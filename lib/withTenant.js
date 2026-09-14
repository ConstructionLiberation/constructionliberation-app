// WRAP EVERY API ROUTE IN THIS.
//
//     import withTenant from '../../lib/withTenant'
//     export default withTenant(async function handler(req, res) { ... })
//
// It works out which customer the request is for from the web address it came
// to, and puts that customer in request-scoped storage for the duration of the
// handler. getClient() reads it back from there, so nothing inside the handler
// changes and no helper needs a new argument.
//
// WHY A WRAPPER RATHER THAN PASSING THE REQUEST DOWN
// --------------------------------------------------
// getClient() is called from roughly 200 places, many inside helpers that never
// see the request - mergeCosts, readRegistry, loadRates. Passing it down means
// changing those signatures and everything that calls them. One line at the top
// of each route does not spread.
//
// It is also the safer failure. A route that was never wrapped resolves no
// customer, and once the global database credentials are removed it will find no
// credentials and error on first use. A missed route becomes a broken page
// rather than a page quietly serving the wrong company's data.
//
// WHILE THE REGISTRY IS NOT CONFIGURED this does nothing at all - it calls the
// handler straight through. So routes can be wrapped in batches, deployed, and
// verified while the app is still single-tenant and behaving exactly as it did.

import { runWithTenant } from './tenantContext'
import { tenantForHost, tenancyEnabled, isPlatformHost, PLATFORM_TENANT } from './tenants'
import { verifySessionToken, SESSION_COOKIE } from './portalAuth'

function readCookie(req, name) {
  const raw = (req.headers && req.headers.cookie) || ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

function sessionBelongsTo(req, tenantId) {
  const raw = readCookie(req, SESSION_COOKIE)
  if (!raw) return false
  return !!verifySessionToken(raw, tenantId)
}

export default function withTenant(handler) {
  return async function wrapped(req, res) {
    // Dormant until TENANCY_ENABLED is set to 1. Having the control database
    // credentials is NOT enough - see the note in lib/tenants.js.
    if (!tenancyEnabled()) return handler(req, res)

    const host = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || ''

    // The platform address belongs to no customer. It must not 404, and a
    // session issued there must not work anywhere else - which is why it carries
    // a reserved id rather than nothing.
    if (isPlatformHost(host)) {
      // THE PLATFORM ADDRESS SERVES THE PLATFORM AND NOTHING ELSE.
      //
      // Pointing a domain at this project makes it serve the WHOLE app, so
      // without this admin.constructionliberation.com would also answer /crm,
      // /wip and every other route - and, having no customer database of its
      // own, would fall back to reading Rock's. One address quietly serving
      // another company's portal is exactly what this whole exercise is for.
      //
      // So only two things are reachable here: signing in, and the platform
      // itself. Everything else is 404, not 403 - a 403 confirms the route
      // exists.
      const url = String(req.url || '')
      const allowed = url.startsWith('/api/portal-auth') || url.startsWith('/api/platform')
      if (!allowed) return res.status(404).json({ error: 'Not found' })

      // No session check here. Sign-in has to work BEFORE a session exists, and
      // the earlier version demanded a platform session in order to reach the
      // login route - a door locked from the inside. Authorisation is done by
      // requireRole and the PLATFORM_ADMINS check inside the platform route.
      return runWithTenant({ id: PLATFORM_TENANT, name: 'Platform', platform: true }, () => handler(req, res))
    }

    let tenant = null
    try {
      tenant = await tenantForHost(host)
    } catch (e) {
      // The registry could not be read AND nothing was cached. Fail the request
      // rather than guess. Guessing is how one customer sees another's data.
      console.error('Tenant resolution failed for host', host, e && e.message)
      return res.status(503).json({ error: 'Service temporarily unavailable' })
    }

    if (!tenant) {
      // An address nobody owns. Say so plainly. Do NOT fall back to a default
      // customer - a default is exactly the silent wrong-data failure this whole
      // design exists to prevent.
      console.error('No tenant for host', host)
      return res.status(404).json({ error: 'Unknown address' })
    }

    // AUTHENTICATION IS TENANT-SCOPED TOO, not just data access.
    //
    // Without this, a valid cookie from one customer's site verifies on
    // another's - same secret, same signature - and everything downstream
    // behaves perfectly while serving the wrong company's data to the wrong
    // company's user. One place, covering every wrapped route.
    //
    // Only enforced where a session is actually present. Routes with no session
    // at all - the signed public links, the login page - are handled by their
    // own checks.
    // ROUTES AUTHENTICATED BY A TOKEN, NOT A SESSION.
    //
    // A variation instruction link, a RAMS approval, an In Query review - these
    // go to people with no portal account at all. The signed token in the
    // address IS the authentication, and middleware already lets them past the
    // login.
    //
    // Refusing them because the visitor happens to be carrying some other
    // session is wrong twice over: it asks a CUSTOMER to sign in to a portal
    // they have no account for, and it blocks the one thing the link exists to
    // do. Found by clicking an instruction link while signed in.
    //
    // The token carries its own customer and is checked against the resolved one
    // inside each handler, so a stale cookie is simply irrelevant here. Ignore
    // it rather than fail on it.
    const url = String(req.url || '').split('?')[0]
    const tokenAuthed =
      url.startsWith('/api/variation-instruct') ||
      url.startsWith('/api/inquery-review') ||
      url.startsWith('/api/rams-token') ||
      url.startsWith('/api/rams-approvals') ||
      url.startsWith('/api/download') ||
      url.startsWith('/go/') ||
      // The page itself, not only its API - a customer arriving here carries
      // whatever cookies they happen to have and must not be judged on them.
      url.startsWith('/instruct/')

    const raw = readCookie(req, SESSION_COOKIE)
    if (raw && !tokenAuthed && !sessionBelongsTo(req, tenant.id)) {
      // CLEAR THE COOKIE, do not just refuse.
      //
      // Refusing alone was a trap. This check runs on EVERY wrapped route -
      // including /api/portal-auth. So a stale cookie blocked the very request
      // needed to replace it: sign in, get refused, still holding the same
      // cookie, refused again. The only way out was clearing cookies by hand or
      // an incognito window, which is not something to ask eight people to work
      // out on a Monday morning.
      //
      // Expiring it means the browser drops it and the retry succeeds. One
      // refusal, then a normal login.
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`)
      return res.status(401).json({ error: 'Please sign in again.' })
    }

    return runWithTenant(tenant, () => handler(req, res))
  }
}
