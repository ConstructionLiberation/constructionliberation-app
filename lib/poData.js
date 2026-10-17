// PURCHASE ORDERS - the rules shared by the office route (/api/purchase-orders) and
// the Site App route (/api/site-po) (1211): the supplier, the fields, the full check
// before a PO is raised, the email's delivery block, the Deliveries entry, the site
// contacts and a supplier's price-list products. One copy, so the two can never
// disagree about what a complete purchase order is.
import { get, set, getPortalUsers, getOpsUsers } from './db'
import { loadPriceList } from './priceListStore'
import { LINKS_KEY, CONTACTS_KEY } from './suppliers'
import { loadPoSettings, deliveryRowFor } from './purchaseOrders'

export const newId = () => `po${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export const money = (n) => `£${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const cleanLines = (lines) => (Array.isArray(lines) ? lines : []).map(l => ({ ref: l.ref ? String(l.ref).slice(0, 40) : null, code: String(l.code || '').slice(0, 60),
  description: String(l.description || '').replace(/\s+/g, ' ').trim().slice(0, 300), qty: (l.qty === '' || l.qty == null) ? '' : (Number(l.qty) || 0), unit: String(l.unit || '').slice(0, 30), price: Math.round((Number(l.price) || 0) * 10000) / 10000 }))
  .filter(l => l.description || l.qty > 0)

export const yn = (v) => (v === 'yes' || v === 'no') ? v : ''

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// THE DELIVERY DETAILS in the email (1200)
export function deliveryHtml(po, docs) {
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
export async function xeroContacts() {
  const [links, cache] = await Promise.all([get(LINKS_KEY), get(CONTACTS_KEY)])
  const priceListOf = {}
  for (const [name, l] of Object.entries(links || {})) for (const c of (l && l.contacts) || []) priceListOf[c.id] = name
  return ((cache && cache.contacts) || []).map(c => ({ id: c.id, name: c.name, supplier: !!c.supplier, email: c.email || '', priceList: priceListOf[c.id] || '' }))
    .sort((a, b) => (b.supplier - a.supplier) || a.name.localeCompare(b.name))
}

export async function linkedSuppliers() {
  const [links, cache] = await Promise.all([get(LINKS_KEY), get(CONTACTS_KEY)])
  const byId = new Map(((cache && cache.contacts) || []).map(c => [c.id, c]))
  return Object.entries(links || {}).filter(([, l]) => l && l.contacts && l.contacts.length).map(([name, l]) => {
    const main = byId.get(l.main) || l.contacts.find(c => c.id === l.main) || l.contacts[0]
    return { name, contactId: l.main, contactName: (main && main.name) || '', email: (byId.get(l.main) || {}).email || '' }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export async function setDelivery(po, remove = false) {
  const rows = (await get('ops:deliveries')) || []
  const id = `app_${po.id}`, i = rows.findIndex(r => r.id === id)
  if (remove) { if (i >= 0 && !rows[i].actualDeliveryDate) { rows.splice(i, 1); await set('ops:deliveries', rows) } return }
  const row = deliveryRowFor(po)
  if (i >= 0) rows[i] = { ...rows[i], poNumber: row.poNumber, supplier: row.supplier, deliveryAddress: row.deliveryAddress, requiredDeliveryDate: row.requiredDeliveryDate, lineItems: row.lineItems, projectName: row.projectName, projectNo: row.projectNo, poSent: row.poSent }
  else rows.unshift(row)
  await set('ops:deliveries', rows)
}

// SITE CONTACTS - one entry per person, by role (1209)
export async function sitePeople() {
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
      return [...byName.values()].sort((x, y) => x.name.localeCompare(y.name))
}

// A SUPPLIER'S PRICE-LIST PRODUCTS (1199)
export async function supplierProducts(name) {
      const { products } = await loadPriceList()
      return ((products || []).filter(p => p.supplier === name).map(p => ({ ref: p.ref, code: p.code || '', description: p.description, section: p.section || '', price: p.price ?? null, unit: p.sellingUnit || p.baseUnit || '' })))
}

// THE SUPPLIER - any Xero contact, or (older pages) a price-list name (1203)
export async function resolveSupplier(src) {
    const contacts = await xeroContacts()
    let sup = null
    if (src.contactId) { const c = contacts.find(x => x.id === String(src.contactId)); if (c) sup = { name: c.priceList || '', contactId: c.id, contactName: c.name, email: c.email } }
    else if (src.supplier) { const l = (await linkedSuppliers()).find(s => s.name === src.supplier); if (l) sup = l }
    if ((src.contactId || src.supplier) && !sup) return { error: 'That supplier is not in Xero\'s contacts - add it in Xero, then Refresh from Xero on Purchasing > Suppliers' }
    return { sup }
}

// THE FIELDS of a purchase order from what was entered (1199-1204)
export function buildFields(src, sup, lines) {
    return { projectId: String(src.projectId || ''), jobNo: String(src.jobNo || ''), projectName: String(src.projectName || ''), supplier: sup ? (sup.name || sup.contactName) : '', priceList: sup ? (sup.name || '') : '', contactId: sup ? sup.contactId : '', contactName: sup ? sup.contactName : '',
      lines, deliveryAddress: String(src.deliveryAddress || '').slice(0, 500), deliveryDate: String(src.deliveryDate || '').slice(0, 10), notes: String(src.notes || '').slice(0, 2000),
      // DELIVERY DETAILS (1200)
      moffett: yn(src.moffett), artics: yn(src.artics), accessRoutes: String(src.accessRoutes || '').slice(0, 2000),
      siteContact: { name: String((src.siteContact && src.siteContact.name) || '').slice(0, 120), phone: String((src.siteContact && src.siteContact.phone) || '').slice(0, 40) },
      confirmationsTo: String(src.confirmationsTo || '').trim().slice(0, 200),
      vat: src.vat === 'none' ? 'none' : 'standard',
      // THE SUPPLIER'S EMAIL for this PO (1214) - as entered, else the Xero contact's
      to: String(src.to ?? '').trim().slice(0, 200) || (sup && sup.email) || '' }
}

// WHAT STOPS A PO BEING RAISED (1201, 1205) - null when complete. Fills in the
// company default for order confirmations when the PO has none.
export async function completeProblem(fields, sup, lines) {
    if (!sup) return 'Pick the supplier (any contact in Xero)'
    if (!fields.projectId) return 'Pick the project'
    if (!lines.length) return 'Add at least one line'
    const k = lines.findIndex(l => !(Number(l.qty) > 0)); if (k >= 0) return `Line ${k + 1}${lines[k].description ? ` (${lines[k].description.slice(0, 40)})` : ''} has no quantity`
    const d = lines.findIndex(l => !l.description); if (d >= 0) return `Line ${d + 1} has no description`
    if (!fields.deliveryAddress.trim()) return 'Enter the delivery address'
    if (!fields.moffett) return 'Answer "Is Moffett offload required?"'
    if (!fields.artics) return 'Answer "Are artics permitted?"'
    if (!fields.siteContact.name) return 'Choose the site contact'
    if (!fields.confirmationsTo) fields.confirmationsTo = (await loadPoSettings()).confirmationsTo || ''
    if (!fields.confirmationsTo) return 'Enter where order confirmations are sent'
    if (fields.to && !EMAIL.test(fields.to)) return 'The supplier email address is not valid'
    return null
}
