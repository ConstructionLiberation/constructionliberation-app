// PRE-CONTRACT TOTALS FOR A MONTH (1040) - one rule each, used by the
// estimator scorecard ("All estimators" cards) and the Business Scorecard, so
// the two pages cannot show different figures.
//
// Inputs are what /api/deals-crm and /api/value-changes-crm return: flat deals
// (lib/crmDashboardAdapter crmDealsToFlat) and value-change records
// (lib/crmValueChanges getAllCrmValueChanges).

export const monthKey = (s) => s ? String(s).substring(0, 7) : null

// VALUE OF WORK PRICED: the sum of every value change dated in the month,
// across all projects. Blank -> 100k adds 100k; 20k -> 25k adds 5k; a price
// cut subtracts. Each change is one record, so a project repriced twice in a
// month contributes both changes.
export function valuePricedIn(valueChanges, month) {
  const list = (valueChanges || []).filter(v => v.changeDate && monthKey(v.changeDate) === month)
  return { total: list.reduce((s, v) => s + (v.valueChange || 0), 0), list }
}

// VALUE OF WORK SECURED: the value of every deal WON in the month (by its
// close date), across all estimators. A won deal with no value is a data gap,
// not a zero-value win, so it is left out.
export function valueSecuredIn(deals, month) {
  const list = (deals || []).filter(d => d.status === 'won' && d.value > 0 && monthKey(d.closeTime) === month)
  return { total: list.reduce((s, d) => s + d.value, 0), list }
}
