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

  // Costs consistent with the margin actually achieved.
  const totalCosts = Math.round(certifiedGross * (1 - margin))
  const costLines = []
  const lineCount = intBetween(r, 6, 26)
  let allocated = 0
  for (let c = 0; c < lineCount; c++) {
    const acct = pick(r, COST_ACCOUNTS)
    const share = c === lineCount - 1
      ? Math.max(0, totalCosts - allocated)
      : Math.round(totalCosts * between(r, 0.01, 0.12))
    allocated += share
    if (share <= 0) continue
    costLines.push({
      date: iso(monthsBack(intBetween(r, 0, ageMonths + 1))),
      supplier: acct.type === 'Labour' ? pick(r, SUBBIES) : pick(r, SUPPLIERS),
      reference: 'INV' + intBetween(r, 10000, 99999),
      account: acct.code,
      type: acct.type,
      total: share,
      amount: share,
    })
  }

  const invoiceLines = applications.map(a => ({
    date: a.periodEnd,
    reference: `${jobNo} App ${a.seq}`,
    invoiceNumber: `INV-${jobNo}-${String(a.seq).padStart(2, '0')}`,
    total: a.thisApplication,
    amountPaid: complete || a.seq < appCount - 1 ? a.thisApplication : 0,
    amountDue: complete || a.seq < appCount - 1 ? 0 : a.thisApplication,
    status: 'AUTHORISED',
  }))

  const totalInvoiced = invoiceLines.reduce((s, l) => s + l.total, 0)
  const allPaid = invoiceLines.reduce((s, l) => s + l.amountPaid, 0)
  const amountOutstanding = invoiceLines.reduce((s, l) => s + l.amountDue, 0)

  return {
    i, jobNo, site, start, ageMonths, status, complete, defects,
    customer: CLIENTS[i % CLIENTS.length],
    address: `${intBetween(r, 1, 240)} ${pick(r, ['Vogel', 'Selwyn', 'Quarry', 'Colombo', 'Rosebank', 'Beaumont'])} Street, ${pick(r, SUBURBS)}`,
    contractValue, margin, variations, instructedVars, afaGross,
    applications, appliedForLatest, certifiedGross, retentionPct, retentionClaimed,
    totalCosts, costLines, invoiceLines, totalInvoiced, allPaid, amountOutstanding,
    cm: pick(r, STAFF.filter(s => s.jobRole === 'Contracts Manager')).name,
    estimator: pick(r, STAFF.filter(s => s.jobRole === 'Estimator')).name,
    qs: STAFF.find(s => s.jobRole === 'Commercial Manager').name,
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
    defectsDate: '',
    completionDate: p.complete ? iso(monthsBack(Math.max(0, p.ageMonths - 8))) : '',
    retentionComments: '',
    variations: p.variations,
    applicationDay: 25,
    paymentDay: 20,
    dateOverrides: {},
    valuationDay: 28,
    afaGross: p.afaGross,
    afaShown: p.afaGross,
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

const DEAL_STAGES = ['Lead', 'Qualified', 'Estimating', 'Submitted', 'Negotiation', 'Won', 'Lost']

function buildDeals(r, count) {
  const deals = []
  for (let i = 0; i < count; i++) {
    const stage = pick(r, DEAL_STAGES)
    const value = Math.round(between(r, 18000, 900000) / 500) * 500
    const org = pick(r, CLIENTS)
    const est = pick(r, STAFF.filter(s => s.jobRole === 'Estimator')).name
    deals.push({
      id: `d${1000 + i}`,
      title: `${pick(r, SITES)} - ${pick(r, ['new build', 'refurbishment', 'extension', 'remedial works'])}`,
      organization: org,
      person: pick(r, ['J. Aldridge', 'M. Kelleher', 'S. Tuwhare', 'R. Dunne', 'A. Beckett', 'P. Finnegan']),
      value,
      currency: 'NZD',
      stage,
      status: stage === 'Won' ? 'won' : stage === 'Lost' ? 'lost' : 'open',
      addedAt: monthsBack(intBetween(r, 0, 13)).getTime(),
      expectedClose: iso(monthsBack(-intBetween(r, 0, 4))),
      estimator_responsible: est,
      fields: { source: pick(r, ['Referral', 'Tender list', 'Repeat client', 'Website', 'Cold approach']) },
      history: [],
      activities: [],
      notes: [],
      lostReason: stage === 'Lost' ? pick(r, ['Price', 'Programme', 'Awarded to incumbent', 'Client deferred']) : '',
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
        to: 'estimating@demo.example',
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
      to: 'estimating@demo.example',
      receivedAt: monthsBack(intBetween(r, 0, 2)).getTime(),
      preview: 'We would be grateful if you could review and come back to us.',
      mailbox: 'estimating@demo.example',
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
  const dealCount = Math.max(0, Math.min(200, opts.deals || 48))
  const r = rng(opts.seed || 20260920)

  const projects = []
  for (let i = 0; i < projectCount; i++) projects.push(buildProject(r, i, opts))

  const team = STAFF.map((s, i) => ({
    id: `tm${i + 1}`,
    name: s.name,
    email: `${slug(s.name)}@demo.example`,
    jobRole: s.jobRole,
    active: true,
  }))

  const users = STAFF.map((s, i) => ({
    id: `pu_demo_${i + 1}`,
    name: s.name,
    email: `${slug(s.name)}@demo.example`,
    role: s.role,
    active: true,
    createdAt: Date.now(),
  }))

  const opsProjects = projects.map(p => ({
    projectNo: p.jobNo,
    projectName: p.site,
    client: p.customer,
    address: p.address,
    contractsManager: p.cm,
    status: p.complete ? 'Complete' : 'Live',
    startDate: iso(p.start),
    value: p.contractValue,
  }))

  const out = {}
  out['ops:team'] = team
  out['ops:projects'] = opsProjects
  out['dashboard:cache'] = projects.map(projectCacheRow)

  for (const p of projects) {
    const xeroId = `demo-${p.jobNo}`
    out[`project:${xeroId}`] = {
      jobNo: p.jobNo,
      customerName: p.customer,
      contractValue: p.contractValue,
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
  'crm:deals', 'crm:emails:',
]
