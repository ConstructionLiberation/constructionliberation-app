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
  await c.del(KEY(id))
  await c.set(INDEX, ((await c.get(INDEX)) || []).filter(e => e.id !== id))
}

// ISSUED REVISIONS (1089): a frozen copy of the estimate as issued, kept apart
// from the estimate so the working record stays small.
//   est:<id>:rev:<letter>   { revision, issuedAt, issuedBy, note, total, estimate }
const REV = (id, r) => `est:${id}:rev:${r}`
export async function saveRevision(id, r, snapshot) { await (await getClient()).set(REV(id, r), snapshot) }
export async function loadRevision(id, r) { return (await (await getClient()).get(REV(id, r))) || null }
