// FORMS MARKED "NOT NEEDED".
//
// A required form is worked out from the Planner: somebody allocated to a project on a
// day means a Daily Site Diary is due for that day. That is right nearly always and
// wrong sometimes - a Contracts Manager allocated for one day to walk the job needs no
// diary, and the page has no way to know the difference. Only a person does.
//
// So a row can be waived. It stops counting, it leaves the Missing list, and it stays
// gone - which is the part that decides the shape below.
//
// THE KEY IS THE OBLIGATION, NOT THE VIEW.
//
// A waive has to survive the date range changing. Filter to next month, come back, and
// the same row must still be waived - so the key is built from what the obligation IS
// (which project, which form, which date) and never from anything about how it is
// currently being looked at. Keyed on the week, or the row's position in a list, it
// would come back the moment the filter moved.
//
// ONE RULE, ONE FILE. The server writes these keys and the browser reads them. Two
// copies of a key format that must agree exactly is the fault this codebase has hit
// more than any other, and here it would not error - the waive would simply stop
// matching and the row would reappear with no explanation.
//
// PURE. No database import, because the page imports this too. Reading and writing the
// store is the API's job.

export const WAIVED_KEY = 'ops:forms-waived'

// projectNo | formType | the date it is actually about.
//
// dueDate is the specific day for a diary or a water ingress visit; the weekly forms
// carry one too. Falling back to the week covers any row that has no specific date, and
// is stable for the same reason - a given week's obligation is the same obligation
// whichever range is on screen.
export function waiveKey(row) {
  if (!row) return ''
  const when = row.dueDate || row.week || ''
  return [
    String(row.projectNo || ''),
    String(row.formType || ''),
    String(when),
  ].join('|')
}

// Normalise whatever is in Redis into a plain object. A store that has never been
// written is null, and a corrupted one must not take the page down with it.
export function normaliseWaived(raw) {
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {}
}
