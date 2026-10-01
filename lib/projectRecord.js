import { getProject, getAllProjectSettings, get } from './db'

// FIND THE PROJECT RECORD, WHICHEVER ID YOU HAVE.
//
// A project can be referred to by more than one id. The dashboard cache row
// carries both `xeroId` and `trackingOptionId`, and they are not always the
// same value; settings have also been keyed by job number historically. Pages
// pass whichever one they happen to hold, and getProject() answers for exactly
// that key - returning an EMPTY OBJECT, not an error, when it is the other one.
//
// That is how an Application for Payment PDF came out with no variations on
// it. The screen had resolved to the id with the record behind it; the
// Download PDF link still carried the id that did not. Every figure that comes
// off the APPLICATION was right, and everything that comes off the PROJECT -
// the variations, the customer name - was silently missing. A document that
// goes to a customer, understating the claim, with nothing on it to suggest
// anything was wrong.
//
// pages/api/project/[id].js already resolves across both ids when it reads the
// cache. This does the same for the SETTINGS record, in one place, so a route
// cannot be given a valid id and quietly find nothing.
export async function resolveProjectRecord(id) {
  const key = String(id || '')
  if (!key) return { project: {}, resolvedId: '' }

  const direct = await getProject(key)
  if (direct && Object.keys(direct).length) return { project: direct, resolvedId: key }

  // Nothing under that key. Find the project in the dashboard cache by EITHER
  // id, then try every other identifier it carries.
  let row = null
  try {
    const cache = await get('dashboard:cache')
    if (Array.isArray(cache)) {
      row = cache.find(p => String(p.xeroId) === key || String(p.trackingOptionId) === key) || null
    }
  } catch {}

  const candidates = []
  if (row) {
    if (row.xeroId) candidates.push(String(row.xeroId))
    if (row.trackingOptionId) candidates.push(String(row.trackingOptionId))
    if (row.jobNo) candidates.push(String(row.jobNo))
  }

  for (const c of candidates) {
    if (c === key) continue
    const found = await getProject(c)
    if (found && Object.keys(found).length) return { project: found, resolvedId: c }
  }

  // Last resort: the settings map itself. A record can exist for a project the
  // cache has forgotten - the same case pages/api/project/[id].js falls back to
  // projects:registry for.
  if (row && row.jobNo) {
    try {
      const all = await getAllProjectSettings()
      for (const [k, v] of Object.entries(all || {})) {
        if (v && String(v.jobNo || '') === String(row.jobNo) && Object.keys(v).length) {
          return { project: v, resolvedId: k }
        }
      }
    } catch {}
  }

  return { project: direct || {}, resolvedId: key }
}
