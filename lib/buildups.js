// RATE BUILD-UPS - THE RULES (1087). Pure: shared by the page and the server.
//
// A TEMPLATE (one build-up):
//   ref        stable key: '<category>::<name>' (lower-cased for matching)
//   section    the CATEGORY (Felt, Single Ply...) - '' = uncategorised, flagged
//   description  the template's NAME
//   unit       m2 | m | nr | item
//   sizes      [{ name, value, comment }]  - size inputs quantities can use
//   lines      [{ id, type, label, offers[], default, amount, qty, waste,
//                 increase, cost, comment, override? }]
//   rules      [{ line (line id), ref, waste }]  - this product on this line -> waste
//
// LINE TYPES
//   material    a price-list product, chosen from the line's offers
//   labour      a labour-rates item
//   fixed rate  an amount per unit not from the price list (tape at 0.20/m2)
//   lump sum    an amount per JOB, spread over the quantity on the estimate
//   comment     anything that does not affect the price
//
// QUANTITY: per unit of the build-up - a number, or a sum of numbers and size
// names (Size1*1.1). Blank = entered per job.
//
// THE RATE (rateFor, below):
//   material   = product rate x qty x (1 + waste + increase)
//   fixed rate = amount x qty x (1 + waste)
//   labour     = labour rate x qty x labour factor
//   subtotal   = materials + fixed + labour;  profit = subtotal x profit %
//   rate       = (subtotal + profit) / (1 - MCD %)   <- EXACT gross-up, so the
//                MCD deducted on the quote returns the full price
//   rounded UP to the penny, as the costing sheet does.
// Lodge and management are not in build-ups (prelims). Lump sums price on the
// estimate, where the quantity is known.
import { cleanText, cellNumber } from './libraryParse'

export const LINE_TYPES = ['material', 'labour', 'lump', 'lump sum', 'comment']
// Shown as (1097): 'lump sum' is called LUMP SPREAD - an amount per job spread
// over the item's quantity. The stored value stays 'lump sum'.
// 1101: LUMP SUM - stored as 'lump' - a fixed amount x the line's quantity, NOT
// divided by the item's quantity; any cost category; no product. (Stored
// 'lump sum' stays the LUMP SPREAD, as every existing build-up has it; in a
// file, 'lump sum' / 'lump spread' mean the spread and 'lump' the lump sum.)
export const LINE_TYPE_LABEL = { material: 'material', labour: 'labour', lump: 'lump sum', 'lump sum': 'lump spread', comment: 'comment' }

// OLDER LINES (1097). 'fixed rate' is gone: every material or labour line takes
// a rate - a product's, or one typed in (an OWN item: no product, e.g. "Risk"
// at 2.50). A fixed-rate line is read as a material line with its amount as
// the typed rate, so it prices exactly as before. 'lump spread' in a file is
// the stored 'lump sum'.
export function normalizeLine(l) {
  if (!l) return l
  const t = String(l.type || '').toLowerCase()
  if (t === 'fixed rate') return { ...l, type: 'material', default: l.default || '', offers: l.offers || [], override: l.override != null ? l.override : (l.amount ?? null), amount: null }
  if (t === 'lump spread') return { ...l, type: 'lump sum' }
  return l
}
// PRODUCT RULES are gone (1098): the waste lives on the line itself. A rule
// for the product a line has chosen is written onto that line's waste, once,
// so nothing changes silently; then the rules are dropped.
// COMMENTS (1102): lines no longer carry notes - a comment is its own line,
// added underneath. Every note, and every comment line from before (the
// spreadsheet's remarks about unusual formulas...), is removed ONCE; the
// build-up then records commentsCleared, so comment lines added afterwards stay.
export function normalizeTemplate(t) {
  let lines = (t.lines || []).map(normalizeLine).map(l => {
    const rule = (t.rules || []).find(r => r.line === l.id && r.ref && r.ref === l.default)
    const out = rule && rule.waste != null ? { ...l, waste: rule.waste } : { ...l }
    if (out.type !== 'comment') delete out.comment
    return out
  })
  if (!t.commentsCleared) lines = lines.filter(l => l.type !== 'comment')
  return { ...t, lines, rules: [], sizes: (t.sizes || []).map(z => ({ ...z, comment: '' })), commentsCleared: true }
}
export const needsNormalizing = (t) => !t.commentsCleared || (t.rules || []).length > 0 || (t.lines || []).some(l => ['fixed rate', 'lump spread'].includes(String(l.type || '').toLowerCase()) || (l.type !== 'comment' && l.comment))

