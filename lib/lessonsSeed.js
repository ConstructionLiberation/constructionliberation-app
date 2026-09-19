// EMPTIED DELIBERATELY. DO NOT PUT DATA BACK IN THIS FILE.
//
// This held 60 KB of Rock Roofing's real internal management meeting minutes -
// named staff, monthly sales figures, KPI percentages, quality failures, and
// candid commercial commentary written for an internal audience.
//
// pages/api/lessons-learnt.js WROTE it into the database of any tenant the
// first time anyone opened the Lessons Learnt page. Not rendered and thrown
// away like lib/crmSeedDeals.js was - persisted, into a customer's own store,
// where it would then have looked like their own records.
//
// Found 20 September 2026 while removing the hardcoded first-admin account,
// one day after the CRM equivalent. Same fault class: one customer's real data
// compiled in as another customer's starting state.
//
// Rock's minutes were seeded long ago and live in Rock's database as ordinary
// editable records. Emptying this costs Rock nothing.
//
// This stub remains only so that any straggling import resolves rather than
// failing the build. Nothing reads it.
//
// The file can be deleted outright once a deploy has been confirmed clean.
// NOTE that deleting it does not remove the data from git history.

export const SEED_MINUTES = []
