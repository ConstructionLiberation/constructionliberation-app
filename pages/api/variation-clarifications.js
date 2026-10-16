// THE COMPANY'S VARIATION CLARIFICATIONS (1197) - read by anyone signed in (the
// Variation Builder, contracted rates, Estimating); saved by admins (Admin >
// Quote Documents).
import withTenant from '../../lib/withTenant'
import { getSessionFromReq, requireRole } from '../../lib/portalAuth'
import { loadVariationClarifications, saveVariationClarifications } from '../../lib/variationClarifications'

async function handler(req, res) {
  if (req.method === 'GET') {
    if (!getSessionFromReq(req)) return res.status(401).json({ error: 'Not signed in' })
    return res.status(200).json({ clarifications: await loadVariationClarifications() })
  }
  if (req.method === 'POST') {
    if (!requireRole(req, res, ['admin'])) return
    const list = (req.body || {}).clarifications
    if (!Array.isArray(list)) return res.status(400).json({ error: 'clarifications must be a list' })
    return res.status(200).json({ ok: true, clarifications: await saveVariationClarifications(list) })
  }
  return res.status(405).json({ error: 'Method not allowed' })
}
export default withTenant(handler)
