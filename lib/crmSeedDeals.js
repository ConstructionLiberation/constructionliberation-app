// EMPTIED DELIBERATELY. DO NOT PUT DATA BACK IN THIS FILE.
//
// This held 378 real Rock Roofing deals - 339 KB of main contractor names,
// named contacts, site addresses, tender values, credit scores, credit limits,
// lost reasons and internal commercial notes.
//
// Two paths delivered it to places it should never have reached:
//
//   pages/crm.js       imported it and never used it. A dead import - but it
//                      compiled the whole file into the CLIENT bundle, so it
//                      was served to the browser of anyone who opened the CRM,
//                      on any tenant, on any hostname.
//
//   pages/api/crm.js   seeded it as the starting data for any tenant with no
//                      crm:deals key. A new customer's CRM opened showing
//                      Rock's pipeline.
//
// Found on 19 September 2026 on the zztest tenant: a database containing two
// keys displayed six months of Rock's live pipeline. No data crossed between
// databases. It was compiled in.
//
// Both imports are gone. This stub remains only so that any straggling import
// resolves rather than failing the build; nothing in the app reads it.
//
// The file can be deleted outright once a deploy has been confirmed clean.
// NOTE that deleting it does not remove the data from git history.

export const SEED_DEALS = []
