import { getClient } from './db'

// DOCUMENT LISTS (1093). Server only. One list per owner, kept APART from the
// estimate record - so uploading never collides with someone saving the take-off.
//   docs:estimate:<id>    [{ id, pathname, name, size, contentType, itemId, uploadedAt, uploadedBy }]
//   docs:buildup:<ref>    the same, for a build-up template in the library
const KEY = (ownerType, ownerId) => `docs:${ownerType}:${ownerId}`
export async function listDocs(ownerType, ownerId) { return (await (await getClient()).get(KEY(ownerType, ownerId))) || [] }
export async function saveDocs(ownerType, ownerId, list) { await (await getClient()).set(KEY(ownerType, ownerId), list) }
export async function dropDocs(ownerType, ownerId) { await (await getClient()).del(KEY(ownerType, ownerId)) }

// A build-up renamed (or its category renamed) gets a new key - its documents
// move with it, so nothing is orphaned (1093).
export async function moveDocs(ownerType, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return
  const c = await getClient()
  const list = (await c.get(KEY(ownerType, fromId))) || []
  if (!list.length) return
  const dest = (await c.get(KEY(ownerType, toId))) || []
  await c.set(KEY(ownerType, toId), [...dest, ...list])
  await c.del(KEY(ownerType, fromId))
}

// Everything an owner holds, out of storage and off the list (estimate or
// build-up deleted). removeFile is passed in, so this file stays storage-free.
export async function deleteAllDocs(ownerType, ownerId, removeFile) {
  for (const d of await listDocs(ownerType, ownerId)) await removeFile(d.pathname)
  await dropDocs(ownerType, ownerId)
}
