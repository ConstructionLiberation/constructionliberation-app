// ESTIMATES - THE RULES AND THE PRICING (1088). Pure: page and server share it.
//
// An ESTIMATE:
//   id, dealId, dealTitle, organisation, quoteRef, revision
//   header    { project, location, contractor, reviewer, date, startOnSite,
//               creditScore, creditLimit, insuredLimit }
//   settings  { profit, mcd, labourFactor, dayRate }   - profit and MCD apply to
//               the WHOLE quote (an item can override profit)
//   rows      in take-off order - the order the quote will follow:
//     { id, kind: 'section', title }                      a header (Roof area A)
//     { id, kind: 'item', description, unit, qty, rateOnly, profit (override
//       or null), templateRef (where it came from, or null = unique item),
//       buildup: { sizes, lines, rules } }                its OWN copy
//
// RATE-ONLY items: no quantity (TBC), priced as a rate, shown BELOW THE LINE and
// not added to the total.
import { rateFor, normalizeLine, normalizeTemplate } from './buildups'
import { adjustLib, pctText } from './priceAdjust'

export const HEADER_FIELDS = [
  ['project', 'Project'], ['location', 'Location'], ['contractor', 'Contractor'], ['reviewer', 'Reviewer'],
  ['date', 'Date'], ['startOnSite', 'Start on site'], ['creditScore', 'Credit score'], ['creditLimit', 'Credit limit'],
  ['insuredLimit', 'Insured limit'],
]

export const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// A take-off item from a library build-up: a DEEP COPY, so this job's changes
// never touch the library.
export function itemFromTemplate(tIn) {
  const t = normalizeTemplate(tIn)          // comments etc. cleared on the way in (1102)
  return {
    // The build-up's own profit % (if it has one) becomes this item's - it takes
    // priority over the quote's profit % (1119).
    id: newId('i'), kind: 'item', description: t.description, unit: t.unit || '', qty: null, rateOnly: false, profit: t.profit != null ? t.profit : null,
    templateRef: t.ref, buildup: JSON.parse(JSON.stringify({ sizes: t.sizes || [], lines: t.lines || [], rules: t.rules || [], descText: t.descText || '', descVars: t.descVars || [], commentsCleared: true })),
  }
}
export const uniqueItem = (unit = 'm2') => ({ id: newId('i'), kind: 'item', description: 'Unique item', unit, qty: null, rateOnly: false, profit: null, templateRef: null, buildup: { sizes: [], lines: [], rules: [] } })
export const sectionRow = (title = 'New section') => ({ id: newId('s'), kind: 'section', title })
// A BLANK LINE (1139) - layout only on the take-off; never priced, not on the quote.
export const spacerRow = () => ({ id: newId('b'), kind: 'spacer' })
// A copy of take-off rows with fresh ids (1139) - for copy / paste.
export const copyRows = (rows) => (rows || []).map(r => ({ ...JSON.parse(JSON.stringify(r)), id: newId(r.kind === 'section' ? 's' : r.kind === 'spacer' ? 'b' : 'i') }))

// Price ONE item with the estimate's settings.
export function priceItem(item, lib, settings) {
  const s = settings || {}
  const profit = item.profit != null ? item.profit : (s.profit || 0)
  const qty = item.rateOnly ? null : (item.qty == null || item.qty === '' ? null : Number(item.qty))
  const r = rateFor({ ...item.buildup, unit: item.unit }, lib, { profit, mcd: s.mcd || 0, labourFactor: s.labourFactor == null ? 1 : s.labourFactor, jobQty: qty })
  const belowLine = !!item.rateOnly
  // To the penny, as the quote will print it.
  const total = !belowLine && qty != null ? Math.round(r.rate * qty * 100) / 100 : null
  return {
    rate: r.rate, total, belowLine, qty, profitUsed: profit,
    // per unit, BEFORE profit and MCD - the budget figures
    materialsRate: r.materials + r.fixed + r.lump, labourRate: r.labour,
    materialsTotal: qty != null && !belowLine ? (r.materials + r.fixed + r.lump) * qty : null,
    labourTotal: qty != null && !belowLine ? r.labour * qty : null,
    // per unit: profit and MCD (1096), and the cost per SUPPLIER - each material
    // line's cost per unit, by its product's supplier (before profit)
    profitRate: r.profit, mcdRate: r.mcd,
    profitTotal: qty != null && !belowLine ? r.profit * qty : null,
    bySupplier: supplierRates(item, r, lib),
    missing: r.missing, detail: r,
  }
}

