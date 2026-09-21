// DEMO DATA GENERATOR.
//
// A GENERATOR, NOT A DATASET. Every record here is invented at call time from
// a seeded pseudo-random sequence. There is no array of projects in this file
// and no customer's real data anywhere near it.
//
// That distinction is the whole reason this file is shaped the way it is.
// lib/crmSeedDeals.js held 378 of Rock Roofing's real deals and shipped them
// into the client bundle of every tenant. lib/lessonsSeed.js held two years of
// Rock's internal management minutes and WROTE them into any tenant that
// opened the Lessons Learnt page. Both were found on 19-20 September 2026 on a
// test tenant that displayed another company's commercial position.
//
// So: nothing compiled in, nothing written unless someone explicitly asks for
// it, and everything obviously invented. If anything of Rock's ever appears in
// the demo tenant, it will be visible at a glance rather than needing a scan.
//
// ---------------------------------------------------------------------------
// WHY IT WRITES dashboard:cache DIRECTLY, WHICH IS NOT IDEAL
// ---------------------------------------------------------------------------
// pages/api/dashboard.js builds that cache from a LIVE Xero connection and
// returns 401 "Not connected to Xero" before touching it when there are no
// tokens. So on a tenant with no Xero, the cache is never rebuilt and never
// cleared - a seeded one survives, which is what makes this possible at all.
//
// The cost is that the object below shadows the one dashboard.js constructs.
// That is the dominant fault class in this codebase - one rule written twice -
// and it is accepted here deliberately, because the alternative is standing up
// a Xero organisation with a year of invoices in it for a demo.
//
// IT IS CONFINED TO ONE FUNCTION, projectCacheRow(), so there is exactly one
// place to update when dashboard.js changes. If the commercial pages start
// showing blanks after a dashboard change, that function is why.
// ---------------------------------------------------------------------------

// Deterministic PRNG, so the same seed produces the same demo twice. A demo
// that changes shape every time it is regenerated is impossible to rehearse.
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)]
const between = (r, lo, hi) => lo + r() * (hi - lo)
const intBetween = (r, lo, hi) => Math.floor(between(r, lo, hi + 1))
const round2 = (n) => Math.round(n * 100) / 100

// Invented, generic, and deliberately not roofing-specific: the platform is
// sold to contractors of several trades and a demo full of roof jargon narrows
// the pitch for no benefit.
const CLIENTS = [
  'Harbourline Developments', 'Tasman Civil Group', 'Fernwood Property',
  'Southbank Construction', 'Kowhai Estates', 'Meridian Build Partners',
  'Arrowtown Property Trust', 'Claymore Developments', 'Regent Park Holdings',
  'Ravensworth Group', 'Lightfoot Projects', 'Stonebridge Developments',
]

const SITES = [
  'Vogel Street Apartments', 'Ashgrove Primary School', 'Northcote Retail Park',
  'Quarry Road Industrial', 'Selwyn Street Offices', 'Rangitoto Community Hall',
  'Beaumont Terrace', 'Halswell Distribution Centre', 'Kingsland Mixed Use',
  'Papanui Medical Centre', 'Riverbank Warehouse', 'Eastgate Logistics',
  'Silverdale Business Park', 'Clifton Rise Housing', 'Waterview Depot',
  'Marlborough Court', 'Highbrook Unit 4', 'Tawa Sports Pavilion',
  'Brookvale Academy', 'Sunnyside Care Home', 'Pinehaven Reserve',
  'Colombo Street Retail', 'Ferndale Works', 'Glenmore Heights',
  'Oakhurst Plaza', 'Rosebank Yard', 'Te Atatu Workshop',
  'Linwood Foodstore', 'Bridgewater Mews', 'Hartley Point',
]

const SUBURBS = [
  'Penrose, Auckland', 'Petone, Lower Hutt', 'Addington, Christchurch',
  'Sockburn, Christchurch', 'Onehunga, Auckland', 'Porirua, Wellington',
  'Frankton, Hamilton', 'Mount Maunganui, Tauranga', 'Papakura, Auckland',
  'Wigram, Christchurch', 'Seaview, Lower Hutt', 'Manukau, Auckland',
]

