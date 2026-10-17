// MATERIALS TAKE-OFFS for jobs (1226) - Commercial. See lib/jobTakeoff.js.
//   GET ?projects=1         -> { projects: [{ projectId, jobNo, name, fromEstimate, hasTakeoff }] }
//   GET ?projectId=         -> { takeoff, fromEstimate, lib }   (lib: the price library the
//                              Build-up editor and Materials tab price with)
//   POST { action: 'start', projectId }        -> a copy of the estimate's issued revision
//   POST { action: 'save', projectId, takeoff } -> its rows, waste, allocations, material rates
import withTenant from '../../lib/withTenant'
import { requireArea } from '../../lib/portalAuth'
import { getProject } from '../../lib/db'
import { loadProject } from '../../lib/projectStore'
import { xeroPoProjects } from '../../lib/poProjects'
import { loadPriceLib } from '../../lib/estimateToRates'
import { loadTakeoff, saveTakeoff, startTakeoff, cleanSave } from '../../lib/jobTakeoff'

async function handler(req, res) {
  const session = requireArea(req, res, 'commercial')
  if (!session) return
  const by = session.name || session.email || ''
  if (req.method === 'GET') {
    if (req.query.projects) {
      const out = []
      for (const p of await xeroPoProjects()) {
        const s = (await getProject(p.projectId).catch(() => null)) || {}
        const fe = (s.contractedRates && s.contractedRates.fromEstimate) || null
        out.push({ projectId: p.projectId, jobNo: p.jobNo, name: p.name, fromEstimate: fe, hasTakeoff: !!(await loadTakeoff(p.projectId)) })
      }
      return res.status(200).json({ projects: out })
    }
    const pid = String(req.query.projectId || '')
    if (!pid) return res.status(400).json({ error: 'Which project?' })
    const proj = await loadProject(pid)
    return res.status(200).json({ takeoff: await loadTakeoff(pid), fromEstimate: (proj && proj.contractedRates && proj.contractedRates.fromEstimate) || null, lib: await loadPriceLib() })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}
  const pid = String(b.projectId || '')
  if (!pid) return res.status(400).json({ error: 'Which project?' })
  if (b.action === 'start') {
    if (await loadTakeoff(pid)) return res.status(409).json({ error: 'This project already has a materials take-off.' })
    const proj = await loadProject(pid)
    const r = await startTakeoff(pid, proj && proj.contractedRates && proj.contractedRates.fromEstimate, by)
    if (r.error) return res.status(400).json({ error: r.error })
    return res.status(200).json({ ok: true, takeoff: r.takeoff })
  }
  if (b.action === 'save') {
    const prev = await loadTakeoff(pid)
    if (!prev) return res.status(404).json({ error: 'Start the take-off first.' })
    const next = { ...cleanSave(prev, b.takeoff || {}), savedAt: new Date().toISOString(), savedBy: by }
    await saveTakeoff(pid, next)
    return res.status(200).json({ ok: true, takeoff: next })
  }
  return res.status(400).json({ error: 'Unknown action' })
}
export default withTenant(handler)
