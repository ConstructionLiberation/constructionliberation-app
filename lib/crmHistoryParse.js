// CRM HISTORY PARSERS (1043) - pure: no database, no Node modules.
//
// Moved out of lib/crmValueChanges.js, which imports the database. 1041 had
// lib/precontractTotals.js import them from there, and precontractTotals is
// used by the pre-contract scorecard IN THE BROWSER - which pulled the
// database code, and its server-only async_hooks, into a browser bundle and
// failed the build. Anything a browser page imports must not reach lib/db.

// History text reads "Value: £100,000 -> £250,000". Newer entries also carry the numbers
// outright; this is the fallback that makes everything recorded before today usable.
export function parseMoneyPair(text) {
  const nums = String(text || '').match(/£\s*[\d,]+(?:\.\d+)?/g)
  if (!nums || nums.length < 2) return null
  const n = (s) => Number(String(s).replace(/[£,\s]/g, ''))
  const a = n(nums[0]), b = n(nums[1])
  if (isNaN(a) || isNaN(b)) return null
  return { old: a, next: b }
}

// "Stage: Received -> MC Secured"
export function parseStagePair(text) {
  const m = /Stage:\s*(.+?)\s*(?:->|\u2192)\s*(.+)$/.exec(String(text || ''))
  if (!m) return null
  return { from: m[1].trim(), to: m[2].trim() }
}