// THE SIZE (1098): one per build-up - its FIRST size (Girth, Height...). A line
// with "Apply size" ticked has its quantity multiplied by it. (A quantity
// written as a sum using a size name, from the converter, still works.)
// 1101: SIZES are WIDTH and HEIGHT. A line's applySize names the one it is
// multiplied by ('Width' / 'Height'); true (1098) means the first size.
export const SIZE_NAMES = ['Width', 'Height', 'Girth']   // Girth: 1111
export function sizeOf(t, sizes, which) {
  const list = t.sizes || []
  const z = which === true || which == null ? list[0] : list.find(x => String(x.name).toLowerCase() === String(which).toLowerCase())
  if (!z) return null
  const v = sizes && z.name in sizes ? sizes[z.name] : z.value
  return v == null || v === '' ? null : Number(v)
}

// THE DESCRIPTION (1098): the build-up's own text (t.descText), with {products} standing for
// the material lines ticked "in the description" - in build-up order, joined
// "A, B, C and D". A product's price-list description; an own item's label.
export function productList(t, lib) {
  const names = (t.lines || []).map(normalizeLine).filter(l => l.type === 'material' && l.inDescription)
    .map(l => (l.default && lib && lib.product && lib.product[l.default] && lib.product[l.default].description) || l.ownName || l.label).filter(Boolean)
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
// descText - NOT 'description', which on a template is its NAME.
// 1101: VARIABLE DESCRIPTIONS - t.descVars [{ name, value }], e.g. Warranty
// period = "20 years", written into the text as {Warranty period}. Each build-up
// (and each estimate item) holds its own values; an empty one shows [Name].
// Fill {products} and {Variable} in a piece of description text.
function fillDesc(text, t, lib) {
  const vars = Object.fromEntries((t.descVars || []).map(v => [String(v.name).toLowerCase(), v.value]))
  return String(text || '').replace(/\{products\}/g, productList(t, lib))
    .replace(/\{([^{}]{1,60})\}/g, (m, name) => { const k = name.trim().toLowerCase(); return k in vars ? (String(vars[k] ?? '').trim() || `[${name.trim()}]`) : m })
}
// MARKED FOR AMENDING (1110): parts of a description wrapped [! ... !] show RED
// in the editor and on the take-off - never on the quote.
const FLAG = /\[!([\s\S]*?)!\]/g
export const needsAmending = (t) => /\[![\s\S]*?!\]/.test(String((t && t.descText) || ''))
// As printed on the QUOTE: marks removed, the words kept.
export function descriptionText(t, lib) {
  return fillDesc(String(t.descText || '').replace(FLAG, '$1'), t, lib).trim()
}
// For the take-off: [{ text, red }] in order - the marked parts red.
export function descriptionParts(t, lib) {
  const raw = String(t.descText || ''), out = []
  let last = 0, m
  FLAG.lastIndex = 0
  while ((m = FLAG.exec(raw))) {
    if (m.index > last) out.push({ text: fillDesc(raw.slice(last, m.index), t, lib), red: false })
    out.push({ text: fillDesc(m[1], t, lib), red: true })
    last = FLAG.lastIndex
  }
  if (last < raw.length) out.push({ text: fillDesc(raw.slice(last), t, lib), red: false })
  return out.filter(p => p.text)
}
// VARIABLE FLAGS (1098): line.variable = { item, rate, waste } - cells the
// estimator must review on each quote (shown light red).
export const isVariable = (l, cell) => !!(l && l.variable && l.variable[cell])
export const BU_UNITS = ['m2', 'm', 'm3', 'nr', 'item', 'week', 'day']   // weeks, days: 1101; m3: 1103
export const BU_UNIT_LABEL = { m2: 'm²', m: 'm', m3: 'm³', nr: 'nr', item: 'item', week: 'week', day: 'day' }
export const COST_CATEGORIES = ['Materials', 'Labour', 'Delivery', 'Plant', 'Management', 'Prelims', 'Attendances', 'Subcontract', 'Other']

export const LINE_COLUMNS = [
  ['category', 'Category'], ['template', 'Template'], ['unit', 'Unit'], ['line', 'Line'], ['type', 'Type'], ['label', 'Label'],
  ['offers', 'Offers (Refs)'], ['default', 'Default (Ref)'], ['amount', 'Amount'], ['qty', 'Quantity'], ['waste', 'Waste %'],
  ['increase', 'Price increase %'], ['cost', 'Cost category'], ['comment', 'Comment'],
  // 1098: an own item's rate (or a product's rate typed over), and the line's settings
  ['rate', 'Rate'], ['applySize', 'Apply size'], ['inDescription', 'In description'], ['variable', 'Variable'], ['ownName', 'Own item'],
]
// 1098: each build-up's description text (its own sheet)
export const DESC_COLUMNS = [['category', 'Category'], ['template', 'Template'], ['descText', 'Description'], ['vars', 'Variables']]
// "Warranty period=20 years; Colour=Grey" <-> [{ name, value }] (1101)
// "Warranty=20 year [10 year|15 year|20 year]; Girth=600mm" - a variable's options in [ ], split by | (1109)
export const varsText = (vs) => (vs || []).map(v => `${v.name}=${v.value ?? ''}${(v.options || []).length ? ` [${v.options.join('|')}]` : ''}`).join('; ')
export const varsOf = (txt) => String(txt || '').split(';').map(x => x.trim()).filter(Boolean).map(x => {
  let options = []
  const m = x.match(/\[([^\]]*)\]\s*$/)
  if (m) { options = m[1].split('|').map(o => o.trim()).filter(Boolean); x = x.slice(0, m.index).trim() }
  const i = x.indexOf('=')
  const v = i < 0 ? { name: x.trim(), value: '' } : { name: x.slice(0, i).trim(), value: x.slice(i + 1).trim() }
  return options.length ? { ...v, options } : v
}).filter(v => v.name)
const sizeChoice = (v) => { const t = String(v ?? '').trim(); const n = SIZE_NAMES.find(x => x.toLowerCase() === t.toLowerCase()); if (n) return n; return yes(t) ? true : undefined }
const yes = (v) => /^(y|yes|true|1|x)$/i.test(String(v ?? '').trim())
// Variable cells in a file: any of item / rate / waste, e.g. "rate, waste"
const varOf = (v) => { const t = String(v || '').toLowerCase(); const o = { item: /item/.test(t), rate: /rate/.test(t), qty: /qty|quantity/.test(t), waste: /waste/.test(t) }; return o.item || o.rate || o.qty || o.waste ? o : undefined }
export const varText = (l) => ['item', 'rate', 'qty', 'waste'].filter(k => l.variable && l.variable[k]).join(', ')
export const SIZE_COLUMNS = [['category', 'Category'], ['template', 'Template'], ['name', 'Size'], ['value', 'Starting value'], ['comment', 'Comment']]
export const RULE_COLUMNS = [['category', 'Category'], ['template', 'Template'], ['line', 'Line'], ['ref', 'Product (Ref)'], ['waste', 'Waste %']]

