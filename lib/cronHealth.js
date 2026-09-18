import { getClient } from './db'
import vercelConfig from '../vercel.json'

// CRON HEALTH, IN ONE PLACE.
//
// This was inside pages/api/admin/cron-health.js. It is now here because a
// SECOND thing needs it - the nightly alert that emails when a job has stopped.
// Two copies of "is this cron overdue" would drift, and the one that drifts is
// the alert, which would then quietly stop alerting.

// Minimal cron parser: enough for the expressions actually in vercel.json,
// which are all "minute hour [dom] [month] [dow]" with * or a plain number.
// It works out the longest gap between runs, which is all the overdue check
// needs. Anything it cannot read returns null and is reported as unknown rather
// than guessed at.
function expectedIntervalMs(expr) {
  const p = String(expr || '').trim().split(/\s+/)
  if (p.length !== 5) return null
  const [min, hour, dom, mon, dow] = p
  const num = (v) => (/^\d+$/.test(v) ? Number(v) : null)
  if (mon !== '*') return null
  if (dow !== '*' && dom !== '*') return null
  const DAY = 86400000
  // ANY day-of-week restriction is treated as WEEKLY, not daily.
  //
  // "0 9 * * 1-5" runs weekdays. Calling that daily would report it overdue
  // every Sunday morning, for ever. An alert that cries wolf weekly is an alert
  // people switch off, which is worse than not having one. Seven days is the
  // safe upper bound for any day-of-week expression.
  if (dow !== '*') return 7 * DAY
  if (dom !== '*' && num(dom) != null) return 31 * DAY         // monthly, worst case
  // A list of hours - "0 6,7 * * *" - still runs every day.
  if (min.includes(',') || hour.includes(',')) return DAY
  if (num(hour) != null && num(min) != null) return DAY        // daily
  if (hour === '*' && num(min) != null) return 3600000         // hourly
  if (hour.startsWith('*/')) {
    const n = Number(hour.slice(2))
    if (n > 0) return n * 3600000
  }
  if (min.startsWith('*/')) {
    const n = Number(min.slice(2))
    if (n > 0) return n * 60000
  }
  return null
}


// Returns the same shape the admin endpoint returns.
export async function cronHealth() {
  const redis = await getClient()

  const scheduled = (vercelConfig.crons || []).map(c => ({
    name: String(c.path || '').replace('/api/cron/', ''),
    schedule: c.schedule,
  }))
  const scheduledNames = new Set(scheduled.map(c => c.name))

  let heartbeatNames = []
  try {
    heartbeatNames = (await redis.keys('cron:last:*')).map(k => k.replace('cron:last:', ''))
  } catch {}

  // JOBS THAT DELIBERATELY DO NOT RUN EVERY TIME THEY ARE INVOKED.
  //
  // The interval is normally derived from the cron expression, which assumes a job runs
  // whenever it is invoked. Some do not: they are invoked daily and then decide it is
  // not their day. pkg906 stopped a skipped run overwriting the heartbeat of a real one
  // - correctly, because that had hidden a genuinely broken job for weeks - and the
  // consequence is that these jobs legitimately show an age far longer than their
  // schedule suggests.
  //
  // So they were reported OVERDUE every single day while working perfectly. Two false
  // alarms in every morning's email, which is how you stop opening it - and on 17
  // September that email also carried crm-daily-activities failing for real, sitting
  // underneath them.
  //
  // Declared here rather than derived, because the cadence lives in an `if` inside each
  // job and no expression can describe it.
  const DECLARED_CADENCE_MS = {
    // Runs only on Mondays, inside the daily hs-expiry-email dispatcher.
    'forms-weekly-notify': 7 * 86400000,
    // Every third WORKING day. Worst case is a Friday send: Mon, Tue, Wed is the third
    // working day, which is five calendar days later.
    'design-rfi-outstanding': 5 * 86400000,
  }

  const UNSCHEDULED_CRON_FILES = ['deep-sync', 'wip-sync', 'pipedrive-sync']
  const fileNames = UNSCHEDULED_CRON_FILES

  const names = [...new Set([...scheduledNames, ...heartbeatNames, ...fileNames])].sort()
  const now = Date.now()
  const rows = []

  for (const name of names) {
    let hb = null
    try { hb = await redis.get(`cron:last:${name}`) } catch {}
    const sched = scheduled.find(c => c.name === name) || null
    const interval = sched ? expectedIntervalMs(sched.schedule) : null
    const lastMs = hb && hb.startedAt ? Date.parse(hb.startedAt) : null
    const ageMs = lastMs ? now - lastMs : null
    const viaDispatcher = hb && hb.viaDispatcher ? hb.viaDispatcher : null
    // A declared cadence wins over anything derived from the schedule.
    const effectiveInterval = DECLARED_CADENCE_MS[name] || interval || (viaDispatcher ? 86400000 : null)

    let status
    if (!sched && !viaDispatcher) status = 'not scheduled'
    else if (!lastMs) status = 'never run'
    else if (effectiveInterval && ageMs > effectiveInterval + 3600000) status = 'OVERDUE'
    // "NOT CONFIGURED" IS NOT A FAILURE.
    //
    // crm-call-volume and crm-daily-activities return { ok: false, error: 'Not
    // configured. Missing in Vercel: EIGHTX8_...' } because 8x8 has never been
    // set up. That is a deliberate state, not a fault.
    //
    // Treating it as a failure would send the same email every morning for as
    // long as 8x8 stays on the backlog - and an alert that always says the same
    // thing is an alert people stop opening, which costs you the one morning it
    // says something different.
    else if (hb && hb.ok === false && /not configured/i.test(String(hb.error || ''))) status = 'not configured'
    else if (hb && hb.ok === false) status = 'last run failed'
    else status = 'ok'

    rows.push({
      name,
      schedule: sched ? sched.schedule : (viaDispatcher ? `runs inside ${viaDispatcher}` : null),
      runsInside: viaDispatcher,
      status,
      lastRunAt: hb ? hb.startedAt : null,
      hoursSince: ageMs != null ? Math.round(ageMs / 360000) / 10 : null,
      durationMs: hb ? hb.ms : null,
      ok: hb ? hb.ok : null,
      error: hb ? hb.error : null,
      expectedEveryHours: effectiveInterval ? Math.round(effectiveInterval / 360000) / 10 : null,
    })
  }

  const rank = (s) => (s === 'OVERDUE' ? 0 : s === 'last run failed' ? 1 : s === 'never run' ? 2 : s === 'not configured' ? 3 : s === 'not scheduled' ? 4 : 5)
  rows.sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name))

  return {
    checkedAt: new Date().toISOString(),
    folderListed: false,
    unscheduledFromList: fileNames,
    total: rows.length,
    problems: rows.filter(r => r.status !== 'ok').length,
    crons: rows,
    note: 'Heartbeats began at pkg858, so anything that has not run since then reads as never run until its next scheduled time.',
  }
}

// WHAT IS WORTH WAKING SOMEBODY FOR.
//
// Not everything that is not "ok". Three of these are permanent and expected:
//
//   not scheduled   deep-sync, wip-sync, pipedrive-sync - parked deliberately
//   never run       a monthly job before its first run
//
// Alerting on those means a daily email that is always the same, which is an
// email people stop reading. Only a job that has STOPPED, or one that FAILED,
// is worth saying anything about.
export function cronAlarms(health) {
  return (health.crons || []).filter(r => r.status === 'OVERDUE' || r.status === 'last run failed')
}
