import withTenant from '../../lib/withTenant'
import { currentTenant } from '../../lib/tenantContext'
import { companyName, logoUrl } from '../../lib/tenantSettings'
import { localePayload } from '../../lib/locale'

// WHO IS THIS PORTAL, AND HOW DOES IT WRITE THINGS DOWN.
//
// The one feed that carries a customer's identity to the browser. Everything
// the client needs to stop saying "Rock Roofing" and stop printing pound
// signs comes from here.
//
// ─────────────────────────────────────────────────────────────────────────
// WHY IT IS UNAUTHENTICATED, AND WHAT THAT COSTS
// ─────────────────────────────────────────────────────────────────────────
// The login page needs the company name and the logo, and there is no session
// on the login page. So this cannot require one.
//
// Which means the response must contain NOTHING that is not already on public
// display. A name and a logo are on the customer's letterhead. Their module
// list, their other hostnames, their sending addresses and their user count
// are not, and none of them are returned here - the fields are listed
// explicitly below rather than spread from the tenant record, so a field
// added to that record later cannot leak by accident. That is the whole
// reason this is written out longhand instead of { ...tenant }.
//
// /api/admin/tenant-setup has a GET that returns every tenant's id, name,
// hosts and modules behind nothing but an admin role. That is already on the
// outstanding list. Do not repeat it here.
//
// ─────────────────────────────────────────────────────────────────────────
// WHY ONE FEED AND NOT TWO
// ─────────────────────────────────────────────────────────────────────────
// Branding (115 client-side "Rock Roofing" strings) and locale (128
// client-side pound signs) are the same problem wearing two hats: a value
// that lives on the tenant record and has to reach a component that cannot
// read AsyncLocalStorage. Two feeds would be two caches, two loading states
// and two chances to disagree. See components/TenantProvider.js.

async function handler(req, res) {
  const t = currentTenant()

  // A hostname no tenant claims gets the generic answer rather than an error.
  // withTenant will already have refused anything that touches the database;
  // this is only reached when the host resolves. Kept defensive because the
  // login page calls it and a broken login page is worse than a plain one.
  if (!t) {
    return res.status(200).json({
      // Empty rather than a placeholder word - see components/TenantProvider.js.
      name: '',
      logoUrl: '',
      localeKey: 'UK',
      localeCode: 'en-GB',
      currency: 'GBP',
      currencySymbol: '\u00A3',
      terms: {},
      resolved: false,
    })
  }

  let payload
  try {
    payload = localePayload()
  } catch (e) {
    // Reported, not swallowed. A locale that cannot be resolved should say so
    // rather than silently rendering in British English and leaving someone
    // to wonder why the dates look wrong.
    return res.status(500).json({ error: 'Could not resolve locale: ' + e.message })
  }

  // Cached briefly. Branding changes rarely; this is called on every page load
  // including the login page, and it must not become a request per render.
  res.setHeader('Cache-Control', 'private, max-age=60')

  return res.status(200).json({
    name: companyName(),
    // Empty until logoUrl is wired up and a logo is uploaded per tenant.
    // The client falls back to the name, so an empty logo is a plain portal
    // rather than a broken image.
    logoUrl: logoUrl() || '',
    localeKey: payload.localeKey,
    localeCode: payload.localeCode,
    currency: payload.currency,
    currencySymbol: payload.currencySymbol,
    terms: payload.terms,
    resolved: true,
  })
}

export default withTenant(handler)
