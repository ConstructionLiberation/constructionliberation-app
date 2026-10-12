import { getClient } from './db'
import { sectionsOf } from './libraryParse'

// SHARED STORAGE for the estimating libraries (1086) - the price list and
// labour rates are stored the same way, by ONE piece of code. Server only.
//
//   <prefix>:index               { version, sections:[{name, count}], count,
//                                  updatedAt, updatedBy, source }
//   <prefix>:v<version>:s<n>     the items of section n, for that version
// A change writes a complete new version first and only then switches the
// index to it - a failed write can never leave half a list. The old version
// is then deleted. A company that has never uploaded has no index: an empty
// list. Nothing is ever written on its own.
//
//   prefix    'pricelist' | 'labourrates'
//   check     (raw) -> { item, errors, warnings }
//   compute   (item) -> item with its worked-out figures (never stored)
//   computed  the worked-out keys to strip before storing
export function createLibraryStore({ prefix, check, compute = (x) => x, computed = [] }) {
  const INDEX = `${prefix}:index`
  const secKey = (v, n) => `${prefix}:v${v}:s${n}`

  async function load() {
    const c = await getClient()
    const idx = await c.get(INDEX)
    if (!idx || !Array.isArray(idx.sections)) return { index: null, items: [] }
    const parts = await Promise.all(idx.sections.map((_, n) => c.get(secKey(idx.version, n))))
    return { index: idx, items: parts.flatMap(p => (Array.isArray(p) ? p : [])).map(compute) }
  }

  async function writeVersion(items, meta) {
    const c = await getClient()
    const old = await c.get(INDEX)
    const version = Date.now()
    const sections = sectionsOf(items)
    const store = (p) => { const o = { ...p }; for (const k of computed) delete o[k]; return o }
    for (let n = 0; n < sections.length; n++) {
      await c.set(secKey(version, n), items.filter(p => p.section === sections[n].name).map(store))
    }
    const index = { version, sections, count: items.length, updatedAt: new Date().toISOString(), ...meta }
    await c.set(INDEX, index)
    if (old && Array.isArray(old.sections)) for (let n = 0; n < old.sections.length; n++) { try { await c.del(secKey(old.version, n)) } catch {} }
    return index
  }

  const replace = (items, { by, source }) => writeVersion(items, { updatedBy: by || '', source: source || '' })

  // One item added or changed (by Ref). ADDING (no originalRef) never
  // overwrites: a Ref already in use is refused.
  async function upsert(raw, { by, originalRef }) {
    const { item, errors } = check(raw)
    if (errors.length) return { errors }
    const { items, index } = await load()
    const key = (originalRef || item.ref).toLowerCase()
    const clash = items.find(p => p.ref.toLowerCase() === item.ref.toLowerCase() && (!originalRef || p.ref.toLowerCase() !== key))
    if (clash) return { errors: [`Ref ${item.ref} is already used by "${clash.description}"`] }
    if (originalRef && !items.some(p => p.ref.toLowerCase() === key)) return { errors: ['That item no longer exists - reload the list'] }
    const i = items.findIndex(p => p.ref.toLowerCase() === key)
    const next = i >= 0 ? items.map((p, j) => (j === i ? item : p)) : [...items, item]
    const idx = await writeVersion(next, { updatedBy: by || '', source: index?.source || '' })
    return { item, index: idx }
  }

  async function remove(ref, { by }) {
    const { items, index } = await load()
    const next = items.filter(p => p.ref.toLowerCase() !== String(ref).toLowerCase())
    if (next.length === items.length) return { errors: ['That item no longer exists'] }
    const idx = await writeVersion(next, { updatedBy: by || '', source: index?.source || '' })
    return { index: idx }
  }

  return { load, replace, upsert, remove }
}
