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
//   baseUnit     m2 | m | nr | l | kg
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
export const BASE_UNITS = ['m2', 'm', 'nr', 'l', 'kg']
export const UNIT_LABEL = { m2: 'm²', m: 'm', nr: 'nr', l: 'l', kg: 'kg' }
const REQUIRED_HEADERS = ['Ref', 'Section', 'Description', 'Supplier price', 'Qty per selling unit', 'Base unit']

// \ufeff: the byte-order mark a CSV starts with (1085) - never part of a value.
const clean = (v, max = 300) => String(v ?? '').replace(/\ufeff/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

// A number from a cell: a number, or text that is only a number. '' -> null.
// Anything else -> NaN, which the checks report.
export function cellNumber(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  const s = String(v).replace(/[,£$\s]/g, '')
  if (s === '') return null
  return /^-?\d*\.?\d+(e-?\d+)?$/i.test(s) ? parseFloat(s) : NaN
}

// A date from a cell: a Date, an Excel serial, 'YYYY-MM-DD' or 'DD/MM/YYYY'.
// -> 'YYYY-MM-DD', null when blank, NaN-string 'invalid' when not a real date.
export function cellDate(v) {
  if (v == null || v === '') return null
  const ok = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : 'invalid' }
  if (v instanceof Date) return isNaN(v) ? 'invalid' : ok(v.getFullYear(), v.getMonth() + 1, v.getDate())
  if (typeof v === 'number') { const t = new Date(Math.round((v - 25569) * 86400000)); return ok(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()) }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return ok(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return ok(+m[3], +m[2], +m[1])
  return 'invalid'
}

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
    baseUnit: clean(raw.baseUnit, 10).toLowerCase().replace('m²', 'm2'), notes: clean(raw.notes, 500),
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

// Read an uploaded sheet (rows as arrays, first matching row = headers).
// -> { products, errors: [{row, ref, msg}], warnings: [...], missingHeaders }
export function parseSheet(aoa) {
  const rows = Array.isArray(aoa) ? aoa : []
  const hi = rows.findIndex(r => Array.isArray(r) && r.some(c => clean(c) === 'Ref') && r.some(c => clean(c) === 'Description'))
  if (hi < 0) return { products: [], errors: [{ row: 0, ref: '', msg: "No header row - the sheet needs the columns 'Ref', 'Section', 'Description'... (see the Read me)" }], warnings: [], missingHeaders: REQUIRED_HEADERS }
  const head = rows[hi].map(c => clean(c))
  const missingHeaders = REQUIRED_HEADERS.filter(h => !head.includes(h))
  if (missingHeaders.length) return { products: [], errors: [{ row: hi + 1, ref: '', msg: `Missing column(s): ${missingHeaders.join(', ')}` }], warnings: [], missingHeaders }
  const col = Object.fromEntries(COLUMNS.map(([k, label]) => [k, head.indexOf(label)]))
  const products = [], errors = [], warnings = [], seen = new Map()
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] || []
    if (!r.some(c => clean(c) !== '')) continue
    const raw = Object.fromEntries(COLUMNS.map(([k]) => [k, col[k] >= 0 ? r[col[k]] : null]))
    const { product, errors: e, warnings: w } = checkProduct(raw)
    const rowNo = i + 1
    if (product.ref) {
      const key = product.ref.toLowerCase()
      if (seen.has(key)) e.push(`Ref ${product.ref} is used twice (also row ${seen.get(key)})`)
      else seen.set(key, rowNo)
    }
    for (const msg of e) errors.push({ row: rowNo, ref: product.ref, msg })
    for (const msg of w) warnings.push({ row: rowNo, ref: product.ref, msg })
    products.push(product)
  }
  if (!products.length) errors.push({ row: hi + 1, ref: '', msg: 'No products under the header row' })
  return { products, errors, warnings, missingHeaders: [] }
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

// Sections in the order they first appear.
export function sectionsOf(products) {
  const order = [], counts = {}
  for (const p of products) { if (!(p.section in counts)) { order.push(p.section); counts[p.section] = 0 } counts[p.section]++ }
  return order.map(name => ({ name, count: counts[name] }))
}
