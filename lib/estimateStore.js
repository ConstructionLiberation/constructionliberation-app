import { getClient } from './db'

// ESTIMATES STORAGE (1088). Server only.
//   est:<id>      the whole estimate (header, settings, take-off rows)
//   est:index     [{ id, quoteRef, revision, title, dealId, dealTitle,
//                    organisation, total, items, updatedAt, updatedBy }]  - the list
// Nothing is written on its own: an estimate exists once someone creates it.
const KEY = (id) => `est:${id}`
const INDEX = 'est:index'

export async function listEstimates() { return (await (await getClient()).get(INDEX)) || [] }
export async function loadEstimate(id) { return (await (await getClient()).get(KEY(id))) || null }

export async function saveEstimate(est, summary) {
  const c = await getClient()
  await c.set(KEY(est.id), est)
  const list = ((await c.get(INDEX)) || []).filter(e => e.id !== est.id)
  list.unshift(summary)
  await c.set(INDEX, list)
}

export async function deleteEstimate(id) {
  const c = await getClient()
  // Its issued revisions go with it (1091).
  const est = await c.get(KEY(id))
  for (const r of (est && est.revisions) || []) { try { await c.del(`est:${id}:rev:${r.revision}`) } catch {} }
  await c.del(KEY(id))
  await c.set(INDEX, ((await c.get(INDEX)) || []).filter(e => e.id !== id))
}

// ISSUED REVISIONS (1089): a frozen copy of the estimate as issued, kept apart
// from the estimate so the working record stays small.
//   est:<id>:rev:<letter>   { revision, issuedAt, issuedBy, note, total, estimate }
const REV = (id, r) => `est:${id}:rev:${r}`
export async function saveRevision(id, r, snapshot) { await (await getClient()).set(REV(id, r), snapshot) }
export async function loadRevision(id, r) { return (await (await getClient()).get(REV(id, r))) || null }

// DELETED ESTIMATES (1177) - a bin. "Delete estimate" moves it here (its issued
// revisions and documents untouched); an admin can restore it for 30 days, after
// which it is removed for good.
//   est:bin:<id>   { est, summary, deletedAt, deletedBy }
//   est:binindex   [{ id, title, quoteRef, revision, dealTitle, organisation, total, revisions, deletedAt, deletedBy }]
const BIN = (id) => `est:bin:${id}`
const BIN_INDEX = 'est:binindex'
export const BIN_DAYS = 30
export async function binEstimate(id, by) {
  const c = await getClient()
  const est = await c.get(KEY(id))
  if (!est) return null
  const summary = ((await c.get(INDEX)) || []).find(e => e.id === id) || { id, title: est.title }
  const deletedAt = new Date().toISOString()
  await c.set(BIN(id), { est, summary, deletedAt, deletedBy: by })
  await c.set(BIN_INDEX, [{ id, title: est.title || summary.title || '', quoteRef: est.quoteRef || '', revision: est.revision || '', dealTitle: summary.dealTitle || '', organisation: summary.organisation || '', total: summary.total ?? null, revisions: (est.revisions || []).length, deletedAt, deletedBy: by }, ...(((await c.get(BIN_INDEX)) || []).filter(e => e.id !== id))])
  await c.del(KEY(id))
  await c.set(INDEX, ((await c.get(INDEX)) || []).filter(e => e.id !== id))
  return true
}
export async function listBin() { return (await (await getClient()).get(BIN_INDEX)) || [] }
export async function restoreEstimate(id) {
  const c = await getClient()
  const b = await c.get(BIN(id))
  if (!b || !b.est) return null
  await c.set(KEY(id), b.est)
  await c.set(INDEX, [b.summary || { id }, ...(((await c.get(INDEX)) || []).filter(e => e.id !== id))])
  await c.del(BIN(id))
  await c.set(BIN_INDEX, ((await c.get(BIN_INDEX)) || []).filter(e => e.id !== id))
  return b.est
}
// removed for good: its issued revisions too (documents are removed by the caller)
export async function purgeEstimate(id) {
  const c = await getClient()
  const b = await c.get(BIN(id))
  for (const r of (b && b.est && b.est.revisions) || []) { try { await c.del(`est:${id}:rev:${r.revision}`) } catch {} }
  await c.del(BIN(id))
  await c.set(BIN_INDEX, ((await c.get(BIN_INDEX)) || []).filter(e => e.id !== id))
}