export const templateKey = (category, name) => `${cleanText(category, 120)}::${cleanText(name, 200)}`.toLowerCase()

// ---- Quantity sums -------------------------------------------------------
// A quantity is a number, or numbers and size names joined by + - * / ( ).
// Evaluated by a tiny parser - never eval - so a file cannot run code.
export function qtyProblem(text, sizeNames) {
  const t = String(text ?? '').trim()
  if (t === '') return null
  const names = new Set((sizeNames || []).map(n => n.toLowerCase()))
  const tokens = t.match(/[A-Za-z][A-Za-z0-9 ]*[A-Za-z0-9]|[A-Za-z]|\d*\.?\d+(?:e-?\d+)?|[()+\-*/]|\S/gi) || []
  let depth = 0
  for (const tk of tokens) {
    if (tk === '(') depth++
    else if (tk === ')') { depth--; if (depth < 0) return 'unbalanced brackets' }
    else if (/^[A-Za-z]/.test(tk)) { if (!names.has(tk.trim().toLowerCase())) return `'${tk.trim()}' is not one of this build-up's sizes` }
    else if (!/^(\d*\.?\d+(e-?\d+)?|[+\-*/])$/i.test(tk)) return `'${tk}' is not allowed in a quantity`
  }
  if (depth !== 0) return 'unbalanced brackets'
  return evalQty(t, Object.fromEntries([...names].map(n => [n, 1]))) == null ? 'not a valid sum' : null
}

