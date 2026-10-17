// EVERY PROJECT'S COSTS REMAINING, as { byRef: { '<xero project id>:<line id>': amount } } -
// for the project cash flow, so a cost-remaining line ticked into a forecast forecasts the
// CM's current figure (1232)
import withTenant from '../../lib/withTenant'
import { requireRole } from '../../lib/portalAuth'
import { remainingByRef } from '../../lib/poForecast'

async function handler(req, res) {
  const session = requireRole(req, res, ['post-contract', 'management', 'admin'])
  if (!session) return
  return res.status(200).json({ byRef: await remainingByRef() })
}
export default withTenant(handler)
