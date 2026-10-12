import { checkProduct, withRates } from './priceList'
import { createLibraryStore } from './libraryStore'

// PRICE LIST STORAGE (1083; on the shared library store since 1086). Server
// only. Keys unchanged: pricelist:index, pricelist:v<version>:s<n>.
const store = createLibraryStore({
  prefix: 'pricelist',
  check: (raw) => { const c = checkProduct(raw); return { item: c.product, errors: c.errors, warnings: c.warnings } },
  compute: withRates,
  computed: ['rate', 'rateM2'],
})

export async function loadPriceList() { const r = await store.load(); return { index: r.index, products: r.items } }
export const replacePriceList = (products, meta) => store.replace(products, meta)
export async function upsertProduct(raw, meta) { const r = await store.upsert(raw, meta); return r.errors ? r : { product: r.item, index: r.index } }
export const deleteProduct = (ref, meta) => store.remove(ref, meta)
