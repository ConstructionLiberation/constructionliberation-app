import { requireArea } from '../../../lib/portalAuth'
import { get } from '../../../lib/db'
import withTenant from '../../../lib/withTenant'
import { BUSINESS_METRICS, CONNECTED } from '../../../lib/businessScorecard'
import { fyStartMonth } from '../../../lib/tenantSettings'
import { fyOfMonth, fyMonths, monthKeyOf } from '../../../lib/financialYear'
import { plMonth, marginOver } from '../../../lib/plMargin'

// GET /api/management/scorecard?period=last12 | fy:YYYY
//
// {
//   months:     ['YYYY-MM', ...]            the columns shown
//   series:     [{ month, <metricKey>: number|null }]
//   connected:  [metricKey]                 metrics actually computed
//   headlines:  { metricKey: { value, label, sub } }   the big figure on a card,
//               where it is not simply the latest month
//   period, periods: [{ value, label }]     the filter at the top
//   fyStartMonth, notices: [string]
// }
//
// A metric not yet connected is null in every month. A month with no data -
// not synced from Xero, or not finished yet - is null, never 0.
const pad = (n) => String(n).padStart(2, '0')
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const label = (mo) => { const [y, m] = mo.split('-').map(Number); return `${MON[m - 1]} ${String(y).slice(2)}` }

function last12(now) {
  const out = []
  for (let i = 11; i >= 0; i--) out.push(monthKeyOf(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  return out
}

async function handler(req, res) {
  if (!requireArea(req, res, 'management')) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const now = new Date()
  const thisMonth = monthKeyOf(now)
  const start = fyStartMonth()
  const notices = []
  if (!start) notices.push('The financial year start is not set for this company (fyStartMonth on the tenant record), so year-to-date figures and the year filter are unavailable.')

  const benchmark = (await get('xero:pl-benchmark')) || { months: {} }
  const bm = benchmark.months || {}

  // ---- the period filter -------------------------------------------------
  const currentFy = start ? fyOfMonth(thisMonth, start) : null
  const fys = start ? [...new Set([currentFy, ...Object.keys(bm).map(mo => fyOfMonth(mo, start))])].sort((a, b) => b - a) : []
  const periods = [{ value: 'last12', label: 'Last 12 months' }, ...fys.map(fy => ({
    value: `fy:${fy}`,
    label: `FY${fy} (${label(fyMonths(fy, start)[0])} – ${label(fyMonths(fy, start)[11])})${fy === currentFy ? ' - this year' : ''}`,
  }))]
  let period = String(req.query.period || 'last12')
  const fyPicked = /^fy:\d{4}$/.test(period) && start ? Number(period.slice(3)) : null
  if (!fyPicked) period = 'last12'
  const months = fyPicked ? fyMonths(fyPicked, start) : last12(now)

  // ---- gross margin ------------------------------------------------------
  // Each month: that month's gross profit / that month's sales, from the Xero
  // P&L that Business Financials reads. Only FINISHED months - the current
  // month is part-posted and would swing the line.
  const complete = (mo) => mo < thisMonth && bm[mo]
  const gmOf = (mo) => complete(mo) ? plMonth(bm[mo]).grossMargin : null

  const series = months.map(month => {
    const row = { month }
    for (const m of BUSINESS_METRICS) row[m.key] = null
    row.gmFytd = gmOf(month)
    // Total invoiced (1033): the month's P&L sales - the same figure the
    // margin divides by, so the two cards always describe the same months.
    row.invoicedFy = complete(month) ? plMonth(bm[month]).sales : null
    return row
  })

  // Headline: the margin for the financial year so far - the year picked, or
  // this year when looking at the last 12 months - from its first month to
  // the last FULL month. Totals first, then the ratio.
  const headlines = {}
  if (start) {
    const fy = fyPicked || currentFy
    const done = fyMonths(fy, start).filter(complete)
    const agg = marginOver(done.map(mo => plMonth(bm[mo])))
    const finished = fy < currentFy
    const span = {
      label: finished ? `FY${fy} full year` : `FY${fy} to date`,
      sub: done.length ? `${label(done[0])} – ${label(done[done.length - 1])}, ${done.length} month${done.length === 1 ? '' : 's'}` : 'No finished months with Xero figures yet',
    }
    headlines.gmFytd = { value: agg.grossMargin, ...span }
    // Total invoiced: the same months, summed. No finished months -> blank,
    // not a total of zero.
    headlines.invoicedFy = { value: done.length ? agg.sales : null, ...span }
  }
  if (!Object.keys(bm).length) notices.push('No Xero P&L figures yet. Sync them from Bookkeeping → Sync Xero figures.')

  return res.status(200).json({ months, series, connected: CONNECTED, headlines, period, periods, fyStartMonth: start, notices })
}

export default withTenant(handler)
