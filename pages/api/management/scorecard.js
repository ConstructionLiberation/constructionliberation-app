import { requireArea } from '../../../lib/portalAuth'
import { get, set, getSubmissionIndex, getSubmission, getForms } from '../../../lib/db'
import { ourFaultWaterIngress } from '../../../lib/waterIngress'
import { getAllCrmValueChanges } from '../../../lib/crmValueChanges'
import { crmDealsToFlat } from '../../../lib/crmDashboardAdapter'
import { getMilestones } from '../../../lib/crmMilestones'
import { valuePricedIn, valueSecuredIn, securedFromNegotiating, strikeRateValueTo, negotiatingAt, negotiatingNow, monthEndDay } from '../../../lib/precontractTotals'
import { liveInvoiceLines, paylessFromLines } from '../../../lib/paylessNotices'
import withTenant from '../../../lib/withTenant'
import { BUSINESS_METRICS, CONNECTED } from '../../../lib/businessScorecard'
import { fyOfMonth, fyMonths, monthKeyOf } from '../../../lib/financialYear'
import { plMonth, marginOver } from '../../../lib/plMargin'
import { computeForecastPl } from '../../../lib/forecastServer'

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

// THE FINANCIAL YEAR START (1036) lives in the company's OWN database, at
// config:financial-year-start, and is set once on the Business Scorecard.
// It was a field on the tenant record (1032-1035), which meant editing JSON in
// Upstash to make the page work - and a page that silently fell back to the
// last 12 months when that edit had not happened. Not set now means the page
// ASKS, it does not guess.
const FY_KEY = 'config:financial-year-start'
const validStart = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null }

