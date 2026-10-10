// PRE-CONTRACT TOTALS FOR A MONTH (1040) - one rule each, used by the
// estimator scorecard ("All estimators" cards) and the Business Scorecard, so
// the two pages cannot show different figures.
//
// From the pure parser file, NOT crmValueChanges (which imports the
// database) - this file is used by a browser page. See lib/crmHistoryParse.js.
import { parseMoneyPair, parseStagePair } from './crmHistoryParse'
import { stageIdToLabel } from './crmDashboardAdapter'

// Inputs are what /api/deals-crm and /api/value-changes-crm return: flat deals
// (lib/crmDashboardAdapter crmDealsToFlat) and value-change records
// (lib/crmValueChanges getAllCrmValueChanges).

export const monthKey = (s) => s ? String(s).substring(0, 7) : null

// VALUE OF WORK PRICED: the sum of every value change dated in the month,
// across all projects. Blank -> 100k adds 100k; 20k -> 25k adds 5k; a price
// cut subtracts. Each change is one record, so a project repriced twice in a
// month contributes both changes.
export function valuePricedIn(valueChanges, month) {
  const list = (valueChanges || []).filter(v => v.changeDate && monthKey(v.changeDate) === month)
  return { total: list.reduce((s, v) => s + (v.valueChange || 0), 0), list }
}

// VALUE OF WORK SECURED: the value of every deal WON in the month (by its
// close date), across all estimators. A won deal with no value is a data gap,
// not a zero-value win, so it is left out.
export function valueSecuredIn(deals, month) {
  const list = (deals || []).filter(d => d.status === 'won' && d.value > 0 && monthKey(d.closeTime) === month)
  return { total: list.reduce((s, d) => s + d.value, 0), list }
}

// ---- month boundaries as plain text (1041) ----------------------------------
// The estimator page built these with new Date(...).toISOString(), which is UTC:
// local midnight on the 31st is still the 30th in UTC anywhere ahead of it (the
// UK in summer, New Zealand always), so a deal won on the last day of a month
// fell outside that month's window. Text arithmetic has no timezone.
const pad = (n) => String(n).padStart(2, '0')
export function monthEndDay(month) {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}
export function monthsBack(month, n) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 - n, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

// STRIKE RATE ON VALUE (1041): rolling six months to the end of `month` - the
// month itself and the five before - across ALL estimators. Won value over
// decided value (won + lost), deals with a value only. The estimator scorecard's
// "Strike rate (value)" for all estimators, which now calls this.
export function strikeRateValueTo(deals, month) {
  const from = `${monthsBack(month, 5)}-01`, to = monthEndDay(month)
  const decided = (deals || []).filter(d => (d.status === 'won' || d.status === 'lost') && d.value > 0 &&
    d.closeTime && String(d.closeTime).slice(0, 10) >= from && String(d.closeTime).slice(0, 10) <= to)
  const won = decided.filter(d => d.status === 'won')
  const v = (l) => l.reduce((s, d) => s + d.value, 0)
  return { rate: decided.length ? v(won) / v(decided) : null, decided, won, from, to }
}

// AVERAGE VALUE OF A SECURED PROJECT (1041): deals WON while at the
// Negotiating stage - a won deal keeps the stage it was won from - with a
// value, by the month won. Averaged as total / count, never as an average of
// monthly averages.
export function securedFromNegotiating(deals, months) {
  const set = new Set(months)
  const list = (deals || []).filter(d => d.status === 'won' && d.value > 0 && d.stageName === 'Negotiating' && set.has(monthKey(d.closeTime)))
  const total = list.reduce((s, d) => s + d.value, 0)
  return { total, count: list.length, avg: list.length ? total / list.length : null, list }
}

// NEGOTIATING PIPELINE (1041): the total value of open deals at the
// Negotiating stage.
//   NOW: exactly /api/negotiating's rule on the flat deals - stageName
//        'Negotiating' and status 'open'.
//   AT A PAST MONTH END: rebuilt from each deal's history - the stage and
//        value it had at the end of that day, and whether it had been won or
//        lost by then. A deal with no stage history is taken to have been at
//        its current stage since it was created; one with no value history,
//        at its current value. That is the best the record allows, and
//        becomes exact for every move recorded from here on.
export function negotiatingNow(flatDeals) {
  const list = (flatDeals || []).filter(d => d.stageName === 'Negotiating' && d.status === 'open')
  return { total: list.reduce((s, d) => s + (Number(d.value) || 0), 0), count: list.length }
}

export function negotiatingAt(crmDeals, endDay) {
  const endTs = `${endDay}T23:59:59.999Z`
  const day = (ts) => ts ? String(ts).slice(0, 10) : null
  let total = 0, count = 0
  for (const d of crmDeals || []) {
    if (!d || d.id == null) continue
    const f = d.fields || {}
    const created = day(f.created)
    if (created && created > endDay) continue
    // Won or lost by the end of that day: no longer in the pipeline.
    if ([f.won_time, f.lost_time].some(t => t && day(t) <= endDay)) continue

    const hist = (Array.isArray(d.history) ? d.history : []).slice().sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')))
    const stages = hist.filter(h => h.type === 'stage').map(h => ({ ts: String(h.ts || ''), pair: (h.stageTo && h.stageFrom != null) ? { from: h.stageFrom, to: h.stageTo } : parseStagePair(h.text) })).filter(x => x.pair)
    const before = stages.filter(x => x.ts <= endTs), after = stages.filter(x => x.ts > endTs)
    const stage = before.length ? before[before.length - 1].pair.to : (after.length ? after[0].pair.from : stageIdToLabel(d.stageId))
    if (String(stage || '').trim() !== 'Negotiating') continue

    const values = hist.filter(h => h.type === 'value').map(h => ({ ts: String(h.ts || ''), pair: (h.oldValue != null && h.newValue != null) ? { old: Number(h.oldValue), next: Number(h.newValue) } : parseMoneyPair(h.text) })).filter(x => x.pair)
    const vb = values.filter(x => x.ts <= endTs), va = values.filter(x => x.ts > endTs)
    const value = vb.length ? vb[vb.length - 1].pair.next : (va.length ? va[0].pair.old : (Number(f.value) || 0))
    total += Number(value) || 0
    count++
  }
  return { total, count }
}