export function evalQty(text, sizes) {
  const t = String(text ?? '').trim()
  if (t === '') return null
  const vals = Object.fromEntries(Object.entries(sizes || {}).map(([k, v]) => [k.toLowerCase(), v]))
  const tokens = t.match(/[A-Za-z][A-Za-z0-9 ]*[A-Za-z0-9]|[A-Za-z]|\d*\.?\d+(?:e-?\d+)?|[()+\-*/]/gi) || []
  let i = 0
  const peek = () => tokens[i], next = () => tokens[i++]
  function primary() {
    const tk = next()
    if (tk === undefined) throw new Error('end')
    if (tk === '(') { const v = expr(); if (next() !== ')') throw new Error(')'); return v }
    if (tk === '-') return -primary()
    if (/^[A-Za-z]/.test(tk)) { const v = vals[tk.trim().toLowerCase()]; if (v == null || Number.isNaN(Number(v))) throw new Error('size'); return Number(v) }
    const n = parseFloat(tk); if (Number.isNaN(n)) throw new Error('num'); return n
  }
  function term() { let v = primary(); while (peek() === '*' || peek() === '/') { const op = next(); const r = primary(); v = op === '*' ? v * r : v / r } return v }
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = next(); const r = term(); v = op === '+' ? v + r : v - r } return v }
  try { const v = expr(); if (i !== tokens.length || !Number.isFinite(v)) return null; return v } catch { return null }
}

// ---- Checking a template ------------------------------------------------
// refsKnown: { material: Set(refs), labour: Set(refs) } - every Ref must exist.
export function checkTemplate(tIn, refsKnown) {
  const t = normalizeTemplate(tIn)
  const errors = [], warnings = []
  const where = `"${t.description || '?'}"`
  if (!t.description) errors.push('A build-up with no Template name')
  if (!t.section) warnings.push(`${where} has no category`)
  if (!t.unit) warnings.push(`${where} has no unit - set m2, m, nr or item`)
  else if (!BU_UNITS.includes(t.unit)) errors.push(`${where}: unit '${t.unit}' must be m2, m, nr or item`)
  const sizeNames = (t.sizes || []).map(z => z.name)
  for (const ln of t.lines || []) {
    const at = `${where} line ${ln.id} (${ln.label || ln.type})`
    if (!LINE_TYPES.includes(ln.type)) { errors.push(`${at}: type '${ln.type}' must be one of ${LINE_TYPES.join(', ')}`); continue }
    const qp = qtyProblem(ln.qty, sizeNames)
    if (qp) errors.push(`${at}: quantity '${ln.qty}' - ${qp}`)
    for (const [k, nm] of [['waste', 'Waste %'], ['increase', 'Price increase %']]) {
      if (ln[k] != null && (Number.isNaN(ln[k]) || ln[k] < 0 || ln[k] > 1)) errors.push(`${at}: ${nm} must be between 0 and 1 (0.1 = 10%)`)
    }
    if (ln.amount != null && Number.isNaN(ln.amount)) errors.push(`${at}: Amount is not a number`)
    const set = ln.type === 'material' ? refsKnown?.material : ln.type === 'labour' ? refsKnown?.labour : null
    if (set) {
      const missing = [...(ln.offers || []), ln.default].filter(r => r && !set.has(r))
      if (missing.length) errors.push(`${at}: ${missing.length} Ref(s) not in the ${ln.type === 'material' ? 'price list' : 'labour rates'} (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''})`)
      if (!(ln.offers || []).length && !ln.default && ln.override == null) warnings.push(`${at}: no ${ln.type === 'material' ? 'product' : 'labour item'} or rate yet`)
    }
  }
  for (const r of t.rules || []) {
    if (!(t.lines || []).some(l => l.id === r.line)) errors.push(`${where}: a product rule points at line ${r.line}, which does not exist`)
    if (refsKnown?.material && !refsKnown.material.has(r.ref)) errors.push(`${where}: product rule Ref ${r.ref} is not in the price list`)
    if (r.waste == null || r.waste < 0 || r.waste > 1) errors.push(`${where}: product rule for ${r.ref} needs a waste between 0 and 1`)
  }
  return { errors, warnings }
}

