import { get, set } from '../../lib/db'
import { requireRole } from '../../lib/portalAuth'
import withTenant from '../../lib/withTenant'
import { COM_WEEKLY, COM_MONTHLY, BK_WEEKLY, BK_MONTHLY } from '../../lib/taskDefaults'

// THE TASK LISTS, PER CUSTOMER.
//
// The weekly and monthly commercial and bookkeeping checklists were literal
// arrays inside components. Rock's own wording, Rock's own process - and one
// of them reads "Does the Retention Owed match 612 Allocated", which names a
// XERO ACCOUNT CODE. A customer would be handed instructions referring to an
// account they do not have.
//
// The pattern here is the same one pages/api/templates.js already uses for the
// Pre-Start and IHM templates, and it is the right one: a code default that
// every tenant starts from, an override stored in the tenant's own database,
// and the stored one wins. Nothing is written until someone actually changes
// something, so a new customer inherits a sensible starting list rather than
// an empty screen.
//
// GET  ?scope=commercial|bookkeeping   -> { weekly: [...], monthly: [...], customised: bool }
// POST { scope, cadence, tasks: [{id,text}] }
//
// DELETION DOES NOT REMOVE COMPLETION HISTORY. Ticks are stored against the
// task id in a separate key. Removing a task hides it from the grid and leaves
// its history alone, so deleting one by accident loses nothing and re-adding
// the same id brings it back.

const KEY = (scope) => `config:task-defs:${scope}`

const DEFAULTS = {
  commercial: { weekly: COM_WEEKLY, monthly: COM_MONTHLY },
  bookkeeping: { weekly: BK_WEEKLY, monthly: BK_MONTHLY },
}

const clean = (list) => (Array.isArray(list) ? list : [])
  .map(t => ({ id: String(t.id || '').trim(), text: String(t.text || '').trim() }))
  .filter(t => t.id && t.text)
  .slice(0, 60)

async function handler(req, res) {
  const scope = String((req.query.scope || (req.body && req.body.scope) || 'commercial')).toLowerCase()
  if (!DEFAULTS[scope]) return res.status(400).json({ error: "scope must be 'commercial' or 'bookkeeping'" })

  if (req.method === 'GET') {
    if (!requireRole(req, res, ['commercial', 'bookkeeping', 'management', 'admin', 'post-contract'])) return
    const stored = (await get(KEY(scope))) || null
    return res.json({
      weekly: clean(stored?.weekly) .length ? clean(stored.weekly)  : DEFAULTS[scope].weekly,
      monthly: clean(stored?.monthly).length ? clean(stored.monthly) : DEFAULTS[scope].monthly,
      customised: !!stored,
    })
  }

  if (req.method === 'POST') {
    // Editing the checklist is a management act - it changes what everyone
    // else is asked to confirm each week.
    if (!requireRole(req, res, ['management', 'admin'])) return
    const cadence = String(req.body?.cadence || '')
    if (cadence !== 'weekly' && cadence !== 'monthly') {
      return res.status(400).json({ error: "cadence must be 'weekly' or 'monthly'" })
    }
    const tasks = clean(req.body?.tasks)
    if (!tasks.length) return res.status(400).json({ error: 'At least one task is required.' })

    const ids = new Set()
    for (const t of tasks) {
      if (ids.has(t.id)) return res.status(400).json({ error: `Duplicate task id "${t.id}".` })
      ids.add(t.id)
    }

    const stored = (await get(KEY(scope))) || {}
    const next = {
      weekly: cadence === 'weekly' ? tasks : (clean(stored.weekly).length ? clean(stored.weekly) : DEFAULTS[scope].weekly),
      monthly: cadence === 'monthly' ? tasks : (clean(stored.monthly).length ? clean(stored.monthly) : DEFAULTS[scope].monthly),
      updatedAt: Date.now(),
    }
    await set(KEY(scope), next)
    return res.json({ ok: true, weekly: next.weekly, monthly: next.monthly, customised: true })
  }

  return res.status(405).json({ error: 'GET or POST only' })
}

export default withTenant(handler)
