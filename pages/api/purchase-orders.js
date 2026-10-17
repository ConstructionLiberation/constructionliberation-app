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
    if (b.action === 'create') {
      const st = await loadPoSettings()
      if (!fields.confirmationsTo) fields.confirmationsTo = st.confirmationsTo || ''
      fields.vatRate = st.vatRate   // kept on the PO - a later change of rate does not alter it
      if (toDraft) {
        // a DRAFT: no number, not approved, not in Deliveries, cannot be sent
        const po = { id: newId(), number: null, status: 'draft', ...fields, to: (sup && sup.email) || '', raisedBy: by, raisedByEmail: session.email || '', createdAt: now, raisedAt: now, history: [{ at: now, by, what: 'Saved as a draft' }] }
        await savePo(po)
        return res.status(200).json({ ok: true, po })
      }
      // raised by the office: approved on raising (operatives' POs wait for the CM - stage 2b)
      const po = { id: newId(), number: await takeNumber(), status: 'approved', ...fields, to: sup.email || '', raisedBy: by, raisedByEmail: session.email || '', raisedAt: now, approvedBy: by, approvedAt: now, history: [{ at: now, by, what: 'Raised and approved' }] }
      await savePo(po); await setDelivery(po)
      return res.status(200).json({ ok: true, po })
    }
    const po = await loadPo(String(b.id))
    if (!po) return res.status(404).json({ error: 'That purchase order no longer exists' })
    if (b.action === 'raise') {
      if (po.status !== 'draft') return res.status(409).json({ error: `${po.number} has already been raised` })
      // a draft takes the VAT rate in force when it is RAISED (1204)
      const next = { ...po, ...fields, vatRate: (await loadPoSettings()).vatRate, number: await takeNumber(), status: 'approved', to: po.to || sup.email || '', raisedBy: by, raisedByEmail: session.email || '', raisedAt: now, approvedBy: by, approvedAt: now, history: [...(po.history || []), { at: now, by, what: 'Raised and approved' }] }
      await savePo(next); await setDelivery(next)
      return res.status(200).json({ ok: true, po: next })
    }
    if (po.status !== 'approved' && po.status !== 'draft') return res.status(409).json({ error: `${po.number} has been ${po.status} - it can no longer be changed` })
    if (po.status === 'draft') {
      // saving a draft again - still incomplete if need be
      const next = { ...po, ...fields, to: po.to || (sup && sup.email) || '', history: [...(po.history || []), { at: now, by, what: 'Draft saved' }] }
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
    const to = String(b.to || po.to || '').trim()
    if (!EMAIL.test(to)) return res.status(400).json({ error: 'Enter the supplier\'s email address' })
    const key = process.env.RESEND_API_KEY
    if (!key) return res.status(500).json({ error: 'Email is not set up for the portal' })
    const link = linkFor(po), co = companyName()
    // THE MESSAGE (1210): what was edited in the send box, else the company template filled in
    const st = await loadPoSettings(), vals = poEmailValues(po, co)
    const subject = String(b.subject || '').trim() || fillPoEmail(st.emailSubject || DEFAULT_PO_EMAIL.subject, vals)
    const body = String(b.body != null ? b.body : (b.message || '')).trim() || fillPoEmail(st.emailBody || DEFAULT_PO_EMAIL.body, vals)
    // THE ATTACHMENTS, ATTACHED (1202) - the PO's attachments and its access route
    // documents go with the email as files; the email service fetches each through a
    // link that lasts minutes. They are also on the supplier's page.
    const [attachDocs, accessDocs] = await Promise.all([listDocs('po', po.id).catch(() => []), listDocs('po-access', po.id).catch(() => [])])
    let attachments = []
    if (privateReady()) {
      try { attachments = await Promise.all([...attachDocs, ...accessDocs].map(async d => ({ filename: d.name, path: await shortLink(d.pathname) }))) }
      catch (e) { return res.status(502).json({ error: `The attachments could not be prepared: ${e.message}` }) }
    }
    const rows = po.lines.map(l => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(l.description)}${l.code ? `<br><span style="color:#888;font-size:12px">${esc(l.code)}</span>` : ''}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${esc(l.qty)} ${esc(l.unit)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(l.price)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(lineTotal(l))}</td></tr>`).join('')
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:680px">
      <div style="white-space:normal;margin:0 0 18px">${esc(body).split(/\n{2,}/).map(par => `<p style="margin:0 0 10px">${par.replace(/\n/g, '<br>')}</p>`).join('')}</div>
      <h3 style="margin:0 0 4px;font-size:16px">Purchase order ${esc(po.number)}</h3><p style="margin:0 0 10px;color:#555">${esc(co)} - ${esc([po.jobNo, po.projectName].filter(Boolean).join(' '))}</p>
      ${deliveryHtml(po, accessDocs.length)}
      ${attachDocs.length ? `<p>Attached: ${attachDocs.map(d => esc(d.name)).join(', ')}</p>` : ''}
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin:10px 0"><tr style="background:#f5f5f3"><th style="padding:6px 8px;text-align:left">Item</th><th style="padding:6px 8px;text-align:right">Qty</th><th style="padding:6px 8px;text-align:right">Price</th><th style="padding:6px 8px;text-align:right">Total</th></tr>${rows}
      <tr><td colspan="3" style="padding:6px 8px;text-align:right">Subtotal (ex VAT)</td><td style="padding:6px 8px;text-align:right">${money(poTotal(po))}</td></tr>
      <tr><td colspan="3" style="padding:6px 8px;text-align:right">${po.vat === 'none' ? 'No VAT' : `VAT ${poVatRate(po)}%`}</td><td style="padding:6px 8px;text-align:right">${money(poVat(po))}</td></tr>
      <tr><td colspan="3" style="padding:8px;text-align:right;font-weight:bold">Total</td><td style="padding:8px;text-align:right;font-weight:bold">${money(poGross(po))}</td></tr></table>
      ${po.notes ? `<p><strong>Additional notes</strong><br>${esc(po.notes).replace(/\n/g, '<br>')}</p>` : ''}
      <p><a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none">View or print the purchase order</a></p>
      <p style="color:#888;font-size:12px">Raised by ${esc(po.raisedBy)}. ${po.confirmationsTo ? `Please send the order confirmation to ${esc(po.confirmationsTo)} - replying to this email reaches it.` : 'Reply to this email with any questions.'}</p></div>`
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail('notify'), to: [to], reply_to: po.confirmationsTo || po.raisedByEmail || session.email || undefined, subject: subject.slice(0, 300), html, ...(attachments.length ? { attachments } : {}) }) })
    if (!r.ok) { const t = await r.text().catch(() => ''); return res.status(502).json({ error: `The email could not be sent (${r.status}) ${t.slice(0, 200)}` }) }
    const next = { ...po, status: 'sent', to, sentAt: now, sentTo: to, sentBy: by, history: [...(po.history || []), { at: now, by, what: `Sent to ${to}` }] }
    await savePo(next); await setDelivery(next)
    return res.status(200).json({ ok: true, po: next })
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
