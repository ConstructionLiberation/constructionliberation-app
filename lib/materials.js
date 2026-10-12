// MATERIAL LISTS (1095). Pure: the estimate's Materials tab and, next, its
// purchase orders. Worked out LIVE from the take-off.
//
// For every material line with a product, on every priced item ABOVE the line
// (rate-only items have no quantity):
//   needed      = item qty x the line's quantity per unit (sizes included)
//                 - in the product's own base unit (m2, m, nr, l, kg). A
//                 product priced BY COVERAGE (litres, kg) is converted: the
//                 line's quantity is area, so litres = area / coverage.
//   order waste = the estimate's waste for that line (product rule included),
//                 unless overridden per product: est.orderWaste[ref] (0.05 = 5%)
//   to order    = needed x (1 + order waste)
//   packs       = to order / qty per selling unit, ROUNDED UP to whole packs
//   cost        = packs x pack price (price list, increases and this quote's
//                 adjustments included)
// Grouped by supplier. Fixed-rate lines are listed apart - not orderable from
// the price list.
import { evalQty } from './buildups'
import { adjustLib } from './priceAdjust'

export function materialList(est, libIn) {
  const lib = adjustLib(libIn, est.adjustments)
  const byRef = new Map(), fixed = [], missing = []
  for (const row of est.rows || []) {
    if (row.kind !== 'item' || row.rateOnly) continue
    const qty = row.qty == null || row.qty === '' ? null : Number(row.qty)
    if (!(qty > 0)) continue
    const sizes = Object.fromEntries((row.buildup.sizes || []).map(z => [z.name, z.value]))
    for (const ln of row.buildup.lines || []) {
      if (ln.type === 'fixed rate' && ln.amount != null) {
        const q = evalQty(ln.qty, sizes)
        if (q != null) fixed.push({ item: row.description, label: ln.label, quantity: qty * q, unit: row.unit, amount: ln.amount, cost: ln.amount * q * qty * (1 + (ln.waste || 0)) })
        continue
      }
      if (ln.type !== 'material') continue
      const ref = ln.default
      const p = ref && lib.product[ref]
      const perUnit = evalQty(ln.qty, sizes)
      if (!p || perUnit == null) { missing.push(`${row.description}: ${ln.label}${!p ? ' (no product chosen)' : ' (quantity entered per job)'}`); continue }
      const rule = (row.buildup.rules || []).find(r => r.line === ln.id && r.ref === ref)
      const estWaste = rule ? rule.waste : (ln.waste || 0)
      // coverage products: the line's quantity is AREA - convert to base units
      const area = qty * perUnit
      const needed = p.coverage ? area / p.coverage : area
      const cur = byRef.get(ref) || { ref, description: p.description, supplier: p.supplier || 'No supplier', code: p.code || '', baseUnit: p.baseUnit, sellingUnit: p.sellingUnit || '', packQty: p.qty, packPrice: p.price, coverage: p.coverage || null, needed: 0, wasteWeighted: 0, uses: [] }
      cur.needed += needed
      cur.wasteWeighted += needed * estWaste
      cur.uses.push({ item: row.description, line: ln.label, needed, estWaste })
      byRef.set(ref, cur)
    }
  }
  const orderWaste = est.orderWaste || {}
  const rows = [...byRef.values()].map(r => {
    const estWaste = r.needed > 0 ? r.wasteWeighted / r.needed : 0     // the estimate's own, weighted by use
    const ow = orderWaste[r.ref] != null ? Number(orderWaste[r.ref]) : null
    const usedWaste = ow != null ? ow : estWaste
    const toOrder = r.needed * (1 + usedWaste)
    const packs = r.packQty > 0 ? Math.ceil(Math.round(toOrder / r.packQty * 1e6) / 1e6) : null
    const cost = packs != null && r.packPrice != null ? packs * r.packPrice : null
    return { ...r, estWaste, orderWaste: ow, usedWaste, toOrder, packs, cost }
  }).sort((a, b) => a.supplier.localeCompare(b.supplier) || a.description.localeCompare(b.description))
  const suppliers = []
  for (const r of rows) {
    let s = suppliers.find(x => x.supplier === r.supplier)
    if (!s) { s = { supplier: r.supplier, rows: [], cost: 0, incomplete: 0 }; suppliers.push(s) }
    s.rows.push(r)
    if (r.cost == null) s.incomplete++; else s.cost += r.cost
  }
  return { suppliers, fixed, missing, total: suppliers.reduce((t, s) => t + s.cost, 0) }
}
