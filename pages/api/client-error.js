import { reportError } from '../../lib/errorReport'

// WHERE BROWSER ERRORS GO.
//
// DELIBERATELY NOT WRAPPED IN withTenant, and deliberately does almost nothing.
//
// This is the route that has to work when the rest of the app does not. If it
// resolved a customer, a page that broke BECAUSE the customer could not be
// resolved would fail to report the very thing worth hearing about. If it
// required a session, a page that broke during sign-in would be silent.
//
// So: no tenant, no session, no database. It reads the body and hands it
// straight to the reporter, which throttles and emails.
//
// The customer is taken from the ADDRESS rather than resolved, so the email
// still says which site it happened on without this route depending on the
// registry being reachable.
export default async function handler(req, res) {
  // Always 204, whatever happens. A page that has already broken must not then
  // have to handle a failure from the thing reporting it.
  const done = () => res.status(204).end()
  try {
    if (req.method !== 'POST') return done()
    const b = req.body || {}
    const message = String(b.message || 'Unknown client error').slice(0, 500)
    const where = String(b.url || req.headers.referer || 'unknown page').slice(0, 300)

    const err = new Error(message)
    err.stack = String(b.stack || '').slice(0, 2000)

    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    reportError({
      where: `[browser] ${where}`,
      error: err,
      req,
      tenantId: host || null,
    })
  } catch {
    // Never let reporting a failure cause one.
  }
  return done()
}
