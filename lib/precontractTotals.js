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
  return { total: list.reduce((s, d) => s + (Number(d.value) || 0), 0), count: list.length, list }
}

export function negotiatingAt(crmDeals, endDay) {
  const endTs = `${endDay}T23:59:59.999Z`
  const day = (ts) => ts ? String(ts).slice(0, 10) : null
  // list (1053): the deals behind the total, for the scorecard's drill-down.
  let total = 0, count = 0
  const list = []
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
    list.push({ dealId: String(d.id), title: d.title || f.title || '', organizationName: f.organization || '', estimator: f.estimator_responsible || '', value: Number(value) || 0 })
  }
  return { total, count, list }
}

// ---- EXISTING CUSTOMERS (1047) ---------------------------------------------
// A customer is EXISTING on a given day if we had already WON A DIFFERENT
// PROJECT for that organisation before that day. Worked out from the deals
// themselves - nothing to fill in, nothing to go stale.
//
// Deliberately NOT the CRM's "Customer type" field (customerType), which the
// estimator scorecard's "Value priced - existing customers" card reads: it is
// set by hand and blank on most deals.
//
//   Organisation   matched by name, ignoring case and spacing. A deal with no
//                  organisation cannot be matched, so is never "existing".
//   "Previously"   won STRICTLY BEFORE the day - a win on the same day does
//                  not make that day's pricing existing-customer work.
//   "Different"    the deal itself does not count: repricing a job we have
//                  already won is not work from an existing customer, it is
//                  the same job.
const orgKey = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
const dayOf = (s) => (s ? String(s).slice(0, 10) : '')

// { orgKey: [{ dealId, day }] } of every won deal, for the lookups below.
export function winsByOrg(deals) {
  const out = {}
  for (const d of deals || []) {
    if (d.status !== 'won' || !d.closeTime) continue
    const k = orgKey(d.organizationName)
    if (!k) continue
    ;(out[k] ||= []).push({ dealId: String(d.id), day: dayOf(d.closeTime) })
  }
  return out
}

export function isExistingCustomer(wins, organizationName, day, dealId) {
  const list = wins[orgKey(organizationName)] || []
  return list.some(w => w.dealId !== String(dealId) && w.day && w.day < dayOf(day))
}

// Value of work priced for existing customers: the value changes in the month
// whose project's organisation was already an existing customer that day.
// The organisation comes from the DEAL where it can (it may have been
// corrected since), else from the change record.
export function valuePricedExistingIn(valueChanges, deals, month) {
  const wins = winsByOrg(deals)
  const orgOf = new Map((deals || []).map(d => [String(d.id), d.organizationName]))
  const list = valuePricedIn(valueChanges, month).list.filter(v =>
    isExistingCustomer(wins, orgOf.get(String(v.dealId)) ?? v.organizationName, v.changeDate, v.dealId))
  return { total: list.reduce((s, v) => s + (v.valueChange || 0), 0), list }
}

// Value of work secured for existing customers: deals won in the month whose
// organisation had a different project won before this one.
export function valueSecuredExistingIn(deals, month) {
  const wins = winsByOrg(deals)
  const list = valueSecuredIn(deals, month).list.filter(d =>
    isExistingCustomer(wins, d.organizationName, d.closeTime, d.id))
  return { total: list.reduce((s, d) => s + d.value, 0), list }
}

// STRIKE RATE ON VALUE - EXISTING CUSTOMERS (1048). Exactly strikeRateValueTo
// - rolling six months to the end of `month`, won value / decided value,
// deals with a value - but only deals whose organisation was an EXISTING
// customer when the deal was decided (isExistingCustomer, above: a different
// project won strictly before that day). A loss counts against existing
// customers on the same test as a win.
export function strikeRateExistingTo(deals, month) {
  const all = strikeRateValueTo(deals, month)
  const wins = winsByOrg(deals)
  const decided = all.decided.filter(d => isExistingCustomer(wins, d.organizationName, d.closeTime, d.id))
  const won = decided.filter(d => d.status === 'won')
  const v = (l) => l.reduce((s, d) => s + d.value, 0)
  return { rate: decided.length ? v(won) / v(decided) : null, decided, won, from: all.from, to: all.to }
}
