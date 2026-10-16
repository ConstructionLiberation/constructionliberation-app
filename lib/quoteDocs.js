// QUOTE DOCUMENTS - THE RULES (1092). Pure: shared by pages and server.
//
// COMPANY-WIDE (Admin > Quote Documents; admins edit):
//   letter         { body }                      the standard covering letter
//   library        { inclusions[], exclusions[], clarifications[] }  each { id, text }
//   terms          { versions: [{ v, text, at, by }] }  - newest last; an issued
//                  quote keeps the version it went out with
// PER ESTIMATE (its tabs):
//   est.letter            { body }  - starts from the company letter, editable
//   est.clarifications    { inclusions[], exclusions[], clarifications[] }
//                         each { id, text }  - ticked from the library or own
// Nothing is filled in for a company: all start empty.
//
// PLACEHOLDERS in a letter stay as placeholders in what is stored, and are
// filled when shown - so a change to the CRM deal shows in the letter.

export const CLAR_KINDS = [['inclusions', 'Inclusions'], ['exclusions', 'Exclusions'], ['clarifications', 'Clarifications']]

export const PLACEHOLDERS = [
  ['companyName', 'Your company name'], ['date', 'Quote date'], ['quoteRef', 'Quote ref'], ['revision', 'Revision'],
  ['project', 'Project'], ['location', 'Site location'], ['customer', 'Customer'], ['customerAddress', 'Customer address'],
  ['contactName', 'Contact name'], ['contactFirstName', 'Contact first name'], ['contactRole', 'Contact job role'],
  ['tenderReturn', 'Tender return date'], ['estimator', 'Estimator'], ['total', 'Quote total'], ['mcd', 'MCD %'],
  ['ratesHeldUntil', 'Rates held until'],
  ['estimatorEmail', 'Estimator email'], ['estimatorPhone', 'Estimator phone'],   // from Portal Users (1186)   // a date set on each estimate's Letter tab (1162)
]

