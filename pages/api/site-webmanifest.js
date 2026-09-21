import withTenant from '../../lib/withTenant'
import { currentTenant } from '../../lib/tenantContext'
import { companyName, logoUrl } from '../../lib/tenantSettings'

// WHAT THE SITE APP IS CALLED ON AN OPERATIVE'S HOME SCREEN.
//
// public/site.webmanifest is ONE static file served to every tenant, and it
// says "Rock Roofing". So a customer's operative who adds the Site App to
// their phone gets a Rock Roofing icon with a Rock Roofing label - the same
// shape as the login page on 19 September and the nav logo before pkg955,
// except this one is fetched by the phone's OS rather than by React, so no
// component can fix it.
//
// This route replaces the static file. pages/_document.js points the
// manifest link here.
//
// ---------------------------------------------------------------------------
// UNAUTHENTICATED, LIKE /api/tenant-brand
// ---------------------------------------------------------------------------
// The browser requests the manifest on first paint, including on the login
// page, and it may do so without cookies. So this cannot require a session.
// It therefore returns NOTHING that is not already on public display: a name
// and an icon. Fields are written out one by one rather than spread, so a
// field added to the tenant record later cannot leak through here.
//
// ---------------------------------------------------------------------------
// WHY ICONS DO NOT COME FROM logoUrl
// ---------------------------------------------------------------------------
// A home-screen icon is not a nav logo. It is square, it is masked to a
// circle or a squircle on most phones, and it wants 192 and 512 versions.
// Rock's logoUrl is a 565px photo-style JPEG; its ACTUAL installed icon is
// the square ROCK mark in favicon-512.png, which is correct and should not
// change.
//
// So the icon comes from an OPTIONAL `iconUrl` on the tenant record, and
// falls back to the existing static files. A tenant that sets nothing keeps
// exactly what it has today.

function iconsFor(t) {
  const custom = String((t && t.iconUrl) || '').trim()
  if (custom) {
    // One entry. The phone scales it; declaring sizes it does not have would
    // be a lie the OS acts on.
    return [{ src: custom, sizes: 'any', purpose: 'any' }]
  }
  return [
    { src: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/favicon-512.png', sizes: '512x512', type: 'image/png' },
  ]
}

async function handler(req, res) {
  const t = currentTenant()
  const name = (t ? companyName() : '') || 'Portal'

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
  // Short, because a phone caches a manifest hard and a customer changing
  // their name should not have to reinstall to see it.
  res.setHeader('Cache-Control', 'public, max-age=300')

  return res.status(200).json({
    name,
    // What actually appears UNDER the icon, where there is room for about
    // twelve characters. The full name is the honest default; a tenant that
    // wants something shorter sets shortName on its record.
    short_name: String((t && t.shortName) || name).slice(0, 30),
    icons: iconsFor(t),
    theme_color: '#1a1a19',
    background_color: '#ffffff',
    display: 'standalone',
    start_url: '/',
  })
}

export default withTenant(handler)
