// PRICE LIST - THE RULES (1083). Pure: no storage, no imports. Used by the
// upload page (to preview) and the server (to decide), so they cannot disagree.
//
// One product:
//   ref          the portal's reference - unique; build-ups and purchase orders point to it
//   section      the price-list section (build-up slots pick from a section)
//   description, supplier, code (supplier's product code)
//   price        supplier price per SELLING UNIT, ex VAT
//   sellingUnit  how it is sold, in words ("roll 21 m2", "box of 100", "25 l tin")
//   qty          how many BASE UNITS are in one selling unit
//   baseUnit     m2 | m | m3 | nr | l | kg | week | day
//   coverage     optional: m2 covered per base unit (adhesives, primers...)
//   priceDate    'YYYY-MM-DD'
//   notes
// Worked out, never typed:
//   rate         price / qty                 per base unit
//   rateM2       rate / coverage             per m2, where coverage is given
//
// THE UPLOAD FILE has exactly these columns (the converter writes them, and the
// download produces them, so a file can go round and round):
export const COLUMNS = [
  ['ref', 'Ref'], ['section', 'Section'], ['description', 'Description'], ['supplier', 'Supplier'],
  ['code', 'Supplier code'], ['price', 'Supplier price'], ['sellingUnit', 'Selling unit'],
  ['qty', 'Qty per selling unit'], ['baseUnit', 'Base unit'], ['rate', 'Rate per base unit'],
  ['coverage', 'Coverage (m2 per base unit)'], ['rateM2', 'Rate per m2 by coverage'],
  ['priceDate', 'Price date'], ['notes', 'Notes'],
]
import { cleanText, cellNumber, cellDate, parseLibrarySheet, sectionsOf } from './libraryParse'
export { cellNumber, cellDate, sectionsOf }   // (1086) now shared - lib/libraryParse.js

export const BASE_UNITS = ['m2', 'm', 'm3', 'nr', 'l', 'kg', 'week', 'day']   // weeks, days: 1101 (e.g. plant hire); m3: 1103
export const UNIT_LABEL = { m2: 'm²', m: 'm', m3: 'm³', nr: 'nr', l: 'l', kg: 'kg', week: 'week', day: 'day' }
const REQUIRED_HEADERS = ['Ref', 'Section', 'Description', 'Supplier price', 'Qty per selling unit', 'Base unit']

const clean = cleanText

export function withRates(p) {
  const rate = p.price != null && p.qty ? p.price / p.qty : null
  const rateM2 = rate != null && p.coverage ? rate / p.coverage : null
  return { ...p, rate, rateM2 }
}

// The rate an estimate uses for a product: per m2 by coverage where coverage is
// given, otherwise per base unit. { value, unit } or null.
export function usableRate(p) {
  const q = withRates(p)
  if (q.rateM2 != null) return { value: q.rateM2, unit: 'm2' }
  if (q.rate != null && q.baseUnit) return { value: q.rate, unit: q.baseUnit }
  return null
}

// Check ONE product (an upload row or an edit). -> { product, errors[], warnings[] }
export function checkProduct(raw) {
  const errors = [], warnings = []
  const p = {
    ref: clean(raw.ref, 40), section: clean(raw.section, 120), description: clean(raw.description, 300),
    supplier: clean(raw.supplier, 120), code: clean(raw.code, 80), sellingUnit: clean(raw.sellingUnit, 80),
    baseUnit: clean(raw.baseUnit, 10).toLowerCase().replace('m²', 'm2').replace('m³', 'm3').replace(/^(week|day)s$/, '$1'), notes: clean(raw.notes, 500),
  }
  for (const [k, label] of [['price', 'Supplier price'], ['qty', 'Qty per selling unit'], ['coverage', 'Coverage']]) {
    const n = cellNumber(raw[k])
    if (Number.isNaN(n)) { errors.push(`${label} is not a number: '${clean(raw[k], 40)}'`); p[k] = null }
    else p[k] = n
  }
  if (!p.ref) errors.push('No Ref')
  if (!p.section) errors.push('No Section')
  if (!p.description) errors.push('No Description')
  if (p.baseUnit && !BASE_UNITS.includes(p.baseUnit)) errors.push(`Base unit '${p.baseUnit}' must be one of ${BASE_UNITS.join(', ')}`)
  if (p.qty != null && p.qty <= 0) errors.push('Qty per selling unit must be more than 0')
  if (p.price != null && p.price < 0) errors.push('Supplier price cannot be negative')
  if (p.coverage != null && p.coverage <= 0) errors.push('Coverage must be more than 0')
  const d = cellDate(raw.priceDate)
  if (d === 'invalid') { warnings.push(`Price date not a real date: '${clean(raw.priceDate, 30)}' - left blank`); p.priceDate = null }
  else p.priceDate = d
  if (p.price == null) warnings.push('No price - no rate until one is added')
  if (p.qty == null) warnings.push('No Qty per selling unit - no rate until one is added')
  if (!p.baseUnit) warnings.push('No base unit - no rate until one is set')
  return { product: withRates(p), errors, warnings }
}

// Read an uploaded sheet - the shared reader (lib/libraryParse.js) with the
// price list's columns and checks.
export function parseSheet(aoa) {
  const r = parseLibrarySheet(aoa, { columns: COLUMNS, required: REQUIRED_HEADERS, check: (raw) => { const c = checkProduct(raw); return { item: c.product, errors: c.errors, warnings: c.warnings } } })
  return { products: r.items, errors: r.errors, warnings: r.warnings, missingHeaders: r.missingHeaders }
}

// What an upload changes compared with the current list.
export function diffLists(current, incoming) {
  const cur = new Map((current || []).map(p => [p.ref.toLowerCase(), p]))
  const inc = new Map((incoming || []).map(p => [p.ref.toLowerCase(), p]))
  const same = (a, b) => ['section', 'description', 'supplier', 'code', 'price', 'sellingUnit', 'qty', 'baseUnit', 'coverage', 'priceDate', 'notes'].every(k => (a[k] ?? null) === (b[k] ?? null))
  const added = [], changed = [], removed = [], priceChanged = []
  for (const [k, p] of inc) {
    const c = cur.get(k)
    if (!c) added.push(p)
    else if (!same(c, p)) { changed.push(p); if ((c.price ?? null) !== (p.price ?? null) || (c.qty ?? null) !== (p.qty ?? null)) priceChanged.push({ ref: p.ref, description: p.description, from: withRates(c).rate, to: p.rate }) }
  }
  for (const [k, c] of cur) if (!inc.has(k)) removed.push(c)
  return { added, changed, removed, priceChanged }
}
