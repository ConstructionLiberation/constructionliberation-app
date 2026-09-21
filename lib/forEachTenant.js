import { runWithTenant } from './tenantContext'
import { allTenants, tenancyEnabled } from './tenants'
import { getClient } from './db'
import { reportError } from './errorReport'

// RUN A CRON ONCE PER CUSTOMER.
//
//     import forEachTenant from '../../../lib/forEachTenant'
//     export default forEachTenant('wip-sync', handler)
//
// WHY CRONS CANNOT USE withTenant
// -------------------------------
// withTenant works out the customer from the web address the request came to.
// A cron has no meaningful address - Vercel calls it on the deployment URL.
// Wrapping a cron would therefore bind it to whichever host it happened to be
// called on, which in practice means every cron runs as the first customer,
// forever, and never runs for anyone else. Silently. The sync would simply stop
// for everybody except one company and nothing would say so.
//
// So a cron loops instead.
//
// EACH ITERATION IS ISOLATED
// --------------------------
// One customer's expired Xero token must not stop the job for everyone else.
// Every iteration is caught separately, its result recorded, and the loop
// continues. The response reports per-customer success or failure so a partial
// run is visible rather than looking like a whole one.
//
// THE RESPONSE PROBLEM
// --------------------
// Each handler calls res.json() itself. Called in a loop it would try to send
// the response once per customer, and every call after the first throws
// "headers already sent". So each iteration gets its own CAPTURING response
// that records what the handler tried to send, and one combined response is
// sent at the end.
//
// HEARTBEATS
// ----------
// Every run records cron:last:<name> in that customer's own database: when it
// started, how long it took, whether it worked, and the error if not. Nothing
// reads these yet - the monitoring page comes later - but a job that has never
// recorded anything is the only way to spot one that has silently stopped, and
// the recording has to start before it is useful.

// A response object that captures instead of sending.
function captureRes() {
  const cap = { statusCode: 200, body: undefined, headers: {} }
  const api = {
    status(code) { cap.statusCode = code; return api },
    json(obj) { cap.body = obj; return api },
    send(obj) { cap.body = obj; return api },
    end(obj) { if (obj !== undefined) cap.body = obj; return api },
    setHeader(k, v) { cap.headers[k] = v; return api },
    getHeader(k) { return cap.headers[k] },
    removeHeader(k) { delete cap.headers[k]; return api },
    write() { return true },
    on() { return api }, once() { return api }, emit() { return api },
    removeListener() { return api },
  }
  Object.defineProperty(api, 'statusCode', {
    get: () => cap.statusCode,
    set: (v) => { cap.statusCode = v },
  })
  return { api, cap }
}

// A 200 RESPONSE IS NOT PROOF THE JOB DID ANYTHING.
//
// A handler can return 200 with { ok: false, error: 'Not configured...' } the
// moment it finds no credentials for the integration it needs. It completes in
// ONE MILLISECOND and the heartbeat records it as healthy. Two jobs were
// reporting green while doing nothing at all. (The original example was
// crm-call-volume, removed with the 8x8 integration in pkg933; runEmailSync's
// msConfigured() skip is the same shape and still live.)
//
// So the body is read as well as the status. A handler that says it failed has
// failed, whatever code it chose to send.
function failureFromBody(body) {
  if (!body || typeof body !== 'object') return null
  // `reason` as well as `error`. deliveries-sync reported
  // { ok: false, reason: 'po fetch failed' } and the alert email said only
  // "handler reported ok: false" - the one word of explanation the handler
  // had bothered to provide was dropped on the floor.
  if (body.ok === false) return String(body.error || body.reason || 'handler reported ok: false')
  return null
}

// A RUN THAT SKIPPED IS NOT A RUN.
//
// crm-daily-activities fires at 06:00 AND 07:00 UTC, because only one of those
// is 07:00 London whichever side of the clock change you are on. The other exits
// immediately with { skipped: ... }.
//
// The heartbeat recorded the LAST run - which in BST is always the skip. So
// cron health showed "ok, 1ms" every day while the REAL run had been throwing
// for weeks. The failure was invisible not because nothing noticed, but because
// something overwrote the notice half an hour later.
//
// A skipped run no longer overwrites the record of a real one.
function isSkip(body) {
  return !!(body && typeof body === 'object' && body.skipped)
}

async function heartbeat(name, entry) {
  try {
    const redis = await getClient()
    await redis.set(`cron:last:${name}`, entry)
  } catch {
    // A heartbeat that cannot be written must never fail the job it is watching.
  }
}

