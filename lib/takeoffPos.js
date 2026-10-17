// DRAFT POs FROM A JOB'S MATERIALS TAKE-OFF (1229) - one draft per supplier, from the same
// materials list the Materials tab shows (lib/materials: the take-off as it counts, packs
// rounded up, the order waste, this job's own material rates). Each draft:
//   - the supplier's products at PACKS x the PACK PRICE (the unit is the selling unit -
//     a roll, a pack), plus any own lines (not from the price list) ALLOCATED to that
//     supplier on the Materials tab
//   - the supplier is the Xero contact linked to that price-list supplier (Purchasing >
//     Suppliers); not linked yet -> the draft is still made, named for the supplier and
//     flagged to link it
//   - the project, its address and the company's order confirmations email filled in
// They are DRAFTS - checked, finished (delivery details) and raised as any other.
// What cannot be ordered is reported: items with no product chosen, own lines not allocated.
import { materialList } from './materials'
import { countingTakeoff } from './jobTakeoff'
import { UNIT_LABEL } from './priceList'
import { BU_UNIT_LABEL } from './buildups'
import { linkedSuppliers, resolveSupplier, buildFields, cleanLines, newId } from './poData'
import { savePo, loadPoSettings } from './purchaseOrders'
import { xeroPoProjects, xeroById, projectAddressFor } from './poProjects'

const UNIT = { ...BU_UNIT_LABEL, ...UNIT_LABEL }
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// THE POs IT COULD MAKE (1230) - shown first, so you choose which to make:
//   kind 'supplier'    a price-list supplier: its products (+ own lines allocated to it);
//                      its linked Xero contact if any (changeable)
//   kind 'category'    own lines allocated to a category of your own (e.g. "Insulation") -
//                      a supplier must be chosen
//   kind 'unallocated' own lines not allocated - a supplier must be chosen
const lineOfProduct = (r) => ({ ref: r.ref, code: r.code || '', description: r.description,
  qty: r.packs != null ? r.packs : r2(r.toOrder),
  unit: r.packs != null ? (UNIT[r.sellingUnit] || r.sellingUnit || 'pack') : (UNIT[r.baseUnit] || r.baseUnit || ''),
  price: r.packPrice != null ? r2(r.packPrice) : 0 })
const lineOfOwn = (f) => ({ ref: null, code: '', description: `${f.label}${f.item ? ` (${f.item})` : ''}`, qty: r2(f.quantity), unit: UNIT[f.unit] || f.unit || '', price: r2(f.amount) })
const totalOf = (lines) => r2(lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0))

export async function takeoffOrderGroups(tk, lib) {
  const m = materialList(countingTakeoff(tk), lib)
  const linked = await linkedSuppliers()
  const groups = []
  for (const s of m.suppliers) {
    const lines = [...s.rows.filter(r => (r.packs != null ? r.packs : r.toOrder) > 0).map(lineOfProduct), ...((s.other && s.other.rows) || []).map(lineOfOwn)]
    if (!lines.length) continue
    const link = linked.find(l => l.name === s.supplier)
    groups.push({ key: `supplier:${s.supplier}`, kind: 'supplier', name: s.supplier, lines, total: totalOf(lines), contactId: link ? link.contactId : '', contactName: link ? link.contactName : '' })
  }
  for (const g of m.groups || []) {
    const lines = (g.rows || []).map(lineOfOwn)
    if (lines.length) groups.push({ key: `category:${g.name}`, kind: 'category', name: g.name, lines, total: totalOf(lines), contactId: '', contactName: '' })
  }
  const un = (m.fixed || []).map(lineOfOwn)
  if (un.length) groups.push({ key: 'unallocated', kind: 'unallocated', name: 'Not allocated', lines: un, total: totalOf(un), contactId: '', contactName: '' })
  return { groups, missing: m.missing || [] }
}

// MAKE THE CHOSEN ONES - picks: [{ key, contactId }] (the supplier chosen for that PO;
// for a linked price-list supplier it may be left out to use its link)
export async function draftPosFromTakeoff(tk, lib, { by = '', picks = [] } = {}) {
  const { groups, missing } = await takeoffOrderGroups(tk, lib)
  const proj = xeroById(await xeroPoProjects(), tk.projectId) || { projectId: tk.projectId, jobNo: '', name: '' }
  const [st, address] = await Promise.all([loadPoSettings(), projectAddressFor(tk.projectId, proj.jobNo)])
  const now = new Date().toISOString()
  const from = `From the materials take-off (${tk.quoteRef || 'estimate'} Rev ${tk.revision})`
  const created = [], skipped = []
  for (const pick of picks || []) {
    const g = groups.find(x => x.key === pick.key)
    if (!g) { skipped.push({ key: pick.key, reason: 'no longer on the take-off' }); continue }
    const contactId = String(pick.contactId || g.contactId || '')
    const r0 = contactId ? await resolveSupplier({ contactId }) : { sup: null }
    if (g.kind !== 'supplier' && !r0.sup) { skipped.push({ key: g.key, name: g.name, reason: 'choose a supplier for it' }); continue }
    const sup = r0.sup || null
    const cl = cleanLines(g.lines)
    const label = g.kind === 'category' ? ` - ${g.name}` : g.kind === 'unallocated' ? ' - lines not allocated on the take-off' : ''
    const fields = buildFields({ projectId: proj.projectId, jobNo: proj.jobNo, projectName: proj.name, contactId: sup ? sup.contactId : '', deliveryAddress: address,
      confirmationsTo: st.confirmationsTo || '', notes: sup ? `${from}${label}` : `${from}. ${g.name} is not linked to a Xero contact yet - link it on Purchasing > Suppliers, then pick it here.`, lines: cl }, sup, cl)
    if (!sup) { fields.supplier = g.name; fields.priceList = g.name }   // named for the supplier until it is linked
    else if (g.kind === 'supplier' && !fields.priceList) fields.priceList = g.name   // its price list, for adding more products
    const po = { id: newId(), number: null, status: 'draft', ...fields, vatRate: st.vatRate, raisedBy: by, raisedByEmail: '', createdAt: now, raisedAt: now,
      fromTakeoff: { projectId: tk.projectId, quoteRef: tk.quoteRef || '', revision: tk.revision, group: g.key }, history: [{ at: now, by, what: `${from}${label}` }] }
    await savePo(po)
    created.push({ id: po.id, key: g.key, supplier: sup ? (sup.contactName || g.name) : g.name, group: g.name, kind: g.kind, linked: !!sup, contactName: sup ? sup.contactName : '', lines: cl.length, total: totalOf(cl) })
  }
  return { created, skipped, missing }
}
