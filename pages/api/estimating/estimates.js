import { requireArea } from '../../../lib/portalAuth'
import withTenant from '../../../lib/withTenant'
import { get, set } from '../../../lib/db'
import { checkEstimate, newId, priceEstimate, nextRevision, diffEstimates, crmDetailsOf } from '../../../lib/estimate'
import { resolveMerged } from '../../../lib/crmMerge'
import { listEstimates, loadEstimate, saveEstimate, deleteEstimate, saveRevision, loadRevision } from '../../../lib/estimateStore'
import { loadPriceList } from '../../../lib/priceListStore'
import { loadLabour, loadLabourSettings } from '../../../lib/labourRatesStore'

// ESTIMATES API (1088) - Estimating area.
// GET                  -> { estimates }  the list
// GET ?id=             -> { estimate }
// GET ?deals=1         -> { deals: [{ id, title, organisation, status }] }  to link a CRM deal
// POST create { dealId?, title? }   -> { estimate }  (settings start from the company's day rate)
// POST save   { estimate }          -> the whole estimate; the list total is worked out HERE
// POST delete { id }

// THE DEAL, LIVE (1090): followed through any CRM merge to the deal it became.
// -> { dealId, title, organisation, details } or { missing: true }
async function liveDeals() {
  const [deals, merged] = await Promise.all([get('crm:deals'), get('crm:merged')])
  const byId = new Map((Array.isArray(deals) ? deals : []).map(d => [String(d.id), d]))
  return (dealId) => {
    if (!dealId) return null
    const d = byId.get(resolveMerged(merged || {}, dealId))
    if (!d) return { missing: true }
    return { dealId: String(d.id), title: d.title || '', organisation: (d.fields || {}).organization || '', details: crmDetailsOf(d) }
  }
}

async function loadLib() {
  const [{ products }, { items }] = await Promise.all([loadPriceList(), loadLabour()])
  return { product: Object.fromEntries(products.map(p => [p.ref, p])), labour: Object.fromEntries(items.map(i => [i.ref, i])) }
}

async function summaryOf(est, lib) {
  const { totals } = priceEstimate(est, lib || await loadLib())
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
    if (req.query.id && req.query.rev) {
      const r = await loadRevision(String(req.query.id), String(req.query.rev))
      if (!r) return res.status(404).json({ error: 'That revision was not found' })
      return res.status(200).json({ revision: r })
    }
    if (req.query.id) {
      const est = await loadEstimate(String(req.query.id))
      if (!est) return res.status(404).json({ error: 'That estimate no longer exists' })
      return res.status(200).json({ estimate: est, crm: (await liveDeals())(est.dealId) })
    }
    // The list shows the deal's CURRENT name and customer, not the ones it had when saved.
    const live = await liveDeals()
    return res.status(200).json({ estimates: (await listEstimates()).map(e => {
      const d = live(e.dealId)
      return d && !d.missing ? { ...e, dealTitle: d.title, organisation: d.organisation } : e
    }) })
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
      // Linked: the project and customer details are read LIVE from the deal, never copied.
      quoteRef: '', revision: 'A', header: b.dealId ? {} : { project: String(b.title || '') },
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
    // Issued revisions are only ever added by 'issue' - a save cannot rewrite them.
    const saved = { ...existing, ...est, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy, revisions: existing.revisions || [], revision: existing.revision, updatedAt: new Date().toISOString(), updatedBy: by }
    await saveEstimate(saved, await summaryOf(saved))
    return res.status(200).json({ ok: true, estimate: saved })
  }
  // ISSUE A REVISION (1089). The SAVED estimate is frozen as its current
  // revision (kept for ever, with what changed since the one before), the
  // estimate moves on to the next letter, and the linked CRM deal's value is
  // set to the issued total - with a value history entry, exactly as an edit in
  // the CRM makes, so Value of work priced counts it.
  if (b.action === 'issue') {
    const est = await loadEstimate(String(b.id))
    if (!est) return res.status(404).json({ error: 'That estimate no longer exists' })
    if (b.baseUpdatedAt && est.updatedAt !== b.baseUpdatedAt) return res.status(409).json({ error: 'This estimate has changed since you opened it - reload, then issue' })
    const lib = await loadLib()
    const { totals } = priceEstimate(est, lib)
    if (est.settings?.profit == null) return res.status(400).json({ error: 'Set the profit % before issuing' })
    const total = Math.round(totals.total * 100) / 100
    const prev = (est.revisions || []).slice(-1)[0]
    const prevSnap = prev ? await loadRevision(est.id, prev.revision) : null
    const changes = prevSnap ? diffEstimates(prevSnap.estimate, est, lib) : []
    const issuedAt = new Date().toISOString()
    const rev = est.revision || 'A'
    const { revisions, ...frozen } = est
    // A TRUE copy - nothing that later edits the estimate can reach the issued revision.
    // The CRM details AS THEY WERE TODAY go with the issued revision, so its
    // letter can always be reproduced exactly.
    const crmNow = (await liveDeals())(est.dealId)
    await saveRevision(est.id, rev, { revision: rev, issuedAt, issuedBy: by, note: String(b.note || '').slice(0, 500), total, estimate: JSON.parse(JSON.stringify(frozen)), crm: crmNow })
    let crm = null
    if (est.dealId) {
      const deals = (await get('crm:deals')) || []
      const target = resolveMerged((await get('crm:merged')) || {}, est.dealId)
      const i = deals.findIndex(d => String(d.id) === String(target))
      if (i < 0) crm = { error: 'The linked CRM deal no longer exists - its value was not updated' }
      else {
        const d = deals[i]
        const old = Number((d.fields || {}).value) || 0
        if (Math.abs(old - total) > 0.004) {
          const fmt = (v) => Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          deals[i] = { ...d, fields: { ...(d.fields || {}), value: total },
            history: [...(Array.isArray(d.history) ? d.history : []), { id: newId('h'), type: 'value', ts: issuedAt, text: `Value: ${fmt(old)} → ${fmt(total)} (estimate ${est.quoteRef || est.title} Rev ${rev}, by ${by})`, oldValue: old, newValue: total }] }
          await set('crm:deals', deals)
          crm = { updated: true, from: old, to: total }
        } else crm = { updated: false, note: 'The deal already had this value' }
      }
    }
    const next = { ...est, revision: nextRevision(rev), updatedAt: issuedAt, updatedBy: by,
      revisions: [...(est.revisions || []), { revision: rev, issuedAt, issuedBy: by, note: String(b.note || '').slice(0, 500), total, changes }] }
    await saveEstimate(next, await summaryOf(next, lib))
    return res.status(200).json({ ok: true, estimate: next, issued: rev, total, crm, changes })
  }
  // LINK a deal (1090) - an estimate started without one, or moved to another.
  if (b.action === 'link') {
    const est = await loadEstimate(String(b.id))
    if (!est) return res.status(404).json({ error: 'That estimate no longer exists' })
    const d = (await liveDeals())(b.dealId)
    if (!d || d.missing) return res.status(404).json({ error: 'That CRM deal no longer exists' })
    const next = { ...est, dealId: d.dealId, dealTitle: d.title, organisation: d.organisation, updatedAt: new Date().toISOString(), updatedBy: by }
    await saveEstimate(next, await summaryOf(next))
    return res.status(200).json({ ok: true, estimate: next, crm: d })
  }
  if (b.action === 'delete') {
    await deleteEstimate(String(b.id))
    return res.status(200).json({ ok: true })
  }
  return res.status(400).json({ error: "action must be 'create', 'save' or 'delete'" })
}

export default withTenant(handler)
