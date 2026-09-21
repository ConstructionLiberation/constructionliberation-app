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
  // A SALES role, distinct from the estimators. sales_person on a deal used to
  // be set to the estimator, so the scorecard's estimator and sales lists were
  // the same three names and the sales tab duplicated an estimator.
  { name: 'Marama Tait', role: 'pre-contract', jobRole: 'Sales' },
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
  // EVERY PROJECT HAS HISTORY. A job that started this month has no
  // application before the valuation date, so it shows zero invoiced, zero
  // spend and an empty row - which reads as missing data rather than as a new
  // job. Minimum three months.
  const ageMonths = intBetween(r, 3, 15)
  const start = monthsBack(ageMonths + intBetween(r, 1, 3))
  const site = SITES[i % SITES.length]
  const jobNo = 'J' + (101 + i)

  const contractValue = Math.round(between(r, 45000, 680000) / 500) * 500
  // Margin clusters around the target with a realistic spread, and a couple of
  // projects go badly - a demo where everything is profitable is not credible
  // to anyone who has run a contract.
  const margin = Math.max(-0.08, Math.min(0.46,
    (opts.targetMargin || 0.25) + between(r, -0.14, 0.13)))

  // The first two are always LIVE: they are the WIP drill-down examples and a
  // completed project has no work in progress by definition.
  const complete = i < 2 ? false : (ageMonths >= 9 || r() < 0.18)
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
  // What the customer's ledger says was deducted. Three quarters agree with
  // our figure; the rest are out, which is the whole point of the column.
  const ret612Agrees = r() < 0.75
  const ret612Deducted = ret612Agrees
    ? retentionClaimed
    // Deliberately well clear of the real figure. A 2% difference rounds to
    // the same number often enough that the mismatch count drifted to 2 in 30
    // instead of the intended 1 in 4.
    : Math.round(retentionClaimed * (r() < 0.5 ? between(r, 0.62, 0.88) : between(r, 1.12, 1.35)))
  const ret612Released = complete ? Math.round(retentionClaimed * between(r, 0.3, 0.6)) : 0
  const ret612Lines = [
    { date: iso(monthsBack(2)), reference: 'RET-' + jobNo, amount: ret612Deducted, type: 'Deducted' },
  ]
  if (ret612Released > 0) {
    ret612Lines.push({ date: iso(monthsBack(1)), reference: 'REL-' + jobNo, amount: -ret612Released, type: 'Released' })
  }

  // Certified normally lags the application slightly.
  // THREE IN FOUR AGREE, ONE IN FOUR DOES NOT.
  //
  // The retention tracker flags a row where the Final Account does not
  // reconcile with what was invoiced. Previously certified ALWAYS differed
  // from invoiced by a random 0-12%, so every row carried the warning and the
  // flag meant nothing. A demo needs the flag to appear on the few rows that
  // deserve it and stay clear on the rest - that is what shows the feature
  // working.
  const certifiedMatches = r() < 0.75
  const certifiedGross = certifiedMatches
    ? appliedForLatest
    : Math.round(appliedForLatest * between(r, 0.82, 0.96))

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
    // ONLY ON THE LATEST PERIOD.
    //
    // Adding a post-valuation spike to EVERY month put uninvoiced cost into
    // every closed month as well - those dates fall before the current
    // valuation date, so they counted as costs-to-date with no matching
    // revenue and dragged the portfolio margin from 25% to 19%. Work in
    // progress is, by definition, the work not yet invoiced: only the current
    // period has any.
    const dim = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
    // The last TWO periods, so the most recently CLOSED month has WIP in it as
    // well as the current one - otherwise the WIP page is empty for every
    // month a user would actually select.
    //
    // This does dent the measured margin slightly, and that is correct rather
    // than a compromise: WIP is by definition cost incurred and not yet
    // invoiced, so (invoiced - costs) / invoiced always reads a little under
    // the true margin while work is in progress. Kept small for that reason.
    if (dim > 28 && !complete && idx >= applications.length - 2) {
      const acct = pick(r, COST_ACCOUNTS)
      const wipCost = Math.round(periodCost * between(r, 0.05, 0.13))
      // TWO PROJECTS GET A REAL LIST TO DRILL INTO.
      //
      // One post-valuation line per project shows a WIP figure but nothing to
      // examine. Project index 0 gets FIVE lines and index 1 gets TEN, so the
      // WIP drill-down has something worth opening - different suppliers,
      // different account codes, different dates within the window.
      const lines = i === 0 ? 5 : i === 1 ? 10 : 1
      if (wipCost > 0) {
        let placedWip = 0
        for (let w = 0; w < lines; w++) {
          const a2 = pick(r, COST_ACCOUNTS)
          const part = w === lines - 1 ? wipCost - placedWip : Math.round(wipCost / lines)
          placedWip += part
          if (part <= 0) continue
          costLines.push({
            date: iso(new Date(end.getFullYear(), end.getMonth(), intBetween(r, 29, dim), 12)),
            supplier: a2.type === 'Labour' ? pick(r, SUBBIES) : pick(r, SUPPLIERS),
            reference: 'INV' + intBetween(r, 10000, 99999),
            accountCode: a2.code, account: a2.code, type: a2.type,
            total: part, amount: part,
          })
        }
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

  // CREDIT NOTES. About one project in five has one - a contra charge, a
  // measurement correction, a rejected item. They are invoice lines with a
  // negative value and creditNote: true, which is how the WIP page finds them.
  if (invoiceLines.length > 1 && r() < 0.22) {
    const src = invoiceLines[Math.max(0, invoiceLines.length - 2)]
    const amt = -Math.round(src.total * between(r, 0.02, 0.12))
    invoiceLines.push({
      date: iso(new Date(new Date(src.date).getTime() + 12 * 86400000)),
      dueDate: src.dueDate,
      reference: `${jobNo} CN`,
      invoiceNumber: `CN-${jobNo}-01`,
      appliedToInvoice: src.invoiceNumber,
      contact: CLIENTS[i % CLIENTS.length],
      total: amt, subTotal: amt, sales200: amt,
      amountPaid: amt, amountDue: 0, due: 0,
      status: 'AUTHORISED',
      creditNote: true,
      reason: pick(r, ['Contra charge - welfare', 'Measurement correction', 'Item removed from scope', 'Damaged goods returned']),
    })
  }

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
    certifiedMatches,
    labourSpend, materialsSpend,
    ret612Deducted, ret612Released, ret612Lines, ret612Agrees,
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
    // THE 612 COLUMNS - DEDUCTED, RELEASED, AND WHETHER THEY RECONCILE.
    //
    // 612 is the retention control account. The tracker compares what the
    // customer has deducted against what we say is owed, and flags the
    // difference. Empty columns show none of that, so: most projects
    // reconcile, a quarter are out by a few hundred to a few thousand, and
    // some have had a first release paid.
    retention612Allocated: p.ret612Deducted,
    retention612Deducted: p.ret612Deducted,
    retention612Released: p.ret612Released,
    retention612ReleasedPaid: p.ret612Released,
    ret612Lines: p.ret612Lines,
    ret612Detail: p.ret612Lines,
    ret612From: 'Xero 612',
    retentionPct: p.retentionPct,
    hasContractedRates: false,
    contractedRatesLocked: false,
    retStatus: p.complete ? 'complete' : p.defects ? 'defects' : 'live',
    detailsMissing: false,
    completeV6: true,
    appliedForLatest: p.appliedForLatest,
    // Matched against the INVOICED total, not the applied-for total. Credit
    // notes reduce what was invoiced, so comparing to applied-for meant every
    // project carrying a credit note showed as unreconciled - the flag fired
    // on 50% of rows instead of the 25% intended.
    certifiedGross: p.certifiedMatches ? p.totalInvoiced : p.certifiedGross,
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
    // Must merely EXIST, not be true. retention612Released is set above with a
    // real figure - it used to be repeated here as 0, and a later key wins in
    // an object literal, so the column was being zeroed after being filled.
    // esbuild's duplicate-key warning caught it.
    wipAdjustments: [],
  }
}

