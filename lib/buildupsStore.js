import { createLibraryStore } from './libraryStore'
import { loadPriceList } from './priceListStore'
import { loadLabour } from './labourRatesStore'

// RATE BUILD-UPS STORAGE (1087). Server only. The shared library store, one
// section per CATEGORY: buildups:index, buildups:v<version>:s<n>.
// Templates are checked by the route (they need the price list and labour
// rates); the store only keeps them.
const store = createLibraryStore({ prefix: 'buildups', check: (raw) => ({ item: raw, errors: [], warnings: [] }) })
export const loadBuildups = () => store.load()
export const replaceBuildups = (items, meta) => store.replace(items, meta)
export const upsertBuildup = (t, meta) => store.upsert(t, meta)
export const removeBuildup = (ref, meta) => store.remove(ref, meta)

// The Refs a build-up may use: this company's own price list and labour rates.
export async function knownRefs() {
  const [{ products }, { items }] = await Promise.all([loadPriceList(), loadLabour()])
  return { material: new Set(products.map(p => p.ref)), labour: new Set(items.map(i => i.ref)), counts: { products: products.length, labour: items.length } }
}