export const emptyTemplates = () => ({ letter: { body: '' }, library: { inclusions: [], exclusions: [], clarifications: [] }, terms: { versions: [] } })
// THE PRICING CHECKLIST (1142) - reminders shown on every take-off, above the
// total. The company list is edited in Admin > Quote Documents; until it is,
// this starter list is used. Each estimate keeps its own ticks and may add its
// own reminders (est.checklist = { ticked: { id: true }, own: [{ id, text }] }).
export const DEFAULT_CHECKLIST = [
  'Drawings, specification and all tender documents read - including addenda',
  'Access: scaffold, edge protection, hoist / crane allowed for',
  'Prelims: welfare, site management, travel and accommodation',
  'Programme: phasing, number of visits, out-of-hours or weekend working',
  'Deliveries: lead times, small-load charges, distribution on the roof',
  'Waste: skips and disposal allowed for',
  'Temporary protection and weather allowances',
  'Manufacturer warranty requirements: inspections, guarantees, approved installer',
  'Price list current - supplier increases / discounts applied',
  'Rate-only and optional items placed below the line',
  'Clarifications, exclusions and the covering letter checked for this job',
  'Retention, MCD and payment terms checked against the enquiry',
].map((text, i) => ({ id: `d${i + 1}`, text }))
export const checklistOf = (tpl) => (tpl && Array.isArray(tpl.checklist)) ? tpl.checklist : DEFAULT_CHECKLIST
// THE LETTER (1163): a quote follows the COMPANY TEMPLATE unless its letter has
// been changed for that quote (est.letter.body set). Reset = back to the template.
export const letterIsCustom = (est) => !!(est && est.letter && est.letter.body != null)
export const letterOf = (est, tpl) => letterIsCustom(est) ? String(est.letter.body) : String((tpl && tpl.letter && tpl.letter.body) || '')
// WHAT STOPS A LETTER GOING TO THE CUSTOMER (1164): a placeholder with nothing to
// fill it (shown red), or text still marked red to edit. -> { missing: [labels], red: n }
export function letterProblems(text, values) {
  const t = String(text || ''), v = values || {}
  const label = Object.fromEntries(PLACEHOLDERS)
  const missing = [...new Set([...t.matchAll(/\{\{\s*([a-zA-Z]+)\s*\}\}/g)].map(m => m[1]).filter(k => label[k] && !String(v[k] ?? '').trim()).map(k => label[k]))]
  const red = (t.match(/\[red\][\s\S]*?\[\/red\]/g) || []).length
  return { missing, red }
}
export const letterProblemText = (p) => [p.missing.length ? `${p.missing.join(', ')} not filled in` : '', p.red ? `${p.red} part${p.red === 1 ? '' : 's'} still marked red to edit` : ''].filter(Boolean).join('; ')
// CLARIFICATIONS (1165): ONE list of headers and clarifications - [{ id, kind:
// 'header' | 'item', text }]. A company TEMPLATE (tpl.clarTemplate) every quote
// follows until changed on that quote (est.clarList). A quote made before this,
// with inclusions / exclusions / clarifications, keeps them - under those headers.
export function legacyClar(est) {
  const c = est && est.clarifications
  if (!c || typeof c !== 'object') return null
  const out = []
  for (const [k, label] of CLAR_KINDS) {
    const l = (c[k] || []).filter(x => String(x.text || '').trim())
    if (l.length) { out.push({ id: `h_${k}`, kind: 'header', text: label }); for (const x of l) out.push({ id: String(x.id), kind: 'item', text: x.text }) }
  }
  return out.length ? out : null
}
export const clarIsCustom = (est) => Array.isArray(est && est.clarList) || !!legacyClar(est)
export const clarTemplateOf = (tpl) => (tpl && Array.isArray(tpl.clarTemplate)) ? tpl.clarTemplate : []
export const clarOf = (est, tpl) => Array.isArray(est && est.clarList) ? est.clarList : (legacyClar(est) || clarTemplateOf(tpl))
// The first time the template is edited: the old company list under its headers.
export function clarStarter(tpl) {
  if (tpl && Array.isArray(tpl.clarTemplate)) return tpl.clarTemplate
  const lib = (tpl && tpl.library) || {}, out = []
  for (const [k, label] of CLAR_KINDS) {
    const l = (lib[k] || []).filter(x => String(x.text || '').trim())
    if (l.length) { out.push({ id: `h_${k}`, kind: 'header', text: label }); for (const x of l) out.push({ id: String(x.id), kind: 'item', text: x.text }) }
  }
  return out
}
// red parts still in the clarifications - each must be checked before sending (1171)
export const clarRedCount = (list) => (Array.isArray(list) ? list : []).reduce((n, x) => n + ((String(x.text || '').match(/\[red\][\s\S]*?\[\/red\]/g) || []).length), 0)
// THE REVISIONS A QUOTE DOCUMENT IS ON (1193) - a list; one saved with a single
// revision (1169) reads as a list of one.
export const docRevisions = (d) => Array.isArray(d && d.revisions) ? d.revisions : (d && d.revision ? [d.revision] : [])
export const cleanClarList = (list) => (Array.isArray(list) ? list : []).map(x => ({ id: String(x.id || ''), kind: x.kind === 'header' ? 'header' : 'item', text: String(x.text || '').slice(0, 2000) })).filter(x => x.id)
export const currentTerms = (tpl) => ((tpl && tpl.terms && tpl.terms.versions) || []).slice(-1)[0] || null

// Fill {{placeholders}}. Unknown or empty ones are left visible as [Name] so
// a gap is obvious rather than silently blank.
export function fillPlaceholders(text, ctx) {
  const labels = Object.fromEntries(PLACEHOLDERS)
  return String(text || '').replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (m, k) => {
    const v = ctx[k]
    if (v != null && String(v).trim() !== '') return String(v)
    return `[${labels[k] || k}]`
  })
}

// The values for a quote: live CRM details (or the estimate's own), the quote's figures.
export function placeholderValues({ est, details, total, companyName, money, dateText }) {
  const d = details || {}
  const s = est.settings || {}
  return {
    companyName: companyName || '', date: dateText || '', quoteRef: est.quoteRef || '', revision: est.revision || '',
    project: d.project || '', location: d.location || '', customer: d.contractor || '', customerAddress: d.customerAddress || '',
    contactName: d.contactName || '', contactFirstName: (d.contactName || '').split(' ')[0] || '', contactRole: d.contactRole || '',
    tenderReturn: d.tenderReturn || '', estimator: d.estimator || '', estimatorEmail: d.estimatorEmail || '', estimatorPhone: d.estimatorPhone || '',
    total: total != null && money ? money(total, { dp: 2 }) : '', mcd: s.mcd != null ? `${+(s.mcd * 100).toFixed(2)}%` : '',
    ratesHeldUntil: est.ratesHeldUntil ? new Date(`${est.ratesHeldUntil}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
  }
}

export function checkTemplates(t) {
  const errors = []
  if (!t || typeof t !== 'object') return ['Nothing to save']
  for (const [k] of CLAR_KINDS) if (!Array.isArray(t.library?.[k])) errors.push(`${k} must be a list`)
  if (typeof (t.letter?.body ?? '') !== 'string') errors.push('The letter must be text')
  return errors
}
