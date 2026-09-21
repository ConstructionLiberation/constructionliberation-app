import { getTokens } from './db'

// DO NOT THROW AWAY A CACHE NOTHING CAN REBUILD.
//
// Twenty-eight routes did this whenever something changed that would alter
// the commercial figures:
//
//     await redis.del('dashboard:cache')
//
// On a tenant with Xero connected that is exactly right - the next sync
// rebuilds it from the accounting data, and a stale cache is worse than a
// missing one.
//
// On a tenant WITHOUT Xero it is destructive and permanent.
// pages/api/dashboard.js returns 401 before it ever reaches the cache when
// there are no tokens, which is the only reason a seeded cache survives at
// all. Delete it and nothing can put it back: Budget Tracker, Project
// Financials, Retention and WIP all go blank and stay blank until somebody
// re-seeds.
//
// That is how the demo lost its data mid-sweep. Saving a retention row calls
// this, and pages/api/retention.js had no way of knowing the tenant could not
// rebuild.
//
// So: delete it only if something can rebuild it. A tenant with no accounting
// connection keeps what it has - possibly stale, but far more useful than
// empty, and on a demo tenant "stale" means "generated earlier today and not
// changing anyway".
export async function invalidateDashboardCache(redis) {
  try {
    const tokens = await getTokens()
    if (!tokens) return { skipped: true, reason: 'no accounting connection to rebuild from' }
  } catch {
    // If we cannot even tell, assume we cannot rebuild. Keeping a cache we
    // were unsure about is recoverable; deleting one we needed is not.
    return { skipped: true, reason: 'could not read the accounting connection' }
  }
  if (redis && typeof redis.del === 'function') await redis.del('dashboard:cache')
  return { deleted: true }
}