const STAFF = [
  { name: 'Aaron Whitfield', role: 'director', jobRole: 'Director' },
  { name: 'Priya Raman', role: 'commercial', jobRole: 'Commercial Manager' },
  { name: 'Tom Bradshaw', role: 'post-contract', jobRole: 'Contracts Manager' },
  { name: 'Hine Ngata', role: 'post-contract', jobRole: 'Contracts Manager' },
  { name: 'Callum Reid', role: 'pre-contract', jobRole: 'Estimator' },
  { name: 'Sofia Marchetti', role: 'pre-contract', jobRole: 'Estimator' },
  { name: 'Dev Patel', role: 'pre-contract', jobRole: 'Estimator' },
  { name: 'Ruth Ellery', role: 'operations', jobRole: 'Operations Manager' },
  { name: 'Marcus Vaile', role: 'bookkeeping', jobRole: 'Bookkeeper' },
]

const SUPPLIERS = [
  'Bayside Steel Supplies', 'Comet Insulation', 'Harding Fixings',
  'Pacific Membrane Co', 'Trellis Access Hire', 'Lakeside Timber',
  'Vector Plant Hire', 'Northway Fasteners',
]

const SUBBIES = [
  'M. Tuilagi Contracting', 'Dunbar Installations', 'K&R Site Services',
  'Halliwell Labour Ltd', 'Corran Trades',
]

const COST_ACCOUNTS = [
  { code: '311', type: 'Materials' },
  { code: '320', type: 'Labour' },
  { code: '321', type: 'Labour' },
  { code: '330', type: 'Materials' },
  { code: '333', type: 'Materials' },
]

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')
}

function monthsBack(n) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setMonth(d.getMonth() - n)
  return d
}

