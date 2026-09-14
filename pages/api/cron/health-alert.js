import forEachTenant from '../../../lib/forEachTenant'
import { cronHealth, cronAlarms } from '../../../lib/cronHealth'
import { reportError } from '../../../lib/errorReport'

// THE JOB THAT WATCHES THE OTHER JOBS.
//
// /api/admin/cron-health has existed since pkg870 and tells you everything - if
// you go and look. Over a week nobody goes and looks, which is exactly when a
// silently stopped sync does its damage.
//
// This runs once a day and says nothing at all unless something is wrong. An
// alert that arrives every morning is an alert people stop reading, so the
// no-news case is deliberately silent.
//
// WHY IT NEEDS ITS OWN JOB
// ------------------------
// A cron that has stopped running cannot report that it has stopped running.
// The absence is the symptom, so something else has to notice it. That is the
// whole reason this is a separate job rather than a check inside each one.
//
// It runs per customer, like every other cron, so each customer's jobs are
// judged against their own heartbeats - one company's Xero token expiring does
// not hide behind another company's healthy sync.

async function handler(req, res) {
  const health = await cronHealth()
  const alarms = cronAlarms(health)

  if (!alarms.length) {
    return res.json({ ok: true, checked: health.total, alarms: 0 })
  }

  // Deliberately reported through the same path as an application error, so it
  // arrives looking like everything else that goes wrong and needs no separate
  // sending setup. reportError reads plain environment variables and never
  // touches the database - which matters here, because a database problem is a
  // likely cause of what we are reporting.
  const summary = alarms.map(a => {
    const when = a.lastRunAt ? `last ran ${a.hoursSince}h ago` : 'never run'
    return `${a.name} - ${a.status} - ${when}${a.error ? ` - ${a.error}` : ''}`
  }).join('\n')

  reportError({
    where: `cron health: ${alarms.length} job${alarms.length === 1 ? '' : 's'} need attention`,
    error: new Error(summary),
    req,
    tenantId: null,
  })

  return res.json({
    ok: true,
    checked: health.total,
    alarms: alarms.length,
    jobs: alarms.map(a => ({ name: a.name, status: a.status, error: a.error })),
  })
}

export default forEachTenant('cron-health-alert', handler)
