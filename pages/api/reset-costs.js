import { requireRole } from '../../lib/portalAuth'
import { invalidateDashboardCache } from '../../lib/dashboardCache'
import { getClient } from '../../lib/db'
import withTenant from '../../lib/withTenant'

async function handler(req, res) {
  if (!requireRole(req, res, ['admin'])) return;
  if (req.method !== 'POST') return res.status(405).end()
  const redis = await getClient()
  // These two are no longer written by anything - see the note in
  // pages/api/upload-bills.js. The deletes STAY so that any values already
  // stored are cleared if this is ever run, rather than sitting in the database
  // for ever looking meaningful.
  await redis.del('costs:labour')
  await redis.del('costs:materials')
  await redis.del('uploaded:invoices')
  await invalidateDashboardCache(redis)
  res.json({ ok: true, message: 'All cost data reset' })
}

export default withTenant(handler)
