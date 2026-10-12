import { getClient } from './db'
import { checkProduct, sectionsOf, withRates } from './priceList'

// PRICE LIST STORAGE (1083). Server only.
//
// ~1,500 products is ~600 KB - too big to keep safely as one record. So:
//   pricelist:index                 { version, sections:[{name, count}], count,
//                                     updatedAt, updatedBy, source }
//   pricelist:v<version>:s<n>       the products of section n, for that version
// An UPLOAD writes a complete new version first and only then switches the
// index to it - a failed upload can never leave half a price list. The old
// version's sections are then deleted.
// A company that has never uploaded has no index: an empty list. Nothing is
// ever written on its own.

const INDEX = 'pricelist:index'
const secKey = (v, n) => `pricelist:v${v}:s${n}`

export async function loadPriceList() {
  const c = await getClient()
  const idx = await c.get(INDEX)
  if (!idx || !Array.isArray(idx.sections)) return { index: null, products: [] }
  const parts = await Promise.all(idx.sections.map((_, n) => c.get(secKey(idx.version, n))))
  return { index: idx, products: parts.flatMap(p => (Array.isArray(p) ? p : [])).map(withRates) }
}

async function writeVersion(products, meta) {
  const c = await getClient()
  const old = await c.get(INDEX)
  const version = Date.now()
  const sections = sectionsOf(products)
  const store = (p) => { const { rate, rateM2, ...rest } = p; return rest }   // rates are worked out, not stored
  for (let n = 0; n < sections.length; n++) {
    await c.set(secKey(version, n), products.filter(p => p.section === sections[n].name).map(store))
  }
  const index = { version, sections, count: products.length, updatedAt: new Date().toISOString(), ...meta }
  await c.set(INDEX, index)
  if (old && Array.isArray(old.sections)) for (let n = 0; n < old.sections.length; n++) { try { await c.del(secKey(old.version, n)) } catch {} }
  return index
}

export async function replacePriceList(products, { by, source }) {
  return writeVersion(products, { updatedBy: by || '', source: source || '' })
}

// One product added or changed (by Ref). The whole list is rewritten as a new
// version - simple, and the same all-or-nothing switch as an upload.
export async function upsertProduct(raw, { by, originalRef }) {
  const { product, errors } = checkProduct(raw)
  if (errors.length) return { errors }
  const { products, index } = await loadPriceList()
  const key = (originalRef || product.ref).toLowerCase()
  // ADDING (no originalRef) must never overwrite: a Ref already in use is refused.
  // EDITING may keep its own Ref, or change to one nobody else uses.
  const clash = products.find(p => p.ref.toLowerCase() === product.ref.toLowerCase() && (!originalRef || p.ref.toLowerCase() !== key))
  if (clash) return { errors: [`Ref ${product.ref} is already used by "${clash.description}"`] }
  if (originalRef && !products.some(p => p.ref.toLowerCase() === key)) return { errors: ['That product no longer exists - reload the price list'] }
  const i = products.findIndex(p => p.ref.toLowerCase() === key)
  const next = i >= 0 ? products.map((p, j) => (j === i ? product : p)) : [...products, product]
  const idx = await writeVersion(next, { updatedBy: by || '', source: index?.source || '' })
  return { product, index: idx }
}

export async function deleteProduct(ref, { by }) {
  const { products, index } = await loadPriceList()
  const next = products.filter(p => p.ref.toLowerCase() !== String(ref).toLowerCase())
  if (next.length === products.length) return { errors: ['That product no longer exists'] }
  const idx = await writeVersion(next, { updatedBy: by || '', source: index?.source || '' })
  return { index: idx }
}
