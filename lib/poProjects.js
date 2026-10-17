// PROJECTS FOR PURCHASE ORDERS (1217) - ONE lookup for the portal and the Site App.
// A PO is always tied to the XERO project (the cost record): its id and its name come
// from Xero - the dashboard's saved list of Xero projects, less hidden ones - matched
// to the Site App's projects by job number (the same tolerant rule the IHM lookups
// use). The Site App still decides WHICH projects an operative sees (their access, live
// projects); one with no Xero match is shown but cannot have a PO.
import { get, getCachedProjects, getOpsProjects } from './db'
import { normJob } from './projectPeople'
import { userCanAccess } from './ramsNotify'

export async function xeroPoProjects() {
  const [cached, hidden] = await Promise.all([getCachedProjects().catch(() => null), get('config:hidden-projects').catch(() => null)])
  const hide = new Set((Array.isArray(hidden) ? hidden : []).map(String))
  return ((Array.isArray(cached) ? cached : []).filter(p => p && p.xeroId && !hide.has(String(p.xeroId))))
    .map(p => ({ projectId: String(p.xeroId), jobNo: String(p.jobNo || ''), name: String(p.name || p.projectName || '') }))
    .sort((a, b) => String(b.jobNo).localeCompare(String(a.jobNo), undefined, { numeric: true }))
}
export const xeroByJob = (list, jobNo) => { const k = normJob(jobNo); return k ? (list || []).find(p => normJob(p.jobNo) === k) || null : null }
export const xeroById = (list, id) => (list || []).find(p => p.projectId === String(id || '')) || null

// the operative's live projects in the Site App - each with its Xero project, or not in Xero
export async function sitePoProjects(user) {
  const [ops, xero] = await Promise.all([getOpsProjects(), xeroPoProjects()])
  // the name: Xero's; the IHM's if Xero has none
  return (ops || []).filter(p => (p.status || 'active') === 'active' && (!user || userCanAccess(user, p.projectNo))).map(p => {
    const x = xeroByJob(xero, p.projectNo)
    return { projectNo: p.projectNo, name: (x && x.name) || (p.data && p.data.projectName) || '', projectId: x ? x.projectId : null, xeroJobNo: x ? x.jobNo : '', inXero: !!x, _p: p }
  })
}
// live Site App projects with no Xero project of the same job number - for the office to fix
export async function projectGaps() {
  return (await sitePoProjects(null)).filter(p => !p.inXero).map(p => ({ projectNo: p.projectNo, name: p.name }))
}
