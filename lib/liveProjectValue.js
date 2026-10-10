import { handler as dashboardHandler } from '../pages/api/dashboard'
import { get, set } from './db'

// AVERAGE VALUE OF LIVE PROJECTS (1045).
//
//   Live      status INPROGRESS - "In progress" on the Commercial page's
//             Project Financials - minus the shared hidden list, as that page
//             filters. Not Defects, not Closed.
//   Value     each project's AFA, exactly as the Commercial page shows it: read
//             through /api/dashboard's own code, not recalculated here.
//   Average   total AFA / number of live projects.
//
// AS AT MONTH END, AND RECORDED GOING FORWARD. Nothing stores what a project's
// AFA was, or whether it was live, on a past date - AFA comes from the last
// application sent, stamped overrides and the final account, and there is no
// status history. Rebuilding past months would be a second copy of those rules
// and a guess at which projects were live. So the figure is RECORDED: every
// day by the month-end-snapshots cron (and whenever the Business Scorecard is
// opened), overwriting that month's entry - so the entry left standing for a
// month is its last day's. Months before recording began stay blank.
//
// Stored at mgmt:snapshots:avg-live-afa = { 'YYYY-MM': { value, total, count, takenAt } }

const KEY = 'mgmt:snapshots:avg-live-afa'

export function averageAfaOfLive(projects, hiddenIds) {
  const hidden = new Set((hiddenIds || []).map(String))
  const live = (projects || []).filter(p => p && p.status === 'INPROGRESS' && !hidden.has(String(p.xeroId)))
  const total = live.reduce((s, p) => s + (Number(p.afa) || 0), 0)
  return { total, count: live.length, value: live.length ? total / live.length : null }
}

async function projectsFromDashboard() {
  let status = 200, body = null
  const res = { status(c) { status = c; return res }, json(d) { body = d; return res }, setHeader() { return res }, end() { return res } }
  await dashboardHandler({ method: 'GET', query: {} }, res)
  if (status >= 400 || !body || !Array.isArray(body.projects)) throw new Error(`Project Financials data unavailable${body?.error ? `: ${body.error}` : ` (${status})`}`)
  return body.projects
}

// Work out today's figure and store it as this month's entry.
export async function recordAvgLiveAfa(month) {
  const [projects, hiddenIds] = await Promise.all([projectsFromDashboard(), get('config:hidden-projects')])
  const r = averageAfaOfLive(projects, hiddenIds || [])
  const all = (await get(KEY)) || {}
  all[month] = { ...r, takenAt: new Date().toISOString() }
  await set(KEY, all)
  return all[month]
}

export async function readAvgLiveAfa() {
  return (await get(KEY)) || {}
}
