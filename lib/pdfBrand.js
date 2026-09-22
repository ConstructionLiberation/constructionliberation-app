import { currentTenant } from './tenantContext'
import { companyName, logoUrl } from './tenantSettings'

// THE BRAND ON A GENERATED DOCUMENT.
//
// Every PDF generator takes a logoUrl and draws whatever it is given. The
// generators were always tenant-agnostic; the CALLERS were not. Eight of them
// built the same string by hand:
//
//     logoUrl: `${origin}/rock-logo.jpg`
//
// So a customer's application, variation, issue report, handover and O&M
// manual all came out carrying Rock Roofing's logo - documents that go to
// THEIR customers, which is about the worst place for it.
//
// This is the one place that answers "whose logo, and what is the company
// called". Same rule as everywhere else: the tenant's own value, or nothing.

// pdf-lib fetches this URL over the network, so it has to be absolute. A
// tenant may store either form - Rock's record holds a full https URL, demo's
// holds /cl-logo.png - so both are handled rather than assumed.
export function pdfLogoUrl(req) {
  const raw = String(logoUrl() || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  const host = (req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || ''
  if (!host) return null
  const proto = (req && req.headers && req.headers['x-forwarded-proto']) || 'https'
  return `${proto}://${host}${raw.startsWith('/') ? '' : '/'}${raw}`
}

// The company block on an O&M manual cover: who the roofing contractor is.
// pages/api/design-oms.js held Rock's name, address, phone, email and website
// as a literal object. None of those are on the tenant record yet, so each
// falls back to blank rather than to Rock's - a missing address on a
// customer's manual is a gap; Rock's address on it is wrong.
export function pdfCompanyBlock() {
  const t = currentTenant() || {}
  return {
    name: companyName() || '',
    address: String(t.address || '').trim(),
    phone: String(t.phone || '').trim(),
    email: String(t.replyTo || '').trim(),
    web: String(t.website || '').trim(),
  }
}
