import withTenant from '../../lib/withTenant'
import { currentTenant } from '../../lib/tenantContext'

// THE BROWSER TAB ICON. NOT THE SAME THING AS THE MANIFEST.
//
// pkg981 made the WEB APP MANIFEST per tenant, which is what a phone reads
// when someone adds the Site App to their home screen. It did not touch the
// four hardcoded links in pages/_document.js:
//
//   /favicon.ico   /favicon-32x32.png   /favicon-16x16.png   /apple-touch-icon.png
//
// Those are the tab icon, and they are Rock's, on every page of every
// tenant. Two icons, two mechanisms, and fixing one looked like fixing both.
//
// _document.js is server-rendered with no hook available, so the link points
// here and this route redirects to whatever the tenant should have. A
// redirect rather than piping the bytes: the file is then served by the CDN
// as a static asset, exactly as it is today.
//
// Rock has no iconUrl, so it redirects to /favicon.ico and nothing changes.

async function handler(req, res) {
  const t = currentTenant()
  const custom = String((t && t.iconUrl) || '').trim()
  const target = custom || '/favicon.ico'

  // Five minutes. Long enough that this is not hit on every page view, short
  // enough that changing iconUrl on a record shows up without a hard reload.
  res.setHeader('Cache-Control', 'public, max-age=300')
  // 302, not 301. A permanent redirect is cached by the browser effectively
  // for ever, and a tenant that later sets an icon would never see it.
  res.redirect(302, target)
}

export default withTenant(handler)
