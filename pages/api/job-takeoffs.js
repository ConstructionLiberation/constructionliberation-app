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
import { draftPosFromTakeoff } from '../../lib/takeoffPos'

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
  // DRAFT POs, one per supplier, from the take-off's materials (1229). The take-off remembers
  // the drafts it made; making them again needs { again: true } (the page asks first).
  if (b.action === 'draft-pos') {
    const tk = await loadTakeoff(pid)
    if (!tk) return res.status(404).json({ error: 'Start the take-off first.' })
    if ((tk.draftPos || []).length && !b.again) return res.status(409).json({ error: 'Draft POs have already been made from this take-off.', already: tk.draftPos })
    const r = await draftPosFromTakeoff(tk, await loadPriceLib(), { by })
    if (!r.created.length) return res.status(400).json({ error: 'There is nothing to order on this take-off yet - choose products on the items, or allocate their own lines to a supplier.', ...r })
    const next = { ...tk, draftPos: [...(tk.draftPos || []), ...r.created.map(c => ({ poId: c.id, supplier: c.supplier, at: new Date().toISOString(), by }))] }
    await saveTakeoff(pid, next)
    return res.status(200).json({ ok: true, ...r, takeoff: next })
  }
  return res.status(400).json({ error: 'Unknown action' })
}
export default withTenant(handler)