function supplierRates(item, r, lib) {
  const out = {}
  const lines = Object.fromEntries((item.buildup.lines || []).map(l => [l.id, normalizeLine(l)]))
  for (const lc of r.lines || []) {
    const ln = lines[lc.id]
    if (lc.cost == null || !ln || ln.type !== 'material') continue
    const prod = lib.product[ln.default]
    if (!prod) continue          // an OWN item (no product) belongs to no supplier (1097)
    const sup = prod.supplier || 'No supplier'
    out[sup] = (out[sup] || 0) + lc.cost
  }
  return out
}

// Price the whole take-off. Totals count ABOVE-THE-LINE items with a quantity.
// est.adjustments (1094): this quote's own supplier increases / discounts, on
// top of the price list - applied here, so every total uses them.
export function priceEstimate(est, libIn) {
  const lib = adjustLib(libIn, est.adjustments)
  const priced = {}
  const totals = { total: 0, materials: 0, labour: 0, profitAndMcd: 0, profit: 0, bySupplier: {}, items: 0, belowLine: 0, noQty: 0, incomplete: 0 }
  for (const row of est.rows || []) {
    if (row.kind !== 'item') continue
    const p = priceItem(row, lib, est.settings)
    priced[row.id] = p
    totals.items++
    if (p.belowLine) { totals.belowLine++; continue }
    if (p.missing.length) totals.incomplete++
    if (p.total == null) { totals.noQty++; continue }
    totals.total += p.total
    totals.materials += p.materialsTotal || 0
    totals.labour += p.labourTotal || 0
    totals.profit += p.profitTotal || 0
    for (const [sup, rate] of Object.entries(p.bySupplier || {})) totals.bySupplier[sup] = (totals.bySupplier[sup] || 0) + rate * p.qty
  }
  totals.profitAndMcd = totals.total - totals.materials - totals.labour
  return { priced, totals }
}

// Section subtotals: each section's items above the line, until the next section.
export function sectionTotals(est, priced) {
  const out = {}
  let cur = null
  for (const row of est.rows || []) {
    if (row.kind === 'section') { cur = row.id; out[cur] = 0; continue }
    const p = priced[row.id]
    if (cur && p && p.total != null) out[cur] += p.total
  }
  return out
}

export function checkEstimate(est) {
  const errors = []
  if (!est || typeof est !== 'object') return ['No estimate']
  if (!Array.isArray(est.rows)) errors.push('No take-off rows')
  for (const r of est.rows || []) {
    if (r.kind === 'item') {
      if (r.qty != null && r.qty !== '' && Number.isNaN(Number(r.qty))) errors.push(`"${r.description}": quantity is not a number`)
      if (r.profit != null && (Number.isNaN(Number(r.profit)) || r.profit < -1 || r.profit > 5)) errors.push(`"${r.description}": profit override must be a percentage`)
    } else if (r.kind !== 'section' && r.kind !== 'spacer') errors.push('A row that is neither an item, a section nor a blank line')
  }
  const s = est.settings || {}
  if (s.mcd != null && (s.mcd < 0 || s.mcd >= 1)) errors.push('MCD must be between 0 and 100%')
  return errors
}

