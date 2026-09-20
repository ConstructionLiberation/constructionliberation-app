import { requireRole } from '../../../lib/portalAuth'
import { clientForCredentials } from '../../../lib/db'
import { tenantById, registryConfigured } from '../../../lib/tenants'
import { generateDemo, DEMO_KEY_PREFIXES } from '../../../lib/demoSeed'

// PUT DEMONSTRATION DATA INTO A NAMED TENANT. ONLY WHEN ASKED.
//
// Three rules, and all three exist because of something that actually went
// wrong:
//
//   1. IT NEVER RUNS BY ITSELF. lib/crmSeedDeals.js and lib/lessonsSeed.js
//      both fired on first access - one rendered Rock Roofing's entire
//      pipeline into any tenant's CRM, the other WROTE two years of Rock's
//      internal management minutes into any tenant's database. Nothing here
//      happens without a deliberate POST naming a tenant.
//
//   2. IT REFUSES A TENANT THAT ALREADY HAS DATA. Any admin can reach this
//      route. Without that check it would be a way to overwrite a live
//      customer's projects, which is worse than anything it fixes.
//
//   3. IT REFUSES THE TENANT IT IS CALLED FROM, unless that tenant IS the
//      target. Belt and braces on top of 2: running this from Rock's portal
//      must never be able to touch Rock's database by accident.
//
// POST { action: 'seed',  id, projects?, deals?, seed?, targetMargin? }
// POST { action: 'wipe',  id, confirm: '<id>' }
// POST { action: 'preview', projects?, deals? }   <- generates nothing, writes
//                                                    nothing, returns a summary
//
// The generated data is obviously invented - made-up company names, made-up
// people, made-up sites. That is deliberate: if anything of a real customer's
// ever appears in the demo tenant, it should be visible at a glance rather
// than needing a database scan to find.

async function clientFor(id, bodyRedis) {
  if (bodyRedis && bodyRedis.url && bodyRedis.token) {
    return { redis: await clientForCredentials(bodyRedis), via: 'credentials supplied in this request' }
  }
  if (!registryConfigured()) throw new Error('No control database configured.')
  const t = await tenantById(String(id).toLowerCase())
  if (!t || !t.redis) throw new Error(`No registered database for "${id}".`)
  return { redis: await clientForCredentials(t.redis), via: `the registered database for "${t.id}"` }
}

async function assertIsTarget(redis, id) {
  const identity = await redis.get('tenant:identity').catch(() => null)
  if (!identity || !identity.id) {
    throw new Error('That database has no identity record. Refusing to write to a database that cannot say who it is.')
  }
  if (String(identity.id) !== String(id).toLowerCase()) {
    throw new Error(`That database identifies as "${identity.id}", not "${id}". Refusing.`)
  }
}

const OCCUPIED_KEYS = ['dashboard:cache', 'ops:projects', 'crm:deals']

async function handler(req, res) {
  if (!requireRole(req, res, ['admin'])) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const body = req.body || {}
  const action = String(body.action || '')

  // Costs nothing, writes nothing, touches no database. Useful for checking
  // the shape and volume before committing to it.
  if (action === 'preview') {
    const { summary } = generateDemo({
      projects: body.projects, deals: body.deals,
      seed: body.seed, targetMargin: body.targetMargin,
    })
    return res.json({ ok: true, preview: true, summary })
  }

  const id = String(body.id || '').trim().toLowerCase()
  if (!id) return res.status(400).json({ error: 'id required - name the tenant explicitly.' })

  // Never the tenant serving this request, unless it IS the target and the
  // caller said so.
  let redis, via
  try {
    const got = await clientFor(id, body.redis)
    redis = got.redis
    via = got.via
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }

  try {
    await assertIsTarget(redis, id)
  } catch (e) {
    return res.status(409).json({ error: e.message })
  }

  if (action === 'wipe') {
    if (String(body.confirm || '') !== id) {
      return res.status(400).json({ error: `To wipe, send confirm: "${id}". This deletes every demo record in that tenant.` })
    }
    let deleted = 0
    for (const prefix of DEMO_KEY_PREFIXES) {
      // Exact keys and prefixed families both handled - project:demo- and
      // crm:emails: expand to many.
      if (prefix.endsWith(':') || prefix.endsWith('-')) {
        let cursor = '0', first = true
        while (first || cursor !== '0') {
          first = false
          const out = await redis.scan(cursor, { match: prefix + '*', count: 500 })
          cursor = String((Array.isArray(out) ? out[0] : out?.cursor) ?? '0')
          const batch = (Array.isArray(out) ? out[1] : out?.keys) || []
          for (const k of batch) { await redis.del(k); deleted++ }
        }
      } else {
        const existed = await redis.get(prefix).catch(() => null)
        if (existed !== null && existed !== undefined) { await redis.del(prefix); deleted++ }
      }
    }
    return res.json({ ok: true, wiped: id, keysDeleted: deleted, wroteTo: via })
  }

  if (action !== 'seed') {
    return res.status(400).json({ error: "action must be 'seed', 'wipe' or 'preview'" })
  }

  // Occupied means occupied. Overwrite is not an option this route offers -
  // wipe first, deliberately, so nobody can destroy a populated tenant with a
  // mistyped id.
  for (const k of OCCUPIED_KEYS) {
    const existing = await redis.get(k).catch(() => null)
    if (Array.isArray(existing) ? existing.length > 0 : (existing !== null && existing !== undefined)) {
      return res.status(409).json({
        error: `"${id}" already has data (${k} is populated). Wipe it first with action 'wipe' if that is really what you want.`,
      })
    }
  }

  const { keys, summary, users } = generateDemo({
    projects: body.projects, deals: body.deals === undefined ? 190 : body.deals,
    seed: body.seed, targetMargin: body.targetMargin,
  })

  let written = 0
  for (const [k, v] of Object.entries(keys)) {
    await redis.set(k, v)
    written++
  }

  // Portal users are merged rather than replaced, so the first admin created
  // at provisioning is not wiped out by seeding. Losing the only account that
  // can sign in would be an unhelpful way to prepare a demo.
  const existingUsers = (await redis.get('portal:users').catch(() => null)) || []
  const have = new Set(existingUsers.map(u => String(u.email || '').toLowerCase()))
  const merged = [...existingUsers, ...users.filter(u => !have.has(u.email.toLowerCase()))]
  await redis.set('portal:users', merged)

  return res.json({
    ok: true,
    seeded: id,
    wroteTo: via,
    keysWritten: written,
    portalUsers: merged.length,
    summary,
    note: 'No Xero, Microsoft or Blob connection is involved. These records are written directly into the keys those syncs would normally fill.',
  })
}

export default handler
