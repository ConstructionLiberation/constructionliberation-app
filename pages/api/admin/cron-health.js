import withTenant from '../../../lib/withTenant'
import { getClient } from '../../../lib/db'
import { requireRole } from '../../../lib/portalAuth'
import vercelConfig from '../../../vercel.json'
import fs from 'fs'
import path from 'path'

// CRON HEALTH. READ ONLY.
//
// Every cron records a heartbeat when it runs - see lib/forEachTenant.js. This
// reads them back and answers the question nothing was asking:
//
//     has anything stopped?
//
// THE POINT IS THE ABSENCES, NOT THE FAILURES.
//
// A cron that errors is visible in the Vercel log. A cron that silently STOPS
// RUNNING writes nothing, logs nothing, and looks exactly like a quiet week.
// That is how three of these came to have no schedule at all without anyone
// noticing, and how a sync could stop for one customer while working for
// everyone else.
//
// So the schedules are read from vercel.json ITSELF rather than copied into a
// list here. A second copy of the schedule would drift from the real one, and a
// monitoring page reporting against the wrong schedule is worse than none.

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

async function handler(req, res) {
  if (!requireRole(req, res, ['admin', 'management'])) return
  const redis = await getClient()

  const scheduled = (vercelConfig.crons || []).map(c => ({
    name: String(c.path || '').replace('/api/cron/', ''),
    schedule: c.schedule,
  }))
  const scheduledNames = new Set(scheduled.map(c => c.name))

  // Everything that has ever recorded a heartbeat, so a cron that used to run
  // and stopped still appears.
  let heartbeatNames = []
  try {
    heartbeatNames = (await redis.keys('cron:last:*')).map(k => k.replace('cron:last:', ''))
  } catch {}

  // AND EVERY CRON FILE THAT EXISTS.
  //
  // The first version listed only crons with a schedule or a heartbeat, which
  // meant deep-sync, wip-sync and pipedrive-sync - the three with NEITHER - were
  // invisible. The "not scheduled" status was unreachable, which made it exactly
  // the wrong thing to miss: a cron nobody scheduled is the one most likely to
  // be forgotten.
  //
  // Read from the folder rather than a list kept here, because a list kept here
  // is a second copy of the truth. It may not be readable inside a serverless
  // function - if not, folderListed comes back false and the report degrades to
  // what it did before rather than failing.
  let fileNames = []
  let folderListed = false
  try {
    const dir = path.join(process.cwd(), 'pages', 'api', 'cron')
    fileNames = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3))
    folderListed = true
  } catch {}

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

    // Jobs that run inside another job - forms-weekly-notify, deliveries-notify
    // and rams-reminders are called as functions from hs-expiry-email. They have
    // no schedule of their own, so they are judged against the dispatcher's.
    const viaDispatcher = hb && hb.viaDispatcher ? hb.viaDispatcher : null
    const effectiveInterval = interval || (viaDispatcher ? 86400000 : null)

    let status
    if (!sched && !viaDispatcher) status = 'not scheduled'
    else if (!lastMs) status = 'never run'
    else if (effectiveInterval && ageMs > effectiveInterval + 3600000) status = 'OVERDUE'
    // Allowed to be one full interval late plus an hour, so a job that runs at
    // 08:00 is not reported as overdue at 08:00:01 the next day.
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

  const problems = rows.filter(r => r.status !== 'ok')
  return res.json({
    checkedAt: new Date().toISOString(),
    // False means the cron folder could not be read inside the function, so any
    // cron with no schedule and no heartbeat is still invisible. Tell me if it
    // is false and I will find another way to enumerate them.
    folderListed,
    total: rows.length,
    problems: problems.length,
    crons: rows.sort((a, b) => {
      const rank = (s) => (s === 'OVERDUE' ? 0 : s === 'last run failed' ? 1 : s === 'never run' ? 2 : s === 'not scheduled' ? 3 : 4)
      return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name)
    }),
    note: 'Heartbeats began at pkg858, so anything that has not run since then reads as never run until its next scheduled time.',
  })
}

export default withTenant(handler)