const iso = (d) => d.toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// ONE PROJECT'S FINANCIAL MODEL.
//
// Everything downstream is derived from this, so the numbers agree with each
// other. A demo where the application total does not reconcile with the
// contract value is a demo that invites exactly the question you cannot
// answer in the room.
// ---------------------------------------------------------------------------
function buildProject(r, i, opts) {
  const ageMonths = intBetween(r, 0, 13)
  const start = monthsBack(ageMonths + intBetween(r, 1, 3))
  const site = SITES[i % SITES.length]
  const jobNo = 'J' + (101 + i)

  const contractValue = Math.round(between(r, 45000, 680000) / 500) * 500
  // Margin clusters around the target with a realistic spread, and a couple of
  // projects go badly - a demo where everything is profitable is not credible
  // to anyone who has run a contract.
  const margin = Math.max(-0.08, Math.min(0.46,
    (opts.targetMargin || 0.25) + between(r, -0.14, 0.13)))

  const complete = ageMonths >= 9 || r() < 0.18
  const defects = !complete && r() < 0.15
  const status = complete ? 'CLOSED' : defects ? 'DEFECTS' : 'INPROGRESS'

  // Variations: a few per project, most instructed.
  const varCount = intBetween(r, 0, 6)
  const variations = []
  for (let v = 0; v < varCount; v++) {
    const value = Math.round(between(r, -4000, 26000) / 50) * 50
    const instructed = r() < 0.72
    variations.push({
      id: `V${String(v + 1).padStart(2, '0')}`,
      ref: `V${String(v + 1).padStart(2, '0')}`,
      description: pick(r, [
        'Additional access provision', 'Revised detail to north elevation',
        'Client-requested finish upgrade', 'Omission of secondary works',
        'Extended programme - standing time', 'Additional survey and setting out',
        'Substitution following supply delay', 'Remedial works to existing substrate',
      ]),
      value,
      instructed,
      status: instructed ? 'Instructed' : 'Submitted',
      dateRaised: iso(monthsBack(intBetween(r, 0, ageMonths + 1))),
    })
  }
  const instructedVars = variations.filter(v => v.instructed).reduce((s, v) => s + v.value, 0)
  const afaGross = contractValue + instructedVars

  // Applications, one a month since start, each claiming more than the last.
  const appCount = Math.min(14, Math.max(1, ageMonths + 1))
  const applications = []
  let cumulative = 0
  for (let a = 0; a < appCount; a++) {
    const pct = Math.min(1, ((a + 1) / (appCount + (complete ? 0 : 1))) * between(r, 0.92, 1.0))
    const gross = Math.round(afaGross * pct)
    const thisApp = gross - cumulative
    cumulative = gross
    const end = monthsBack(ageMonths - a)
    applications.push({
      seq: a + 1,
      number: a + 1,
      periodEnd: iso(end),
      valuationDate: iso(end),
      grossToDate: gross,
      thisApplication: Math.max(0, thisApp),
      status: 'sent',
      sentAt: new Date(end).getTime(),
      measuredContractSum: contractValue,
      variationsFinal: instructedVars,
    })
  }
  const appliedForLatest = cumulative
  const retentionPct = pick(r, [0.03, 0.05, 0.05, 0.05, 0.1])
  const retentionClaimed = Math.round(appliedForLatest * retentionPct)

  // Certified normally lags the application slightly.
  const certifiedGross = Math.round(appliedForLatest * between(r, 0.88, 1.0))

  // ------------------------------------------------------------------
  // ONE TIMELINE FOR COSTS AND INVOICES. THIS IS THE FIX.
  //
  // Previous versions generated costs scattered at random across the
  // project's life and invoices only from the applications - two unrelated
  // timelines. At any given valuation date the two did not correspond, so a
  // young project had all of its costs and none of its invoices and reported
  // a margin of minus two hundred per cent. The average came out at -16.9% on
  // a dataset built to average 25%.
  //
  // Now both are generated PERIOD BY PERIOD from the same loop. In every
  // month the project earns some revenue and spends (1 - margin) of it. So at
  // ANY valuation date, costs-to-date over invoiced-to-date gives the margin
  // by construction, not by coincidence.
  //
  // The last period's costs are placed in the 29th-31st window deliberately,
  // because that is what computeProjectWip counts as post-valuation.
  // ------------------------------------------------------------------
  const costLines = []
  const invoiceLines = []
  let cumulativeInvoiced = 0

  applications.forEach((a, idx) => {
    const periodRevenue = a.thisApplication
    const periodCost = Math.round(periodRevenue * (1 - margin))
    const end = new Date(a.periodEnd)

    // Costs land through the month, BEFORE the valuation date, so they pair
    // with the revenue claimed for that period.
    const n = Math.max(1, Math.min(6, Math.round(periodCost / 4000)))
    let placed = 0
    for (let c = 0; c < n; c++) {
      const acct = pick(r, COST_ACCOUNTS)
      const share = c === n - 1 ? periodCost - placed : Math.round(periodCost / n)
      placed += share
      if (share <= 0) continue
      const d = new Date(end.getFullYear(), end.getMonth(), intBetween(r, 2, 27), 12)
      costLines.push({
        date: iso(d),
        supplier: acct.type === 'Labour' ? pick(r, SUBBIES) : pick(r, SUPPLIERS),
        reference: 'INV' + intBetween(r, 10000, 99999),
        accountCode: acct.code, account: acct.code, type: acct.type,
        total: share, amount: share,
      })
    }

    // WORK CONTINUES AFTER THE VALUATION IS CUT. That is what WIP is.
    // A small extra spend in the 29th-31st window of the same month.
    const dim = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
    if (dim > 28 && !complete) {
      const acct = pick(r, COST_ACCOUNTS)
      const wipCost = Math.round(periodCost * between(r, 0.05, 0.22))
      if (wipCost > 0) {
        costLines.push({
          date: iso(new Date(end.getFullYear(), end.getMonth(), intBetween(r, 29, dim), 12)),
          supplier: acct.type === 'Labour' ? pick(r, SUBBIES) : pick(r, SUPPLIERS),
          reference: 'INV' + intBetween(r, 10000, 99999),
          accountCode: acct.code, account: acct.code, type: acct.type,
          total: wipCost, amount: wipCost,
        })
      }
    }

    // The invoice for the period.
    const due = new Date(end); due.setDate(due.getDate() + 30)
    const now = new Date()
    const pastDue = due < now
    // MOST OF THE DEBTOR BOOK IS WITHIN TERMS. Anything not yet due is
    // naturally outstanding; only about one in six older invoices is still
    // unpaid, which is what makes a quarter of the LISTED invoices overdue
    // rather than nearly all of them.
    const unpaid = !pastDue ? true : (complete ? r() < 0.05 : r() < 0.16)
    cumulativeInvoiced += periodRevenue
    invoiceLines.push({
      date: a.periodEnd,
      dueDate: iso(due),
      reference: `${jobNo} App ${a.seq}`,
      invoiceNumber: `INV-${jobNo}-${String(a.seq).padStart(2, '0')}`,
      total: periodRevenue, subTotal: periodRevenue, sales200: periodRevenue,
      amountPaid: unpaid ? 0 : periodRevenue,
      amountDue: unpaid ? periodRevenue : 0,
      due: unpaid ? periodRevenue : 0,
      status: 'AUTHORISED',
      overdue: unpaid && pastDue,
    })
  })

  const totalCosts = costLines.reduce((s, l) => s + l.amount, 0)

  const labourSpend = costLines.filter(l => ['320', '321'].includes(l.accountCode)).reduce((s, l) => s + l.amount, 0)
  const materialsSpend = costLines.reduce((s, l) => s + l.amount, 0) - labourSpend
  const totalInvoiced = invoiceLines.reduce((s, l) => s + l.total, 0)
  const allPaid = invoiceLines.reduce((s, l) => s + l.amountPaid, 0)
  const amountOutstanding = invoiceLines.reduce((s, l) => s + l.amountDue, 0)

  // Budgets sit a little under the actual spend split, so a couple of jobs
  // show as over budget - which is what the Commercial dashboard's
  // "Over Budget" tiles exist to surface.
  const labourShare = between(r, 0.3, 0.5)
  const labourBudget = Math.round(contractValue * (1 - margin) * labourShare * between(r, 0.92, 1.12))
  const materialsBudget = Math.round(contractValue * (1 - margin) * (1 - labourShare) * between(r, 0.92, 1.12))

  return {
    i, jobNo, site, start, ageMonths, status, complete, defects,
    labourBudget, materialsBudget,
    customer: CLIENTS[i % CLIENTS.length],
    address: `${intBetween(r, 1, 240)} ${pick(r, ['Vogel', 'Selwyn', 'Quarry', 'Colombo', 'Rosebank', 'Beaumont'])} Street, ${pick(r, SUBURBS)}`,
    contractValue, margin, variations, instructedVars, afaGross,
    applications, appliedForLatest, certifiedGross, retentionPct, retentionClaimed,
    totalCosts, costLines, invoiceLines, totalInvoiced, allPaid, amountOutstanding,
    labourSpend, materialsSpend,
    cm: pick(r, STAFF.filter(s => s.jobRole === 'Contracts Manager')).name,
    estimator: pick(r, STAFF.filter(s => s.jobRole === 'Estimator')).name,
    qs: STAFF.find(s => s.jobRole === 'Commercial Manager').name,
    dm: STAFF.find(s => s.jobRole === 'Operations Manager').name,
    om: STAFF.find(s => s.jobRole === 'Operations Manager').name,
    contact: pick(r, CONTACTS),
  }
}

