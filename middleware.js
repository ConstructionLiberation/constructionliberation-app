import { NextResponse } from 'next/server'

const SESSION_COOKIE = 'rr_portal_session'

// Edge-safe HMAC verify of the session token (mirrors lib/portalAuth.js).
async function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    if (expected !== sig) return null
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
    if (!payload.exp || payload.exp < Date.now()) return null
    return payload
  } catch { return null }
}

// Operative Site App lives on siteapp.rockroofing.co.uk (formerly forms.).
export async function middleware(req) {
  const host = (req.headers.get('host') || '').toLowerCase()
  const isForms = host.startsWith('siteapp.') || host.startsWith('forms.')

  // ── The platform address serves the platform only ──
  //
  // Pointing a domain at this project makes it serve the WHOLE app. Without
  // this, admin.constructionliberation.com would render /crm, /wip and the rest
  // - the pages would draw their shell and then fail every API call, which
  // looks like a broken portal rather than a wrong address.
  //
  // The API is already locked down in lib/withTenant.js; this is so the SCREEN
  // matches. Anything else here goes to /platform.
  const platformHosts = String(process.env.PLATFORM_HOSTS || '')
    .split(',').map(h => h.trim().toLowerCase().split(':')[0]).filter(Boolean)
  if (platformHosts.length && platformHosts.includes(host.split(':')[0])) {
    const { pathname } = req.nextUrl
    const ok =
      pathname.startsWith('/platform') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/api/platform') ||
      pathname.startsWith('/api/portal-auth') ||
      pathname.startsWith('/_next') ||
      pathname.startsWith('/favicon')
    if (!ok) {
      const url = req.nextUrl.clone()
      url.pathname = '/platform'
      return NextResponse.redirect(url)
    }
  }

  // ── Site App subdomain routing (unchanged) ──
  if (isForms) {
    const url = req.nextUrl.clone()
    const { pathname } = url
    const passthrough =
      pathname.startsWith('/_next') ||
      pathname.startsWith('/favicon') ||
      // The manifest is now an API ROUTE, so it has no file extension and the
      // rule below cannot see it. Without this line the rewrite turns it into
      // the /forms PAGE, the phone asks for JSON and gets HTML, and the Site
      // App silently loses its name and icon on install.
      pathname === '/api/site-webmanifest' ||
      // See the note on the main list below. This one matters MORE: it is the
      // Site App, and site.webmanifest is what an operative's phone fetches when
      // they add it to their home screen.
      /\.(webmanifest|ico|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|txt|xml)$/i.test(pathname) ||
      pathname === '/rock-logo.jpg' ||
      // THE SITE APP NEEDS THE BRAND FEED TOO.
      // Without this the rewrite below turns /api/tenant-brand into the
      // /forms PAGE, the fetch gets HTML, r.json() throws, TenantProvider
      // swallows it and every operative sees a portal with no name and no
      // logo. The rule was already written down: a Site App route that is
      // not in this list does not exist.
      pathname === '/api/tenant-brand' ||
      pathname.startsWith('/api/forms') ||
      pathname.startsWith('/api/cron') ||
      pathname.startsWith('/api/submissions') ||
      pathname.startsWith('/api/ops-users') ||
      pathname.startsWith('/api/ops-docs') ||
      pathname.startsWith('/api/ops-projects') ||
      pathname.startsWith('/api/project-files') ||
      pathname.startsWith('/api/project-drawings') ||
      pathname.startsWith('/api/cm-project-financials') ||
      pathname.startsWith('/api/site-badges') ||
      pathname.startsWith('/api/rams-signatures') ||
      pathname.startsWith('/api/rams-approvals') ||
      pathname.startsWith('/api/rams-director') ||
      pathname.startsWith('/api/upload-file') ||
      pathname.startsWith('/api/team') ||
      pathname.startsWith('/api/upload-photo') ||
      pathname.startsWith('/api/dashboard') ||
      pathname.startsWith('/api/issues') ||
      pathname.startsWith('/api/issue-notify') ||
      pathname.startsWith('/api/issue-send-customer') ||
      pathname.startsWith('/api/issue-pdf') ||
      pathname.startsWith('/api/download') ||
      pathname.startsWith('/api/deliveries') ||
      pathname.startsWith('/api/operatives') ||
      pathname.startsWith('/api/planning') ||
      pathname.startsWith('/api/srats') ||
      pathname.startsWith('/api/tasks') ||
      pathname.startsWith('/api/forms-missing') ||
      pathname.startsWith('/api/variations') ||
      pathname.startsWith('/api/contracted-rates-view') ||
      pathname.startsWith('/api/applications-view') ||
      pathname.startsWith('/api/report-problem') ||
      pathname.startsWith('/api/blob-upload') ||
      pathname.startsWith('/api/pre-start')
    if (passthrough) return NextResponse.next()
    if (pathname === '/forms' || pathname.startsWith('/forms/')) return NextResponse.next()
    url.pathname = '/forms'
    return NextResponse.rewrite(url)
  }

  // ── Main portal: require login ──
  const { pathname } = req.nextUrl

  // Vercel Cron routes: these are called by Vercel's scheduler (no portal session), so
  // they must bypass the login check. They are protected instead by CRON_SECRET - Vercel
  // sends it as "Authorization: Bearer <CRON_SECRET>" on scheduled invocations. If a
  // CRON_SECRET is set we require it; if it isn't set we still let cron through (so the
  // jobs work) but they remain non-obvious internal endpoints.
  if (pathname.startsWith('/api/cron')) {
    // Vercel sets this header on its own scheduled invocations. Trust it so scheduled
    // crons always run, even if CRON_SECRET is mismatched/rotated.
    if (req.headers.get('x-vercel-cron')) return NextResponse.next()
    const secret = process.env.CRON_SECRET
    if (!secret) return NextResponse.next()
    const auth = req.headers.get('authorization') || ''
    if (auth === `Bearer ${secret}`) return NextResponse.next()
    // Allow a manual ?key=<secret> too, for testing from a browser.
    if (req.nextUrl.searchParams.get('key') === secret) return NextResponse.next()
    return new NextResponse(JSON.stringify({ error: 'Unauthorized cron' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  // Always allow: static, the login page & its API, Xero OAuth callback, logo.
  const isOpen =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    // STATIC FILES IN /public ARE NOT PRIVATE.
    //
    // The list covered /favicon and /rock-logo.jpg, one at a time, and missed
    // the rest. /site.webmanifest was being redirected to /login, so the browser
    // asked for JSON and got an HTML page - "Manifest: Line 1, column 1, Syntax
    // error" on every page load. apple-touch-icon.png too.
    //
    // By extension rather than by filename, so the next icon or font added to
    // /public does not need remembering. None of these can carry data.
    /\.(webmanifest|ico|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|txt|xml)$/i.test(pathname) ||
    // The manifest moved to an API route and so has no extension. The browser
    // asks for it BEFORE anyone logs in, including on the login page.
    pathname === '/api/site-webmanifest' ||
    pathname === '/rock-logo.jpg' ||
    pathname === '/login' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/go/') ||
    pathname === '/rams-approve' ||
    // The variation instruction page. The link in the email is
    // /instruct/<signed token> and it goes to a CUSTOMER - somebody with no
    // portal account at all. The token in the address is the authentication,
    // exactly as for the In Query and RAMS links below.
    //
    // This was never in this list. Anyone clicking that button without a portal
    // session was bounced to /login, where they could do nothing. It went
    // unnoticed because the people who click it in testing are always signed in
    // already.
    pathname.startsWith('/instruct/') ||
    // ...and the endpoint that page calls. Opening the page without this just
    // moves the failure one step later: the customer reaches the screen and
    // then every button on it is refused.
    pathname === '/api/variation-instruct' ||
    // The In Query review link goes to people with no portal account - somebody
    // added to the table by hand. The signed token in the address is the
    // authentication, and it scopes the response to that one email. Without these
    // two lines the link bounces to the login page and is useless to them.
    pathname === '/inquery-review' ||
    pathname === '/api/inquery-review' ||
    pathname === '/api/rams-token' ||
    pathname === '/api/rams-approvals' ||
    pathname === '/api/download' ||
    pathname === '/api/portal-auth' ||
    // Browser error reports. Open on purpose: a page that breaks during sign-in,
    // or because a session was rejected, must still be able to say so. Requiring
    // a session here would silence exactly the errors most worth hearing.
    // It writes nothing and returns 204 whatever happens.
    pathname === '/api/client-error' ||
    // WHO IS THIS PORTAL. Open on purpose, and it HAS to be: the login page
    // needs the company name and logo, and there is no session on the login
    // page. Without this line the fetch gets a 401, the provider falls back to
    // its generic defaults, and the heading renders "Portal Portal".
    //
    // Safe because the response is enumerated field by field and carries only
    // what is already public - name, logo, locale, currency, terms. No modules,
    // no hosts, no addresses. See pages/api/tenant-brand.js.
    pathname === '/api/tenant-brand' ||
    pathname.startsWith('/xero-callback') ||
    pathname.startsWith('/api/xero')
  if (isOpen) return NextResponse.next()

  const token = req.cookies.get(SESSION_COOKIE)?.value
  const session = await verifyToken(token, process.env.SESSION_SECRET || 'dev-insecure-secret-change-me')
  if (!session) {
    // API calls get a 401; page requests redirect to /login.
    if (pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // EXTERNAL USERS ARE DESIGN-ONLY, ON THE SERVER AS WELL AS THE SCREEN.
  //
  // A design customer's session carries role 'external'. Until now that was
  // enforced by client-side JavaScript alone - the nav hid everything else.
  // Nothing on the server said so, so a valid external session presented to
  // /api/commercial-metrics, /api/planning-costs or any of the other ~190
  // routes would have been accepted: signed cookie, right tenant, no role
  // check. Typing a URL was enough.
  //
  // These are people outside the company - a customer's design team. They are
  // the one class of user the portal hands a login to and does not employ.
  //
  // Allowed: the design pages, the design APIs, and signing in and out.
  // Everything else is 404 rather than 403, for the same reason as the platform
  // host above: a 403 confirms the route exists.
  if (session.role === 'external') {
    // '/' is deliberately NOT allowed. pages/index.js already redirects an
    // external user to /design, but only after the portal home has rendered -
    // so a customer saw the internal home page flash up first. Redirecting here
    // means they never receive it at all.
    const ok =
      pathname.startsWith('/design') ||
      pathname.startsWith('/api/design-') ||
      // The design pages read the project list from here. Allowed so the area
      // keeps working - but this endpoint does NOT scope its response to the
      // customer's own projects, and that is the next thing to fix. See
      // _DEPLOY_NOTES.
      pathname === '/api/planning' ||
      pathname === '/api/portal-auth' ||
      pathname === '/api/tenant-brand' ||
      pathname === '/api/blob-upload'
    if (!ok) {
      if (pathname.startsWith('/api/')) {
        return new NextResponse(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
      }
      const url = req.nextUrl.clone()
      url.pathname = '/design'
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
