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
import { draftPosFromTakeoff, takeoffOrderGroups } from '../../lib/takeoffPos'
import { xeroContacts } from '../../lib/poData'

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
    // THE TAKE-OFF'S MATERIALS BUDGETS for the project page's Forecast to complete (1231):
    // per price-list supplier, per category of your own, and the own lines not allocated -
    // the same groups as the Materials tab and the draft-PO list (one calculation)
    if (req.query.budgets) {
      const tk = await loadTakeoff(String(req.query.budgets))
      if (!tk) return res.status(200).json({ takeoff: false })
      const r = await takeoffOrderGroups(tk, await loadPriceLib())
      return res.status(200).json({ takeoff: true, quoteRef: tk.quoteRef || '', revision: tk.revision || '', missing: (r.missing || []).length,
        groups: r.groups.map(g => ({ key: g.key, kind: g.kind, name: g.name, total: g.total, lines: g.lines.length })) })
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
  // THE POs IT COULD MAKE - to choose from first (1230), with the Xero contacts to pick a
  // supplier from (for a category, the lines not allocated, or a supplier not yet linked)
  if (b.action === 'draft-preview') {
    const tk = await loadTakeoff(pid)
    if (!tk) return res.status(404).json({ error: 'Start the take-off first.' })
    const r = await takeoffOrderGroups(tk, await loadPriceLib())
    return res.status(200).json({ ok: true, ...r, already: tk.draftPos || [], contacts: await xeroContacts() })
  }
  // MAKE THE CHOSEN DRAFT POs (1229, 1230) - only those ticked, each with its supplier. The
  // take-off remembers the drafts it made; making more needs { again: true } (the page asks).
  if (b.action === 'draft-pos') {
    const tk = await loadTakeoff(pid)
    if (!tk) return res.status(404).json({ error: 'Start the take-off first.' })
    const picks = Array.isArray(b.picks) ? b.picks.filter(p => p && p.key) : []
    if (!picks.length) return res.status(400).json({ error: 'Tick the POs to make.' })
    if ((tk.draftPos || []).length && !b.again) return res.status(409).json({ error: 'Draft POs have already been made from this take-off.', already: tk.draftPos })
    const r = await draftPosFromTakeoff(tk, await loadPriceLib(), { by, picks })
    if (!r.created.length) return res.status(400).json({ error: r.skipped.length ? `Nothing made: ${r.skipped.map(x => `${x.name || x.key} - ${x.reason}`).join('; ')}` : 'Nothing to make.', ...r })
    const next = { ...tk, draftPos: [...(tk.draftPos || []), ...r.created.map(c => ({ poId: c.id, supplier: c.supplier, group: c.group, at: new Date().toISOString(), by }))] }
    await saveTakeoff(pid, next)
    return res.status(200).json({ ok: true, ...r, takeoff: next })
  }
  return res.status(400).json({ error: 'Unknown action' })
}
export default withTenant(handler)