// THE SHADOWED SHAPE. See the header. One place, on purpose.
function projectCacheRow(p) {
  const xeroId = `demo-${p.jobNo}`
  return {
    xeroId,
    trackingOptionId: xeroId,
    trackingCategoryId: 'demo-category',
    jobNo: p.jobNo,
    name: `${p.jobNo}-${p.site}`,
    projectName: `${p.jobNo}-${p.site}`,
    inXero: true,
    lastSeenInXero: iso(new Date()),
    status: p.status,
    stageSource: 'retention',
    customer: p.customer,
    pcType: p.complete ? 'Practical Completion' : '',
    qsEmailSetting: '',
    contractsManager: p.cm,
    cmResolved: true,
    estimatorResolved: true,
    qsResolved: true,
    estimator: p.estimator,
    qsName: p.qs,
    orderRef: `PO-${intBetween(rng(p.i + 7), 1000, 9999)}`,
    customerContacts: [],
    qsEmail: '',
    customerEmail: '',
    customerContact: '',
    people: {},
    highRisk: false,
    pcDate: p.complete ? iso(monthsBack(Math.max(0, p.ageMonths - 8))) : '',
    defectsDate: p.complete ? iso(monthsBack(Math.max(0, p.ageMonths - 20))) : '',
    completionDate: p.complete ? iso(monthsBack(Math.max(0, p.ageMonths - 8))) : '',
    retentionComments: '',
    variations: p.variations,
    applicationDay: 25,
    paymentDay: 20,
    dateOverrides: {},
    valuationDay: 28,
    // `afa` is what the Commercial table reads. afaGross is used elsewhere.
    // Both are set: one rule, two names already existed in the codebase and
    // this is not the place to start unpicking that.
    afa: p.afaGross,
    afaGross: p.afaGross,
    afaShown: p.afaGross,
    // Without these the "Project details incomplete" banner lists every
    // project. The full list the banner checks is: applicationDay,
    // valuationDay, paymentDay, contractValue, labourBudget,
    // materialsBudget, retentionPct, pcDate (or pcDateTBC), defectsDate (or
    // defectsDateTBC).
    contractValue: p.contractValue,
    labourBudget: p.labourBudget,
    materialsBudget: p.materialsBudget,
    pcDateTBC: !p.complete,
    defectsDateTBC: !p.complete,
    afaUsedStamp: false,
    afaStamped: null,
    afaStampedFromApp: false,
    afaStampedAppSeq: null,
    afaFromApp: true,
    vat: 0,
    paid: p.allPaid,
    retention612Allocated: p.retentionClaimed,
    ret612Detail: [],
    ret612From: 'demo',
    retentionPct: p.retentionPct,
    hasContractedRates: false,
    contractedRatesLocked: false,
    retStatus: p.complete ? 'complete' : p.defects ? 'defects' : 'live',
    detailsMissing: false,
    completeV6: true,
    appliedForLatest: p.appliedForLatest,
    certifiedGross: p.certifiedGross,
    certifiedSetOnApp: true,
    certifiedFromApp: true,
    appliedForDetail: [],
    mcdBasis: 'contract',
    finalAccountFromApplication: p.complete,
    afaStampStale: false,
    latestAppEnd: p.applications.length ? p.applications[p.applications.length - 1].periodEnd : '',
    retentionClaimed: p.retentionClaimed,
    appRelease1: null,
    appRelease2: null,
    records: p.applications.length,
    latestSent: p.applications.length,
    sentSum: p.appliedForLatest,
    instructedVarsTotal: p.instructedVars,
    // THE BUDGET TRACKER READS THESE STRAIGHT OFF THE ROW.
    //
    // pages/commercial.js renders p.grossInvoiced, p.retentionOutstanding,
    // p.remainingToClaim, p.labourSpend and p.materialsSpend directly. The
    // derived calcAtValDate() path only runs in EOM Report mode, so in the
    // default Budget Tracker view these five fields ARE the columns - and
    // without them every money cell showed a dash while Total Spend, which
    // does come from the row, showed correctly. That inconsistency was the
    // clue.
    grossInvoiced: p.totalInvoiced,
    invoicedToDate: p.totalInvoiced,
    retentionOutstanding: p.retentionClaimed,
    remainingToClaim: Math.max(0, p.afaGross - p.totalInvoiced),
    labourSpend: p.labourSpend,
    materialsSpend: p.materialsSpend,
    totalBudget: Math.round(p.contractValue * (1 - (p.margin + 0.02))),
    totalCosts: p.totalCosts,
    totalInvoiced: p.totalInvoiced,
    allPaid: p.allPaid,
    amountOutstanding: p.amountOutstanding,
    _costLines: p.costLines,
    _invoiceLines: p.invoiceLines,

    // ------------------------------------------------------------------
    // THE CACHE-VALIDITY MARKERS. WITHOUT THESE THE DEMO SHOWS NO PROJECTS.
    //
    // pages/api/dashboard.js reads dashboard:cache first, but only if the
    // first row carries EVERY one of these fields. Each was added when a
    // record shape changed, to stop an old snapshot serving stale values -
    // a sensible guard, and the reason the first version of this seeder
    // produced 49 keys and an empty portal: the guard rejected the rows,
    // the code fell through to Xero, and Xero 401'd.
    //
    // Extracted from the condition programmatically rather than copied by
    // eye. IF A NEW MARKER IS ADDED TO THAT CONDITION, IT MUST BE ADDED
    // HERE TOO, or the demo silently empties.
    // ------------------------------------------------------------------
    accountBaseNetOfMcd_v1: true,
    afaAsIssued_v1: true,
    afaDecomp_v1: true,
    afaLiveNotStamp_v1: true,
    afaOneRule_v1: true,
    afaShown_v1: true,
    appliedForSent_v1: true,
    appsBothRecords_v1: true,
    appsIdRecordWins_v1: true,
    certifiedPrevCert_v2: true,
    certifiedTypedBox_v1: true,
    dashFields_v1: true,
    finalAccountMcdPlacement_v1: true,
    ret612Match_v1: true,
    varsIdWins_v1: true,
    // Must merely EXIST, not be true.
    retention612Released: 0,
    wipAdjustments: [],
  }
}

