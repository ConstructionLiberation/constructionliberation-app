// THE CUSTOMER PROGRESS REPORT (1234) - the parts of a Project Report the customer is sent,
// chosen once for the company ("Edit customer report") and sent by hand from the reports
// table ("Send Customer Progress Report"). Client-safe: the page and the route share it.
//   report:customer -> { include: [section keys] }
// The header - project, address, customer, date, who completed it - always goes.
import { BUILT_IN_SECTIONS, CUSTOM_AFTER, normaliseTemplate } from './projectReportTemplate'

export const CUSTOMER_KEY = 'report:customer'
// to begin with: variations, works completed with the marked-up drawings, the week's photos,
// planned works and the customer notes - changed with "Edit customer report"
export const DEFAULT_CUSTOMER_INCLUDE = ['_variations', '_worksCompleted', '_drawings', '_photos', '_manualPhotos', '_plannedWorks', '_customerNotes']
const ALWAYS = ['_date', '_project', '_customer', '_completedBy', '_address']

// the sections that can be chosen, in the report's order: its own, the company's template
// sections (after the customer notes), and the weather (before the approval)
export function customerChoices(template) {
  const own = normaliseTemplate(template).sections.map(s => ({ key: s.key, label: s.label, custom: true }))
  const out = []
  for (const b of BUILT_IN_SECTIONS) {
    if (ALWAYS.includes(b.key)) continue
    if (b.key === '_approval') out.push({ key: '_weather', label: 'Weather', note: 'the 14 days to the report date' })
    out.push({ key: b.key, label: b.label, note: b.note })
    if (b.key === CUSTOM_AFTER) out.push(...own)
  }
  return out
}
export const customerInclude = (settings) => Array.isArray(settings && settings.include) ? settings.include.map(String) : DEFAULT_CUSTOMER_INCLUDE
