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
]

export const emptyTemplates = () => ({ letter: { body: '' }, library: { inclusions: [], exclusions: [], clarifications: [] }, terms: { versions: [] } })
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
    tenderReturn: d.tenderReturn || '', estimator: d.estimator || '',
    total: total != null && money ? money(total, { dp: 2 }) : '', mcd: s.mcd != null ? `${+(s.mcd * 100).toFixed(2)}%` : '',
  }
}

export function checkTemplates(t) {
  const errors = []
  if (!t || typeof t !== 'object') return ['Nothing to save']
  for (const [k] of CLAR_KINDS) if (!Array.isArray(t.library?.[k])) errors.push(`${k} must be a list`)
  if (typeof (t.letter?.body ?? '') !== 'string') errors.push('The letter must be text')
  return errors
}
