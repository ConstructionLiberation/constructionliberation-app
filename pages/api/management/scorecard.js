import { requireArea } from '../../../lib/portalAuth'
import { get } from '../../../lib/db'
import withTenant from '../../../lib/withTenant'
import { BUSINESS_METRICS, CONNECTED } from '../../../lib/businessScorecard'
import { fyStartMonth } from '../../../lib/tenantSettings'
import { fyOfMonth, fyMonths, monthKeyOf } from '../../../lib/financialYear'
import { plMonth, marginOver } from '../../../lib/plMargin'

// GET /api/management/scorecard?from=YYYY-MM&to=YYYY-MM
//
// THE PERIOD IS A MONTH RANGE (1034). With no range given it is the CURRENT
// FINANCIAL YEAR, first month to last - so the page opens on December to
// November for Rock, and the graphs start in December. Change From and To to
// look at any other stretch; every card follows.
//
// {
//   months, series:  the columns and each month's figures
//   headlines:       { metricKey: { value, label, sub } } - the big figure,
//                    worked over the SELECTED RANGE, finished months only
//   from, to:        the range used
//   defaultFrom, defaultTo:  the current financial year, for "Reset"
//   choices:         ['YYYY-MM', ...] months the pickers offer
//   connected, fyStartMonth, notices
// }
//
// Months not finished yet, or with no Xero figures, are null - never 0.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const label = (mo) => { const [y, m] = mo.split('-').map(Number); return `${MON[m - 1]} ${String(y).slice(2)}` }
const addMonths = (mo, n) => { const [y, m] = mo.split('-').map(Number); return monthKeyOf(new Date(y, m - 1 + n, 1)) }
const isMonth = (v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ''))
const MAX_MONTHS = 120

function monthsFrom(from, to) {
  const out = []
  for (let mo = from; mo <= to && out.length < MAX_MONTHS; mo = addMonths(mo, 1)) out.push(mo)
  return out
}

async function handler(req, res) {
  if (!requireArea(req, res, 'management')) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const thisMonth = monthKeyOf(new Date())
  const start = fyStartMonth()
  const notices = []

  const benchmark = (await get('xero:pl-benchmark')) || { months: {} }
  const bm = benchmark.months || {}
  if (!Object.keys(bm).length) notices.push('No Xero P&L figures yet. Sync them from Bookkeeping → Sync Xero figures.')

  // ---- the default range: this financial year ----------------------------
  const currentFy = start ? fyOfMonth(thisMonth, start) : null
  let defaultFrom, defaultTo
  if (start) {
    const fy = fyMonths(currentFy, start)
    defaultFrom = fy[0]; defaultTo = fy[11]
  } else {
    // Without the company's year start, fall back to the last 12 months -
    // and say so, rather than cutting the year on someone else's calendar.
    notices.push('The financial year start is not set for this company (fyStartMonth on the tenant record), so the page opens on the last 12 months instead of the financial year.')
    defaultFrom = addMonths(thisMonth, -11); defaultTo = thisMonth
  }

  let from = isMonth(req.query.from) ? req.query.from : defaultFrom
  let to = isMonth(req.query.to) ? req.query.to : defaultTo
  if (from > to) [from, to] = [to, from]
  const months = monthsFrom(from, to)
  if (months[months.length - 1] !== to) notices.push(`Showing the first ${MAX_MONTHS} months of the range.`)

  // Months the pickers offer: from the earliest Xero month (or 3 years back)
  // to the end of the current financial year.
  const earliest = [Object.keys(bm).sort()[0], addMonths(thisMonth, -36)].filter(Boolean).sort()[0]
  const latest = [defaultTo, thisMonth].sort().pop()
  const choices = monthsFrom(earliest, latest > to ? latest : to)

  // ---- per month ---------------------------------------------------------
  // Only FINISHED months with Xero figures. The current month is part-posted.
  const complete = (mo) => mo < thisMonth && !!bm[mo]
  const series = months.map(month => {
    const row = { month }
    for (const m of BUSINESS_METRICS) row[m.key] = null
    if (complete(month)) {
      const p = plMonth(bm[month])
      row.gmFytd = p.grossMargin      // that month's gross profit / sales
      row.invoicedFy = p.sales          // that month's sales (label: Total sales)
    }
    return row
  })

  // ---- headlines: over the selected range --------------------------------
  // Margin: from the range's TOTALS, not an average of monthly percentages.
  // Sales: the total. Finished months only, so with the default range these
  // read "financial year to date".
  const done = months.filter(complete)
  const agg = marginOver(done.map(mo => plMonth(bm[mo])))
  const isWholeFy = start && from === fyMonths(fyOfMonth(from, start), start)[0] && to === fyMonths(fyOfMonth(from, start), start)[11]
  const fyName = isWholeFy ? `FY${fyOfMonth(from, start)}` : null
  const rangeLabel = fyName
    ? (done.length === 12 ? `${fyName} full year` : `${fyName} to date`)
    : `${label(from)} – ${label(to)}`
  const sub = done.length
    ? `${label(done[0])} – ${label(done[done.length - 1])}, ${done.length} finished month${done.length === 1 ? '' : 's'}`
    : 'No finished months with Xero figures in this range'
  const headlines = {
    gmFytd: { value: agg.grossMargin, label: rangeLabel, sub },
    invoicedFy: { value: done.length ? agg.sales : null, label: rangeLabel, sub },
  }

  return res.status(200).json({
    months, series, connected: CONNECTED, headlines,
    from, to, defaultFrom, defaultTo, choices, fyStartMonth: start, notices,
  })
}

export default withTenant(handler)