// ---- Budgets (1089) -------------------------------------------------------
// Where the money goes, BEFORE profit and MCD - the figures a won job is run
// to. Per item: each line's cost per unit x the item's quantity. Rate-only
// items (no quantity) are left out.
//   byCategory  { Materials: n, Labour: n, Delivery: n, Management: n, ... }
//   bySupplier  { 'Renolit': n, ... }   material lines, by the product's supplier
//   (lines with no cost category count as Other; products with no supplier as
//    "No supplier")
export function budgets(est, lib) {
  const { priced } = priceEstimate(est, lib)
  const byCategory = {}, bySupplier = {}
  const add = (o, k, v) => { o[k] = (o[k] || 0) + v }
  for (const row of est.rows || []) {
    if (row.kind !== 'item') continue
    const p = priced[row.id]
    if (!p || p.belowLine || p.qty == null) continue
    const lines = Object.fromEntries((row.buildup.lines || []).map(l => [l.id, normalizeLine(l)]))
    for (const lc of p.detail.lines) {
      if (lc.cost == null) continue
      const ln = lines[lc.id]
      if (!ln) continue
      const amount = lc.cost * p.qty
      add(byCategory, ln.cost || (ln.type === 'labour' ? 'Labour' : 'Other'), amount)
      if (ln.type === 'material') {
        const prod = lib.product[ln.default]
        if (prod) add(bySupplier, prod.supplier || 'No supplier', amount)   // own items: no supplier (1097)
      }
    }
  }
  return { byCategory, bySupplier }
}

// ---- Revisions (1089) -----------------------------------------------------
// A -> B ... Z -> AA
export function nextRevision(r) {
  const s = String(r || 'A').toUpperCase()
  if (!/^[A-Z]+$/.test(s)) return 'A'
  const chars = s.split('')
  let i = chars.length - 1
  while (i >= 0) {
    if (chars[i] !== 'Z') { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); return chars.join('') }
    chars[i] = 'A'; i--
  }
  return 'A' + chars.join('')
}

// What changed between two versions of an estimate (an issued revision and
// the next). -> [{ kind, text }] in take-off order, then the totals.
export function diffEstimates(before, after, lib) {
  const out = []
  const pb = priceEstimate(before, lib), pa = priceEstimate(after, lib)
  const sb = before.settings || {}, sa = after.settings || {}
  const pctS = (v) => `${+((v || 0) * 100).toFixed(2)}%`
  if ((sb.profit ?? null) !== (sa.profit ?? null)) out.push({ kind: 'setting', text: `Profit ${pctS(sb.profit)} -> ${pctS(sa.profit)}` })
  if ((sb.mcd ?? null) !== (sa.mcd ?? null)) out.push({ kind: 'setting', text: `MCD ${pctS(sb.mcd)} -> ${pctS(sa.mcd)}` })
  if ((sb.labourFactor ?? 1) !== (sa.labourFactor ?? 1)) out.push({ kind: 'setting', text: `Labour factor ${sb.labourFactor ?? 1} -> ${sa.labourFactor ?? 1}` })
  const adjText = (e) => (e.adjustments || []).map(a => `${a.supplier} ${pctText(a.pct)}`).sort().join(', ')
  if (adjText(before) !== adjText(after)) out.push({ kind: 'setting', text: `Quote price adjustments: ${adjText(before) || 'none'} -> ${adjText(after) || 'none'}` })
  const items = (e) => new Map((e.rows || []).filter(r => r.kind === 'item').map(r => [r.id, r]))
  const ib = items(before), ia = items(after)
  const money = (v) => v == null ? '-' : Number(v).toFixed(2)
  for (const [id, r] of ia) {
    const o = ib.get(id)
    if (!o) { out.push({ kind: 'added', text: `Added "${r.description}"${pa.priced[id]?.total != null ? ` (${money(pa.priced[id].total)})` : r.rateOnly ? ' (rate only)' : ''}` }); continue }
    const was = pb.priced[id] || {}, now = pa.priced[id] || {}
    const bits = []
    if (o.description !== r.description) bits.push(`renamed from "${o.description}"`)
    if (!!o.rateOnly !== !!r.rateOnly) bits.push(r.rateOnly ? 'now rate only' : 'no longer rate only')
    if (String(o.qty ?? '') !== String(r.qty ?? '')) bits.push(`qty ${o.qty ?? 'TBC'} -> ${r.qty ?? 'TBC'}`)
    if ((o.profit ?? null) !== (r.profit ?? null)) bits.push(`profit ${o.profit == null ? 'quote' : pctS(o.profit)} -> ${r.profit == null ? 'quote' : pctS(r.profit)}`)
    if (was.rate !== now.rate) bits.push(`rate ${money(was.rate)} -> ${money(now.rate)}`)
    if (bits.length) out.push({ kind: 'changed', text: `"${r.description}": ${bits.join(', ')}${was.total !== now.total ? ` (total ${money(was.total)} -> ${money(now.total)})` : ''}` })
  }
  for (const [id, o] of ib) if (!ia.has(id)) out.push({ kind: 'removed', text: `Removed "${o.description}"${pb.priced[id]?.total != null ? ` (${money(pb.priced[id].total)})` : ''}` })
  const tb = pb.totals.total, ta = pa.totals.total
  if (Math.abs(tb - ta) > 0.004) out.push({ kind: 'total', text: `Total ${money(tb)} -> ${money(ta)} (${ta >= tb ? '+' : ''}${money(ta - tb)})` })
  return out
}

