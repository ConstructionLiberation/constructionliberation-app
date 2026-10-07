import { requireRole } from '../../lib/portalAuth'
import { get, set, getOpsProjects, getLiveTasks, getPortalUsers } from '../../lib/db'
import withTenant from '../../lib/withTenant'

// GET /api/ops-scorecards?from=YYYY-MM-DD&to=YYYY-MM-DD
//   Returns a MONTHLY SERIES so the UI can draw trend lines, matching the
//   pre-contract scorecard. Shape:
//     { months:[YYYY-MM],
//       cms:   { [cmName]: { series:[{month, ...metrics}], latest:{...} } },
//       ops:   { series:[{month, ...metrics}], latest:{...} },
//       cmNames:[...] }
//
// POST /api/ops-scorecards { month, toolbox:true|false }  -> save Toolbox Yes/No.

const DAY = 86400000
const pad = (n) => String(n).padStart(2, '0')
const monthOf = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}` }
const inMonth = (t, month) => t && monthOf(t) === month
const norm = (s) => (s || '').trim().toLowerCase()

function monthsBetween(fromStr, toStr) {
  const [fy, fm] = fromStr.substring(0, 7).split('-').map(Number)
  const [ty, tm] = toStr.substring(0, 7).split('-').map(Number)
  const out = []
  let y = fy, m = fm
  while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${pad(m)}`); m++; if (m > 12) { m = 1; y++ } }
  return out
}
const weekToMonth = (weekMon) => (weekMon || '').substring(0, 7)

// REMOVED IN 1022: H&S incidences, Water Ingress (Rock at fault), Procurement
// savings complete and Issues resolved on time. Taken off the Contracts
// Manager scorecard by decision, and no longer computed here either - they
// were the only reason this route fetched every accident, water ingress and
// pre-start submission in full on each load, plus one procurement read per
// closed project per CM. Pre-Start % never needed those: it comes from the
// forms-missing rows.