// The real stage ids from pages/crm.js. A deal with any other value sits in no
// column at all.
const DEAL_STAGES = [
  'stage_project_in', 'stage_1st_contact', 'stage_calls_x3', 'stage_in_abeyance',
  'stage_tbf', 'stage_mc_unsec_np', 'stage_info_pending', 'stage_received',
  'stage_1', 'stage_2', 'stage_review', 'stage_mc_unsecured',
  'stage_mc_secured', 'stage_negotiating',
]

const CONTACTS = [
  'Jenna Aldridge', 'Michael Kelleher', 'Sione Tuwhare', 'Rebecca Dunne',
  'Adam Beckett', 'Patrick Finnegan', 'Ngaire Hollis', 'Damien Oyelaran',
]

// ONE ADDRESS FOR EVERYTHING, SO NOTIFICATIONS CAN BE DEMONSTRATED.
// Every generated customer, contact and portal user uses this, so any email
// the demo sends arrives somewhere you can open it. It also means the demo
// physically cannot email a real person.
const DEMO_EMAIL = 'james@constructionliberation.com'

function buildDeals(r, count) {
  const deals = []
  for (let i = 0; i < count; i++) {
    const stage = pick(r, DEAL_STAGES)
    const value = Math.round(between(r, 18000, 900000) / 500) * 500
    const org = pick(r, CLIENTS)
    const est = pick(r, STAFF.filter(s => s.jobRole === 'Estimator')).name
    // EVERY ATTRIBUTE LIVES IN `fields`. pages/crm.js reads deal.fields.organization,
    // deal.fields.value and so on - 51 references to d.fields in that file. A deal
    // with those values at the top level renders as an empty row, which is why the
    // CRM looked unpopulated after the first seed.
    //
    // stageId, not stage, and it must be one of the ids in STAGES.
    const contact = pick(r, CONTACTS)
    deals.push({
      id: `d${1000 + i}`,
      title: `${pick(r, SITES)} - ${pick(r, ['new build', 'refurbishment', 'extension', 'remedial works'])}`,
      stageId: stage,
      status: stage === 'stage_mc_secured' ? 'won' : (r() < 0.12 ? 'lost' : 'open'),
      addedAt: monthsBack(intBetween(r, 0, 13)).getTime(),
      history: [],
      // AN ACTIVITY ON EVERY DEAL.
      //
      // 5% overdue, 5% due today, the rest spread into the future - so the
      // "needs attention" states have something in them without the pipeline
      // looking neglected. A CRM demo where nothing is due tells you nothing
      // about what the CRM is for.
      activities: [(() => {
        const roll = r()
        const d = new Date()
        if (roll < 0.05) d.setDate(d.getDate() - intBetween(r, 1, 21))
        else if (roll < 0.10) { /* today */ }
        else d.setDate(d.getDate() + intBetween(r, 2, 45))
        return {
          id: `act-${i}`,
          type: pick(r, ['Call', 'Meeting', 'Email', 'Site visit', 'Follow up']),
          subject: pick(r, [
            'Chase for tender feedback', 'Confirm site access', 'Issue revised price',
            'Pre-qualification paperwork', 'Review scope changes', 'Programme discussion',
          ]),
          dueDate: iso(d),
          done: false,
          assignedTo: est,
        }
      })()],
      notes: [],
      fields: {
        organization: org,
        contact_person: contact,
        contact_email: DEMO_EMAIL,
        contact_phone: '02' + intBetween(r, 1000000, 9999999),
        contact_job_role: pick(r, ['Commercial Manager', 'Project Manager', 'Director', 'Buyer']),
        org_address: `${intBetween(r, 1, 200)} ${pick(r, ['Victoria', 'Queen', 'Durham', 'Manchester'])} Street, ${pick(r, SUBURBS)}`,
        org_phone: '0' + intBetween(r, 3, 9) + intBetween(r, 1000000, 9999999),
        org_email: DEMO_EMAIL,
        org_website: `www.${slug(org).replace(/\./g, '')}.co.nz`,
        value,
        site_location: pick(r, SUBURBS),
        region: pick(r, ['Auckland', 'Wellington', 'Canterbury', 'Waikato', 'Bay of Plenty']),
        size_m2: intBetween(r, 200, 9000),
        credit_score: intBetween(r, 32, 96),
        credit_limit: Math.round(between(r, 25000, 500000) / 1000) * 1000,
        estimator_responsible: est,
        project_type: pick(r, ['New build', 'Refurbishment', 'Extension', 'Remedial']),
        lead_source: pick(r, ['Referral', 'Tender list', 'Repeat client', 'Website', 'Cold approach']),
        sales_person: est,
        project_start_date: iso(monthsBack(-intBetween(r, 0, 5))),
        scope_of_works: 'Supply and installation to the specification issued.',
        general_info: '',
        supply_chain_approved: r() < 0.7 ? 'Yes' : 'No',
      },
    })
  }
  return deals
}