// ---- Reading the upload (three sheets as rows) ---------------------------
function table(aoa, columns, required) {
  const rows = Array.isArray(aoa) ? aoa : []
  const hi = rows.findIndex(r => Array.isArray(r) && required.every(h => r.some(c => cleanText(c) === h)))
  if (hi < 0) return { rows: [], missing: required, headerRow: 0 }
  const head = rows[hi].map(c => cleanText(c))
  const col = Object.fromEntries(columns.map(([k, label]) => [k, head.indexOf(label)]))
  const out = []
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] || []
    if (!r.some(c => cleanText(c) !== '')) continue
    out.push({ rowNo: i + 1, ...Object.fromEntries(columns.map(([k]) => [k, col[k] >= 0 ? r[col[k]] : null])) })
  }
  return { rows: out, missing: [], headerRow: hi + 1, head }
}

// sheets: { lines: aoa, sizes: aoa, rules: aoa }
// -> { templates, errors: [{sheet, row, msg}], warnings: [...] }
export function parseBuildupSheets(sheets, refsKnown) {
  const errors = [], warnings = []
  const L = table(sheets.lines, LINE_COLUMNS, ['Category', 'Template', 'Type', 'Label'])
  if (L.missing.length) return { templates: [], errors: [{ sheet: 'Build-ups', row: 0, msg: `Missing column(s): ${L.missing.join(', ')}` }], warnings }
  const S = table(sheets.sizes, SIZE_COLUMNS, ['Category', 'Template', 'Size'])
  const R = table(sheets.rules, RULE_COLUMNS, ['Category', 'Template', 'Line', 'Product (Ref)'])
  const Dsc = table(sheets.descriptions, DESC_COLUMNS, ['Category', 'Template', 'Description'])
  const byKey = new Map()
  for (const r of L.rows) {
    const name = cleanText(r.template, 200), cat = cleanText(r.category, 120)
    if (!name) { errors.push({ sheet: 'Build-ups', row: r.rowNo, msg: 'No Template name' }); continue }
    const key = templateKey(cat, name)
    if (!byKey.has(key)) byKey.set(key, { ref: key, section: cat, description: name, unit: cleanText(r.unit, 10).toLowerCase().replace('m²', 'm2').replace('m³', 'm3').replace(/^(week|day)s$/, '$1'), sizes: [], lines: [], rules: [], _row: r.rowNo })
    const t = byKey.get(key)
    const num = (v) => { const n = cellNumber(v); return n === null ? null : n }
    const lineNo = cleanText(r.line, 10) || String(t.lines.length + 1)
    t.lines.push({
      id: `L${lineNo}`, type: cleanText(r.type, 20).toLowerCase(), label: cleanText(r.label, 200),
      offers: cleanText(r.offers, 100000).split(/\s*;\s*/).filter(Boolean), default: cleanText(r.default, 40),
      amount: num(r.amount), qty: cleanText(r.qty, 200), waste: num(r.waste), increase: num(r.increase),
      cost: cleanText(r.cost, 40), comment: cleanText(r.comment, 2000),
      override: num(r.rate), applySize: sizeChoice(r.applySize), ownName: cleanText(r.ownName, 200) || undefined, inDescription: yes(r.inDescription) || undefined, variable: varOf(r.variable),
    })
    t.lines[t.lines.length - 1] = normalizeLine(t.lines[t.lines.length - 1])
  }
  for (const r of S.rows) {
    const t = byKey.get(templateKey(r.category, r.template))
    if (!t) { errors.push({ sheet: 'Sizes', row: r.rowNo, msg: `No build-up "${cleanText(r.template)}" in "${cleanText(r.category)}"` }); continue }
    const name = cleanText(r.name, 40)
    if (!/^[A-Za-z][A-Za-z0-9 ]*$/.test(name)) { errors.push({ sheet: 'Sizes', row: r.rowNo, msg: `Size name '${name}' must start with a letter and use letters, numbers and spaces` }); continue }
    t.sizes.push({ name, value: cellNumber(r.value), comment: cleanText(r.comment, 300) })
  }
  for (const r of R.rows) {
    const t = byKey.get(templateKey(r.category, r.template))
    if (!t) { errors.push({ sheet: 'Product rules', row: r.rowNo, msg: `No build-up "${cleanText(r.template)}" in "${cleanText(r.category)}"` }); continue }
    const label = cleanText(r.line, 200)
    const ln = t.lines.find(l => l.label === label || l.id === label || l.id === `L${label}`)
    t.rules.push({ line: ln ? ln.id : label, ref: cleanText(r.ref, 40), waste: cellNumber(r.waste) })
  }
  for (const r of Dsc.rows) {
    const t = byKey.get(templateKey(r.category, r.template))
    if (t) { t.descText = String(r.descText ?? '').trim().slice(0, 4000); t.descVars = varsOf(r.vars) }
  }
  // A file downloaded from the app (it has the newer columns) keeps its comment
  // lines; the converter's file - written before comments moved - does not (1102).
  const ownFile = (L.head || []).includes('Apply size')
  const templates = [...byKey.values()].map(t => { const n = normalizeTemplate(ownFile ? { ...t, commentsCleared: true } : t); n._row = t._row; return n })
  for (const t of templates) {
    const { errors: e, warnings: w } = checkTemplate(t, refsKnown)
    e.forEach(msg => errors.push({ sheet: 'Build-ups', row: t._row, msg }))
    w.forEach(msg => warnings.push({ sheet: 'Build-ups', row: t._row, msg }))
    delete t._row
  }
  return { templates, errors, warnings }
}

