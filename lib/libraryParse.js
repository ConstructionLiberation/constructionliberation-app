// SHARED UPLOAD READING for the estimating libraries (1086) - the price list
// and labour rates read their files the same way, from ONE piece of code.
// Pure: no storage, no imports.

export const cleanText = (v, max = 300) => String(v ?? '').replace(/\ufeff/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

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
// -> 'YYYY-MM-DD', null when blank, 'invalid' when not a real date.
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

// Read an uploaded sheet (rows as arrays; the first row containing 'Ref' and
// 'Description' is the header). columns: [[key, heading]]; required: headings
// that must be present; check(raw) -> { item, errors[], warnings[] }.
// -> { items, errors: [{row, ref, msg}], warnings: [...], missingHeaders }
export function parseLibrarySheet(aoa, { columns, required, check }) {
  const rows = Array.isArray(aoa) ? aoa : []
  const hi = rows.findIndex(r => Array.isArray(r) && r.some(c => cleanText(c) === 'Ref') && r.some(c => cleanText(c) === 'Description'))
  if (hi < 0) return { items: [], errors: [{ row: 0, ref: '', msg: "No header row - the sheet needs the columns 'Ref', 'Section', 'Description'... (see the Read me)" }], warnings: [], missingHeaders: required }
  const head = rows[hi].map(c => cleanText(c))
  const missingHeaders = required.filter(h => !head.includes(h))
  if (missingHeaders.length) return { items: [], errors: [{ row: hi + 1, ref: '', msg: `Missing column(s): ${missingHeaders.join(', ')}` }], warnings: [], missingHeaders }
  const col = Object.fromEntries(columns.map(([k, label]) => [k, head.indexOf(label)]))
  const items = [], errors = [], warnings = [], seen = new Map()
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] || []
    if (!r.some(c => cleanText(c) !== '')) continue
    const raw = Object.fromEntries(columns.map(([k]) => [k, col[k] >= 0 ? r[col[k]] : null]))
    const { item, errors: e, warnings: w } = check(raw)
    const rowNo = i + 1
    if (item.ref) {
      const key = item.ref.toLowerCase()
      if (seen.has(key)) e.push(`Ref ${item.ref} is used twice (also row ${seen.get(key)})`)
      else seen.set(key, rowNo)
    }
    for (const msg of e) errors.push({ row: rowNo, ref: item.ref, msg })
    for (const msg of w) warnings.push({ row: rowNo, ref: item.ref, msg })
    items.push(item)
  }
  if (!items.length) errors.push({ row: hi + 1, ref: '', msg: 'No products under the header row' })
  return { items, errors, warnings, missingHeaders: [] }
}

// Sections in the order they first appear.
export function sectionsOf(items) {
  const order = [], counts = {}
  for (const p of items) { if (!(p.section in counts)) { order.push(p.section); counts[p.section] = 0 } counts[p.section]++ }
  return order.map(name => ({ name, count: counts[name] }))
}
