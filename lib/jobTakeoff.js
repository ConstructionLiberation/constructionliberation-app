// THE JOB'S MATERIALS TAKE-OFF (1226) - the won estimate's take-off, copied for the job
// and re-measured for construction without ever touching the quote. Stored in the SAME
// shape as an estimate (rows, settings, its frozen prices and its own material rates), so
// the Estimating take-off's own pieces - the Build-up editor, the Materials tab and its
// rules (lib/materials) - work on it unchanged and give the same packs and suppliers.
//   job:takeoff:<xero project id> -> { projectId, estimateId, quoteRef, revision, rows,
//     settings, priceLock, materialRates, adjustments, orderWaste, allocations,
//     allocationGroups, originalQty: { rowId: qty as estimated }, createdAt/By, savedAt/By }
// A row the job does not need is LEFT OUT (excluded: true) - kept, so it can be put back.
import { get, set } from './db'
import { loadEstimate, loadRevision } from './estimateStore'

export const TAKEOFF_KEY = (projectId) => `job:takeoff:${projectId}`
export const loadTakeoff = async (projectId) => (await get(TAKEOFF_KEY(projectId))) || null
export const saveTakeoff = (projectId, t) => set(TAKEOFF_KEY(projectId), t)

// START: a copy of the revision the contracted rates were built from (fromEstimate)
export async function startTakeoff(projectId, fromEstimate, by) {
  if (!fromEstimate || !fromEstimate.estimateId) return { error: 'Build the contracted rates from the estimate first (Contracted Rates) - the take-off starts from the same revision.' }
  const est = await loadEstimate(fromEstimate.estimateId)
  if (!est) return { error: 'The estimate the contracted rates came from no longer exists.' }
  const snap = await loadRevision(est.id, fromEstimate.revision)
  const frozen = snap && (snap.estimate || snap)
  if (!frozen || !Array.isArray(frozen.rows)) return { error: `Rev ${fromEstimate.revision} of ${est.quoteRef || 'the estimate'} could not be read.` }
  const rows = JSON.parse(JSON.stringify(frozen.rows))
  const now = new Date().toISOString()
  const t = { projectId: String(projectId), estimateId: est.id, quoteRef: est.quoteRef || '', title: est.title || '', revision: fromEstimate.revision,
    rows, settings: frozen.settings || {}, priceLock: frozen.priceLock || null, materialRates: frozen.materialRates || {}, adjustments: frozen.adjustments || [],
    orderWaste: frozen.orderWaste || {}, allocations: frozen.allocations || {}, allocationGroups: frozen.allocationGroups || [],
    originalQty: Object.fromEntries(rows.filter(r => r.kind === 'item').map(r => [r.id, r.qty == null || r.qty === '' ? null : Number(r.qty)])),
    createdAt: now, createdBy: by || '', savedAt: now, savedBy: by || '' }
  await saveTakeoff(projectId, t)
  return { takeoff: t }
}

// THE TAKE-OFF AS IT COUNTS - left-out items removed. The Materials tab and the draft
// POs both use this, so a left-out item is never ordered.
export const countingTakeoff = (t) => t ? { ...t, rows: (t.rows || []).filter(r => !(r.kind === 'item' && r.excluded)) } : t

// what may be saved from the page - the take-off's own fields, nothing else
const SAVE_FIELDS = ['rows', 'orderWaste', 'allocations', 'allocationGroups', 'materialRates']
export function cleanSave(prev, incoming) {
  const out = { ...prev }
  for (const k of SAVE_FIELDS) if (incoming && incoming[k] !== undefined) out[k] = incoming[k]
  if (!Array.isArray(out.rows)) out.rows = prev.rows
  return out
}