function buildEmails(r, deals) {
  const unallocated = []
  const byDeal = {}
  for (const d of deals.slice(0, Math.min(14, deals.length))) {
    const n = intBetween(r, 1, 4)
    byDeal[d.id] = []
    for (let i = 0; i < n; i++) {
      byDeal[d.id].push({
        id: `em-${d.id}-${i}`,
        subject: pick(r, ['Tender documents', 'Revised drawings issued', 'Site visit - availability', 'Query on specification', 'Programme update']),
        from: `${slug(d.person)}@${slug(d.organization).replace(/\./g, '')}.co.nz`,
        to: DEMO_EMAIL,
        receivedAt: monthsBack(intBetween(r, 0, 6)).getTime(),
        preview: 'Please find attached the latest information for your review.',
      })
    }
  }
  for (let i = 0; i < 9; i++) {
    const org = pick(r, CLIENTS)
    unallocated.push({
      id: `em-un-${i}`,
      subject: pick(r, ['RFQ - new enquiry', 'Drawing revision C', 'Payment query', 'Site access arrangements', 'Request for quotation']),
      from: `enquiries@${slug(org).replace(/\./g, '')}.co.nz`,
      to: DEMO_EMAIL,
      receivedAt: monthsBack(intBetween(r, 0, 2)).getTime(),
      preview: 'We would be grateful if you could review and come back to us.',
      mailbox: DEMO_EMAIL,
    })
  }
  return { unallocated, byDeal }
}

