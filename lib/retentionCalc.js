// THE RETENTION RULES. ONE COPY.
//
// These lived in pages/retention.js, and pages/business-financials/retentions-due.js
// had its own version with a comment saying it was a "mirror ... so figures
// always balance". They did not balance.
//
//   tracker   retention on APPLIED FOR      correct
//   BF        retention on INVOICED         wrong under any reading
//
// Almost every project differed. J190 read 7,845.91 a half on the tracker and
// 7,993 on Business Financials; J197 6,914.35 against 6,435. The few that
// agreed were the jobs where applied for and invoiced happen to be the same
// number, which is exactly how a fault like this survives a spot check.
//
// RETENTION COMES FROM THE APPLICATION. That is the source of truth: retention
// is deducted on what has been applied for, so retention owed is applied for
// times the retention percentage. It converges on the final account as a job
// completes, but the application is what governs at any moment in between.
//
// Invoiced is not a retention base at all. It is what has been billed, which
// lags and sometimes leads what has been certified.

// RETENTION OWED = applied for x retention %.
export function calcRetentionOwed(entry) {
  const pct = parseFloat(entry.retentionPct || 0) || 0
  const base = parseFloat(entry.appliedFor || 0) || 0
  if (pct <= 0 || base <= 0) return 0
  // Whole numbers on tracker rows (5), fractions on project records (0.05).
  return base * (pct > 1 ? pct / 100 : pct)
}

// A RELEASE HALF IS HALF THE RETENTION ON THE FINAL ACCOUNT.
//
// NOT half of retention owed. These are two different things and collapsing
// them is a mistake I made in the first version of this file:
//
//   retention HELD    accrues as you apply      applied for x ret%
//   a release HALF    is contractual, fixed     final account x ret% / 2
//
// A half falling due at 70% applied for is still half of the WHOLE retention -
// that is what the application certificate claims, and what the contract
// entitles you to. lib/applications.js has always computed it this way
// (finalSubTotal x ret% / 2), and pages/api/dashboard.js says the same in a
// comment with a worked example: on a 580k account at 5% MCD and 3% retention,
// half of retention-to-date was 6,227 against the 8,265 the application
// actually claims.
//
// So the portal must agree with the certificate, not the other way round.
//
// retentionOnFinalAccount is computed on the project record as Gross AFA less
// MCD, times the retention percentage - the same base the certificate uses.
// Falls back to computing it from the final account on the row for manual
// entries, which have no project behind them.
export function calcReleaseHalf(entry) {
  const stored = parseFloat(entry.retentionOnFinalAccount || 0) || 0
  if (stored > 0) return stored / 2

  const pct = parseFloat(entry.retentionPct || 0) || 0
  const fa = parseFloat(entry.finalAccount || 0) || 0
  if (pct <= 0 || fa <= 0) return 0
  return (fa * (pct > 1 ? pct / 100 : pct)) / 2
}

// IS A HALF RELEASED?
//
// A manual tick or untick always wins over the application, so somebody can
// correct what the application inferred. Undefined means nobody has said, so
// the application decides.
export function released1(entry) {
  if (entry.release1Manual === true) return true
  if (entry.release1Manual === false) return false
  return !!entry.appRelease1
}

export function released2(entry) {
  if (entry.release2Manual === true) return true
  if (entry.release2Manual === false) return false
  return !!entry.appRelease2
}

// WHAT IS STILL OUTSTANDING on one row: the retention held, less the halves
// already released.
//
// Note the two sides use different bases ON PURPOSE - held accrues with
// applications, a release is contractual. Mid-contract a released half can
// exceed what has accrued, and the figure is smaller than the halves remaining
// suggest. That is the real commercial position, not an error: you have claimed
// a contractual half against retention you have not yet fully accrued. The two
// converge as the job completes, because applied for converges on the final
// account.
export function calcOutstanding(entry) {
  const owed = calcRetentionOwed(entry)
  const half = calcReleaseHalf(entry)
  const released = (released1(entry) ? half : 0) + (released2(entry) ? half : 0)
  return owed - released
}

// The unreleased halves as dated events, for the cash-in view. Same rule as
// calcOutstanding, so the list and the total cannot disagree: every half this
// returns is one calcOutstanding counted.
export function outstandingReleases(entry) {
  const half = calcReleaseHalf(entry)
  const out = []
  if (half && !released1(entry)) out.push({ which: '1st release', date: entry.release1Date || '', amount: half })
  if (half && !released2(entry)) out.push({ which: '2nd release', date: entry.release2Date || '', amount: half })
  return out
}
