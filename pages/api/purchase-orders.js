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
import { privateReady, shortLink } from '../../lib/privateFiles'
import { summaryOf, listPos, loadPo, savePo, deletePo, takeNumber, loadPoSettings, savePoSettings, poTotal, lineTotal, poVat, poGross, poVatRate, createPoToken, deliveryRowFor } from '../../lib/purchaseOrders'

// a document on this PO - attachments ('po') or access routes ('po-access')
const newId = () => `po${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const money = (n) => `£${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const cleanLines = (lines) => (Array.isArray(lines) ? lines : []).map(l => ({ ref: l.ref ? String(l.ref).slice(0, 40) : null, code: String(l.code || '').slice(0, 60),
  description: String(l.description || '').replace(/\s+/g, ' ').trim().slice(0, 300), qty: (l.qty === '' || l.qty == null) ? '' : (Number(l.qty) || 0), unit: String(l.unit || '').slice(0, 30), price: Math.round((Number(l.price) || 0) * 10000) / 10000 }))
  .filter(l => l.description || l.qty > 0)
const yn = (v) => (v === 'yes' || v === 'no') ? v : ''
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const linkFor = (po) => `${baseUrl()}/po?token=${encodeURIComponent(createPoToken({ id: po.id, tenantId: currentTenantId() }))}`

// THE DELIVERY DETAILS in the email (1200)
function deliveryHtml(po, docs) {
  const yes = (v) => v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '-'
  const row = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:4px 0">${v}</td></tr>` : ''
  return `<table style="border-collapse:collapse;font-size:13px;margin:10px 0">
    ${row('Delivery required', po.deliveryDate ? `<strong>${esc(new Date(po.deliveryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}</strong>` : '')}
    ${row('Deliver to', po.deliveryAddress ? esc(po.deliveryAddress).replace(/\n/g, '<br>') : '')}
    ${row('Moffett offload required', yes(po.moffett))}
    ${row('Artics permitted', yes(po.artics))}
    ${row('Special access routes', (po.accessRoutes ? esc(po.accessRoutes).replace(/\n/g, '<br>') : '') + (docs ? `${po.accessRoutes ? '<br>' : ''}<em>${docs} document${docs === 1 ? '' : 's'} attached</em>` : ''))}
    ${row('Site contact', po.siteContact && po.siteContact.name ? `${esc(po.siteContact.name)}${po.siteContact.phone ? ` - ${esc(po.siteContact.phone)}` : ''}` : '')}
    ${row('Order confirmations to', po.confirmationsTo ? esc(po.confirmationsTo) : '')}
  </table>`
}

// ANY XERO CONTACT can be a PO's supplier (1203) - suppliers first; each with the
// price-list supplier it is linked to (any of that supplier's contacts), whose
// products can then be added.
async function xeroContacts() {
  const [links, cache] = await Promise.all([get(LINKS_KEY), get(CONTACTS_KEY)])
  const priceListOf = {}
  for (const [name, l] of Object.entries(links || {})) for (const c of (l && l.contacts) || []) priceListOf[c.id] = name
  return ((cache && cache.contacts) || []).map(c => ({ id: c.id, name: c.name, supplier: !!c.supplier, email: c.email || '', priceList: priceListOf[c.id] || '' }))
    .sort((a, b) => (b.supplier - a.supplier) || a.name.localeCompare(b.name))
}

async function linkedSuppliers() {
  const [links, cache] = await Promise.all([get(LINKS_KEY), get(CONTACTS_KEY)])
  const byId = new Map(((cache && cache.contacts) || []).map(c => [c.id, c]))
  return Object.entries(links || {}).filter(([, l]) => l && l.contacts && l.contacts.length).map(([name, l]) => {
    const main = byId.get(l.main) || l.contacts.find(c => c.id === l.main) || l.contacts[0]
    return { name, contactId: l.main, contactName: (main && main.name) || '', email: (byId.get(l.main) || {}).email || '' }
  }).sort((a, b) => a.name.localeCompare(b.name))
}
async function setDelivery(po, remove = false) {
  const rows = (await get('ops:deliveries')) || []
  const id = `app_${po.id}`, i = rows.findIndex(r => r.id === id)
  if (remove) { if (i >= 0 && !rows[i].actualDeliveryDate) { rows.splice(i, 1); await set('ops:deliveries', rows) } return }
  const row = deliveryRowFor(po)
  if (i >= 0) rows[i] = { ...rows[i], poNumber: row.poNumber, supplier: row.supplier, deliveryAddress: row.deliveryAddress, requiredDeliveryDate: row.requiredDeliveryDate, lineItems: row.lineItems, projectName: row.projectName, projectNo: row.projectNo, poSent: row.poSent }
  else rows.unshift(row)
  await set('ops:deliveries', rows)
}

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
      const [users, ops] = await Promise.all([getPortalUsers().catch(() => []), getOpsUsers().catch(() => [])])
      const name = (u) => (u.name || [u.firstName, u.lastName].filter(Boolean).join(' ')).trim()
      // ONE ENTRY PER PERSON, BY THEIR ROLE (1209): a Site App user is a Contracts
      // Manager or an operative (its accessLevel); someone in both the Site App and
      // the portal is merged into one, with whichever mobile is on record.
      const byName = new Map()
      for (const u of (ops || []).filter(u => u.active !== false)) {
        const n = name(u); if (!n) continue
        byName.set(n.toLowerCase(), { name: n, phone: u.phone || '', kind: u.accessLevel === 'contracts-manager' ? 'Contracts Manager' : 'Operative' })
      }
      for (const u of (users || []).filter(u => u.active !== false)) {
        const n = name(u); if (!n) continue
        const cur = byName.get(n.toLowerCase())
        if (cur) { if (!cur.phone && u.phone) cur.phone = u.phone }
        else byName.set(n.toLowerCase(), { name: n, phone: u.phone || '', kind: 'Portal user' })
      }
      return res.status(200).json({ people: [...byName.values()].sort((x, y) => x.name.localeCompare(y.name)) })
    }
    if (req.query.products) {
      const { products } = await loadPriceList()
      const name = String(req.query.products)
      return res.status(200).json({ products: (products || []).filter(p => p.supplier === name).map(p => ({ ref: p.ref, code: p.code || '', description: p.description, section: p.section || '', price: p.price ?? null, unit: p.sellingUnit || p.baseUnit || '' })) })
    }
    // POs listed before VAT (1204) carry no VAT figures - worked out from the PO itself
    const pos = await Promise.all((await listPos()).map(async p => p.gross != null ? p : summaryOf((await loadPo(p.id)) || p)))
    return res.status(200).json({ pos, settings: await loadPoSettings(), suppliers: await linkedSuppliers(), contacts: await xeroContacts(), canSettings: normRole(session.role) === 'admin' })
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
    const contacts = await xeroContacts()
    let sup = null
    if (src.contactId) { const c = contacts.find(x => x.id === String(src.contactId)); if (c) sup = { name: c.priceList || '', contactId: c.id, contactName: c.name, email: c.email } }
    else if (src.supplier) { const l = (await linkedSuppliers()).find(s => s.name === src.supplier); if (l) sup = l }
    const lines = cleanLines(src.lines)
    const fullCheck = () => {
      if (!sup) return 'Pick the supplier (any contact in Xero)'
      if (!src.projectId) return 'Pick the project'
      if (!lines.length) return 'Add at least one line'
      const k = lines.findIndex(l => !(Number(l.qty) > 0)); if (k >= 0) return `Line ${k + 1}${lines[k].description ? ` (${lines[k].description.slice(0, 40)})` : ''} has no quantity`
      const d = lines.findIndex(l => !l.description); if (d >= 0) return `Line ${d + 1} has no description`
      return null
    }
    if ((src.contactId || src.supplier) && !sup) return res.status(400).json({ error: 'That supplier is not in Xero\'s contacts - add it in Xero, then Refresh from Xero on Purchasing > Suppliers' })
    const fields = { projectId: String(src.projectId || ''), jobNo: String(src.jobNo || ''), projectName: String(src.projectName || ''), supplier: sup ? (sup.name || sup.contactName) : '', priceList: sup ? (sup.name || '') : '', contactId: sup ? sup.contactId : '', contactName: sup ? sup.contactName : '',
      lines, deliveryAddress: String(src.deliveryAddress || '').slice(0, 500), deliveryDate: String(src.deliveryDate || '').slice(0, 10), notes: String(src.notes || '').slice(0, 2000),
      // DELIVERY DETAILS (1200)
      moffett: yn(src.moffett), artics: yn(src.artics), accessRoutes: String(src.accessRoutes || '').slice(0, 2000),
      siteContact: { name: String((src.siteContact && src.siteContact.name) || '').slice(0, 120), phone: String((src.siteContact && src.siteContact.phone) || '').slice(0, 40) },
      confirmationsTo: String(src.confirmationsTo || '').trim().slice(0, 200),
      vat: src.vat === 'none' ? 'none' : 'standard' }   // VAT on by default; 'No VAT' an option (1204)
    const raising = !toDraft && b.action !== 'update'   // create (not a draft) or raise a draft
    const existing = b.action === 'update' ? await loadPo(String(b.id)) : null
    const strict = raising || (b.action === 'update' && existing && existing.status === 'approved')   // an approved PO stays complete when changed
    if (strict) {
      const why = fullCheck(); if (why) return res.status(400).json({ error: why })
      if (!fields.deliveryAddress.trim()) return res.status(400).json({ error: 'Enter the delivery address' })
      if (!fields.moffett) return res.status(400).json({ error: 'Answer "Is Moffett offload required?"' })
      if (!fields.artics) return res.status(400).json({ error: 'Answer "Are artics permitted?"' })
      if (!fields.siteContact.name) return res.status(400).json({ error: 'Choose the site contact' })
      // the order confirmations address: this PO's, else the company default - one is needed (1205)
      if (!fields.confirmationsTo) fields.confirmationsTo = (await loadPoSettings()).confirmationsTo || ''
      if (!fields.confirmationsTo) return res.status(400).json({ error: 'Enter where order confirmations are sent' })
    }
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
  if (b.action === 'send') {
    if (po.status === 'cancelled') return res.status(409).json({ error: `${po.number} has been cancelled` })
    const to = String(b.to || po.to || '').trim()
    if (!EMAIL.test(to)) return res.status(400).json({ error: 'Enter the supplier\'s email address' })
    const key = process.env.RESEND_API_KEY
    if (!key) return res.status(500).json({ error: 'Email is not set up for the portal' })
    const link = linkFor(po), co = companyName()
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
      <h2 style="margin:0 0 4px">Purchase order ${esc(po.number)}</h2><p style="margin:0 0 14px;color:#555">${esc(co)} - ${esc([po.jobNo, po.projectName].filter(Boolean).join(' '))}</p>
      ${b.message ? `<p>${esc(b.message).replace(/\n/g, '<br>')}</p>` : ''}
      <p><strong>Please quote ${esc(po.number)} on your invoice.</strong></p>
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
      body: JSON.stringify({ from: fromEmail('notify'), to: [to], reply_to: po.confirmationsTo || po.raisedByEmail || session.email || undefined, subject: `Purchase order ${po.number} - ${co}${po.jobNo ? ` - ${po.jobNo}` : ''}`, html, ...(attachments.length ? { attachments } : {}) }) })
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
