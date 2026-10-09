import { requireArea } from '../../lib/portalAuth'
import { get, set } from '../../lib/db'
import withTenant from '../../lib/withTenant'
import { SCORECARDS, personKey, cleanHiddenPeople } from '../../lib/scorecardPeople'

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
  },
  operationsManager: {
    sosPct: 1,
    diaryPct: 1,
    wahPct: 1,
    toolbox: 1,
  }
}

async function handler(req, res) {
  // Targets feed the pre-contract, commercial, operations and business
  // scorecards, so anyone who can open one of those may read and set them. By
  // area, so Accounts gets the Commercial Scorecard's targets with the portal
  // (1023). 'management' added for the Business Scorecard (1026) - every role
  // with that area already had one of the others, so nobody gains access.
  const session = requireArea(req, res, ['pre-contract', 'commercial', 'operations', 'management'])
  if (!session) return;
  if (req.method === 'GET') {
    // HIDDEN METRICS ride with the targets rather than getting their own
    // route: the scorecard already fetches this, it is the same kind of
    // per-customer scorecard config, and a second fetch on that page buys
    // nothing. An array of metric keys - see the defs in
    // pages/scorecard-crm.js. Empty means show everything, which is what
    // every existing tenant has.
    //
    // HIDDEN PEOPLE ride along for the same reason - see lib/scorecardPeople.js.
    const [stored, hidden, hiddenPeople] = await Promise.all([
      get('scorecard:targets'),
      get('scorecard:hidden'),
      get('scorecard:hiddenPeople'),
    ])
    return res.status(200).json({
      targets: stored || DEFAULT_TARGETS,
      hidden: Array.isArray(hidden) ? hidden : [],
      hiddenPeople: cleanHiddenPeople(hiddenPeople),
    })
  }
  if (req.method === 'POST') {
    // HIDE OR SHOW ONE PERSON: { hidePerson: { scorecard, key, hidden } }
    //
    // Management and admin only - hiding a colleague's scorecard is not
    // something to do from your own tab. And ONE person per request, merged on
    // the server, not the whole list sent back from the page: two managers
    // tidying the list at once must not undo each other.
    if (req.body.hidePerson !== undefined) {
      if (!['management', 'admin'].includes(session.role)) {
        return res.status(403).json({ error: 'Only management can hide or show a scorecard.' })
      }
      const { scorecard, key, hidden } = req.body.hidePerson || {}
      const k = personKey(key)
      if (!SCORECARDS.includes(scorecard)) return res.status(400).json({ error: `scorecard must be one of: ${SCORECARDS.join(', ')}` })
      if (!k) return res.status(400).json({ error: 'Missing person' })
      const all = cleanHiddenPeople(await get('scorecard:hiddenPeople'))
      const list = all[scorecard].filter(x => x !== k)
      if (hidden) list.push(k)
      all[scorecard] = list
      await set('scorecard:hiddenPeople', all)
      return res.status(200).json({ success: true, hiddenPeople: all })
    }
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