// A prelims block: a section and one item (unit 'item', qty 1) whose lump-sum
// lines carry their own cost categories - so they show in the breakdown.
export function prelimsRows() {
  const s = sectionRow('Prelims')
  const it = {
    id: newId('i'), kind: 'item', description: 'Preliminaries', unit: 'item', qty: 1, rateOnly: false, profit: null, templateRef: null,
    buildup: { sizes: [], rules: [], lines: [
      { id: 'L1', type: 'lump sum', label: 'Lodge', amount: null, qty: '1', cost: 'Prelims', comment: 'Accommodation and travel for the job' },
      { id: 'L2', type: 'lump sum', label: 'Management', amount: null, qty: '1', cost: 'Management', comment: 'Site management for the job' },
      { id: 'L3', type: 'lump sum', label: 'Attendances', amount: null, qty: '1', cost: 'Attendances', comment: '' },
    ] },
  }
  return [s, it]
}

// ---- Project and customer details from the CRM (1090) ------------------------
// A linked estimate stores only the deal's id. These details are read LIVE from
// the deal every time the estimate opens - a change in the CRM shows here and
// in the letter. An issued revision keeps them as they were on the day.
//   [key on the estimate, label, the deal field (or a function of the deal)]
export const CRM_DETAILS = [
  ['project', 'Project', (d) => d.title || ''],
  ['location', 'Site location', 'site_location'],
  ['contractor', 'Customer', 'organization'],
  ['customerAddress', 'Customer address', 'org_address'],
  ['contactName', 'Contact', 'contact_person'],
  ['contactRole', 'Job role', 'contact_job_role'],
  ['contactEmail', 'Email', 'contact_email'],
  ['contactPhone', 'Phone', 'contact_phone'],
  ['tenderReturn', 'Tender return date', 'expected_close_date'],
  ['startOnSite', 'Start on site', 'project_start_date'],
  ['estimator', 'Estimator', 'estimator_responsible'],
  ['creditScore', 'Credit score', 'credit_score'],
  ['creditLimit', 'Credit limit', 'credit_limit'],
  ['insuredLimit', 'Insured credit limit', 'insured_credit_limit'],
]
// The estimate's OWN details - never from the CRM.
// The quote DATE is not typed (1098): it is the day the quote is marked as sent
// (the revision issued); a draft shows today's date marked DRAFT.
export const OWN_DETAILS = [['reviewer', 'Reviewer']]

export function crmDetailsOf(deal) {
  const f = (deal && deal.fields) || {}
  const out = {}
  for (const [k, , src] of CRM_DETAILS) {
    const v = typeof src === 'function' ? src(deal || {}) : f[src]
    out[k] = v == null ? '' : (typeof v === 'object' ? (v.name || v.value || '') : String(v))
  }
  return out
}

// The details to show / print: live from the CRM when linked, else the
// estimate's own typed header. Plus the estimate's own fields either way.
export function detailsFor(est, crm) {
  const h = est.header || {}
  const base = crm && !crm.missing ? crm.details : Object.fromEntries(CRM_DETAILS.map(([k]) => [k, h[k] || '']))
  return { ...base, ...Object.fromEntries(OWN_DETAILS.map(([k]) => [k, h[k] || ''])) }
}
