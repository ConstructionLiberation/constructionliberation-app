// HIDDEN PEOPLE ON THE SCORECARDS (1025).
//
// Someone who has left still appears on a scorecard, because the people are
// derived from the data - the estimator on a deal, the Contracts Manager on a
// project - and their history is still in it. Hiding takes their TAB away.
// It does not take their work out of any team total: a figure for "all
// estimators" still counts a deal a leaver priced, because they did price it.
//
// Stored per tenant at scorecard:hiddenPeople as
//   { 'pre-contract': [key, ...], 'operations': [key, ...] }
// read and written through /api/targets, which both scorecards already fetch.
//
// KEYED BY NAME, NOT ID. The rule is never to store a display name as a key,
// and it would apply here if there were an alternative: these people have no
// id. A tab exists because a name appears on deals or projects, so the name is
// the only thing to match. If someone is renamed on their records, their tab
// comes back - visible, not silently lost.

export const SCORECARDS = ['pre-contract', 'operations']

// Case and spacing do not make a different person.
export const personKey = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()

export function cleanHiddenPeople(v) {
  const out = {}
  for (const sc of SCORECARDS) {
    const list = Array.isArray(v?.[sc]) ? v[sc] : []
    out[sc] = [...new Set(list.map(personKey).filter(Boolean))]
  }
  return out
}
