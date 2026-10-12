// SUPPLIER PRICE ADJUSTMENTS (1094) - increases and discounts. Pure: shared by
// the price list, the server and estimates.
//
// An adjustment: { id, supplier, pct (0.10 = +10%, -0.05 = -5%), from
// ('YYYY-MM-DD'), note, by, at }.
//   On the PRICE LIST: company-wide, on every product of that supplier.
//   On an ESTIMATE: that quote only (est.adjustments), on top of the price list.
// The supplier's LIST PRICE is always kept: rates are worked out from it, so an
// adjustment can be removed exactly, and downloads give the list price.
// Several on one supplier COMPOUND: +10% then +5% = +15.5%, as price rises do.
import { withRates } from './priceList'

const norm = (s) => String(s || '').trim().toLowerCase()
export const factorFor = (adjs, supplier) => (adjs || []).filter(a => norm(a.supplier) === norm(supplier)).reduce((f, a) => f * (1 + Number(a.pct || 0)), 1)
export const pctText = (pct) => `${pct >= 0 ? '+' : '-'}${+(Math.abs(pct) * 100).toFixed(2)}%`

// Products as stored (list prices) -> products as priced. basePrice = the list
// price; price = after adjustments; adjusted = the factor (1 = none).
export function applyAdjustments(products, adjs) {
  return (products || []).map(p => {
    const f = factorFor(adjs, p.supplier)
    const base = p.basePrice != null ? p.basePrice : p.price
    if (f === 1) return withRates({ ...p, basePrice: base, price: base, adjusted: 1 })
    return withRates({ ...p, basePrice: base, price: base == null ? null : base * f, adjusted: f })
  })
}

// An estimate's own adjustments, on top of the price list's: scale each
// product's worked-out rates by its supplier's factor. lib = { product: {ref -> p}, labour }
export function adjustLib(lib, adjs) {
  if (!adjs || !adjs.length) return lib
  const product = {}
  for (const [ref, p] of Object.entries(lib.product || {})) {
    const f = factorFor(adjs, p.supplier)
    // The PACK price too (1095) - a material list / purchase order orders packs.
    product[ref] = f === 1 ? p : { ...p, price: p.price == null ? null : p.price * f, rate: p.rate == null ? null : p.rate * f, rateM2: p.rateM2 == null ? null : p.rateM2 * f, quoteAdjusted: f }
  }
  return { ...lib, product }
}

export function checkAdjustment(raw) {
  const errors = []
  const suppliers = [...new Set((Array.isArray(raw.suppliers) ? raw.suppliers : [raw.supplier]).map(s => String(s || '').trim()).filter(Boolean))]
  const pct = Number(raw.pct)
  if (!suppliers.length) errors.push('Choose a supplier')
  if (!Number.isFinite(pct) || pct === 0) errors.push('Enter the increase or discount as a percentage (minus for a discount)')
  else if (pct <= -1 || pct > 5) errors.push('That percentage is out of range')
  const from = String(raw.from || '').slice(0, 10)
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) errors.push('The date is not a real date')
  return { errors, suppliers, pct, from, note: String(raw.note || '').slice(0, 300) }
}
