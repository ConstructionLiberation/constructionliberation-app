import withTenant from '../../../lib/withTenant'
import { requireRole } from '../../../lib/portalAuth'
import { get, set } from '../../../lib/db'
import { COMPANY_KEY, cleanCompany, forgetCompany } from '../../../lib/companyDetails'

// ADMIN > COMPANY DETAILS (1166) - admins read and save the company's name,
// address, contact details and logo.
async function handler(req, res) {
  if (!requireRole(req, res, ['admin'])) return
  const cur = (await get(COMPANY_KEY)) || {}
  if (req.method === 'GET') return res.status(200).json({ company: cur })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  let next
  try { next = cleanCompany(req.body || {}, cur) } catch (e) { return res.status(400).json({ error: e.message }) }
  await set(COMPANY_KEY, next)
  forgetCompany()
  return res.status(200).json({ ok: true, company: next })
}
export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }
export default withTenant(handler)
