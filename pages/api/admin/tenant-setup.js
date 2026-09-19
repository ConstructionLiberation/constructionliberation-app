import { requireRole, hashPassword } from '../../../lib/portalAuth'
import { getClient, clientForCredentials } from '../../../lib/db'
import { saveTenant, tenantForHost, tenantById, allTenants, registryConfigured, tenancyEnabled } from '../../../lib/tenants'

// TENANT SETUP - admin only, and deliberately manual for now.
//
// Three things it does:
//
//   GET                 report what is configured, so you can see the state
//                       before changing anything
//   POST identity       write the tenant:identity record into the CURRENT
//                       database - the label the self-check compares against
//   POST register       write a customer's record into the control database
//
// The identity label and the registry entry are the two halves of the self-check.
// Both have to say the same thing or getClient() refuses to serve that database.
// Write the identity FIRST, then the registry entry - in that order nothing is
// ever pointed at a database that cannot prove who it is.
//
// Not wired to any page. Called by hand, once per customer, until provisioning
// replaces it.
// Never return a customer's database credentials. There is no screen that needs
// them and a response that carries them is a response that can be pasted.
function safeTenant(t) {
  if (!t) return null
  const { redis, ...rest } = t
  return { ...rest, databaseConfigured: !!(redis && redis.url && redis.token) }
}

