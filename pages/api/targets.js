import { requireRole } from '../../lib/portalAuth'
import { get, set } from '../../lib/db'
import withTenant from '../../lib/withTenant'

const DEFAULT_TARGETS = {
  commercial: {
    gpMargin: 0.20,
    paylessNotices: 0,
    avgPaymentDays: 30,
    retentionInvoiced: 1,
  },
  estimator: {
    strikeRateOverall: 0.25,
    strikeRateMCSecured: 0.30,
    valuePricedExisting: 300000,
    totalValuePriced: 667000,
    totalValueSecured: 133000,
    avgValueSecured: 150000,
    gpMargin: 0.25,
  },
  sales: {
    dealsResearched: 20,
    emailsSentExternal: 200,
    avgValueSecured: 150000,
    avgValuePriced: 200000,
    chasedScored5: 3,
    gleniganScored5: 3,
    websiteReceived: 7,
    websitePriced: 4,
    strikeRateValue: 0.25,
    valuePricedExisting: 800000,
    totalValuePriced: 2000000,
    totalValueSecured: 400000,
  },
  contractsManager: {
    gpMargin: 0.20,
    psnPct: 1,
    hsIncidences: 0,
    wiRockFault: 0,
    procPct: 1,
    issuesOnTimePct: 0.9,
  },
  operationsManager: {
    sosPct: 1,
    diaryPct: 1,
    wahPct: 1,
    toolbox: 1,
    tasksPct: 0.9,
    risksPct: 0.9,
  }
}

async function handler(req, res) {
  if (!requireRole(req, res, ['pre-contract','post-contract','management','admin'])) return;
  if (req.method === 'GET') {
    // HIDDEN METRICS ride with the targets rather than getting their own
    // route: the scorecard already fetches this, it is the same kind of
    // per-customer scorecard config, and a second fetch on that page buys
    // nothing. An array of metric keys - see the defs in
    // pages/scorecard-crm.js. Empty means show everything, which is what
    // every existing tenant has.
    const [stored, hidden] = await Promise.all([
      get('scorecard:targets'),
      get('scorecard:hidden'),
    ])
    return res.status(200).json({
      targets: stored || DEFAULT_TARGETS,
      hidden: Array.isArray(hidden) ? hidden : [],
    })
  }
  if (req.method === 'POST') {
    // Either or both. A POST carrying only hidden must not wipe the targets,
    // which is exactly what an unconditional set of req.body.targets would do.
    if (req.body.targets !== undefined) await set('scorecard:targets', req.body.targets)
    if (req.body.hidden !== undefined) {
      await set('scorecard:hidden', Array.isArray(req.body.hidden) ? req.body.hidden : [])
    }
    return res.status(200).json({ success: true })
  }
  res.status(405).end()
}

export default withTenant(handler)
