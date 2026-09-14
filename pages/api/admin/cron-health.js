import withTenant from '../../../lib/withTenant'
import { requireRole } from '../../../lib/portalAuth'
import { cronHealth } from '../../../lib/cronHealth'

// CRON HEALTH. READ ONLY.
//
// The logic moved to lib/cronHealth.js when the nightly alert started needing
// it too. Two copies of "is this cron overdue" would drift, and the copy that
// drifts is the alert - which would then quietly stop alerting.

async function handler(req, res) {
  if (!requireRole(req, res, ['admin', 'management'])) return
  return res.json(await cronHealth())
}

export default withTenant(handler)
