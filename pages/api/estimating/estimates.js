import { requireArea } from '../../../lib/portalAuth'
import withTenant from '../../../lib/withTenant'
import { get } from '../../../lib/db'
import { checkEstimate, newId, priceEstimate } from '../../../lib/estimate'
import { listEstimates, loadEstimate, saveEstimate, deleteEstimate } from '../../../lib/estimateStore'
import { loadPriceList } from '../../../lib/priceListStore'
import { loadLabour, loadLabourSettings } from '../../../lib/labourRatesStore'

// ESTIMATES API (1088) - Estimating area.
// GET                  -> { estimates }  the list
// GET ?id=             -> { estimate }
// GET ?deals=1         -> { deals: [{ id, title, organisation, status }] }  to link a CRM deal
// POST create { dealId?, title? }   -> { estimate }  (settings start from the company's day rate)
// POST save   { estimate }          -> the whole estimate; the list total is worked out HERE
// POST delete { id }

async function summaryOf(est) {
  const [{ products }, { items }] = await Promise.all([loadPriceList(), loadLabour()])
  const lib = { product: Object.fromEntries(products.map(p => [p.ref, p])), labour: Object.fromEntries(items.map(i => [i.ref, i])) }
  const { totals } = priceEstimate(est, lib)
  return {
    id: est.id, quoteRef: est.quoteRef || '', revision: est.revision || '', title: est.title || '',
    dealId: est.dealId || null, dealTitle: est.dealTitle || '', organisation: est.organisation || '',
    total: Math.round(totals.total * 100) / 100, items: totals.items, updatedAt: est.updatedAt, updatedBy: est.updatedBy,
  }
}

async function handler(req, res) {
  const session = requireArea(req, res, 'estimating')
  if (!session) return
  const by = session.name || session.email || ''
  if (req.method === 'GET') {
    if (req.query.deals) {
      const deals = (await get('crm:deals')) || []
      return res.status(200).json({ deals: (Array.isArray(deals) ? deals : []).map(d => ({ id: d.id, title: d.title || '', organisation: (d.fields || {}).organization || '', status: d.status || '' })) })
    }
    if (req.query.id) {
      const est = await loadEstimate(String(req.query.id))
      if (!est) return res.status(404).json({ error: 'That estimate no longer exists' })
      return res.status(200).json({ estimate: est })
    }
    return res.status(200).json({ estimates: await listEstimates() })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}

  if (b.action === 'create') {
    let dealTitle = '', organisation = ''
    if (b.dealId) {
      const d = ((await get('crm:deals')) || []).find(x => String(x.id) === String(b.dealId))
      if (!d) return res.status(404).json({ error: 'That CRM deal no longer exists' })
      dealTitle = d.title || ''; organisation = (d.fields || {}).organization || ''
    }
    const ls = await loadLabourSettings()
    const now = new Date().toISOString()
    const est = {
      id: newId('e'), dealId: b.dealId || null, dealTitle, organisation, title: String(b.title || dealTitle || 'New estimate').slice(0, 200),
      quoteRef: '', revision: 'A', header: { project: dealTitle, contractor: organisation },
      // Profit and MCD are the estimator's to set; the day rate starts from the company setting.
      settings: { profit: null, mcd: null, labourFactor: 1, dayRate: ls?.dayRate ?? null },
      rows: [], createdAt: now, createdBy: by, updatedAt: now, updatedBy: by,
    }
    await saveEstimate(est, await summaryOf(est))
    return res.status(200).json({ estimate: est })
  }
  if (b.action === 'save') {
    const est = b.estimate
    const errors = checkEstimate(est)
    if (errors.length) return res.status(400).json({ error: errors.join('; ') })
    const existing = await loadEstimate(est.id)
    if (!existing) return res.status(404).json({ error: 'That estimate no longer exists' })
    // Someone else saved since this was opened -> refuse rather than overwrite their work.
    if (b.baseUpdatedAt && existing.updatedAt !== b.baseUpdatedAt) {
      return res.status(409).json({ error: `${existing.updatedBy || 'Someone'} saved this estimate at ${new Date(existing.updatedAt).toLocaleTimeString('en-GB')} since you opened it - reload to see their changes before saving` })
    }
    const saved = { ...existing, ...est, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy, updatedAt: new Date().toISOString(), updatedBy: by }
    await saveEstimate(saved, await summaryOf(saved))
    return res.status(200).json({ ok: true, estimate: saved })
  }
  if (b.action === 'delete') {
    await deleteEstimate(String(b.id))
    return res.status(200).json({ ok: true })
  }
  return res.status(400).json({ error: "action must be 'create', 'save' or 'delete'" })
}

export default withTenant(handler)
