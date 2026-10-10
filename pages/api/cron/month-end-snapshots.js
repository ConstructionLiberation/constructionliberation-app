import forEachTenant from '../../../lib/forEachTenant'
import { recordAvgLiveAfa } from '../../../lib/liveProjectValue'

// MONTH-END SNAPSHOTS (1045) - figures that must be RECORDED because nothing
// stores what they were on a past date.
//
// Runs DAILY at 22:45 UTC (23:45 in the UK in summer, 22:45 in winter) and
// overwrites the current month's entry each time, so the entry left standing
// for each month is its LAST DAY's. A daily run rather than a month-end one
// because cron cannot say "last day of the month", and a missed night costs
// one day, not a month.
//
// Currently: average AFA of live projects (lib/liveProjectValue.js).
export const config = { maxDuration: 300 }

const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

async function handler(req, res) {
  try {
    const month = monthKey(new Date())
    const avgLiveAfa = await recordAvgLiveAfa(month)
    return res.status(200).json({ ok: true, month, avgLiveAfa })
  } catch (e) {
    console.error('month-end-snapshots error:', e)
    return res.status(500).json({ error: e.message || 'Failed' })
  }
}

export default forEachTenant('month-end-snapshots', handler)
