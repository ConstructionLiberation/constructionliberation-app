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
import { newId, esc, money, cleanLines, EMAIL, deliveryHtml, xeroContacts, linkedSuppliers, setDelivery, sitePeople, supplierProducts, resolveSupplier, buildFields, completeProblem } from '../../lib/poData'
import { privateReady, shortLink } from '../../lib/privateFiles'
import { summaryOf, listPos, loadPo, savePo, deletePo, takeNumber, loadPoSettings, savePoSettings, poTotal, lineTotal, poVat, poGross, poVatRate, createPoToken, deliveryRowFor } from '../../lib/purchaseOrders'

const linkFor = (po) => `${baseUrl()}/po?token=${encodeURIComponent(createPoToken({ id: po.id, tenantId: currentTenantId() }))}`




async function handler(req, res) {
  const session = requireArea(req, res, 'purchasing'); if (!session) return
  const by = session.name || session.email || ''
  if (req.method === 'GET') {
    if (req.query.id) {
      const po = await loadPo(String(req.query.id))
      if (!po) return res.status(404).json({ error: 'That purchase order no longer exists' })
      return res.status(200).json({ po, link: linkFor(po) })
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
    if (req.query.people) {
      return res.status(200).json({ people: await sitePeople() })
    }
    if (req.query.products) {
      return res.status(200).json({ products: await supplierProducts(String(req.query.products)) })
    }
    // POs listed before VAT (1204) carry no VAT figures - worked out from the PO itself
    const pos = await Promise.all((await listPos()).map(async p => p.gross != null ? p : summaryOf((await loadPo(p.id)) || p)))
    return res.status(200).json({ pos, settings: await loadPoSettings(), suppliers: await linkedSuppliers(), contacts: await xeroContacts(), companyName: companyName(), canSettings: normRole(session.role) === 'admin' })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}
  const now = new Date().toISOString()
  if (b.action === 'settings') {
    if (normRole(session.role) !== 'admin') return res.status(403).json({ error: 'Only an admin can change PO numbering' })
    return res.status(200).json({ ok: true, settings: await savePoSettings(b) })
  }
  if (b.action === 'create' || b.action === 'update' || b.action === 'raise') {
    // A DRAFT (1201) may be incomplete; RAISING checks everything - a supplier linked
    // to Xero, the project, and every line with a quantity (none quietly dropped).
    const src = b.po || {}
    const toDraft = b.action === 'create' ? !!b.draft : false
    // the supplier, the fields and the full check are shared with the Site App (lib/poData, 1211)
    const r0 = await resolveSupplier(src); if (r0.error) return res.status(400).json({ error: r0.error })
    const sup = r0.sup, lines = cleanLines(src.lines)
    const fields = buildFields(src, sup, lines)
    const raising = !toDraft && b.action !== 'update'   // create (not a draft) or raise a draft
    const existing = b.action === 'update' ? await loadPo(String(b.id)) : null
    const strict = raising || (b.action === 'update' && existing && existing.status === 'approved')   // an approved PO stays complete when changed
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
    if (po.status !== 'approved' && po.status !== 'draft') return res.status(409).json({ error: `${po.number} has been ${po.status} - it can no longer be changed` })
    if (po.status === 'draft') {
      // saving a draft again - still incomplete if need be
      const next = { ...po, ...fields, history: [...(po.history || []), { at: now, by, what: 'Draft saved' }] }
      await savePo(next)
      return res.status(200).json({ ok: true, po: next })
    }
    const next = { ...po, ...fields, history: [...(po.history || []), { at: now, by, what: 'Changed' }] }
    await savePo(next); await setDelivery(next)
    return res.status(200).json({ ok: true, po: next })
  }
  const po = await loadPo(String(b.id || ''))
  if (!po) return res.status(404).json({ error: 'That purchase order no longer exists' })
  if (b.action === 'discard') {
    if (po.status !== 'draft') return res.status(409).json({ error: 'Only a draft can be deleted - cancel a raised PO instead' })
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
