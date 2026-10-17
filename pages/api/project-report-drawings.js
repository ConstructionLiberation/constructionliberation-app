// DRAWINGS FOR THE PROJECT REPORT (1233) - kept PER PROJECT, so their mark-up carries on
// from week to week and is developed as the job goes on. Each report keeps a copy of
// them as they were when it was saved (report.drawingsSnapshot), so a report that has
// gone to the customer never changes.
//   report:drawings:<projectNo> -> [{ id, name, url, contentType, markup, addedBy, addedAt, updatedAt, updatedBy }]
//   GET ?projectNo=                                     -> { drawings }
//   POST { action: 'add', projectNo, drawing: { name, url, contentType } }
//   POST { action: 'markup', projectNo, id, markup }
//   POST { action: 'remove', projectNo, id }           (reports already saved keep their copy)
import withTenant from '../../lib/withTenant'
import { get, set } from '../../lib/db'
import { getSessionFromReq } from '../../lib/portalAuth'

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }
const KEY = (no) => `report:drawings:${String(no || '').trim()}`

async function handler(req, res) {
  const who = (getSessionFromReq(req) || {}).name || ''
  if (req.method === 'GET') {
    const no = String(req.query.projectNo || '')
    if (!no) return res.status(400).json({ error: 'Which project?' })
    return res.status(200).json({ drawings: (await get(KEY(no))) || [] })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}
  const no = String(b.projectNo || '')
  if (!no) return res.status(400).json({ error: 'Which project?' })
  const list = (await get(KEY(no))) || []
  const now = new Date().toISOString()
  if (b.action === 'add') {
    const d = b.drawing || {}
    if (!/^https:\/\//.test(String(d.url || ''))) return res.status(400).json({ error: 'No file' })
    const item = { id: `drw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: String(d.name || 'Drawing').slice(0, 200), url: String(d.url), contentType: String(d.contentType || ''), markup: [], addedBy: who, addedAt: now, updatedAt: now, updatedBy: who }
    await set(KEY(no), [...list, item])
    return res.status(200).json({ ok: true, drawing: item })
  }
  const i = list.findIndex(x => x.id === String(b.id || ''))
  if (i < 0) return res.status(404).json({ error: 'That drawing is no longer on the project.' })
  if (b.action === 'markup') {
    const next = [...list]; next[i] = { ...list[i], markup: b.markup && typeof b.markup === 'object' ? b.markup : [], updatedAt: now, updatedBy: who }
    await set(KEY(no), next)
    return res.status(200).json({ ok: true, drawing: next[i] })
  }
  if (b.action === 'remove') {
    await set(KEY(no), list.filter((_, j) => j !== i))
    return res.status(200).json({ ok: true })
  }
  return res.status(400).json({ error: 'Unknown action' })
}
export default withTenant(handler)
