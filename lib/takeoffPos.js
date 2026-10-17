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

export async function draftPosFromTakeoff(tk, lib, { by = '' } = {}) {
  const m = materialList(countingTakeoff(tk), lib)
  const proj = xeroById(await xeroPoProjects(), tk.projectId) || { projectId: tk.projectId, jobNo: '', name: '' }
  const [linked, st, address] = await Promise.all([linkedSuppliers(), loadPoSettings(), projectAddressFor(tk.projectId, proj.jobNo)])
  const now = new Date().toISOString()
  const from = `From the materials take-off (${tk.quoteRef || 'estimate'} Rev ${tk.revision})`
  const created = []
  for (const s of m.suppliers) {
    const lines = s.rows.filter(r => (r.packs != null ? r.packs : r.toOrder) > 0).map(r => ({
      ref: r.ref, code: r.code || '', description: r.description,
      qty: r.packs != null ? r.packs : r2(r.toOrder),
      unit: r.packs != null ? (UNIT[r.sellingUnit] || r.sellingUnit || 'pack') : (UNIT[r.baseUnit] || r.baseUnit || ''),
      price: r.packPrice != null ? r2(r.packPrice) : 0 }))
    for (const f of (s.other && s.other.rows) || []) lines.push({ ref: null, code: '', description: `${f.label}${f.item ? ` (${f.item})` : ''}`, qty: r2(f.quantity), unit: UNIT[f.unit] || f.unit || '', price: r2(f.amount) })
    if (!lines.length) continue
    const link = linked.find(l => l.name === s.supplier)
    const r0 = link ? await resolveSupplier({ contactId: link.contactId }) : { sup: null }
    const sup = r0.sup || null
    const cl = cleanLines(lines)
    const fields = buildFields({ projectId: proj.projectId, jobNo: proj.jobNo, projectName: proj.name, contactId: sup ? sup.contactId : '', deliveryAddress: address,
      confirmationsTo: st.confirmationsTo || '', notes: sup ? from : `${from}. ${s.supplier} is not linked to a Xero contact yet - link it on Purchasing > Suppliers, then pick it here.`, lines: cl }, sup, cl)
    if (!sup) { fields.supplier = s.supplier; fields.priceList = s.supplier }   // named for the supplier until it is linked
    const po = { id: newId(), number: null, status: 'draft', ...fields, vatRate: st.vatRate, raisedBy: by, raisedByEmail: '', createdAt: now, raisedAt: now,
      fromTakeoff: { projectId: tk.projectId, quoteRef: tk.quoteRef || '', revision: tk.revision }, history: [{ at: now, by, what: from }] }
    await savePo(po)
    created.push({ id: po.id, supplier: s.supplier, linked: !!sup, contactName: sup ? sup.contactName : '', lines: cl.length, total: r2(cl.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0)) })
  }
  return { created, missing: m.missing || [], unallocated: (m.fixed || []).map(f => `${f.label}${f.item ? ` (${f.item})` : ''}`), groups: (m.groups || []).map(g => g.name) }
}
