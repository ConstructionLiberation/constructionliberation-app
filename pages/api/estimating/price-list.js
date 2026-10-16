import { requireArea } from '../../../lib/portalAuth'
import withTenant from '../../../lib/withTenant'
import { parseSheet, diffLists, sectionsOf } from '../../../lib/priceList'
import { loadPriceList, loadPriceListRaw, replacePriceList, upsertProduct, deleteProduct, loadAdjustments, saveAdjustments, shownProduct } from '../../../lib/priceListStore'
import { checkAdjustment } from '../../../lib/priceAdjust'

// PRICE LIST API (1083) - Estimating area.
// GET                                   -> { index, products }
// POST { action: 'check',  rows, fileName }  -> what an upload would do; nothing saved
// POST { action: 'import', rows, fileName }  -> replace the list (refused if any errors)
// POST { action: 'save',   product, originalRef }   add or change one product
// POST { action: 'delete', ref }
// POST { action: 'adjust', suppliers[], pct, from, note }  supplier increase / discount (1094)
// POST { action: 'unadjust', id }
// import: { keepAdjustments: [ids] } - an adjustment on a supplier IN the new
//   file is kept only if ticked (their new list may already include the rise)
// rows = the sheet as arrays (the page reads the file; the SERVER re-checks
// every row - the page's preview is never trusted).

export const config = { api: { bodyParser: { sizeLimit: '6mb' } } }

async function handler(req, res) {
  const session = requireArea(req, res, 'estimating')
  if (!session) return
  if (req.method === 'GET') {
    const { index, products, adjustments } = await loadPriceList()
    return res.status(200).json({ index, products, adjustments })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}
  const by = session.name || session.email || ''

  if (b.action === 'check' || b.action === 'import') {
    const parsed = parseSheet(b.rows)
    // Compared with the stored LIST prices - not the adjusted ones - so an
    // increase in force never shows every product of that supplier as changed.
    const { products: current } = await loadPriceListRaw()
    const diff = diffLists(current, parsed.products)
    const adjustments = await loadAdjustments()
    const inFile = new Set(parsed.products.map(p => String(p.supplier || '').trim().toLowerCase()))
    const affected = adjustments.filter(a => inFile.has(String(a.supplier || '').trim().toLowerCase()))
    const summary = {
      products: parsed.products.length, sections: sectionsOf(parsed.products).length,
      errors: parsed.errors, warnings: parsed.warnings,
      added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length,
      removedRefs: diff.removed.slice(0, 50).map(p => `${p.ref} ${p.description}`),
      priceChanged: diff.priceChanged.slice(0, 50),
      adjustmentsInFile: affected,
    }
    if (b.action === 'check') return res.status(200).json({ summary })
    if (parsed.errors.length) return res.status(400).json({ error: `The file has ${parsed.errors.length} error(s) - nothing was imported.`, summary })
    const index = await replacePriceList(parsed.products, { by, source: String(b.fileName || '').slice(0, 200) })
    // Adjustments on suppliers in the file are kept only if ticked; others stay.
    const keep = new Set((b.keepAdjustments || []).map(String))
    const dropped = affected.filter(a => !keep.has(a.id))
    if (dropped.length) await saveAdjustments(adjustments.filter(a => !dropped.some(d => d.id === a.id)))
    return res.status(200).json({ ok: true, index, summary, dropped: dropped.map(a => a.supplier) })
  }
  if (b.action === 'save') {
    const r = await upsertProduct(b.product || {}, { by, originalRef: b.originalRef })
    if (r.errors) return res.status(400).json({ error: r.errors.join('; ') })
    // the saved product as the list shows it, so the page updates that row only (1188)
    return res.status(200).json({ ok: true, product: r.product, shown: await shownProduct(r.product), index: r.index })
  }
  if (b.action === 'delete') {
    const r = await deleteProduct(b.ref, { by })
    if (r.errors) return res.status(404).json({ error: r.errors[0] })
    return res.status(200).json({ ok: true, index: r.index })
  }
  if (b.action === 'adjust') {
    const c = checkAdjustment(b)
    if (c.errors.length) return res.status(400).json({ error: c.errors.join('; ') })
    const { products } = await loadPriceListRaw()
    const known = new Set(products.map(p => String(p.supplier || '').trim().toLowerCase()))
    const unknown = c.suppliers.filter(s => !known.has(s.toLowerCase()))
    if (unknown.length) return res.status(400).json({ error: `Not a supplier on the price list: ${unknown.join(', ')}` })
    const now = new Date().toISOString()
    const added = c.suppliers.map(sup => ({ id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, supplier: sup, pct: c.pct, from: c.from || now.slice(0, 10), note: c.note, by, at: now }))
    const list = [...(await loadAdjustments()), ...added]
    await saveAdjustments(list)
    return res.status(200).json({ ok: true, adjustments: list })
  }
  if (b.action === 'unadjust') {
    const list = await loadAdjustments()
    if (!list.some(a => a.id === String(b.id))) return res.status(404).json({ error: 'That adjustment no longer exists' })
    const next = list.filter(a => a.id !== String(b.id))
    await saveAdjustments(next)
    return res.status(200).json({ ok: true, adjustments: next })
  }
  return res.status(400).json({ error: "action must be 'check', 'import', 'save', 'delete', 'adjust' or 'unadjust'" })
}

export default withTenant(handler)
