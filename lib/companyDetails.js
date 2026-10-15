// COMPANY DETAILS (1166) - the company's own name, address, contact details and
// logo, kept in ITS OWN database and edited in Admin > Company details. They take
// priority everywhere the company is named or shown: the pages (through the
// tenant-brand feed), and the server's companyName() / logoUrl() (loaded once at
// the start of each request - see withTenant). The platform registry's name and
// logo are the fallback until a company fills these in.
import { get } from './db'
import { currentTenantId } from './tenantContext'

export const COMPANY_KEY = 'company:details'
import { COMPANY_FIELDS } from './companyFields'
export { COMPANY_FIELDS }
const MAX_LOGO = 600 * 1024   // the logo is resized in the browser; this is a backstop

const cache = new Map()
export async function loadCompany() {
  const id = currentTenantId() || '_'
  const c = cache.get(id)
  if (c && Date.now() - c.at < 30000) return c.v
  let v = null
  try { v = (await get(COMPANY_KEY)) || null } catch { v = null }
  cache.set(id, { at: Date.now(), v })
  return v
}
export function forgetCompany() { cache.delete(currentTenantId() || '_') }

export function cleanCompany(b, prev) {
  const out = {}
  for (const [k] of COMPANY_FIELDS) out[k] = String((b && b[k]) ?? '').slice(0, k === 'address' ? 600 : 200).trim()
  const logo = b && b.logo
  if (logo === null) { out.logo = ''; out.logoVersion = Date.now() }
  else if (typeof logo === 'string' && logo && logo !== (prev && prev.logo)) {
    if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(logo)) throw new Error('The logo must be a PNG, JPG, WEBP or SVG image')
    if (logo.length > MAX_LOGO * 1.4) throw new Error('The logo is too large - use a smaller image')
    out.logo = logo; out.logoVersion = Date.now()
  } else { out.logo = (prev && prev.logo) || ''; out.logoVersion = (prev && prev.logoVersion) || 0 }
  return out
}
// The address and contact lines - public letterhead details
export const publicCompany = (c) => c ? { address: c.address || '', phone: c.phone || '', email: c.email || '', website: c.website || '', companyNumber: c.companyNumber || '', vatNumber: c.vatNumber || '' } : { address: '', phone: '', email: '', website: '', companyNumber: '', vatNumber: '' }
export const companyLogoPath = (c) => (c && c.logo) ? `/api/company-logo?v=${c.logoVersion || 1}` : ''
