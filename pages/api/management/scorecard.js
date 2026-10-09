import { requireArea } from '../../../lib/portalAuth'
import withTenant from '../../../lib/withTenant'
import { BUSINESS_METRICS, CONNECTED } from '../../../lib/businessScorecard'

// GET /api/management/scorecard?from=YYYY-MM-DD&to=YYYY-MM-DD
//   { months:[YYYY-MM], series:[{ month, <metricKey>: number|null }], connected:[keys] }
//
// The frame only. Every metric returns null until it is connected - see
// lib/businessScorecard.js. Each connection lands here as its own function,
// reading the same source as the scorecard it mirrors, never a second copy of
// the rule.
const pad = (n) => String(n).padStart(2, '0')
function monthsBetween(fromStr, toStr) {
  const [fy, fm] = fromStr.slice(0, 7).split('-').map(Number)
  const [ty, tm] = toStr.slice(0, 7).split('-').map(Number)
  const out = []
  let y = fy, m = fm
  while ((y < ty || (y === ty && m <= tm)) && out.length < 240) { out.push(`${y}-${pad(m)}`); m++; if (m > 12) { m = 1; y++ } }
  return out
}

async function handler(req, res) {
  if (!requireArea(req, res, 'management')) return
  const now = new Date()
  const from = /^\d{4}-\d{2}/.test(req.query.from || '') ? req.query.from : `${now.getFullYear() - 1}-${pad(now.getMonth() + 1)}-01`
  const to = /^\d{4}-\d{2}/.test(req.query.to || '') ? req.query.to : now.toISOString().slice(0, 10)
  const months = monthsBetween(from, to)
  const series = months.map(month => {
    const row = { month }
    for (const m of BUSINESS_METRICS) row[m.key] = null
    return row
  })
  return res.status(200).json({ months, series, connected: CONNECTED })
}

export default withTenant(handler)
