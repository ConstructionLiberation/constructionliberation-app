// PURCHASE ORDERS (1199) - stage 2a: raised by the office from the price list.
//
//   GET                         -> { pos, settings, suppliers, canSettings }
//   GET ?id=                    -> { po, link }            (link = the supplier's no-login page)
//   GET ?products=<supplier>    -> { products }            (that supplier's price-list products)
//   POST { action: 'create', po }            raised by the office -> approved; numbered; into Deliveries
//   POST { action: 'update', id, po }        until it is sent
//   POST { action: 'send', id, to, message } emailed to the supplier with the link
//   POST { action: 'cancel', id, reason }
//   POST { action: 'settings', prefix, next, width }    admins
//
// Nothing is written to Xero (stage 3). A PO is a commitment, never a cost.
import withTenant from '../../lib/withTenant'
import { requireArea } from '../../lib/portalAuth'
import { normRole } from '../../lib/roles'
import { get, set, getPortalUsers, getOpsUsers, getProject } from '../../lib/db'
import { currentTenantId } from '../../lib/tenantContext'
import { fromEmail, baseUrl, companyName } from '../../lib/tenantSettings'
import { loadPriceList } from '../../lib/priceListStore'
import { LINKS_KEY, CONTACTS_KEY } from '../../lib/suppliers'
import { listDocs } from '../../lib/documentsStore'
import { DEFAULT_PO_EMAIL, poEmailValues, fillPoEmail } from '../../lib/poShared'
import { sendPurchaseOrder } from '../../lib/poSend'
import { decidePo } from '../../lib/poApprove'
import { xeroPoProjects, xeroById, xeroMatch, projectGaps, GAPS_DISMISSED } from '../../lib/poProjects'
import { committedFor, committedOf } from '../../lib/poCommitted'
import { findProjectCM } from '../../lib/ramsNotify'
import { newId, esc, money, cleanLines, EMAIL, deliveryHtml, xeroContacts, linkedSuppliers, setDelivery, sitePeople, supplierProducts, resolveSupplier, buildFields, completeProblem } from '../../lib/poData'
import { privateReady, shortLink } from '../../lib/privateFiles'
import { summaryOf, listPos, loadPo, savePo, deletePo, takeNumber, loadPoSettings, savePoSettings, poTotal, lineTotal, poVat, poGross, poVatRate, createPoToken, deliveryRowFor } from '../../lib/purchaseOrders'

const linkFor = (po) => `${baseUrl()}/po?token=${encodeURIComponent(createPoToken({ id: po.id, tenantId: currentTenantId() }))}`




// the project's CM, as the Site App and the RAMS notifications find them
async function projectCmOf(po) {
  try { const p = ((await get('ops:projects')) || []).find(x => String(x.projectNo).toLowerCase() === String(po.jobNo || '').toLowerCase()); return p ? await findProjectCM(p) : null } catch { return null }
}

