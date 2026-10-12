// LABOUR RATES - THE RULES (1086). Pure; shared by the page and the server.
//
// ONE rate per labour item: the price per unit the estimate uses.
//   ref, section, description
//   rate       price per unit (ex VAT)
//   unit       m2 | m | nr
//   rateDate   'YYYY-MM-DD'
//   notes      where the rate came from (e.g. the installer who quoted it) -
//              for reference only, never used in pricing
//
// THE DAY RATE is a separate SETTING (see checkSettings), not an item: every
// estimate starts from it and can change it. It is never filled in for a
// company - they set it.
import { cleanText, cellNumber, cellDate, parseLibrarySheet, sectionsOf } from './libraryParse'
export { sectionsOf }

export const LABOUR_COLUMNS = [
  ['ref', 'Ref'], ['section', 'Section'], ['description', 'Description'], ['rate', 'Rate'],
  ['unit', 'Unit'], ['rateDate', 'Rate date'], ['notes', 'Notes'],
]
export const LABOUR_UNITS = ['m2', 'm', 'nr', 'week', 'day']   // weeks, days: 1101
export const LABOUR_UNIT_LABEL = { m2: 'm²', m: 'm', nr: 'nr', week: 'week', day: 'day' }
const REQUIRED = ['Ref', 'Section', 'Description', 'Rate', 'Unit']

export function checkLabour(raw) {
  const errors = [], warnings = []
  const it = {
    ref: cleanText(raw.ref, 40), section: cleanText(raw.section, 120), description: cleanText(raw.description, 300),
    unit: cleanText(raw.unit, 10).toLowerCase().replace('m²', 'm2').replace(/^(week|day)s$/, '$1'), notes: cleanText(raw.notes, 500),
  }
  const rate = cellNumber(raw.rate)
  if (Number.isNaN(rate)) { errors.push(`Rate is not a number: '${cleanText(raw.rate, 40)}'`); it.rate = null } else it.rate = rate
  if (!it.ref) errors.push('No Ref')
  if (!it.section) errors.push('No Section')
  if (!it.description) errors.push('No Description')
  if (it.unit && !LABOUR_UNITS.includes(it.unit)) errors.push(`Unit '${it.unit}' must be one of ${LABOUR_UNITS.join(', ')}`)
  if (it.rate != null && it.rate < 0) errors.push('Rate cannot be negative')
  const d = cellDate(raw.rateDate)
  if (d === 'invalid') { warnings.push(`Rate date not a real date: '${cleanText(raw.rateDate, 30)}' - left blank`); it.rateDate = null } else it.rateDate = d
  if (it.rate == null) warnings.push('No rate - cannot be priced until one is added')
  else if (it.rate === 0) warnings.push('Rate is 0')
  if (!it.unit) warnings.push('No unit - cannot be priced until one is set')
  return { item: it, errors, warnings }
}

export const labourUsable = (it) => it && it.rate != null && it.rate > 0 && !!it.unit

export function parseLabourSheet(aoa) {
  return parseLibrarySheet(aoa, { columns: LABOUR_COLUMNS, required: REQUIRED, check: checkLabour })
}

export function diffLabour(current, incoming) {
  const cur = new Map((current || []).map(p => [p.ref.toLowerCase(), p]))
  const inc = new Map((incoming || []).map(p => [p.ref.toLowerCase(), p]))
  const same = (a, b) => ['section', 'description', 'rate', 'unit', 'rateDate', 'notes'].every(k => (a[k] ?? null) === (b[k] ?? null))
  const added = [], changed = [], removed = [], rateChanged = []
  for (const [k, p] of inc) {
    const c = cur.get(k)
    if (!c) added.push(p)
    else if (!same(c, p)) { changed.push(p); if ((c.rate ?? null) !== (p.rate ?? null)) rateChanged.push({ ref: p.ref, description: p.description, from: c.rate, to: p.rate }) }
  }
  for (const [k, c] of cur) if (!inc.has(k)) removed.push(c)
  return { added, changed, removed, rateChanged }
}

// THE DAY RATE SETTING. hoursPerDay turns it into an hourly rate (the
// workbook uses 8).
export function checkSettings(raw) {
  const errors = []
  const dayRate = cellNumber(raw.dayRate), hoursPerDay = cellNumber(raw.hoursPerDay)
  if (dayRate == null || Number.isNaN(dayRate) || dayRate <= 0) errors.push('Day rate must be a number more than 0')
  if (hoursPerDay == null || Number.isNaN(hoursPerDay) || hoursPerDay <= 0 || hoursPerDay > 24) errors.push('Hours per day must be between 0 and 24')
  return { settings: { dayRate, hoursPerDay }, errors }
}
export const hourlyRate = (s) => (s && s.dayRate > 0 && s.hoursPerDay > 0) ? s.dayRate / s.hoursPerDay : null
