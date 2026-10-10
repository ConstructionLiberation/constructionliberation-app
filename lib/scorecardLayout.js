// SCORECARD LAYOUT - which metrics show, and in what order (1042).
//
// One layout per scorecard, shared by everyone who opens it, set from the gear
// icon by management or admin. Stored per tenant at scorecard:layouts:
//   { [scorecardId]: { order: [metricKey], hidden: [metricKey] } }
// through /api/targets, which every scorecard already fetches.
//
// Applied at ONE point on each page - the list that feeds both the cards and
// the trend table - so hiding or moving a metric changes both together.
//
// A metric added to the code later, and so missing from a saved order, takes
// its place after the saved ones rather than vanishing. A saved key whose
// metric no longer exists is ignored.

export const SCORECARD_IDS = {
  'business': 'Business Scorecard',
  'ops-cm': 'Operations - Contracts Manager',
  'ops-om': 'Operations - Operations Manager',
  'pre-estimator': 'Pre-Contract - Estimator',
  'pre-sales': 'Pre-Contract - Sales',
  'commercial': 'Commercial Scorecard',
}

const keyList = (v) => [...new Set((Array.isArray(v) ? v : []).map(String).filter(k => k && k.length <= 80))].slice(0, 100)

export function cleanLayouts(v) {
  const out = {}
  if (!v || typeof v !== 'object') return out
  for (const id of Object.keys(SCORECARD_IDS)) {
    if (v[id] && typeof v[id] === 'object') out[id] = { order: keyList(v[id].order), hidden: keyList(v[id].hidden) }
  }
  return out
}

// defs: [{ key, ... }] in the code's own order.
// -> { all: defs in saved order, visible: the same without hidden ones }
export function applyLayout(defs, layout) {
  const order = (layout && layout.order) || []
  const hidden = new Set((layout && layout.hidden) || [])
  const rank = new Map(order.map((k, i) => [k, i]))
  const all = defs
    .map((d, i) => ({ d, i, r: rank.has(d.key) ? rank.get(d.key) : order.length + i }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(x => x.d)
  return { all, visible: all.filter(d => !hidden.has(d.key)) }
}
