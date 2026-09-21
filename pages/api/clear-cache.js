import { requireRole } from '../../lib/portalAuth'
import { invalidateDashboardCache } from '../../lib/dashboardCache'
import { getClient } from '../../lib/db'
import withTenant from '../../lib/withTenant'

async function handler(req, res) {
  if (!requireRole(req, res, ['admin'])) return;
  const redis = await getClient()
  await invalidateDashboardCache(redis)
  res.json({ ok: true, message: 'Dashboard cache cleared' })
}

export default withTenant(handler)
