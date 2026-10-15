import withTenant from '../../lib/withTenant'
import { loadCompany } from '../../lib/companyDetails'

// THE COMPANY'S LOGO (1166) - served from its company details. Public, like the
// logo on its letterhead; the ?v= in the link changes when a new one is saved,
// so it can be cached.
async function handler(req, res) {
  const c = await loadCompany()
  const m = c && c.logo && String(c.logo).match(/^data:(image\/[a-z+]+);base64,(.*)$/)
  if (!m) return res.status(404).json({ error: 'No logo' })
  res.setHeader('Content-Type', m[1])
  res.setHeader('Cache-Control', 'public, max-age=86400')
  return res.status(200).send(Buffer.from(m[2], 'base64'))
}
export default withTenant(handler)