// ---- The rate ------------------------------------------------------------
// lib: { product: ref -> {rate, rateM2, baseUnit, coverage, ...}, labour: ref -> {rate, unit} }
// opts: { profit, mcd (0..1), labourFactor (default 1), picks: {lineId: ref}, sizes: {name: value},
//         jobQty }  - jobQty (an estimate item's quantity) spreads LUMP SUMS over it (1088)
// -> { rate, subtotal, profit, mcd, materials, fixed, labour, lines: [...], missing: [...] }
export function rateFor(t, lib, opts = {}) {
  const factor = opts.labourFactor == null ? 1 : Number(opts.labourFactor)
  const sizes = { ...Object.fromEntries((t.sizes || []).map(z => [z.name, z.value])), ...(opts.sizes || {}) }
  const out = { materials: 0, fixed: 0, labour: 0, lump: 0, lines: [], missing: [] }
  const jobQty = opts.jobQty == null ? null : Number(opts.jobQty)
  for (const raw of t.lines || []) {
    const ln = normalizeLine(raw)
    if (ln.type === 'comment') { out.lines.push({ id: ln.id, cost: null }); continue }
    // A lump sum is an amount per JOB: on an estimate it is spread over the
    // item's quantity; on a template (no quantity) it waits for the estimate.
    if (ln.type === 'lump sum') {
      if (ln.amount == null || !(jobQty > 0)) { out.lines.push({ id: ln.id, cost: null }); continue }
      const cost = ln.amount / jobQty
      out.lump += cost
      out.lines.push({ id: ln.id, unitRate: ln.amount, qty: 1 / jobQty, cost })
      continue
    }
    const baseQty = ln.qty === '' || ln.qty == null ? null : evalQty(ln.qty, sizes)
    const sizeVal = ln.applySize ? sizeOf(t, opts.sizes, ln.applySize) : 1
    if (ln.applySize && sizeVal == null) { out.missing.push(`${ln.label}: set the ${ln.applySize === true ? 'size' : String(ln.applySize).toLowerCase()}`); out.lines.push({ id: ln.id, cost: null }); continue }
    const qty = baseQty == null ? null : baseQty * sizeVal
    if (qty == null) { out.missing.push(`${ln.label}: quantity`); out.lines.push({ id: ln.id, cost: null }); continue }
    const pick = (opts.picks && opts.picks[ln.id]) || ln.default
    if (ln.type === 'material') {
      const p = pick && lib.product[pick]
      const libRate = p ? (p.rateM2 != null ? p.rateM2 : p.rate) : null
      const unitRate = ln.override != null ? ln.override : libRate
      if (unitRate == null) { out.missing.push(`${ln.label}: ${pick ? 'product has no rate' : 'choose a product or type a rate'}`); out.lines.push({ id: ln.id, cost: null }); continue }
      const waste = ln.waste || 0   // product rules are gone (1098) - the line's own waste
      const cost = unitRate * qty * (1 + waste + (ln.increase || 0))
      out.materials += cost
      out.lines.push({ id: ln.id, unitRate, libRate, qty, waste, cost })
    } else if (ln.type === 'lump') {
      if (ln.amount == null) { out.missing.push(`${ln.label}: amount`); out.lines.push({ id: ln.id, cost: null }); continue }
      const cost = ln.amount * qty
      if (ln.cost === 'Labour') out.labour += cost; else out.fixed += cost
      out.lines.push({ id: ln.id, unitRate: ln.amount, qty, cost })
    } else if (ln.type === 'fixed rate') {
      if (ln.amount == null) { out.missing.push(`${ln.label}: amount`); out.lines.push({ id: ln.id, cost: null }); continue }
      const cost = ln.amount * qty * (1 + (ln.waste || 0))
      out.fixed += cost
      out.lines.push({ id: ln.id, unitRate: ln.amount, qty, waste: ln.waste || 0, cost })
    } else if (ln.type === 'labour') {
      const l = pick && lib.labour[pick]
      const libRate = l ? l.rate : null
      const unitRate = ln.override != null ? ln.override : libRate
      if (unitRate == null) { out.missing.push(`${ln.label}: ${pick ? 'labour item has no rate' : 'choose a labour item or type a rate'}`); out.lines.push({ id: ln.id, cost: null }); continue }
      const cost = unitRate * qty * factor
      out.labour += cost
      out.lines.push({ id: ln.id, unitRate, libRate, qty, cost })
    }
  }
  out.subtotal = out.materials + out.fixed + out.labour + out.lump
  out.profit = out.subtotal * (Number(opts.profit) || 0)
  const mcd = Number(opts.mcd) || 0
  const beforeMcd = out.subtotal + out.profit
  out.mcd = mcd > 0 && mcd < 1 ? beforeMcd / (1 - mcd) - beforeMcd : 0
  out.rate = Math.ceil(Math.round((beforeMcd + out.mcd) * 1e6) / 1e4) / 100   // round UP to the penny
  return out
}

export function summarise(templates) {
  const cats = {}
  for (const t of templates) cats[t.section || ''] = (cats[t.section || ''] || 0) + 1
  return cats
}
