import { requireArea } from '../../../lib/portalAuth'
import { get, getPortalUsers } from '../../../lib/db'
import withTenant from '../../../lib/withTenant'
import { DOCS } from '../../../lib/mgmtDocs'

// GET /api/management/org-chart
//
// The people are the tenant's ACTIVE portal users, read live on every request
// - nothing is copied or stored. Deactivate or delete a user and they are off
// the chart on the next load. Only name and job role leave this route: no
// emails, no access roles, no hashes.
//
// Outsourced services are the 'org-external' rows, edited through
// /api/management/org-external. Returned here too so the chart is one fetch.
async function handler(req, res) {
  if (!requireArea(req, res, 'management')) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const [users, external] = await Promise.all([getPortalUsers(), get(DOCS['org-external'].key)])
  const people = (users || [])
    .filter(u => u.active !== false)
    .map(u => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || '',
      jobRole: u.jobRole || '',
    }))
    .filter(p => p.name)
    .sort((a, b) => a.name.localeCompare(b.name))
  return res.status(200).json({ people, external: Array.isArray(external) ? external : [] })
}

export default withTenant(handler)
