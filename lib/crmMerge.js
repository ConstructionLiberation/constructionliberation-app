// MERGING TWO CRM DEALS (1075) - the rules, pure, no storage.
//
// One deal SURVIVES (keep) and takes the other's place. You choose, field by
// field, which deal's value to keep. Three things are chosen as a whole,
// because their history only makes sense in one piece:
//
//   __value     the value AND its value history - only ONE deal's history
//               carries forward, or work priced would count the same tender
//               twice
//   __outcome   stage, status (open/won/lost), won/lost dates, lost reason,
//               AND their history (stage moves, won, lost, reopened)
//   title       the project name and number
//
// Everything else in the history - notes, comments, calls, emails logged,
// mentions - comes from BOTH, in date order. The received ("created") date is
// the EARLIER of the two: the project was in hand from the first copy.

const OUTCOME_FIELDS = ['won_time', 'lost_time', 'lost_reason']
const AUTO_FIELDS = ['created']          // decided by rule, not by choice
const isOutcomeEntry = (h) => h && (h.type === 'stage' || h.type === 'won' || h.type === 'lost' || (h.type === 'note' && /^Deal reopened$/.test(String(h.text || ''))))
const isValueEntry = (h) => h && h.type === 'value'

// Every field that differs between the two, for the comparison window.
export function differingFields(keep, other) {
  const kf = keep.fields || {}, of = other.fields || {}
  const keys = [...new Set([...Object.keys(kf), ...Object.keys(of)])]
    .filter(k => k !== 'value' && !OUTCOME_FIELDS.includes(k) && !AUTO_FIELDS.includes(k))
  const blank = (v) => v == null || v === '' || (Array.isArray(v) && !v.length)
  return keys.filter(k => JSON.stringify(blank(kf[k]) ? null : kf[k]) !== JSON.stringify(blank(of[k]) ? null : of[k]))
}

// The default choice for a field: the side that has a value; if both do, keep.
export function defaultPick(keep, other, key) {
  const blank = (v) => v == null || v === '' || (Array.isArray(v) && !v.length)
  const kv = key === 'title' ? keep.title : key === '__value' ? keep.fields?.value : key === '__outcome' ? keep.stageId : keep.fields?.[key]
  const ov = key === 'title' ? other.title : key === '__value' ? other.fields?.value : key === '__outcome' ? other.stageId : other.fields?.[key]
  return blank(kv) && !blank(ov) ? 'other' : 'keep'
}

const earlier = (a, b) => (!a ? b : !b ? a : (String(a) <= String(b) ? a : b))

// -> the surviving deal. picks: { [fieldKey | 'title' | '__value' | '__outcome']: 'keep' | 'other' }
export function mergeDeal(keep, other, picks = {}, { by = '', at = new Date().toISOString() } = {}) {
  const pick = (k) => (picks[k] === 'other' ? 'other' : 'keep')
  const side = (k) => (pick(k) === 'other' ? other : keep)
  const kf = keep.fields || {}, of = other.fields || {}
  const fields = { ...kf }
  for (const k of differingFields(keep, other)) if (pick(k) === 'other') fields[k] = of[k]
  // Fields only the other deal has, that nobody chose against: take them.
  for (const k of Object.keys(of)) if (!(k in fields)) fields[k] = of[k]
  const vSide = side('__value'), oSide = side('__outcome')
  fields.value = (vSide.fields || {}).value ?? null
  for (const k of OUTCOME_FIELDS) fields[k] = (oSide.fields || {})[k] ?? null
  fields.created = earlier(kf.created, of.created)

  // History: value entries from the value side, outcome entries from the
  // outcome side, everything else from both. Ids made unique, date order.
  const seen = new Set()
  const uniq = (h, src) => { let id = String(h.id ?? ''); if (!id || seen.has(id)) id = `${src}-${id || Math.random().toString(36).slice(2, 8)}`; seen.add(id); return { ...h, id } }
  const take = (deal, src) => (deal.history || []).filter(h => {
    if (isValueEntry(h)) return deal === vSide
    if (isOutcomeEntry(h)) return deal === oSide
    return true
  }).map(h => uniq(h, src))
  const history = [...take(keep, 'k'), ...take(other, 'm')]
    .sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')))
  history.push({ id: `merge-${Date.now().toString(36)}`, type: 'note', ts: at,
    text: `Merged with "${other.title || ''}" (CRM-${other.id})${by ? ` by ${by}` : ''}. Value history kept from ${vSide === keep ? 'this deal' : 'the merged deal'}; stage and status from ${oSide === keep ? 'this deal' : 'the merged deal'}.` })

  return {
    ...keep,
    title: side('title').title,
    stageId: oSide.stageId,
    status: oSide.status,
    fields,
    history,
    // Marks the deal as having absorbed another, so a save from a tab opened
    // BEFORE the merge (which would not carry this) is refused by the server.
    mergedFrom: [...(keep.mergedFrom || []), { id: other.id, title: other.title || '', at, by }],
  }
}

// Activities, notes, filed emails: both, de-duplicated by id.
export function unionById(a, b) {
  const out = [...(a || [])], ids = new Set(out.map(x => String(x && x.id)))
  for (const x of b || []) { const id = String(x && x.id); if (!ids.has(id)) { ids.add(id); out.push(x) } }
  return out
}

// Follow merges: a deal merged into one that was later merged again.
export function resolveMerged(map, id) {
  let cur = String(id), hops = 0
  while (map && map[cur] != null && hops++ < 20) cur = String(map[cur])
  return cur
}