// The real stage ids from pages/crm.js. A deal with any other value sits in no
// column at all.
// Stage LABELS, keyed by id. lib/crmValueChanges.js matches PRICED_STAGES
// against the label written into a deal's history, not against the id, so the
// two have to agree exactly: 'MC Unsecured' is a priced stage and
// 'MC Unsecured Not Priced' is deliberately not.
const STAGE_LABEL = {
  stage_project_in: 'Project In', stage_1st_contact: '1st Contact',
  stage_calls_x3: 'Calls x 3', stage_in_abeyance: 'In Abeyance',
  stage_tbf: 'TBF', stage_mc_unsec_np: 'MC Unsecured Not Priced',
  stage_info_pending: 'info Pending', stage_received: 'Received',
  stage_1: 'Stage 1', stage_2: 'Stage 2', stage_review: 'Review',
  stage_mc_unsecured: 'MC Unsecured', stage_variations: 'Variations',
  stage_mc_secured: 'MC Secured', stage_negotiating: 'Negotiating',
}

// THE HISTORY A DEAL WOULD REALLY HAVE.
//
// Walked forward from the day it was created to the stage it sits in now, so
// "the value at the time" is right for each stage entry - which is what
// deriveValueChanges() relies on when it decides whether money has already
// been counted.
//
// A price is rarely right first time, so most deals get a value revision
// partway through. That is what puts anything at all into "total value of
// work priced".
function dealHistory(r, i, finalStage, finalValue, addedTs) {
  const idx = DEAL_STAGES.indexOf(finalStage)
  if (idx < 0) return []
  const out = []
  const span = Date.now() - addedTs
  // Opening value: the deal is usually priced a little differently to where it
  // ends up. Between 80% and 115% of the final figure, rounded like a real one.
  const opening = Math.round((finalValue * between(r, 0.8, 1.15)) / 500) * 500

  out.push({
    id: `h-${i}-0`, type: 'value', ts: new Date(addedTs).toISOString(),
    text: `Value set: ${opening}`, oldValue: 0, newValue: opening,
  })

  let current = opening
  // Step through the stages it passed on the way, oldest first.
  for (let k = 1; k <= idx; k++) {
    const ts = new Date(addedTs + Math.round(span * (k / (idx + 1)))).toISOString()
    // A repricing on roughly a third of the steps, before entering the stage.
    if (r() < 0.33) {
      const next = Math.round((current * between(r, 0.9, 1.2)) / 500) * 500
      if (next !== current) {
        out.push({
          id: `h-${i}-${k}v`, type: 'value', ts,
          text: `Value: ${current} -> ${next}`, oldValue: current, newValue: next,
        })
        current = next
      }
    }
    out.push({
      id: `h-${i}-${k}s`, type: 'stage', ts,
      stageFrom: STAGE_LABEL[DEAL_STAGES[k - 1]] || '',
      stageTo: STAGE_LABEL[DEAL_STAGES[k]] || '',
      text: `Stage: ${STAGE_LABEL[DEAL_STAGES[k - 1]]} -> ${STAGE_LABEL[DEAL_STAGES[k]]}`,
      value: current,
    })
  }

  // THE HISTORY MUST END WHERE THE DEAL IS NOW.
  //
  // Without this the walk drifts - a deal card reading $250,000 with a
  // history whose last entry says 185,500. Nobody would query the scorecard
  // arithmetic, but anyone opening a deal would see the two disagree.
  if (current !== finalValue) {
    out.push({
      id: `h-${i}-z`, type: 'value',
      ts: new Date(addedTs + Math.round(span * 0.97)).toISOString(),
      text: `Value: ${current} -> ${finalValue}`,
      oldValue: current, newValue: finalValue,
    })
  }
  return out
}