// ---------------------------------------------------------------------------
// THE WHOLE DATASET. Returns a plain map of key -> value. The caller writes it.
// Nothing here touches the database, so it can be inspected and tested without
// a tenant.
// ---------------------------------------------------------------------------
export function generateDemo(opts = {}) {
  const projectCount = Math.max(1, Math.min(60, opts.projects || 30))
  // FOUR TIMES THE PIPELINE. 48 deals across 14 stages left most columns with
  // one or two cards in them, which reads as a dead pipeline rather than a
  // busy one.
  const dealCount = Math.max(0, Math.min(400, opts.deals || 190))
  const r = rng(opts.seed || 20260920)

  const projects = []
  for (let i = 0; i < projectCount; i++) projects.push(buildProject(r, i, opts))

  const team = STAFF.map((s, i) => ({
    id: `tm${i + 1}`,
    name: s.name,
    email: DEMO_EMAIL,
    jobRole: s.jobRole,
    active: true,
  }))

  const users = STAFF.map((s, i) => ({
    id: `pu_demo_${i + 1}`,
    name: s.name,
    email: DEMO_EMAIL,
    role: s.role,
    active: true,
    createdAt: Date.now(),
  }))

  // THE OPS SHAPE IS NESTED. pages/api/ops-projects.js reads p.data.projectName,
  // p.data.contractsManager and so on - a flat object produces a project list
  // with every column blank, which is what the first version of this did.
  const opsProjects = projects.map(p => ({
    projectNo: p.jobNo,
    status: p.complete ? 'complete' : 'active',
    manual: false,
    createdAt: p.start.getTime(),
    updatedAt: Date.now(),
    data: {
      projectName: p.site,
      customerCompany: p.customer,
      projectAddress: p.address,
      siteLocation: p.address,
      contractsManager: p.cm,
      estimator: p.estimator,
      quantitySurveyor: p.qs,
      designManager: p.dm,
      operationsManager: p.om,
      contractValue: p.contractValue,
      startDate: iso(p.start),
      customerEmail: DEMO_EMAIL,
      customerContact: p.contact,
    },
  }))

  // SITE APP OPERATIVES, WITH TRAINING RECORDS.
  //
  // The H&S matrix and the RAMS matrix both read ops:users. Without them both
  // pages are empty grids. Expiries are deliberately mixed - some lapsed, some
  // inside 60 days, most current - so the matrix shows red, amber and green
  // rather than a wall of one colour.
  const OPERATIVES = [
    'Wiremu Paitai', 'Josh Fenwick', 'Tane Rangi', 'Dylan Hobbs', 'Sefo Leota',
    'Aaron Kerr', 'Manu Toeava', 'Brett Sullivan', 'Rawiri Kahu', 'Jacob Neale',
    'Peter Vasquez', 'Nikau Waaka', 'Craig Amberley', 'Tevita Fifita', 'Owen Marsh',
  ]
  const TRAINING = ['Site Safe Passport', 'Working at Height', 'First Aid', 'Hot Works', 'Elevated Work Platform', 'Confined Space']
  const opsUsers = OPERATIVES.map((nm, i) => {
    const training = {}
    for (const t of TRAINING) {
      if (r() < 0.22) continue          // not held at all
      const d = new Date()
      const roll = r()
      if (roll < 0.12) d.setDate(d.getDate() - intBetween(r, 5, 200))      // expired
      else if (roll < 0.3) d.setDate(d.getDate() + intBetween(r, 5, 55))   // expiring soon
      else d.setDate(d.getDate() + intBetween(r, 90, 900))                 // current
      training[t] = { expires: iso(d), issued: iso(monthsBack(intBetween(r, 6, 30))) }
    }
    return {
      id: `op${100 + i}`,
      opId: `op${100 + i}`,
      name: nm,
      email: DEMO_EMAIL,
      phone: '02' + intBetween(r, 1000000, 9999999),
      role: i < 3 ? 'supervisor' : 'operative',
      company: i < 11 ? null : pick(r, SUBBIES),
      active: true,
      accessLevel: i < 3 ? 'supervisor' : 'operative',
      projectAccess: [],
      training,
    }
  })

  const out = {}
  out['ops:users'] = opsUsers
  out['ops:team'] = team
  out['ops:projects'] = opsProjects
  out['dashboard:cache'] = projects.map(projectCacheRow)

  for (const p of projects) {
    const xeroId = `demo-${p.jobNo}`
    out[`project:${xeroId}`] = {
      jobNo: p.jobNo,
      customerName: p.customer,
      customerEmail: DEMO_EMAIL,
      customerContact: p.contact,
      qsEmail: DEMO_EMAIL,
      contractValue: p.contractValue,
      labourBudget: p.labourBudget,
      materialsBudget: p.materialsBudget,
      pcDateTBC: !p.complete,
      defectsDateTBC: !p.complete,
      retentionPct: p.retentionPct,
      variations: p.variations,
      applications: p.applications,
      contractsManager: p.cm,
      estimator: p.estimator,
      qsName: p.qs,
      valuationDay: 28,
      applicationDay: 25,
      paymentDay: 20,
      projectAddress: p.address,
      peopleOverride: {},
    }
  }

  // RETENTION ENTRIES, WITH RELEASE DATES.
  //
  // The tracker warned "30 retentions with no release date - these never show
  // as overdue and never reach the Cash Flow". Half the first releases are
  // deliberately in the past and unpaid, so the overdue state and the cash
  // flow schedule both have something in them.
  out['retention:entries'] = projects.map(p => {
    const pc = p.complete ? monthsBack(Math.max(0, p.ageMonths - 8)) : monthsBack(-intBetween(r, 1, 7))
    const r1 = new Date(pc); r1.setMonth(r1.getMonth() + 1)
    const r2 = new Date(pc); r2.setMonth(r2.getMonth() + 12)
    const half = Math.round(p.retentionClaimed / 2)
    return {
      id: `ret-${p.jobNo}`,
      // THE MERGE KEY IS xeroId. Without it the entry cannot attach to the
      // project row and both appear - 60 rows for 30 projects.
      xeroId: `demo-${p.jobNo}`,
      ourRef: p.jobNo,
      customerName: p.customer,
      // MUST MATCH THE PROJECT ROW EXACTLY OR IT APPEARS AS A SECOND ROW.
      // p.site alone produced 60 rows for 30 projects.
      projectName: `${p.jobNo}-${p.site}`,
      projectValue: p.contractValue,
      finalAccount: p.afaGross,
      retentionPct: p.retentionPct * 100,
      completionDate: iso(pc),
      pcType: 'Practical Completion',
      qsName: p.qs,
      qsEmail: DEMO_EMAIL,
      certified: p.certifiedGross,
      release1Value: half,
      release1Date: iso(r1),
      release1Received: p.complete && r() < 0.5,
      release2Value: p.retentionClaimed - half,
      release2Date: iso(r2),
      release2Received: false,
      comments: '',
      trackerOnly: false,
    }
  })

  const deals = buildDeals(r, dealCount)
  out['crm:deals'] = deals
  const emails = buildEmails(r, deals)
  out['crm:emails:unallocated'] = emails.unallocated
  for (const [dealId, list] of Object.entries(emails.byDeal)) out[`crm:emails:${dealId}`] = list

  return {
    keys: out,
    summary: {
      projects: projects.length,
      live: projects.filter(p => !p.complete).length,
      complete: projects.filter(p => p.complete).length,
      deals: deals.length,
      unallocatedEmails: emails.unallocated.length,
      contractValueTotal: projects.reduce((s, p) => s + p.contractValue, 0),
      averageMargin: Math.round((projects.reduce((s, p) => s + p.margin, 0) / projects.length) * 1000) / 10,
      teamMembers: team.length,
      portalUsers: users.length,
    },
    users,
  }
}

// The keys this writes, so the wipe can remove exactly what was added and
// nothing else. Prefixes are matched, not just exact names.
export const DEMO_KEY_PREFIXES = [
  'dashboard:cache', 'ops:team', 'ops:projects', 'project:demo-',
  'crm:deals', 'crm:emails:', 'retention:entries', 'ops:users',
]