export default async function handler(req, res) {
  if (!requireRole(req, res, ['admin'])) return

  if (req.method === 'GET') {
    // Read the identity from the database belonging to whichever customer this
    // ADDRESS resolves to, using credentials from the registry - not from
    // whatever happens to be in the environment.
    //
    // This endpoint is not wrapped in withTenant (it has to work before a
    // customer exists), so there is no ambient customer to fall back on. Once
    // the global credentials are removed there will be nothing to fall back TO,
    // which is the point of this change.
    let identity = null
    let identityFrom = null
    try {
      const t = registryConfigured() ? await tenantForHost(req.headers.host) : null
      if (t && t.redis) {
        identityFrom = t.id
        identity = await (await clientForCredentials(t.redis)).get('tenant:identity')
      } else if (!tenancyEnabled()) {
        // Still single tenant: the ambient client is the only database there is.
        identity = await (await getClient()).get('tenant:identity')
        identityFrom = '(ambient)'
      }
    } catch (e) { identity = { error: e.message } }
    let registered = []
    if (registryConfigured()) {
      try { registered = (await allTenants()).map(t => ({ id: t.id, name: t.name, hosts: t.hosts, modules: t.modules })) } catch (e) {
        return res.status(500).json({ error: 'Control database unreachable: ' + e.message })
      }
    }
    return res.json({
      controlDatabaseConfigured: registryConfigured(),
      tenancyEnabled: tenancyEnabled(),
      identityOfCurrentDatabase: identity,
      identityReadFrom: identityFrom,
      registeredTenants: registered,
      // STRIPPED. This returned the RAW customer record, which carries the
      // database url and token. Admin-only, but it would have printed Rock's
      // credentials into a browser tab - and into anything that output was
      // pasted into.
      //
      // The platform endpoint has always stripped them. This one was written
      // earlier and never did. Same rule, two places, one of them wrong: the
      // fault class this project keeps producing, this time with credentials.
      resolvedForThisHost: registryConfigured() ? safeTenant(
        await tenantForHost(req.headers.host).catch(() => null)
      ) : null,
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' })

  const { action, id, name } = req.body || {}

  // Stamp the database this request is already talking to.
  if (action === 'identity') {
    if (!id) return res.status(400).json({ error: 'id required' })

    // WHICH DATABASE AM I STAMPING?
    //
    // Three ways, in order of preference:
    //
    //   1. credentials given in the body  - a brand new customer whose database
    //      exists but who is not registered yet. This is the normal path.
    //   2. the customer is already registered - take their credentials from the
    //      registry.
    //   3. neither, and tenancy is off - the ambient database, which is how
    //      Rock's own identity was stamped.
    //
    // What it no longer does is silently write to whatever database the
    // environment variables happen to point at. That was fine when there was
    // one, and is a way to stamp the wrong company's database when there are
    // several.
    let redis = null
    let target = null
    const creds = req.body && req.body.redis
    if (creds && creds.url && creds.token) {
      redis = await clientForCredentials(creds)
      target = 'credentials supplied in this request'
    } else {
      const known = registryConfigured() ? await tenantById(String(id).toLowerCase()).catch(() => null) : null
      if (known && known.redis) {
        redis = await clientForCredentials(known.redis)
        target = `the registered database for "${known.id}"`
      } else if (!tenancyEnabled()) {
        redis = await getClient()
        target = 'the ambient database'
      } else {
        return res.status(400).json({
          error: `No database to stamp. Either register "${id}" first, or supply redis: { url, token } in this request.`,
        })
      }
    }
    const existing = await redis.get('tenant:identity').catch(() => null)
    if (existing && existing.id && String(existing.id) !== String(id)) {
      // Changing an identity re-points a database at a different customer. That
      // is never a thing to do by accident.
      return res.status(409).json({
        error: `This database already identifies as "${existing.id}". Refusing to change it to "${id}".`,
      })
    }
    const rec = { id: String(id).toLowerCase(), name: name || String(id), setAt: new Date().toISOString() }
    await redis.set('tenant:identity', rec)
    return res.json({ ok: true, identity: rec, wroteTo: target })
  }

  // THE FIRST ADMIN, CREATED ON PURPOSE.
  //
  // Replaces the bootstrap that used to live in pages/api/portal-auth.js, which
  // created a Rock Roofing admin with a password literal in the source in ANY
  // tenant whose user list was empty.
  //
  // Three guards, and all three matter:
  //
  //   - it REFUSES if the tenant already has users, so it cannot be used to add
  //     an administrator to a customer who is already running. Any Rock admin
  //     can reach this route, and without that check this would be a back door
  //     into every customer's portal rather than a fix for one.
  //   - the password is supplied by the caller and must be a real one. Nothing
  //     is generated, nothing is defaulted, and there is no value to leak.
  //   - mustResetPassword is set, so the customer changes it at first sign-in
  //     and whatever was typed here stops being useful immediately.
  //
  // POST { action:'first-admin', id, name, email, password, redis? }
  if (action === 'first-admin') {
    if (!id) return res.status(400).json({ error: 'id required' })
    const email = String((req.body && req.body.email) || '').trim().toLowerCase()
    const password = String((req.body && req.body.password) || '')
    const personName = String((req.body && req.body.name) || '').trim()
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid email is required.' })
    if (password.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters.' })
    if (!personName) return res.status(400).json({ error: 'A name is required.' })

    // Same three ways of finding the database as the identity branch, and the
    // same refusal to guess.
    let redis = null
    let target = null
    const creds = req.body && req.body.redis
    if (creds && creds.url && creds.token) {
      redis = await clientForCredentials(creds)
      target = 'credentials supplied in this request'
    } else {
      const known = registryConfigured() ? await tenantById(String(id).toLowerCase()).catch(() => null) : null
      if (known && known.redis) {
        redis = await clientForCredentials(known.redis)
        target = `the registered database for "${known.id}"`
      } else {
        return res.status(400).json({
          error: `No database found for "${id}". Register it first, or supply redis: { url, token } in this request.`,
        })
      }
    }

    // The database must already know who it is, and agree. Creating an admin in
    // a database that has not been stamped means creating one in a database
    // whose owner is unverified.
    const identity = await redis.get('tenant:identity').catch(() => null)
    if (!identity || !identity.id) {
      return res.status(409).json({ error: `That database has no identity record. Stamp it first with action 'identity'.` })
    }
    if (String(identity.id) !== String(id).toLowerCase()) {
      return res.status(409).json({ error: `That database identifies as "${identity.id}", not "${id}". Refusing.` })
    }

    const existing = (await redis.get('portal:users').catch(() => null)) || []
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({
        error: `"${id}" already has ${existing.length} user(s). This creates the FIRST admin only - add further users from inside their portal.`,
      })
    }

    const user = {
      id: `pu_${Date.now()}`,
      name: personName,
      email,
      role: 'admin',
      active: true,
      passwordHash: hashPassword(password),
      mustResetPassword: true,
      createdAt: Date.now(),
    }
    await redis.set('portal:users', [user])
    return res.json({
      ok: true,
      wroteTo: target,
      tenant: String(id).toLowerCase(),
      admin: { id: user.id, name: user.name, email: user.email, role: user.role, mustResetPassword: true },
    })
  }

  // Write a customer into the control database.
  if (action === 'register') {
    if (!registryConfigured()) return res.status(400).json({ error: 'Control database not configured' })
    const rec = req.body.tenant
    if (!rec || !rec.id) return res.status(400).json({ error: 'tenant record with an id required' })
    if (!Array.isArray(rec.hosts) || !rec.hosts.length) return res.status(400).json({ error: 'tenant.hosts required' })
    if (!rec.redis || !rec.redis.url || !rec.redis.token) return res.status(400).json({ error: 'tenant.redis.url and .token required' })
    const saved = await saveTenant({
      timezone: 'Europe/London',
      currency: 'GBP',
      locale: 'UK',
      active: true,
      ...rec,
    })
    // Never echo credentials back.
    const { redis: _omit, ...safe } = saved
    return res.json({ ok: true, tenant: safe })
  }

  return res.status(400).json({ error: "action must be 'identity', 'first-admin' or 'register'" })
}