// WHY A JOB WAS LOST. Straight from the lost_reason options in
// lib/crmFieldSchema.js - not invented, so the dropdown on the deal offers
// exactly these and the Lost Reasons chart has real categories instead of
// one bar reading "No Reason Given".
//
// Weighted the way a roofing pipeline actually loses work: price first,
// then the package already being let, then the long tail.
const LOST_REASONS = [
  'Price', 'Price', 'Price', 'Price',
  'Roofing package already let', 'Roofing package already let', 'Roofing package already let',
  'Unable to make contact', 'Unable to make contact',
  'Package Contractor', 'Project Shelved', 'Alternative spec',
  'Gone with preferred, approved suppy chain', "Main Contractor didn't secure",
  'No Time to Price', 'Lead Time', 'No Feedback Given',
]

const DEAL_STAGES = [
  'stage_project_in', 'stage_1st_contact', 'stage_calls_x3', 'stage_in_abeyance',
  'stage_tbf', 'stage_mc_unsec_np', 'stage_info_pending', 'stage_received',
  'stage_1', 'stage_2', 'stage_review', 'stage_mc_unsecured',
  'stage_mc_secured', 'stage_negotiating',
]

const OPERATIVES_FOR_WAGES = [
  'W Paitai', 'J Fenwick', 'T Rangi', 'D Hobbs', 'S Leota', 'A Kerr', 'M Toeava',
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
    const salesPerson = pick(r, STAFF.filter(s => s.jobRole === 'Sales')).name
    // EVERY ATTRIBUTE LIVES IN `fields`. pages/crm.js reads deal.fields.organization,
    // deal.fields.value and so on - 51 references to d.fields in that file. A deal
    // with those values at the top level renders as an empty row, which is why the
    // CRM looked unpopulated after the first seed.
    //
    // stageId, not stage, and it must be one of the ids in STAGES.
    const contact = pick(r, CONTACTS)
    const addedTs = monthsBack(intBetween(r, 0, 13)).getTime()
    const status = stage === 'stage_mc_secured' ? 'won' : (r() < 0.12 ? 'lost' : 'open')
    deals.push({
      id: `d${1000 + i}`,
      title: `${pick(r, SITES)} - ${pick(r, ['new build', 'refurbishment', 'extension', 'remedial works'])}`,
      stageId: stage,
      status,
      addedAt: addedTs,
      // DEALS RESEARCHED reads these two TOP-LEVEL fields, not fields.*:
      //   deals.filter(d => d.everIn1stContact && d.firstContactDate ...)
      // in pages/scorecard-crm.js, which is also what the Sales Dashboard
      // uses so the two cannot disagree. Nothing set them, so the metric was
      // zero in every month.
      //
      // True for anything that got past Project In, dated the day it moved -
      // which is the same timestamp the history records for that step.
      everIn1stContact: DEAL_STAGES.indexOf(stage) >= 1,
      firstContactDate: DEAL_STAGES.indexOf(stage) >= 1
        ? new Date(addedTs + Math.round((Date.now() - addedTs) / (DEAL_STAGES.indexOf(stage) + 1))).toISOString().split('T')[0]
        : null,
      // A DEAL WITH NO HISTORY PRICES NOTHING.
      //
      // history was []. lib/crmValueChanges.js DERIVES every value-change
      // record from it rather than storing them - so with an empty history
      // the Sales Dashboard had nothing at all, and three scorecard metrics
      // (total value priced, value priced to existing customers, projects
      // priced over 200k) were blank on every estimator.
      //
      // One empty array, four empty screens. Nothing else had to be seeded.
      //
      // Two event types are read, and only these fields off them:
      //   { type:'value', ts, oldValue, newValue, text }
      //   { type:'stage', ts, stageFrom, stageTo, text, value }
      // The numbers are given outright rather than left to be parsed out of
      // the text - parseMoneyPair() looks for a POUND sign, which an NZ
      // tenant never writes.
      history: dealHistory(r, i, stage, value, addedTs),
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
        // THE SHAPE THE CRM ACTUALLY READS.
        //
        // This wrote dueDate / subject / assignedTo. pages/crm.js reads
        // a.due (13 places), a.text (12) and a.assignee (12). So every
        // seeded activity had no due date, no description and nobody
        // assigned - the pipeline traffic light stayed grey on all 190
        // deals, and opening one showed an activity that did not look real.
        //
        // Copied from addActivity() in pages/crm.js, which is what the app
        // itself writes when a user adds one:
        //   { id, text, due, done: false, assignee, author }
        // Guessing the names from the concept is what produced the old set.
        return {
          id: `act-${i}`,
          type: pick(r, ['Call', 'Meeting', 'Email', 'Site visit', 'Follow up']),
          text: pick(r, [
            'Chase for tender feedback', 'Confirm site access', 'Issue revised price',
            'Pre-qualification paperwork', 'Review scope changes', 'Programme discussion',
          ]),
          due: iso(d),
          done: false,
          assignee: est,
          author: est,
        }
      })()],
      notes: [],
      fields: {
        // WHEN THE DEAL WAS CREATED. Deals Researched depends on this and
        // nothing else would have revealed it.
        //
        // I set everIn1stContact and firstContactDate on the deal in pkg987,
        // having read the filter in scorecard-crm.js. But
        // lib/crmDashboardAdapter.js OVERRIDES both, computing them from
        // lib/crmMilestones.js instead - so the deal's own values were never
        // read. Reading the consumer was not enough; the consumer had a
        // consumer.
        //
        // crmMilestones takes projectInDate from fields.created, and the page
        // drops any deal without one. everInProjectIn was already satisfied,
        // because the generated history moves OUT of Project In and that
        // counts as having been there - which is why the metric was zero
        // rather than obviously broken.
        created: new Date(addedTs).toISOString().split('T')[0],
        lost_reason: status === 'lost' ? pick(r, LOST_REASONS) : null,
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
        sales_person: salesPerson,
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
  // Which account code means what. Without this every code reads as
  // "uncategorised" and the app raises a banner about it.
  out['config:chart-of-accounts'] = [
    { code: '200', name: 'Sales' },
    { code: '311', name: 'Materials - purchased' },
    { code: '320', name: 'Direct wages' },
    { code: '321', name: 'Subcontract labour' },
    { code: '330', name: 'Plant and consumables' },
    { code: '333', name: 'Hire and access' },
    { code: '404', name: 'Advertising' },
    { code: '408', name: 'Cleaning' },
    { code: '412', name: 'Consulting and accounting' },
    { code: '429', name: 'General expenses' },
    { code: '433', name: 'Insurance' },
    { code: '449', name: 'Motor vehicle expenses' },
    { code: '469', name: 'Rent' },
    { code: '477', name: 'Salaries - office' },
    { code: '485', name: 'Subscriptions' },
    { code: '489', name: 'Telephone and internet' },
  ]
  out['config:account-categorisation'] = {
    '200': { category: 'sales' },
    '311': { category: 'materials' }, '330': { category: 'materials' }, '333': { category: 'materials' },
    '320': { category: 'labour' }, '321': { category: 'labour' },
    '404': { category: 'overheads' }, '408': { category: 'overheads' }, '412': { category: 'overheads' },
    '429': { category: 'overheads' }, '433': { category: 'overheads' }, '449': { category: 'overheads' },
    '469': { category: 'overheads' }, '477': { category: 'overheads' }, '485': { category: 'overheads' },
    '489': { category: 'overheads' },
  }

  // THE PROJECT REGISTRY.
  //
  // Not the same list as dashboard:cache, and read by different screens. The
  // In Query project dropdown gets its options from inqueryProjectOptions(),
  // which reads projects:registry - so without this every row on that tab
  // offers "Not set" and nothing else, and a parked cost cannot be assigned
  // anywhere. Which is the entire purpose of the tab.
  //
  // It exists because a project must survive being deleted from Xero: the
  // registry is our own record of every tracking option ever seen, so the
  // costs and invoices against it stay accountable even when Xero stops
  // returning it.
  //
  // In Query is deliberately absent - lib/inquery.js filters it out anyway,
  // since offering "In Query" as the answer to "which job is this In Query
  // cost for" is an own goal.
  const today = iso(new Date())
  out['projects:registry'] = Object.fromEntries(projects.map(p => [
    `demo-${p.jobNo}`,
    {
      name: `${p.jobNo}-${p.site}`,
      jobNo: p.jobNo,
      trackingCategoryId: 'demo-category',
      firstSeen: iso(p.start),
      lastSeenInXero: today,
    },
  ]))

  // THE IN QUERY BUCKET.
  //
  // Matched on the tracking option NAME, not a flag - pages/api/bookkeeping.js
  // compares the project name to "inquery" with spaces stripped. A cost parked
  // here is deliberately excluded from project spend until somebody decides
  // where it belongs.
  const inQueryLines = []
  for (let k = 0; k < 9; k++) {
    const acct = pick(r, COST_ACCOUNTS)
    const amt = Math.round(between(r, 180, 4200))
    inQueryLines.push({
      date: iso(monthsBack(intBetween(r, 0, 4))),
      supplier: pick(r, SUPPLIERS), reference: 'INV' + intBetween(r, 10000, 99999),
      description: pick(r, ['Awaiting delivery note', 'Price queried with supplier', 'Wrong site on invoice', 'Duplicate suspected', 'Pending credit']),
      accountCode: acct.code, account: acct.code, type: acct.type, total: amt, amount: amt,
    })
  }
  out['costs:lines:demo-INQUERY'] = inQueryLines
  out['invoiced:lines:demo-INQUERY'] = []
  out['project:demo-INQUERY'] = { jobNo: 'IQ', customerName: '', contractValue: 0 }

  // SEPTEMBER: THE PILE TO WORK THROUGH.
  const sep = new Date(); sep.setDate(1)
  const sepDay = () => iso(new Date(sep.getFullYear(), sep.getMonth(), intBetween(r, 1, Math.min(26, new Date().getDate())), 12))

  const OVERHEAD_CODES = ['404', '408', '412', '429', '433', '449', '469', '477', '485', '489']
  const untaggedBills = []
  for (let k = 0; k < 26; k++) {
    // Most are project costs someone has to allocate; the rest are genuine
    // overheads, which is what makes the categorisation step meaningful
    // rather than mechanical.
    const isOverhead = r() < 0.35
    const code = isOverhead ? pick(r, OVERHEAD_CODES) : pick(r, COST_ACCOUNTS).code
    const amt = Math.round(between(r, 90, 7400))
    untaggedBills.push({
      date: sepDay(),
      supplier: isOverhead ? pick(r, ['Vector Energy', 'Spark Business', 'NZI Insurance', 'Ricoh NZ', 'Bunnings Trade', 'Chapman Tripp']) : pick(r, SUPPLIERS),
      reference: 'INV' + intBetween(r, 10000, 99999),
      description: isOverhead ? 'Monthly account' : pick(r, ['Materials to site', 'Plant hire', 'Access equipment', 'Consumables']),
      accountCode: code, account: code, amount: amt, total: amt,
    })
  }
  out['costs:untagged:bills'] = untaggedBills

  const untaggedWages = []
  for (let k = 0; k < 11; k++) {
    const amt = Math.round(between(r, 640, 3900))
    untaggedWages.push({
      date: sepDay(), supplier: 'Direct Wages',
      description: 'Week ' + intBetween(r, 36, 39) + ' - ' + pick(r, OPERATIVES_FOR_WAGES),
      reference: 'WAGES-' + intBetween(r, 100, 999),
      accountCode: '320', amount: amt, total: amt,
    })
  }
  out['costs:untagged:wages'] = untaggedWages

  const unassignedSales = []
  for (let k = 0; k < 7; k++) {
    const amt = Math.round(between(r, 2400, 68000))
    unassignedSales.push({
      date: sepDay(), invoiceNumber: 'INV-' + intBetween(r, 4000, 4999),
      contact: pick(r, CLIENTS), reference: pick(r, ['Interim application', 'Variation works', 'Dayworks', 'Final account']),
      total: amt, subTotal: amt, sales200: amt, amountDue: r() < 0.6 ? amt : 0, totalTax: 0,
    })
  }
  out['invoiced:lines:__UNASSIGNED__'] = unassignedSales

  // The In Query row has to be IN the project list for its costs to be found,
  // and its name must read exactly "In Query" - that string is the match.
  out['dashboard:cache'] = [
    ...projects.map(projectCacheRow),
    {
      xeroId: 'demo-INQUERY', trackingOptionId: 'demo-INQUERY', jobNo: 'IQ',
      name: 'In Query', projectName: 'In Query', inXero: true, status: 'INPROGRESS',
      stageSource: 'retention', customer: '', contractsManager: '', estimator: '', qsName: '',
      cmResolved: true, estimatorResolved: true, qsResolved: true, completeV6: true,
      detailsMissing: false, hasContractedRates: false, pcType: '', appRelease1: null,
      appliedForLatest: 0, latestAppEnd: '', retention612Released: 0, wipAdjustments: [],
      accountBaseNetOfMcd_v1: true, afaAsIssued_v1: true, afaDecomp_v1: true,
      afaLiveNotStamp_v1: true, afaOneRule_v1: true, afaShown_v1: true,
      appliedForSent_v1: true, appsBothRecords_v1: true, appsIdRecordWins_v1: true,
      certifiedPrevCert_v2: true, certifiedTypedBox_v1: true, dashFields_v1: true,
      finalAccountMcdPlacement_v1: true, ret612Match_v1: true, varsIdWins_v1: true,
      afa: 0, contractValue: 0, labourBudget: 0, materialsBudget: 0, retentionPct: 0,
      variations: [], dateOverrides: {}, applicationDay: 25, valuationDay: 28, paymentDay: 20,
      grossInvoiced: 0, invoicedToDate: 0, retentionOutstanding: 0, remainingToClaim: 0,
      labourSpend: 0, materialsSpend: 0, totalBudget: 0, totalCosts: 0, totalInvoiced: 0,
      allPaid: 0, amountOutstanding: 0, _costLines: inQueryLines, _invoiceLines: [],
    },
  ]

  for (const p of projects) {
    const xeroId = `demo-${p.jobNo}`
    // THE WIP PAGE READS ITS OWN KEYS, NOT THE DASHBOARD CACHE.
    //
    // pages/api/wip.js pulls costs:lines:<id> and invoiced:lines:<id>
    // directly. The cache's _costLines and _invoiceLines feed the Commercial
    // table; WIP never looks at them. Writing only the cache gave a WIP page
    // that was empty while Project Financials showed a WIP figure - the same
    // data needed in two places under different names.
    out[`costs:lines:${xeroId}`] = p.costLines
    out[`invoiced:lines:${xeroId}`] = p.invoiceLines
    out[`wip:adjustments:${xeroId}`] = []
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
      retention612Deducted: p.ret612Deducted,
      retention612Released: p.ret612Released,
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

  // ------------------------------------------------------------------
  // BOOKKEEPING.
  //
  // The section exists to get every cost, wage and sales invoice out of Xero
  // and onto a project. Its whole value is the RECONCILIATION: an unassigned
  // line sits in the list until somebody gives it a project, and then it
  // clears. A demo with everything already assigned shows a set of empty
  // tabs and proves nothing.
  //
  // So: April through August are fully assigned and balance, and SEPTEMBER
  // has a pile of untagged bills, wages and sales invoices waiting to be
  // categorised. That is the screen worth showing.
  // ------------------------------------------------------------------

  const deals = buildDeals(r, dealCount)
  out['crm:deals'] = deals

  // THE OPEN-ACTIVITY LIST EXISTS IN TWO PLACES.
  //
  // Each deal carries its own `activities` array, which is what the CRM page
  // reads - so the board looked right. But crm:activities:open is a SEPARATE
  // flat index across every deal, written by pages/api/crm.js whenever an
  // activity is saved through the app, and read by the daily "projects with
  // no activity set" email.
  //
  // The seeder wrote the deals and not the index, so the index was empty and
  // the email counted EVERY open deal: "142 projects with no activity set",
  // every evening, while the CRM screen showed an activity on all of them.
  //
  // Same shape as the project list living in three keys. Before populating
  // anything, find every key that answers the same question.
  //
  // Field names copied from the writer in pages/api/crm.js, not invented:
  // { id, dealId, text, due, assignee }.
  out['crm:activities:open'] = deals
    .filter((d) => d.status === 'open')
    .flatMap((d) => (d.activities || [])
      .filter((a) => !a.done)
      .map((a) => ({
        id: a.id,
        dealId: String(d.id),
        text: a.text || a.subject || 'Activity',
        due: a.due || a.dueDate || '',
        assignee: a.assignee || a.assignedTo || '',
      })))
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
  // crm:activities:open is written above and MUST be wiped with the rest, or
  // a re-seed leaves the old index pointing at deal ids that no longer exist.
  'crm:deals', 'crm:activities:open', 'crm:emails:', 'retention:entries', 'ops:users',
  'costs:lines:demo-', 'invoiced:lines:demo-', 'wip:adjustments:demo-',
  'costs:untagged:bills', 'costs:untagged:wages', 'invoiced:lines:__UNASSIGNED__',
  'config:chart-of-accounts', 'config:account-categorisation', 'projects:registry',
]