export default function forEachTenant(name, handler) {
  return async function wrapped(req, res) {
    // Single-tenant, as today. Still records a heartbeat, so the history starts
    // now rather than when multi-tenancy lands.
    if (!tenancyEnabled()) {
      const started = Date.now()
      const { api, cap } = captureRes()
      let ok = true, error = null
      try {
        await handler(req, api)
        if (cap.statusCode >= 400) { ok = false; error = (cap.body && cap.body.error) || `status ${cap.statusCode}` }
        else { const f = failureFromBody(cap.body); if (f) { ok = false; error = f } }
      } catch (e) {
        ok = false; error = (e && e.message) || 'failed'
      }
      await heartbeat(name, {
        startedAt: new Date(started).toISOString(),
        ms: Date.now() - started, ok, error, result: cap.body ?? null,
      })
      if (!ok && error) return res.status(cap.statusCode >= 400 ? cap.statusCode : 500).json({ ok: false, error, result: cap.body ?? null })
      return res.status(cap.statusCode).json(cap.body ?? { ok: true })
    }

    let tenants = []
    try {
      tenants = await allTenants()
    } catch (e) {
      // The registry itself is unreachable. Say so rather than running nothing
      // and reporting success, which is how a stopped sync stays hidden.
      return res.status(503).json({ ok: false, error: 'Registry unreachable: ' + (e && e.message) })
    }

    const results = []
    for (const tenant of tenants) {
      const started = Date.now()
      const { api, cap } = captureRes()
      let ok = true, error = null
      try {
        await runWithTenant(tenant, () => handler(req, api))
        if (cap.statusCode >= 400) { ok = false; error = (cap.body && cap.body.error) || `status ${cap.statusCode}` }
        else { const f = failureFromBody(cap.body); if (f) { ok = false; error = f } }
      } catch (e) {
        ok = false; error = (e && e.message) || 'failed'
      }
      const entry = {
        startedAt: new Date(started).toISOString(),
        ms: Date.now() - started, ok, error, result: cap.body ?? null,
      }
      // Written inside the tenant's own scope so it lands in their database.
      // A skip is recorded ONLY if there is nothing better already there, so the
      // real run's result survives - see isSkip above.
      try {
        await runWithTenant(tenant, async () => {
          if (isSkip(cap.body)) {
            const prev = await (await getClient()).get(`cron:last:${name}`).catch(() => null)
            if (prev && !prev.skipped) return
            return heartbeat(name, { ...entry, skipped: true })
          }
          return heartbeat(name, entry)
        })
      } catch {}

      // AND SAY SOMETHING. A heartbeat is only read by somebody who goes
      // looking. A cron that fails at 02:30 and is never mentioned is a sync
      // that has silently stopped for one customer while working for the rest -
      // which is the exact failure the per-customer loop was built to expose.
      // Same reasoning as lib/cronHealth.js: a job reporting that it is not
      // configured is not a job that has broken. Emailing it nightly would
      // train you to ignore the address these arrive at.
      const notConfigured = /not configured/i.test(String(error || ''))
      if (!ok && !notConfigured) {
        reportError({
          where: `cron/${name}`,
          error: new Error(error || 'failed'),
          req,
          tenantId: tenant.id,
        })
      }
      results.push({ tenant: tenant.id, ok, ms: entry.ms, error, result: cap.body ?? null })
    }

    const failed = results.filter(r => !r.ok)
    return res.status(200).json({
      cron: name,
      tenants: results.length,
      succeeded: results.length - failed.length,
      failed: failed.length,
      // A 200 with failures inside is deliberate: the JOB ran. Returning 500
      // because one customer out of forty failed would make Vercel report the
      // whole cron as broken and hide the other thirty-nine that worked.
      results,
    })
  }
}

// FOR JOBS THAT RUN INSIDE ANOTHER JOB.
//
// forms-weekly-notify, deliveries-notify and rams-reminders are called as
// FUNCTIONS from hs-expiry-email, not as routes, so forEachTenant never sees
// them and they recorded no heartbeat at all.
//
// The dispatcher ran for 8.5 seconds and reported success. If the RAMS
// reminders inside it had thrown and been swallowed, it would have looked
// identical. Three jobs were completely unmonitored.
//
// Each one now records its own, so it appears in cron health beside the rest.
export async function recordSubJob(name, started, result) {
  const failed = result && typeof result === 'object' && result.ok === false
  await heartbeat(name, {
    startedAt: new Date(started).toISOString(),
    ms: Date.now() - started,
    ok: !failed,
    error: failed ? String(result.error || 'reported ok: false') : null,
    result: result ?? null,
    viaDispatcher: 'hs-expiry-email',
  })
}
