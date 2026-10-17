// PROJECTS FOR PURCHASE ORDERS (1217) - ONE lookup for the portal and the Site App.
// A PO is always tied to the XERO project (the cost record): its id and its name come
// from Xero - the dashboard's saved list of Xero projects, less hidden ones - matched
// to the Site App's projects by job number (the same tolerant rule the IHM lookups
// use). The Site App still decides WHICH projects an operative sees (their access, live
// projects); one with no Xero match is shown but cannot have a PO.
import { get, getCachedProjects, getOpsProjects } from './db'
import { inqueryProjectOptions } from './inquery'
import { normJob } from './projectPeople'
import { userCanAccess } from './ramsNotify'

// THE PROJECTS - from the PERMANENT project register (projects:registry: every project Xero
// has ever returned, kept even when the dashboard's cache is empty), less hidden projects and
// the tracking options that are not projects - the same list In Query uses (one rule) -
// plus anything in the dashboard's cache that the register has not caught up with yet.
// (1228: this read ONLY the dashboard's cache, which expires after 4 hours and is wiped
// whenever figures change - locking contracted rates, for one - leaving NO projects at all
// until somebody opened Project Financials.)
export async function xeroPoProjects() {
  const [reg, cached, hidden] = await Promise.all([inqueryProjectOptions().catch(() => []), getCachedProjects().catch(() => null), get('config:hidden-projects').catch(() => null)])
  const hide = new Set((Array.isArray(hidden) ? hidden : []).map(String))
  const byId = new Map((reg || []).map(p => [String(p.xeroId), { projectId: String(p.xeroId), jobNo: String(p.jobNo || ''), name: String(p.name || '') }]))
  for (const p of (Array.isArray(cached) ? cached : [])) {
    if (!p || !p.xeroId || hide.has(String(p.xeroId))) continue
    const id = String(p.xeroId)
    byId.set(id, { projectId: id, jobNo: String(p.jobNo || (byId.get(id) || {}).jobNo || ''), name: String(p.name || p.projectName || (byId.get(id) || {}).name || '') })
  }
  return [...byId.values()].sort((a, b) => String(b.jobNo).localeCompare(String(a.jobNo), undefined, { numeric: true }))
}
export const xeroByJob = (list, jobNo) => { const k = normJob(jobNo); return k ? (list || []).find(p => normJob(p.jobNo) === k) || null : null }
// by job number; when that finds nothing (one side has no job number), by the project's
// NAME - ignoring case and punctuation (1219)
export const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export const xeroMatch = (list, jobNo, name) => xeroByJob(list, jobNo) || (normName(name) ? (list || []).find(p => normName(p.name) === normName(name)) || null : null)
export const xeroById = (list, id) => (list || []).find(p => p.projectId === String(id || '')) || null

// the operative's live projects in the Site App - each with its Xero project, or not in Xero
export async function sitePoProjects(user) {
  const [ops, xero] = await Promise.all([getOpsProjects(), xeroPoProjects()])
  // the name: Xero's; the IHM's if Xero has none
  return (ops || []).filter(p => (p.status || 'active') === 'active' && (!user || userCanAccess(user, p.projectNo))).map(p => {
    const x = xeroMatch(xero, p.projectNo, p.data && p.data.projectName)
    return { projectNo: p.projectNo, name: (x && x.name) || (p.data && p.data.projectName) || '', projectId: x ? x.projectId : null, xeroJobNo: x ? x.jobNo : '', inXero: !!x, _p: p }
  })
}
// live Site App projects with no Xero project - for the office to fix, or DISMISS (test
// projects, cancelled jobs, anything that will never need a PO) - 1219
export const GAPS_DISMISSED = 'po:gaps-dismissed'
export const gapKey = (p) => normJob(p.projectNo) || `name:${normName(p.name)}`
export async function projectGaps() {
  const dismissed = new Set(((await get(GAPS_DISMISSED).catch(() => null)) || []).map(String))
  return (await sitePoProjects(null)).filter(p => !p.inXero).map(p => ({ key: gapKey(p), projectNo: p.projectNo, name: p.name }))
    .map(g => ({ ...g, dismissed: dismissed.has(g.key) }))
}
