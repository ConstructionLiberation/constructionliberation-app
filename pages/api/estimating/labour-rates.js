import { requireArea } from '../../../lib/portalAuth'
import withTenant from '../../../lib/withTenant'
import { parseLabourSheet, diffLabour, sectionsOf } from '../../../lib/labourRates'
import { loadLabour, replaceLabour, upsertLabour, removeLabour, loadLabourSettings, saveLabourSettings } from '../../../lib/labourRatesStore'

// LABOUR RATES API (1086) - Estimating area. Same shape as the price list:
// GET -> { index, items, settings }
// POST check | import (rows, fileName) | save (item, originalRef) | delete (ref)
//      | settings (dayRate, hoursPerDay)
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

async function handler(req, res) {
  const session = requireArea(req, res, 'estimating')
  if (!session) return
  if (req.method === 'GET') {
    const [{ index, items }, settings] = await Promise.all([loadLabour(), loadLabourSettings()])
    return res.status(200).json({ index, items, settings })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}
  const by = session.name || session.email || ''
  if (b.action === 'check' || b.action === 'import') {
    const parsed = parseLabourSheet(b.rows)
    const { items: current } = await loadLabour()
    const diff = diffLabour(current, parsed.items)
    const summary = {
      products: parsed.items.length, sections: sectionsOf(parsed.items).length, errors: parsed.errors, warnings: parsed.warnings,
      added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length,
      removedRefs: diff.removed.slice(0, 50).map(p => `${p.ref} ${p.description}`),
      priceChanged: diff.rateChanged.slice(0, 50),
    }
    if (b.action === 'check') return res.status(200).json({ summary })
    if (parsed.errors.length) return res.status(400).json({ error: `The file has ${parsed.errors.length} error(s) - nothing was imported.`, summary })
    const index = await replaceLabour(parsed.items, { by, source: String(b.fileName || '').slice(0, 200) })
    return res.status(200).json({ ok: true, index, summary })
  }
  if (b.action === 'save') {
    const r = await upsertLabour(b.item || {}, { by, originalRef: b.originalRef })
    if (r.errors) return res.status(400).json({ error: r.errors.join('; ') })
    return res.status(200).json({ ok: true, item: r.item, index: r.index })
  }
  if (b.action === 'delete') {
    const r = await removeLabour(b.ref, { by })
    if (r.errors) return res.status(404).json({ error: r.errors[0] })
    return res.status(200).json({ ok: true, index: r.index })
  }
  if (b.action === 'settings') {
    const r = await saveLabourSettings(b, { by })
    if (r.errors) return res.status(400).json({ error: r.errors.join('; ') })
    return res.status(200).json({ ok: true, settings: r.settings })
  }
  return res.status(400).json({ error: "action must be 'check', 'import', 'save', 'delete' or 'settings'" })
}

export default withTenant(handler)