async function handler(req, res) {
  const session = requireArea(req, res, 'purchasing'); if (!session) return
  const by = session.name || session.email || ''
  if (req.method === 'GET') {
    if (req.query.id) {
      const po = await loadPo(String(req.query.id))
      if (!po) return res.status(404).json({ error: 'That purchase order no longer exists' })
      const cm = po.status === 'awaiting-approval' ? await projectCmOf(po) : null
      return res.status(200).json({ po, link: linkFor(po), cmName: cm ? [cm.firstName, cm.lastName].filter(Boolean).join(' ') || cm.name || '' : '' })
    }
    // THE PROJECT'S ADDRESS from Project Details - the commercial override, else the IHM (1200)
    if (req.query.project) {
      let projectAddress = ''
      try {
        const { resolveProjectPeople } = await import('../../lib/projectPeople')
        const [ops, users, settings] = await Promise.all([get('ops:projects'), getPortalUsers(), getProject(String(req.query.project))])
        const rp = resolveProjectPeople({ jobNo: String(req.query.jobNo || ''), opsProjects: ops || [], users: users || [], override: (settings && settings.peopleOverride) || {} })
        projectAddress = (rp && rp.projectAddress) || ''
      } catch {}
      return res.status(200).json({ projectAddress })
    }
    // SITE CONTACTS - every active operative (Site App users) and portal user, with mobile (1200)
    // COMMITTED COSTS for a project (1221) - its open POs less what has been billed
    if (req.query.committed) return res.status(200).json(await committedFor(String(req.query.committed)))
    if (req.query.people) {
      return res.status(200).json({ people: await sitePeople() })
    }
    if (req.query.products) {
      return res.status(200).json({ products: await supplierProducts(String(req.query.products)) })
    }
    // POs listed before VAT (1204) carry no VAT figures - worked out from the PO itself
    const pos0 = await Promise.all((await listPos()).map(async p => p.gross != null ? p : summaryOf((await loadPo(p.id)) || p)))
    // billed and still committed on each approved / sent / closed PO (1221) - one read of
    // each project's cost lines
    const linesOf = {}, pos = []
    for (const p of pos0) {
      if (!['approved', 'sent', 'closed'].includes(p.status)) { pos.push(p); continue }
      const pid = String(p.projectId || '')
      if (!(pid in linesOf)) linesOf[pid] = (await get(`costs:lines:${pid}`).catch(() => null)) || []
      const full = await loadPo(p.id)
      const c = full ? committedOf(full, linesOf[pid]) : null
      pos.push(c ? { ...p, billed: c.billed, committed: c.committed } : p)
    }
    // THE PROJECTS - Xero's, the same lookup as the Site App (1217); and what needs fixing
    const xp = await xeroPoProjects()
    const unlinked = pos.filter(p => p.status !== 'cancelled' && !xeroById(xp, p.projectId)).length
    const allGaps = await projectGaps()
    return res.status(200).json({ projects: xp, gaps: allGaps.filter(g => !g.dismissed), gapsDismissed: allGaps.filter(g => g.dismissed).length, unlinked, canRelink: ['admin', 'management'].includes(normRole(session.role)), pos, settings: await loadPoSettings(), suppliers: await linkedSuppliers(), contacts: await xeroContacts(), companyName: companyName(), canSettings: normRole(session.role) === 'admin' })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}
  const now = new Date().toISOString()
  if (b.action === 'settings') {
    if (normRole(session.role) !== 'admin') return res.status(403).json({ error: 'Only an admin can change PO numbering' })
    return res.status(200).json({ ok: true, settings: await savePoSettings(b) })
  }
  // DISMISS / RESTORE A PROJECT IN THE "NOT IN XERO" NOTICE (1219) - management / admin
  if (b.action === 'dismiss-gap' || b.action === 'restore-gaps') {
    if (!['admin', 'management'].includes(normRole(session.role))) return res.status(403).json({ error: 'Only management or an admin can change this' })
    const cur = ((await get(GAPS_DISMISSED)) || []).map(String)
    await set(GAPS_DISMISSED, b.action === 'restore-gaps' ? [] : [...new Set([...cur, String(b.key || '')])].filter(Boolean))
    return res.status(200).json({ ok: true })
  }
  // RELINK BY JOB NUMBER (1217) - POs saved without a Xero project (or with one no
  // longer in the list) are tied to the Xero project of the same job number.
  if (b.action === 'relink') {
    if (!['admin', 'management'].includes(normRole(session.role))) return res.status(403).json({ error: 'Only management or an admin can relink purchase orders' })
    const xp = await xeroPoProjects(), relinked = [], unmatched = []
    for (const s0 of await listPos()) {
      if (s0.status === 'cancelled' || xeroById(xp, s0.projectId)) continue
      const p = await loadPo(s0.id); if (!p) continue
      const x = xeroMatch(xp, p.jobNo, p.projectName)
      if (!x) { unmatched.push(`${p.number || 'Draft'} (${p.jobNo || 'no job number'})`); continue }
      const next = { ...p, projectId: x.projectId, jobNo: x.jobNo, projectName: x.name, history: [...(p.history || []), { at: new Date().toISOString(), by, what: `Linked to Xero project ${x.jobNo} ${x.name}` }] }
      await savePo(next); if (next.status === 'approved' || next.status === 'sent') await setDelivery(next)
      relinked.push(`${p.number || 'Draft'} -> ${x.jobNo} ${x.name}`)
    }
    return res.status(200).json({ ok: true, relinked, unmatched })
  }
  if (b.action === 'create' || b.action === 'update' || b.action === 'raise') {
    // A DRAFT (1201) may be incomplete; RAISING checks everything - a supplier linked
    // to Xero, the project, and every line with a quantity (none quietly dropped).
    const src = b.po || {}
    const toDraft = b.action === 'create' ? !!b.draft : false
    // the supplier, the fields and the full check are shared with the Site App (lib/poData, 1211)
    const r0 = await resolveSupplier(src); if (r0.error) return res.status(400).json({ error: r0.error })
    const sup = r0.sup, lines = cleanLines(src.lines)
    // THE PROJECT, from Xero on the server - its id, job number and name (1217)
    const xp = await xeroPoProjects(), proj = src.projectId ? xeroById(xp, src.projectId) : null
    const fields = buildFields(proj ? { ...src, projectId: proj.projectId, jobNo: proj.jobNo, projectName: proj.name } : src, sup, lines)
    const raising = !toDraft && b.action !== 'update'   // create (not a draft) or raise a draft
    const existing = b.action === 'update' ? await loadPo(String(b.id)) : null
    const strict = raising || (b.action === 'update' && existing && (existing.status === 'approved' || existing.status === 'awaiting-approval'))   // an approved or waiting PO stays complete when changed
    if (strict && fields.projectId && !proj) return res.status(400).json({ error: 'That project is not in Xero - pick it again, or relink this PO by its job number (Purchase Orders list)' })
    if (strict) { const why = await completeProblem(fields, sup, lines); if (why) return res.status(400).json({ error: why }) }
    if (fields.confirmationsTo && !EMAIL.test(fields.confirmationsTo)) return res.status(400).json({ error: 'The order confirmations address is not a valid email address' })
    if (fields.to && !EMAIL.test(fields.to)) return res.status(400).json({ error: 'The supplier email address is not valid' })
    if (b.action === 'create') {
      const st = await loadPoSettings()
      if (!fields.confirmationsTo) fields.confirmationsTo = st.confirmationsTo || ''
      fields.vatRate = st.vatRate   // kept on the PO - a later change of rate does not alter it
      if (toDraft) {
        // a DRAFT: no number, not approved, not in Deliveries, cannot be sent
        const po = { id: newId(), number: null, status: 'draft', ...fields, raisedBy: by, raisedByEmail: session.email || '', createdAt: now, raisedAt: now, history: [{ at: now, by, what: 'Saved as a draft' }] }
        await savePo(po)
        return res.status(200).json({ ok: true, po })
      }
      // raised by the office: approved on raising (operatives' POs wait for the CM - stage 2b)
      const po = { id: newId(), number: await takeNumber(), status: 'approved', ...fields, raisedBy: by, raisedByEmail: session.email || '', raisedAt: now, approvedBy: by, approvedAt: now, history: [{ at: now, by, what: 'Raised and approved' }] }
      await savePo(po); await setDelivery(po)
      return res.status(200).json({ ok: true, po })
    }
    const po = await loadPo(String(b.id))
    if (!po) return res.status(404).json({ error: 'That purchase order no longer exists' })
    if (b.action === 'raise') {
      if (po.status !== 'draft') return res.status(409).json({ error: `${po.number} has already been raised` })
      // a draft takes the VAT rate in force when it is RAISED (1204)
      const next = { ...po, ...fields, vatRate: (await loadPoSettings()).vatRate, number: await takeNumber(), status: 'approved', raisedBy: by, raisedByEmail: session.email || '', raisedAt: now, approvedBy: by, approvedAt: now, history: [...(po.history || []), { at: now, by, what: 'Raised and approved' }] }
      await savePo(next); await setDelivery(next)
      return res.status(200).json({ ok: true, po: next })
    }
    if (po.status !== 'approved' && po.status !== 'draft' && po.status !== 'awaiting-approval') return res.status(409).json({ error: `${po.number} has been ${po.status} - it can no longer be changed` })
    if (po.status === 'draft') {
      // saving a draft again - still incomplete if need be
      const next = { ...po, ...fields, history: [...(po.history || []), { at: now, by, what: 'Draft saved' }] }
      await savePo(next)
      return res.status(200).json({ ok: true, po: next })
    }
    const next = { ...po, ...fields, history: [...(po.history || []), { at: now, by, what: 'Changed' }] }
    await savePo(next); if (next.status === 'approved') await setDelivery(next)
    return res.status(200).json({ ok: true, po: next })
  }
  const po = await loadPo(String(b.id || ''))
  if (!po) return res.status(404).json({ error: 'That purchase order no longer exists' })
  // COVER FOR THE CM (1216) - any portal user with Purchasing can approve (and send)
  // or reject a PO raised in the Site App, e.g. when the CM is away. The same decision
  // as the CM's (lib/poApprove); the history says who and where; the CM is told.
  if (b.action === 'approve' || b.action === 'reject') {
    const cm = await projectCmOf(po)
    const r = await decidePo(po, { action: b.action, by, where: ` by ${by} in the portal`, reason: b.reason, send: false, replyFallback: session.email,
      cm: cm && cm.email && String(cm.email).toLowerCase() !== String(session.email || '').toLowerCase() ? { email: cm.email, firstName: cm.firstName || '' } : null })
    if (r.error) return res.status(r.status || 400).json({ error: r.error })
    return res.status(200).json({ ok: true, ...r })
  }
  // MARK AS FULLY BILLED (1221) - for a PO whose bill did not quote its number, so it
  // stops counting as committed; REOPEN puts it back
  if (b.action === 'close') {
    if (po.status !== 'approved' && po.status !== 'sent') return res.status(409).json({ error: 'Only an approved or sent purchase order can be marked as billed' })
    const now = new Date().toISOString()
    const next = { ...po, status: 'closed', closedFrom: po.status, closedBy: by, closedAt: now, history: [...(po.history || []), { at: now, by, what: 'Marked as fully billed' }] }
    await savePo(next); return res.status(200).json({ ok: true, po: next })
  }
  if (b.action === 'reopen') {
    if (po.status !== 'closed') return res.status(409).json({ error: 'It is not closed' })
    const now = new Date().toISOString()
    const next = { ...po, status: po.closedFrom || 'sent', closedFrom: null, history: [...(po.history || []), { at: now, by, what: 'Reopened - still to be billed' }] }
    await savePo(next); return res.status(200).json({ ok: true, po: next })
  }
  if (b.action === 'discard') {
    // DELETING (1219): a draft - anyone; a CANCELLED or REJECTED PO - management / admin;
    // never a live one (awaiting approval, approved, sent) - cancel it first
    if (po.status === 'cancelled' || po.status === 'rejected') {
      if (!['admin', 'management'].includes(normRole(session.role))) return res.status(403).json({ error: 'Only management or an admin can delete a cancelled or rejected purchase order' })
      await setDelivery(po, true).catch(() => {})
      await deletePo(po.id)
      return res.status(200).json({ ok: true })
    }
    if (po.status !== 'draft') return res.status(409).json({ error: 'Cancel it first - only a draft, or a cancelled or rejected purchase order, can be deleted' })
    await deletePo(po.id)
    return res.status(200).json({ ok: true })
  }
  if (po.status === 'draft') return res.status(409).json({ error: 'This is a draft - raise it first' })
  // only an APPROVED purchase order goes to a supplier (1211) - not one awaiting the CM, nor a rejected one
  if (b.action === 'send' && po.status !== 'approved' && po.status !== 'sent') return res.status(409).json({ error: po.status === 'awaiting-approval' ? 'This purchase order is awaiting the CM\'s approval' : `This purchase order has been ${po.status}` })
  if (b.action === 'send') {
    if (po.status === 'cancelled') return res.status(409).json({ error: `${po.number} has been cancelled` })
    // the shared sender (lib/poSend, 1215) - the same email the Site App sends
    const r = await sendPurchaseOrder(po, { to: b.to, subject: b.subject, body: b.body != null ? b.body : b.message, by, replyFallback: session.email })
    if (r.error) return res.status(r.status || 400).json({ error: r.error })
    return res.status(200).json({ ok: true, po: r.po })
  }
  if (b.action === 'cancel') {
    if (po.status === 'cancelled') return res.status(200).json({ ok: true, po })
    const next = { ...po, status: 'cancelled', cancelledAt: now, cancelledBy: by, cancelReason: String(b.reason || '').slice(0, 500), history: [...(po.history || []), { at: now, by, what: `Cancelled${b.reason ? `: ${b.reason}` : ''}` }] }
    await savePo(next); await setDelivery(next, true)
    return res.status(200).json({ ok: true, po: next })
  }
  return res.status(400).json({ error: 'Unknown action' })
}
export default withTenant(handler)
