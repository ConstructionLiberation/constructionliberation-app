import { getProject, saveProject, getClient } from './db'

// LOAD / SAVE A PROJECT RECORD BY ID (moved here from /api/contracted-rates in
// 1073 so the labour schedules use exactly the same rule).
//
// Negotiated projects (Pipedrive deals, id like "N:123") aren't in getProject,
// so their record lives in a dedicated key; live and negotiated projects share
// one code path.
export const isNegotiated = (id) => typeof id === 'string' && id.startsWith('N:')
async function getNegProject(id) {
  const r = await getClient()
  return (await r.get(`crates:negotiated:${id.slice(2)}`)) || {}
}
async function saveNegProject(id, project) {
  const r = await getClient()
  await r.set(`crates:negotiated:${id.slice(2)}`, project)
}
export const loadProject = async (id) => isNegotiated(id) ? (await getNegProject(id)) : ((await getProject(id)) || {})
export const persistProject = async (id, project) => isNegotiated(id) ? saveNegProject(id, project) : saveProject(id, project)
