import { requireRole } from '../../../lib/portalAuth'
import { allTenants, tenantById, saveTenant, registryConfigured, tenancyEnabled, PLATFORM_TENANT } from '../../../lib/tenants'
import { MODULES, normaliseModules, validateModules, NEEDS_XERO } from '../../../lib/modules'

// PLATFORM ADMIN - the customer registry. James only.
//
// NOT wrapped in withTenant. This endpoint is about the control database, not
// about any one customer's data, and it has to work before a customer exists.
//
// WHO CAN REACH IT
// ----------------
// Once tenancy is switched on: only from a platform host (PLATFORM_HOSTS), and
// only for an admin. A customer's own admin must never see this - it lists
// every other customer.
//
// Until tenancy is switched on there IS no platform host, so an admin may reach
// it from the normal portal. That is a deliberate temporary door so the registry
// can be set up at all, and it closes by itself the moment TENANCY_ENABLED=1.
//
// CREDENTIALS ARE NEVER RETURNED. A customer's database url and token go in and
// are never sent back out, not even to James. There is no screen that needs
// them and a screen that shows them is a screen that can leak them.

// TWO INDEPENDENT CONDITIONS, not one.
//
// The first version required only the admin ROLE until tenancy was switched on.
// That leaves a window - between creating the control database and throwing the
// switch - where ANY Rock admin could open this and read the full customer list,
// their addresses and their modules. That window could be five minutes or five
// weeks, and "short" is doing a lot of work in that sentence.
//
// So: named people AND, once tenancy is on, the right address. Neither alone is
// enough.
//
//   PLATFORM_ADMINS   comma-separated emails. Yours.
//   PLATFORM_HOSTS    comma-separated addresses. Your own domain.
//
// While PLATFORM_ADMINS is unset, any admin can reach it - otherwise there would
// be no way to set it up at all. Set it as soon as the control database exists.
// The report below says which of the two conditions are actually in force, so it
// cannot be quietly left open.
function platformAdmins() {
  return String(process.env.PLATFORM_ADMINS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
}

function platformGuard(req, res) {
  const session = requireRole(req, res, ['admin'])
  if (!session) return false

  const named = platformAdmins()
  if (named.length && !named.includes(String(session.email || '').toLowerCase())) {
    // 404 rather than 403. A 403 confirms the page exists and that somebody has
    // access to it; a 404 says nothing at all.
    res.status(404).json({ error: 'Not found' })
    return false
  }

  if (!tenancyEnabled()) return true

  const host = String((req.headers['x-forwarded-host'] || req.headers.host || '')).toLowerCase().split(':')[0]
  const allowed = String(process.env.PLATFORM_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean)
  if (!allowed.includes(host)) {
    res.status(404).json({ error: 'Not found' })
    return false
  }
  return true
}

const safe = (t) => {
  if (!t) return null
  const { redis, ...rest } = t
  return { ...rest, databaseConfigured: !!(redis && redis.url && redis.token) }
}

export default async function handler(req, res) {
  if (!platformGuard(req, res)) return

  if (!registryConfigured()) {
    return res.status(200).json({
      controlDatabaseConfigured: false,
      tenancyEnabled: false,
      restrictedToNamedAdmins: platformAdmins().length > 0,
      restrictedToPlatformHosts: false,
      tenants: [],
      modules: MODULES,
      message: 'No control database yet. Create an Upstash Redis store in Vercel with the prefix CONTROL_REDIS, redeploy, then add your first customer here.',
    })
  }

  if (req.method === 'GET') {
    let tenants = []
    try { tenants = await allTenants() } catch (e) {
      return res.status(503).json({ error: 'Control database unreachable: ' + e.message })
    }
    return res.json({
      controlDatabaseConfigured: true,
      tenancyEnabled: tenancyEnabled(),
      // Shown so an open door cannot be left open quietly.
      restrictedToNamedAdmins: platformAdmins().length > 0,
      restrictedToPlatformHosts: tenancyEnabled(),
      platformHosts: String(process.env.PLATFORM_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean),
      tenants: tenants.map(safe).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id))),
      modules: MODULES,
      needsXero: NEEDS_XERO,
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' })

  const body = req.body || {}
  const id = String(body.id || '').trim().toLowerCase()
  if (!id) return res.status(400).json({ error: 'id required' })
  if (id === PLATFORM_TENANT) return res.status(400).json({ error: 'That id is reserved.' })
  if (!/^[a-z0-9-]+$/.test(id)) {
    return res.status(400).json({ error: 'id must be lower case letters, numbers and hyphens only - it appears in web addresses.' })
  }

  const existing = await tenantById(id).catch(() => null)

  const hosts = (Array.isArray(body.hosts) ? body.hosts : String(body.hosts || '').split(','))
    .map(h => String(h).trim().toLowerCase()).filter(Boolean)
  if (!hosts.length) return res.status(400).json({ error: 'At least one web address is required.' })

  // An address can only belong to one customer. Without this check a typo
  // silently re-points an existing customer's address at a new record, and
  // everyone at that company lands somewhere else.
  let all = []
  try { all = await allTenants() } catch {}
  for (const t of all) {
    if (t.id === id) continue
    for (const h of (t.hosts || [])) {
      if (hosts.includes(String(h).toLowerCase())) {
        return res.status(409).json({ error: `${h} already belongs to "${t.id}".` })
      }
    }
  }

  const modules = normaliseModules(body.modules)
  const problems = validateModules(modules)
  if (problems.length) return res.status(400).json({ error: problems.join(' ') })

  // Credentials are only taken when supplied, so saving a customer to change
  // their modules cannot wipe the pointer to their database.
  const redis = (body.redis && body.redis.url && body.redis.token)
    ? { url: String(body.redis.url).trim(), token: String(body.redis.token).trim() }
    : (existing ? existing.redis : null)
  if (!redis) return res.status(400).json({ error: 'Database url and token are required for a new customer.' })

  const rec = {
    ...(existing || {}),
    id,
    name: String(body.name || (existing && existing.name) || id).trim(),
    hosts,
    redis,
    modules,
    timezone: body.timezone || (existing && existing.timezone) || 'Europe/London',
    currency: body.currency || (existing && existing.currency) || 'GBP',
    locale: body.locale || (existing && existing.locale) || 'UK',
    senderName: body.senderName != null ? String(body.senderName).trim() : (existing && existing.senderName) || '',
    sendingAddress: body.sendingAddress != null ? String(body.sendingAddress).trim() : (existing && existing.sendingAddress) || '',
    replyTo: body.replyTo != null ? String(body.replyTo).trim() : (existing && existing.replyTo) || '',
    logoUrl: body.logoUrl != null ? String(body.logoUrl).trim() : (existing && existing.logoUrl) || '',
    active: body.active !== false,
    updatedAt: new Date().toISOString(),
    createdAt: (existing && existing.createdAt) || new Date().toISOString(),
  }

  try {
    await saveTenant(rec)
  } catch (e) {
    return res.status(500).json({ error: 'Could not save: ' + e.message })
  }
  return res.json({ ok: true, tenant: safe(rec) })
}
