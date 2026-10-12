import { checkProduct, withRates } from './priceList'
import { createLibraryStore } from './libraryStore'
import { getClient } from './db'
import { applyAdjustments } from './priceAdjust'

// PRICE LIST STORAGE (1083; on the shared library store since 1086). Server
// only. Keys unchanged: pricelist:index, pricelist:v<version>:s<n>.
const store = createLibraryStore({
  prefix: 'pricelist',
  check: (raw) => { const c = checkProduct(raw); return { item: c.product, errors: c.errors, warnings: c.warnings } },
  compute: withRates,
  computed: ['rate', 'rateM2', 'basePrice', 'adjusted'],   // worked out, never stored (1094)
})

// The price list AS PRICED: list prices with the supplier increases and
// discounts applied (1094). Every consumer - build-ups, estimates - uses this.
export async function loadPriceList() {
  const [r, adjustments] = await Promise.all([store.load(), loadAdjustments()])
  return { index: r.index, products: applyAdjustments(r.items, adjustments), adjustments }
}
export const replacePriceList = (products, meta) => store.replace(products, meta)
export async function upsertProduct(raw, meta) { const r = await store.upsert(raw, meta); return r.errors ? r : { product: r.item, index: r.index } }
export const deleteProduct = (ref, meta) => store.remove(ref, meta)

// ---- Supplier increases and discounts (1094) -------------------------------
// Products are STORED at the supplier's list price; adjustments are kept
// apart and applied when the list is loaded - so build-ups and estimates price
// with them, while uploads, downloads and the comparison of an upload use the
// list prices (loadPriceListRaw).
const ADJ = 'pricelist:adjustments'
export async function loadAdjustments() { return (await (await getClient()).get(ADJ)) || [] }
export async function saveAdjustments(list) { await (await getClient()).set(ADJ, list) }
export async function loadPriceListRaw() { const r = await store.load(); return { index: r.index, products: r.items } }
