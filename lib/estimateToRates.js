// BUILD CONTRACTED RATES FROM AN ESTIMATE (1225) - the won estimate's latest ISSUED
// revision (the one the customer accepted - never a revision still being edited) turned
// into contracted rate items, in exactly the shape an uploaded take-off sheet produces
// (lib/contractRatesParser), so the Contracted Rates page, locking, budgets,
// applications and the cash flow all work on them unchanged.
// The figures are the estimate's own (priceEstimate): its frozen revision prices and its
// own material rates, the selling rate as quoted, and materials and labour per unit
// BEFORE profit - which is what the budgets want.
import { priceEstimate } from './estimate'
import { BU_UNIT_LABEL } from './buildups'
import { loadPriceList } from './priceListStore'
import { loadLabour } from './labourRatesStore'

// the price library the estimate is priced with - shared with the estimating route
export async function loadPriceLib() {
  const [{ products }, { items }] = await Promise.all([loadPriceList(), loadLabour()])
  return { product: Object.fromEntries(products.map(p => [p.ref, p])), labour: Object.fromEntries(items.map(i => [i.ref, i])) }
}

const r2 = (n) => n == null ? null : Math.round(Number(n) * 100) / 100
const r4 = (n) => n == null ? null : Math.round(Number(n) * 10000) / 10000

export function ratesFromEstimate(snapshot, lib) {
  const { priced, totals } = priceEstimate(snapshot, lib)
  const items = []
  let after = false
  for (const row of snapshot.rows || []) {
    if (row.kind === 'line') { after = true; continue }
    if (row.kind !== 'item') continue                 // section headings and spacers - as the upload
    const p = priced[row.id] || {}
    const rateOnly = !!row.rateOnly
    const qty = rateOnly ? null : (row.qty == null || row.qty === '' ? null : Number(row.qty))
    const code = String(row.itemNo || '').trim()
    items.push({
      id: `cr_e_${row.id}`,
      code, qty, unit: BU_UNIT_LABEL[row.unit] || row.unit || '', description: String(row.description || '').trim(),
      rate: r2(p.rate), total: rateOnly ? null : (qty != null ? r2((p.rate || 0) * qty) : null),
      totalMode: rateOnly ? 'text' : 'calc', totalText: rateOnly ? 'Rate only' : '',
      matRate: r4(p.materialsRate), labRate: r4(p.labourRate),
      // above or below by WHERE IT SITS on the take-off - a rate-only item above the line is part of
      // the main schedule (as on an uploaded sheet), it just has no total
      rateOnly, section: after ? 'below' : 'above', kind: 'item', struck: false,
      codeMissing: !code, fromEstimateItem: row.id,
    })
  }
  return { items, estimateTotal: r2(totals.total) }
}
