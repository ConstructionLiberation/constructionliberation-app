// COSTS REMAINING ON A PROJECT (1222) - entered by the CM on the project page: what is
// still to be spent that is not yet in Xero or on a purchase order, as lines (labour,
// materials, plant, other). The forecast cost is costs to date + committed (open POs)
// + these; the forecast margin is measured against the anticipated final account.
//   forecast:remaining:<xero project id> -> { lines: [{ id, description, category, amount }], updatedBy, updatedAt }
//   GET                    -> { lines, updatedBy, updatedAt }
//   POST { lines }         -> saves the whole list
import withTenant from '../../../../lib/withTenant'
import { get, set } from '../../../../lib/db'
import { requireRole } from '../../../../lib/portalAuth'

export const FORECAST_CATEGORIES = ['labour', 'materials', 'plant', 'other']
const KEY = (id) => `forecast:remaining:${id}`

async function handler(req, res) {
  const session = requireRole(req, res, ['post-contract', 'management', 'admin'])
  if (!session) return
  const id = String(req.query.id || '')
  if (!id) return res.status(400).json({ error: 'Which project?' })
  if (req.method === 'GET') {
    const r = (await get(KEY(id))) || {}
    return res.status(200).json({ lines: Array.isArray(r.lines) ? r.lines : [], updatedBy: r.updatedBy || '', updatedAt: r.updatedAt || null })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const raw = Array.isArray(req.body && req.body.lines) ? req.body.lines : null
  if (!raw) return res.status(400).json({ error: 'No lines sent' })
  const lines = raw.slice(0, 200).map((l, i) => ({
    id: String((l && l.id) || `l${Date.now().toString(36)}${i}`).slice(0, 40),
    description: String((l && l.description) || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    category: FORECAST_CATEGORIES.includes(l && l.category) ? l.category : 'other',
    amount: Math.round((Number(l && l.amount) || 0) * 100) / 100,
  })).filter(l => l.description || l.amount)   // a blank line is dropped
  const rec = { lines, updatedBy: session.name || session.email || '', updatedAt: new Date().toISOString() }
  await set(KEY(id), rec)
  return res.status(200).json({ ok: true, ...rec })
}
export default withTenant(handler)
