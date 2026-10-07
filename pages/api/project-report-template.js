import { requireRole } from '../../lib/portalAuth'
import { get, set } from '../../lib/db'
import withTenant from '../../lib/withTenant'
import { DEFAULT_TEMPLATE, normaliseTemplate } from '../../lib/projectReportTemplate'

const KEY = 'ops:project-report-template'

async function handler(req, res) {
  // READING AND WRITING ARE DIFFERENT PERMISSIONS.
  //
  // READING NEEDS NO PORTAL SESSION AT ALL. A Site App operative writes
  // project reports and has no portal login - requireRole answered 401, the
  // page got no sections, and a report written on a phone silently lacked
  // every box the customer had added. The same shape as /api/srats, which is
  // ungated for exactly this reason.
  //
  // What is returned is a list of HEADINGS. It carries no project data, no
  // figures and nothing about a customer - there is nothing here to protect.
  //
  // Changing the template alters every report written from here on, so that
  // stays with management.
  if (req.method !== 'GET') {
    if (!requireRole(req, res, ['management', 'admin'])) return
  }

  if (req.method === 'GET') {
    const stored = await get(KEY)
    return res.status(200).json({ template: normaliseTemplate(stored || DEFAULT_TEMPLATE) })
  }

  if (req.method === 'POST') {
    const next = normaliseTemplate(req.body && req.body.template)

    // A key must not appear twice - two sections sharing one key would write
    // over each other's answers on every report.
    const seen = new Set()
    for (const s of next.sections) {
      if (seen.has(s.key)) {
        return res.status(400).json({ error: `Two sections share the key ${s.key}. Each needs its own.` })
      }
      seen.add(s.key)
    }
    if (next.sections.length > 20) {
      return res.status(400).json({ error: 'A report can carry at most 20 extra sections.' })
    }

    await set(KEY, next)
    return res.status(200).json({ ok: true, template: next })
  }

  res.status(405).end()
}

export default withTenant(handler)
