// EXISTING CUSTOMERS - THE RULE (1047, moved here 1055). No imports, so both
// the scorecards (lib/precontractTotals.js) and the deals code
// (lib/crmDashboardAdapter.js) can use it without loading each other.
//
// A customer is EXISTING on a given day if we had already WON A DIFFERENT
// PROJECT for that organisation before that day.
//   Organisation   matched by name, ignoring case and spacing. No
//                  organisation, never existing.
//   "Before"       strictly before the day.
//   "Different"    the deal itself does not count.
//
// Deals passed in need { id, organizationName, status, closeTime }.

const orgKey = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
const dayOf = (s) => (s ? String(s).slice(0, 10) : '')

// { orgKey: [{ dealId, day }] } of every won deal, for the lookups below.
export function winsByOrg(deals) {
  const out = {}
  for (const d of deals || []) {
    if (d.status !== 'won' || !d.closeTime) continue
    const k = orgKey(d.organizationName)
    if (!k) continue
    ;(out[k] ||= []).push({ dealId: String(d.id), day: dayOf(d.closeTime) })
  }
  return out
}

export function isExistingCustomer(wins, organizationName, day, dealId) {
  const list = wins[orgKey(organizationName)] || []
  return list.some(w => w.dealId !== String(dealId) && w.day && w.day < dayOf(day))
}

