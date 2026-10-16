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
  // WHERE A SECTION IS STORED (1188): the index records each section's key, so a
  // new version can REUSE the sections that did not change. An index written
  // before this has no keys - its sections are found the old way, by version.
  const keyOf = (idx, n) => (idx.sections[n] && idx.sections[n].key) || secKey(idx.version, n)

  async function load() {
    const c = await getClient()
    const idx = await c.get(INDEX)
    if (!idx || !Array.isArray(idx.sections)) return { index: null, items: [] }
    const parts = await Promise.all(idx.sections.map((_, n) => c.get(keyOf(idx, n))))
    return { index: idx, items: parts.flatMap(p => (Array.isArray(p) ? p : [])).map(compute) }
  }

  // A NEW VERSION (1086; 1188 faster). `changed` = the names of the sections whose
  // items changed (null = all): only those are written; the rest reuse their
  // stored section. Writes, then the index switch, then removing the replaced
  // sections - each step all at once rather than one by one. A failed write still
  // never leaves half a list: the index only moves once every write is done.
  async function writeVersion(items, meta, changed = null) {
    const c = await getClient()
    const old = await c.get(INDEX)
    const version = Date.now()
    const store = (p) => { const o = { ...p }; for (const k of computed) delete o[k]; return o }
    const oldByName = new Map(((old && Array.isArray(old.sections)) ? old.sections : []).map((sec, n) => [sec.name, { key: keyOf(old, n), count: sec.count }]))
    const sections = sectionsOf(items).map((sec, n) => {
      const prev = oldByName.get(sec.name)
      const reuse = changed && prev && !changed.has(sec.name) && prev.count === sec.count
      return { ...sec, key: reuse ? prev.key : secKey(version, n), write: !reuse }
    })
    await Promise.all(sections.filter(sec => sec.write).map(sec => c.set(sec.key, items.filter(p => p.section === sec.name).map(store))))
    const index = { version, sections: sections.map(({ write, ...sec }) => sec), count: items.length, updatedAt: new Date().toISOString(), ...meta }
    await c.set(INDEX, index)
    const kept = new Set(index.sections.map(sec => sec.key))
    if (old && Array.isArray(old.sections)) await Promise.all(old.sections.map((_, n) => keyOf(old, n)).filter(k => !kept.has(k)).map(k => c.del(k).catch(() => {})))
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
    // only its section is written (or both, if it moved section) (1188)
    const idx = await writeVersion(next, { updatedBy: by || '', source: index?.source || '' }, new Set([item.section, i >= 0 ? items[i].section : item.section]))
    return { item, index: idx }
  }

  async function remove(ref, { by }) {
    const { items, index } = await load()
    const gone = items.find(p => p.ref.toLowerCase() === String(ref).toLowerCase())
    const next = items.filter(p => p !== gone)
    if (!gone) return { errors: ['That item no longer exists'] }
    const idx = await writeVersion(next, { updatedBy: by || '', source: index?.source || '' }, new Set([gone.section]))
    return { index: idx }
  }

  return { load, replace, upsert, remove }
}
