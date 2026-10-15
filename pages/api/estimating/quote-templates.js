import { requireArea } from '../../../lib/portalAuth'
import withTenant from '../../../lib/withTenant'
import { get, set } from '../../../lib/db'
import { normRole } from '../../../lib/roles'
import { emptyTemplates, checkTemplates, cleanClarList } from '../../../lib/quoteDocs'

// QUOTE DOCUMENTS (1092) - the company's letter template, standard
// clarifications library and Terms & Conditions.
// GET  (Estimating area or admin) -> { templates, canEdit }
// POST (ADMINS ONLY)  { action: 'save', letter, library }
//                     { action: 'terms', text }   - saves a NEW version; old ones kept
const KEY = 'quote:templates'

async function handler(req, res) {
  const session = requireArea(req, res, ['estimating', 'admin'])
  if (!session) return
  const isAdmin = normRole(session.role) === 'admin'
  const by = session.name || session.email || ''
  const cur = (await get(KEY)) || emptyTemplates()
  if (req.method === 'GET') return res.status(200).json({ templates: cur, canEdit: isAdmin })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!isAdmin) return res.status(403).json({ error: 'Only an admin can change the quote documents.' })
  const b = req.body || {}
  if (b.action === 'save') {
    const next = { ...cur, letter: { body: String(b.letter?.body ?? cur.letter.body ?? ''), updatedAt: new Date().toISOString(), updatedBy: by }, library: b.library || cur.library }
    // the pricing checklist (1142)
    if (Array.isArray(b.clarTemplate)) next.clarTemplate = cleanClarList(b.clarTemplate)   // the clarifications template (1165)
    if (Array.isArray(b.checklist)) next.checklist = b.checklist.map(x => ({ id: String(x.id), text: String(x.text || '').slice(0, 500) })).filter(x => x.text.trim())
    const errors = checkTemplates(next)
    if (errors.length) return res.status(400).json({ error: errors.join('; ') })
    for (const k of Object.keys(next.library)) next.library[k] = next.library[k].map(x => ({ id: String(x.id), text: String(x.text || '').slice(0, 2000) })).filter(x => x.text.trim())
    await set(KEY, next)
    return res.status(200).json({ ok: true, templates: next })
  }
  if (b.action === 'terms') {
    const text = String(b.text || '')
    if (!text.trim()) return res.status(400).json({ error: 'The Terms & Conditions are empty' })
    const versions = cur.terms?.versions || []
    const last = versions.slice(-1)[0]
    if (last && last.text === text) return res.status(200).json({ ok: true, templates: cur, unchanged: true })
    const next = { ...cur, terms: { versions: [...versions, { v: (last?.v || 0) + 1, text: text.slice(0, 200000), at: new Date().toISOString(), by }] } }
    await set(KEY, next)
    return res.status(200).json({ ok: true, templates: next })
  }
  return res.status(400).json({ error: "action must be 'save' or 'terms'" })
}

export default withTenant(handler)