async function handler(req, res) {
  if (!requireArea(req, res, 'management')) return

  // POST { fyStartMonth: 1-12 } - set the year start.
  if (req.method === 'POST') {
    const v = validStart((req.body || {}).fyStartMonth)
    if (!v) return res.status(400).json({ error: 'fyStartMonth must be a month number, 1 to 12.' })
    await set(FY_KEY, v)
    return res.status(200).json({ ok: true, fyStartMonth: v })
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const thisMonth = monthKeyOf(new Date())
  const start = validStart(await get(FY_KEY))
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
  // LAST FULL MONTH ONLY (1044). Every metric counts finished months - this
  // month is part-way through and would understate a total or swing an
  // average. The one exception, by decision, is Forecast sales, which is
  // actual to last month PLUS the forecast from this month on.
  const isFull = (mo) => mo < thisMonth
  const fullMonths = months.filter(isFull)
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
    // avgPerMonth (1042): the total over the same finished months, divided by
    // how many there are - shown under the total.
    invoicedFy: { value: done.length ? agg.sales : null, label: rangeLabel, sub, avgPerMonth: done.length ? agg.sales / done.length : null },
  }

  // ---- water ingress, our fault (1039) -----------------------------------
  // A count of things that happened, so a past or current month with none is
  // a real 0. Months not reached yet are blank.
  const details = {}
  try {
    const { reports, problem } = await ourFaultWaterIngress({ getSubmissionIndex, getSubmission, getForms })
    if (problem) notices.push(`Water ingress: ${problem}`)
    const inRange = reports.filter(r => fullMonths.includes(r.month))
    for (const row of series) {
      row.waterIngressRockFault = isFull(row.month) ? inRange.filter(r => r.month === row.month).length : null
    }
    headlines.waterIngressRockFault = {
      value: problem ? null : inRange.length,
      label: rangeLabel,
      sub: `${inRange.length} report${inRange.length === 1 ? '' : 's'} where we were responsible`,
    }
    details.waterIngressRockFault = {}
    for (const r of inRange) (details.waterIngressRockFault[r.month] ||= []).push(r)
  } catch (e) {
    notices.push(`Water ingress figures unavailable: ${e.message}`)
  }

  // ---- pre-contract: value priced, value secured (1040) -------------------
  // The same data the estimator scorecard reads (/api/deals-crm and
  // /api/value-changes-crm build theirs with these same functions) and the
  // same per-month rules (lib/precontractTotals.js). A month reached with no
  // activity is a real 0; a month not reached yet is blank.
  try {
    const crmDeals = (await get('crm:deals')) || []
    const [changes, milestones] = await Promise.all([getAllCrmValueChanges(), getMilestones(crmDeals)])
    const deals = crmDealsToFlat(crmDeals, milestones)
    let priced = 0, secured = 0
    for (const row of series) {
      if (!isFull(row.month)) continue
      row.valuePriced = valuePricedIn(changes, row.month).total
      row.valueSecured = valueSecuredIn(deals, row.month).total
      priced += row.valuePriced; secured += row.valueSecured
    }
    const upTo = fullMonths
    const span = upTo.length ? `${label(upTo[0])} – ${label(upTo[upTo.length - 1])}` : 'No finished months yet'
    headlines.valuePriced = { value: upTo.length ? priced : null, label: rangeLabel, sub: span }
    headlines.valueSecured = { value: upTo.length ? secured : null, label: rangeLabel, sub: span }

    // Average value of a secured project (1041): won from Negotiating. A month
    // with none has no average - blank, not 0.
    for (const row of series) if (isFull(row.month)) row.avgValueSecured = securedFromNegotiating(deals, [row.month]).avg
    const sp = securedFromNegotiating(deals, upTo)
    headlines.avgValueSecured = { value: sp.avg, label: rangeLabel, sub: `${sp.count} project${sp.count === 1 ? '' : 's'} won from Negotiating` }

    // Strike rate on value (1041): rolling six months to each month end, whole
    // business. Headline: the latest month reached.
    for (const row of series) if (isFull(row.month)) row.strikeRateValue = strikeRateValueTo(deals, row.month).rate
    if (upTo.length) {
      const last = upTo[upTo.length - 1], sr = strikeRateValueTo(deals, last)
      headlines.strikeRateValue = { value: sr.rate, label: `Rolling 6 months to ${label(last)}`, sub: `${sr.won.length} won of ${sr.decided.length} decided` }
    }

    // Negotiating pipeline (1041): past months at their month end, rebuilt
    // from deal history; this month as it stands today, by /api/negotiating's
    // own rule. Headline: the latest.
    // 1044: finished months only - the value at each MONTH END. This month
    // has not ended, so it has no point and the card shows the last month end.
    for (const row of series) {
      if (isFull(row.month)) row.negotiatingPipeline = negotiatingAt(crmDeals, monthEndDay(row.month)).total
    }
    if (upTo.length) {
      const last = upTo[upTo.length - 1]
      const r = negotiatingAt(crmDeals, monthEndDay(last))
      headlines.negotiatingPipeline = { value: r.total, label: `At ${monthEndDay(last).split('-').reverse().join('/')}`, sub: `${r.count} project${r.count === 1 ? '' : 's'} in Negotiating` }
    }
  } catch (e) {
    notices.push(`Pre-contract figures unavailable: ${e.message}`)
  }

  // ---- payless notices (1041) --------------------------------------------
  // Credit notes counted exactly as the Commercial Scorecard does - same
  // projects, same dating, same manual month adjustments (lib/paylessNotices).
  try {
    const { lines } = await liveInvoiceLines(get)
    const { countByMonth } = paylessFromLines(lines, (await get('config:payless-adjustments')) || {})
    let total = 0
    for (const row of series) {
      if (!isFull(row.month)) continue
      row.paylessNotices = countByMonth[row.month]?.adjusted ?? 0
      total += row.paylessNotices
    }
    const upTo = fullMonths
    headlines.paylessNotices = {
      value: upTo.length ? total : null, label: rangeLabel,
      // Average per month (1044), shown under the total, as on Total sales.
      avgPerMonth: upTo.length ? total / upTo.length : null,
      sub: `Credit notes on live projects, as the Commercial Scorecard. ${upTo.length} finished month${upTo.length === 1 ? '' : 's'}`,
    }
  } catch (e) {
    notices.push(`Payless notices unavailable: ${e.message}`)
  }

  // ---- the Forecast P&L (1035) -------------------------------------------
  // Always the CURRENT financial year - a forecast is about the year still
  // running, whatever range is selected. The Forecast P&L runs December to
  // November, so it is used only when this company's year does too; anything
  // else would put a December year's forecast against another year's actuals.
  if (start === 12) {
    try {
      const f = await computeForecastPl()
      const adj = f.adjTotals
      const fMonths = f.rows.filter(r => r.source === 'forecast')
      const fyName = `FY${f.fyEnd}`
      headlines.gmForecastFyEnd = {
        value: adj.revenue > 0 ? adj.gross / adj.revenue : null,
        label: `${fyName} forecast, full year`,
        sub: `${f.rows.length - fMonths.length} actual/manual + ${fMonths.length} forecast month${fMonths.length === 1 ? '' : 's'}`,
      }
      // FORECAST SALES (1037). The year split at THIS month, not at the
      // Forecast P&L's own actual/forecast line:
      //   finished months   -> actual Xero sales, the same figure as Total
      //                        sales. September is finished on 10 October even
      //                        if Budgets still has it as a forecast month.
      //   this month onward -> the Forecast P&L's revenue for that month.
      // A finished month with no Xero figures yet takes the forecast figure,
      // counts as forecast, and is NAMED on the card - never silently dropped.
      const fyAll = f.rows.map(r => r.mo)
      const plRev = Object.fromEntries(f.rows.map(r => [r.mo, r.revenue]))
      const actual = {}, forecast = {}, unsynced = []
      for (const mo of fyAll) {
        if (mo < thisMonth && bm[mo]) actual[mo] = plMonth(bm[mo]).sales
        else {
          forecast[mo] = plRev[mo] || 0
          if (mo < thisMonth) unsynced.push(mo)
        }
      }
      const sum = (o) => Object.values(o).reduce((a, v) => a + v, 0)
      const aMos = Object.keys(actual).sort(), fMos = Object.keys(forecast).sort()
      headlines.salesForecast = {
        value: sum(actual) + sum(forecast),
        label: `${fyName} total, actual + forecast`,
        sub: [
          aMos.length ? `actual ${label(aMos[0])} – ${label(aMos[aMos.length - 1])}` : null,
          fMos.length ? `forecast ${label(fMos[0])} – ${label(fMos[fMos.length - 1])}` : null,
        ].filter(Boolean).join(', ') + (unsynced.length ? `. ${unsynced.map(label).join(', ')} not synced from Xero yet - forecast used` : ''),
        parts: [{ label: 'actual', value: sum(actual) }, { label: 'forecast', value: sum(forecast) }],
      }
      for (const row of series) {
        if (row.month in actual) row.salesForecast = actual[row.month]
        if (row.month in forecast) row.salesForecast__f = forecast[row.month]
      }
    } catch (e) {
      notices.push(`Forecast figures unavailable: ${e.message}`)
    }
  } else if (start) {
    notices.push('Forecast figures need a December financial year: the Forecast P&L runs December to November.')
  }

  return res.status(200).json({
    months, series, connected: CONNECTED, headlines, details,
    from, to, defaultFrom, defaultTo, choices, fyStartMonth: start, notices,
  })
}

export default withTenant(handler)
