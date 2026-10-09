import { requireArea } from '../../../lib/portalAuth'
import { get, set } from '../../../lib/db'
import withTenant from '../../../lib/withTenant'
import { DOCS, cleanDocData, cleanRowFields } from '../../../lib/mgmtDocs'

// /api/management/<doc>   - see lib/mgmtDocs.js for the documents.
//
// GET                                   -> doc:  { data, updatedAt }
//                                          rows: { rows }
// POST doc:  { data, baseUpdatedAt }    -> saves whole; 409 if someone saved since
// POST rows: { op:'upsert', row:{ id?, ...fields } }
//            { op:'delete', id }
//
// Management area only. Every refusal carries a message the page shows.

const newId = () => `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

async function handler(req, res) {
  const session = requireArea(req, res, 'management')
  if (!session) return
  const def = DOCS[req.query.doc]
  if (!def) return res.status(404).json({ error: `Unknown management document: ${req.query.doc}` })
  const who = session.name || session.email || ''

  if (req.method === 'GET') {
    const stored = await get(def.key)
    if (def.kind === 'doc') {
      const { out } = cleanDocData(def, stored?.data)
      return res.status(200).json({ data: out, updatedAt: stored?.updatedAt || null, updatedBy: stored?.updatedBy || '' })
    }
    return res.status(200).json({ rows: Array.isArray(stored) ? stored : [] })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const body = req.body || {}

  if (def.kind === 'doc') {
    const { out, unknown } = cleanDocData(def, body.data)
    if (unknown.length) return res.status(400).json({ error: `Unknown field(s): ${unknown.join(', ')}` })
    const stored = await get(def.key)
    const current = stored?.updatedAt || null
    if ((body.baseUpdatedAt || null) !== current) {
      return res.status(409).json({
        error: `${stored?.updatedBy || 'Someone'} saved this since you opened it. Reload to see their changes - your text is still in the box.`,
      })
    }
    const next = { data: out, updatedAt: Date.now(), updatedBy: who }
    await set(def.key, next)
    return res.status(200).json(next)
  }

  // rows
  const rows = (await get(def.key)) || []
  if (body.op === 'delete') {
    if (!rows.some(r => r.id === body.id)) return res.status(404).json({ error: 'That row no longer exists. Reload.' })
    const next = rows.filter(r => r.id !== body.id)
    await set(def.key, next)
    return res.status(200).json({ rows: next })
  }
  if (body.op === 'upsert') {
    const { id, createdAt, updatedAt, updatedBy, ...fields } = body.row || {}
    const { out, unknown } = cleanRowFields(def, fields)
    if (unknown.length) return res.status(400).json({ error: `Unknown field(s): ${unknown.join(', ')}` })
    const now = Date.now()
    let next, row
    if (id) {
      const at = rows.findIndex(r => r.id === id)
      if (at < 0) return res.status(404).json({ error: 'That row was deleted by someone else. Reload.' })
      row = { ...rows[at], ...out, updatedAt: now, updatedBy: who }
      next = rows.map((r, i) => i === at ? row : r)
    } else {
      row = { id: newId(), ...out, createdAt: now, updatedAt: now, updatedBy: who }
      next = [...rows, row]
    }
    await set(def.key, next)
    return res.status(200).json({ row, rows: next })
  }
  return res.status(400).json({ error: "op must be 'upsert' or 'delete'" })
}

export default withTenant(handler)