async function handler(req, res) {
  if (!requireRole(req, res, ['post-contract', 'management', 'admin'])) return

  if (req.method === 'POST') {
    const { month, toolbox } = req.body || {}
    if (!month) return res.status(400).json({ error: 'Missing month' })
    await set(`scorecard:toolbox:${month}`, toolbox === true || toolbox === 'yes')
    return res.status(200).json({ ok: true })
  }

  try {
    const now = new Date()
    const from = req.query.from || new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().slice(0, 10)
    const to = req.query.to || now.toISOString().slice(0, 10)
    const months = monthsBetween(from, to)

    const [projects, liveTasks, risks, dashCache] = await Promise.all([
      getOpsProjects(),
      getLiveTasks(),
      get('ops:risks').then(r => r || []),
      get('dashboard:cache').then(c => c || []),
    ])

    // projectNo -> CM (from IHM/Ops project)
    const projCM = {}
    for (const p of projects) projCM[p.projectNo] = p.data?.contractsManager || ''

    // Pull the forms-missing rows for the whole range (same engine the portal uses).
    // Each row: { week, projectNo, projectName, formType, responsible, role, done }
    let missingRows = []
    try {
      const origin = `https://${req.headers.host}`
      const cookie = req.headers.cookie || ''
      const fm = await fetch(`${origin}/api/forms-missing?from=${from}&to=${to}`, { headers: { cookie } }).then(r => r.json())
      missingRows = fm.rows || []
    } catch {}

    const pct = (completed, required) => required > 0 ? completed / required : null

    // ── Contracts Managers ──────────────────────────────────────────────────
    const cmNames = [...new Set(projects.map(p => p.data?.contractsManager).filter(Boolean))]
    const cms = {}
    for (const cm of cmNames) {
      const series = months.map(month => {
        // Pre-Start %: rows for this CM, Pre-Start form, in this month.
        const psnRows = missingRows.filter(r => r.formType === 'Pre-Start' && weekToMonth(r.week) === month && norm(r.responsible) === norm(cm))
        const psnReq = psnRows.length
        const psnDone = psnRows.filter(r => r.done).length
        const psnPct = pct(psnDone, psnReq)

        return { month, gpMargin: null, psnPct }
      })

      // Point-in-time metrics attributed to the latest month:
      // Gross margin — live + defects projects for this CM (commercial designation).
      const myCommercial = dashCache.filter(p => norm(p.contractsManager) === norm(cm) && (p.status === 'INPROGRESS' || p.status === 'DEFECTS'))
      let gInv = 0, gCost = 0, gCount = 0
      for (const p of myCommercial) { if (p.grossInvoiced != null && p.totalCosts != null) { gInv += p.grossInvoiced || 0; gCost += p.totalCosts || 0; gCount++ } }
      const gpMargin = gInv > 0 ? (gInv - gCost) / gInv : null

      if (series.length) {
        series[series.length - 1].gpMargin = gpMargin
        series[series.length - 1]._gpTotals = { totalProfit: gInv - gCost, totalGrossInvoiced: gInv, totalCosts: gCost, count: gCount }
      }
      cms[cm] = { series, latest: series[series.length - 1] || {} }
    }

    // ── Operations Manager (Dori) ───────────────────────────────────────────
    const opsSeries = []
    for (const month of months) {
      const rowsIn = (formType) => missingRows.filter(r => r.formType === formType && weekToMonth(r.week) === month)
      const pctOf = (formType) => { const rr = rowsIn(formType); return pct(rr.filter(r => r.done).length, rr.length) }

      // Tasks completed on-time % — tasks with a target date whose (closed) items
      // were closed on/before target. We don't store resolvedAt, so on-time =
      // closed && not past-due; total = closed tasks with a target date, this month
      // (by createdAt as a stable month bucket).
      const monthTasks = liveTasks.filter(t => t.closeOutDate && t.createdAt && monthOf(t.createdAt) === month && t.closed)
      const tasksOnTime = monthTasks.filter(t => { const due = new Date(t.closeOutDate); due.setHours(0,0,0,0); const today = new Date(); today.setHours(0,0,0,0); return due >= today }).length
      const tasksPct = pct(tasksOnTime, monthTasks.length)

      // Risk log completed on-time % — risks resolved this month, share resolved
      // on/before the target resolution date.
      const monthRisks = risks.filter(r => r.resolvedDate && monthOf(r.resolvedDate) === month)
      const risksOnTime = monthRisks.filter(r => !r.closeOutDate || new Date(r.resolvedDate) <= new Date(r.closeOutDate)).length
      const risksPct = pct(risksOnTime, monthRisks.length)

      const toolbox = await get(`scorecard:toolbox:${month}`)
      opsSeries.push({
        month,
        sosPct: pctOf('Start on Site Checklist'),
        diaryPct: pctOf('Daily Site Diary'),
        wahPct: pctOf('Works Area Handover'),
        toolbox: toolbox === true ? 1 : (toolbox === false ? 0 : null),
        tasksPct, risksPct,
      })
    }

    // WHO THE OPERATIONS MANAGER IS.
    //
    // cmNames has always been returned and the page ignored it, using a
    // hardcoded ['Will','Mike','Dori'] instead. The ops series had no name at
    // all because there was only ever one and everybody knew it was Dori.
    //
    // Taken from the tenant's own people, by job role, so the tab is right on
    // every customer without anybody configuring it. More than one is fine -
    // the page lists them all and they share the one ops series, which is
    // what the series measures anyway.
    let opsNames = []
    try {
      opsNames = (await getPortalUsers())
        .filter(u => u.active !== false && String(u.jobRole || '') === 'Operations Manager')
        .map(u => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || '')
        .filter(Boolean)
    } catch {}

    return res.status(200).json({ months, cms, ops: { series: opsSeries, latest: opsSeries[opsSeries.length - 1] || {} }, cmNames, opsNames })
  } catch (e) {
    console.error('ops-scorecards error:', e)
    return res.status(500).json({ error: e.message || 'Failed to compute scorecards' })
  }
}

export default withTenant(handler)
