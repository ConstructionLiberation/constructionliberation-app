import { requireArea } from '../../../lib/portalAuth'
import withTenant from '../../../lib/withTenant'
import { parseSheet, diffLists, sectionsOf } from '../../../lib/priceList'
import { loadPriceList, replacePriceList, upsertProduct, deleteProduct } from '../../../lib/priceListStore'

// PRICE LIST API (1083) - Estimating area.
// GET                                   -> { index, products }
// POST { action: 'check',  rows, fileName }  -> what an upload would do; nothing saved
// POST { action: 'import', rows, fileName }  -> replace the list (refused if any errors)
// POST { action: 'save',   product, originalRef }   add or change one product
// POST { action: 'delete', ref }
// rows = the sheet as arrays (the page reads the file; the SERVER re-checks
// every row - the page's preview is never trusted).

export const config = { api: { bodyParser: { sizeLimit: '6mb' } } }

async function handler(req, res) {
  const session = requireArea(req, res, 'estimating')
  if (!session) return
  if (req.method === 'GET') {
    const { index, products } = await loadPriceList()
    return res.status(200).json({ index, products })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}
  const by = session.name || session.email || ''

  if (b.action === 'check' || b.action === 'import') {
    const parsed = parseSheet(b.rows)
    const { products: current } = await loadPriceList()
    const diff = diffLists(current, parsed.products)
    const summary = {
      products: parsed.products.length, sections: sectionsOf(parsed.products).length,
      errors: parsed.errors, warnings: parsed.warnings,
      added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length,
      removedRefs: diff.removed.slice(0, 50).map(p => `${p.ref} ${p.description}`),
      priceChanged: diff.priceChanged.slice(0, 50),
    }
    if (b.action === 'check') return res.status(200).json({ summary })
    if (parsed.errors.length) return res.status(400).json({ error: `The file has ${parsed.errors.length} error(s) - nothing was imported.`, summary })
    const index = await replacePriceList(parsed.products, { by, source: String(b.fileName || '').slice(0, 200) })
    return res.status(200).json({ ok: true, index, summary })
  }
  if (b.action === 'save') {
    const r = await upsertProduct(b.product || {}, { by, originalRef: b.originalRef })
    if (r.errors) return res.status(400).json({ error: r.errors.join('; ') })
    return res.status(200).json({ ok: true, product: r.product, index: r.index })
  }
  if (b.action === 'delete') {
    const r = await deleteProduct(b.ref, { by })
    if (r.errors) return res.status(404).json({ error: r.errors[0] })
    return res.status(200).json({ ok: true, index: r.index })
  }
  return res.status(400).json({ error: "action must be 'check', 'import', 'save' or 'delete'" })
}

export default withTenant(handler)
