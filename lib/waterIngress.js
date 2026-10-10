// WATER INGRESS REPORTS FOR THE BUSINESS SCORECARD (1039).
//
// Counts Water Ingress Reports where "Who is responsible for the water
// ingress?" is answered with the company itself.
//
//   EVERY REPORT COUNTS. A second report on the same project is a second leak:
//   the first should have fixed it. No de-duplication, by decision.
//
//   THE DATE IS THE FORM'S OWN - its first date question, "Date on which the
//   water ingress survey and assessment took place". Not the submission date,
//   which moves if the form is typed up late. A report with that left blank
//   falls back to the day it was submitted.
//
//   Read from the form DEFINITION, not hardcoded field ids, so the count
//   follows the form if it is edited in the forms builder:
//     - the responsibility question: the single-choice field labelled "Who is
//       responsible..."
//     - "our fault": that question's FIRST option. On Rock's form it is
//       "Rock"; on another company's copy it would be their name. Matching the
//       word 'Rock' would count nothing for anyone else.
//
// lib/formDates.js formDateOf() is NOT used: its rule only recognises labels
// like "Site diary date", and widening it would change how Forms Missing
// scores other forms.

const isWaterIngress = (s) => s && (s.formId === 'water-ingress-report' || /water ingress/i.test(s.formTitle || ''))
const norm = (s) => String(s || '').trim().toLowerCase()

function isoDay(v) {
  if (!v) return ''
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// -> { reports: [{ id, date, month, project, reportedBy, surveyedBy, cause, responsible }], problem }
// Only reports that are OUR fault are returned. problem is a message when the
// form definition could not be read, so the card can say why it is empty.
export async function ourFaultWaterIngress({ getSubmissionIndex, getSubmission, getForms }) {
  const [index, forms] = await Promise.all([getSubmissionIndex(), getForms()])
  const def = (forms || []).find(f => f.id === 'water-ingress-report') || (forms || []).find(f => /water ingress/i.test(f.title || ''))
  const fields = def?.fields || []
  const resp = fields.find(f => f.type === 'single' && /who is responsible/i.test(f.label || ''))
  if (!def || !resp || !(resp.options || []).length) {
    return { reports: [], problem: 'The Water Ingress Report form, or its "Who is responsible" question, could not be found.' }
  }
  const ours = norm(resp.options[0])
  const dateId = (fields.find(f => f.type === 'date') || {}).id
  const byLabel = (rx) => (fields.find(f => rx.test(f.label || '')) || {}).id
  const reportedById = byLabel(/who reported/i)
  const surveyedById = byLabel(/your name/i)
  const causeId = byLabel(/determined to be the cause/i)

  const wi = (index || []).filter(s => isWaterIngress(s) && !s.draft)
  const full = await Promise.all(wi.map(s => getSubmission(s.id).catch(() => null)))
  const reports = []
  for (let i = 0; i < wi.length; i++) {
    const s = full[i]
    if (!s) continue
    const a = s.answers || {}
    if (norm(a[resp.id]) !== ours) continue
    const date = isoDay(dateId && a[dateId]) || isoDay(s.submittedAt ? new Date(s.submittedAt) : '')
    if (!date) continue
    reports.push({
      id: s.id, date, month: date.slice(0, 7),
      project: s.projectName || wi[i].projectName || '',
      reportedBy: reportedById ? String(a[reportedById] || '') : '',
      surveyedBy: surveyedById ? String(a[surveyedById] || '') : '',
      cause: causeId ? String(a[causeId] || '') : '',
      responsible: String(a[resp.id] || ''),
      dateFromForm: !!(dateId && a[dateId]),
    })
  }
  reports.sort((x, y) => x.date.localeCompare(y.date))
  return { reports, problem: null }
}
