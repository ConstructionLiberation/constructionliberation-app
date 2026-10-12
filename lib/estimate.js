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
import { rateFor } from './buildups'

export const HEADER_FIELDS = [
  ['project', 'Project'], ['location', 'Location'], ['contractor', 'Contractor'], ['reviewer', 'Reviewer'],
  ['date', 'Date'], ['startOnSite', 'Start on site'], ['creditScore', 'Credit score'], ['creditLimit', 'Credit limit'],
  ['insuredLimit', 'Insured limit'],
]

export const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// A take-off item from a library build-up: a DEEP COPY, so this job's changes
// never touch the library.
export function itemFromTemplate(t) {
  return {
    id: newId('i'), kind: 'item', description: t.description, unit: t.unit || '', qty: null, rateOnly: false, profit: null,
    templateRef: t.ref, buildup: JSON.parse(JSON.stringify({ sizes: t.sizes || [], lines: t.lines || [], rules: t.rules || [] })),
  }
}
export const uniqueItem = (unit = 'm2') => ({ id: newId('i'), kind: 'item', description: 'Unique item', unit, qty: null, rateOnly: false, profit: null, templateRef: null, buildup: { sizes: [], lines: [], rules: [] } })
export const sectionRow = (title = 'New section') => ({ id: newId('s'), kind: 'section', title })

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
    missing: r.missing, detail: r,
  }
}

// Price the whole take-off. Totals count ABOVE-THE-LINE items with a quantity.
export function priceEstimate(est, lib) {
  const priced = {}
  const totals = { total: 0, materials: 0, labour: 0, profitAndMcd: 0, items: 0, belowLine: 0, noQty: 0, incomplete: 0 }
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
    } else if (r.kind !== 'section') errors.push('A row that is neither an item nor a section')
  }
  const s = est.settings || {}
  if (s.mcd != null && (s.mcd < 0 || s.mcd >= 1)) errors.push('MCD must be between 0 and 100%')
  return errors
}
