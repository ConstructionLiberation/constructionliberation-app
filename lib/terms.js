// CONSTRUCTION TERMINOLOGY BY MARKET.
//
// UK is the source language and the fallback. AU and NZ follow UK usage far
// more closely than US does - the large jump is UK to US, and AU/NZ is mostly
// currency, date format, GST and SWMS.
//
// -------------------------------------------------------------------------
// TWO KINDS OF TERM, AND THE DIFFERENCE MATTERS
// -------------------------------------------------------------------------
//
// COSMETIC   a word that means the same thing and is simply said differently.
//            Safe to switch. "Rooflight" / "skylight" changes nothing but the
//            reading.
//
// STATUTORY  a term with legal weight, defined in legislation, often with
//            deadlines or entitlements attached. NZ's Construction Contracts
//            Act defines "payment claim" and "payment schedule"; Australia's
//            Security of Payment regime varies BY STATE; US retainage is
//            capped by statute in many places and lien waivers have no UK
//            equivalent at all.
//
//            THESE ARE MARKED AND DO NOT VARY YET. They render in UK English
//            everywhere until someone qualified in that market has reviewed
//            them. Getting one wrong inside a document a customer sends to
//            their own client is worse than leaving it in British English,
//            because the British version is obviously foreign and the wrong
//            local version looks authoritative.
//
// Adding a market: add the key to every entry, and leave statutory entries
// pointing at the UK wording until reviewed. Do not guess.
// -------------------------------------------------------------------------

export const DEFAULT_LOCALE = 'UK'

export const LOCALES = [
  { key: 'UK', label: 'United Kingdom', code: 'en-GB', currency: 'GBP' },
  { key: 'US', label: 'United States', code: 'en-US', currency: 'USD' },
  { key: 'AU', label: 'Australia', code: 'en-AU', currency: 'AUD' },
  { key: 'NZ', label: 'New Zealand', code: 'en-NZ', currency: 'NZD' },
]

// status: 'cosmetic' | 'statutory'
// note:   why it is held, where a review is needed
export const TERMS = {
  // ---- Commercial ------------------------------------------------------
  variation: { UK: 'variation', US: 'change order', AU: 'variation', NZ: 'variation', status: 'cosmetic' },
  retention: {
    UK: 'retention', US: 'retainage', AU: 'retention', NZ: 'retention',
    status: 'statutory',
    note: 'US retainage percentages and release timing are capped by statute in many states. Word is safe; any RULE built on it is not.',
  },
  application: {
    UK: 'application for payment', US: 'pay application', AU: 'progress claim', NZ: 'payment claim',
    status: 'statutory',
    note: 'NZ Construction Contracts Act defines "payment claim" and "payment schedule" with response deadlines. AU Security of Payment varies BY STATE. Review before use on any document.',
  },
  valuation: { UK: 'valuation', US: 'progress billing', AU: 'progress claim', NZ: 'progress claim', status: 'cosmetic' },
  tender: { UK: 'tender', US: 'bid', AU: 'tender', NZ: 'tender', status: 'cosmetic' },
  prelims: { UK: 'preliminaries', US: 'general conditions', AU: 'preliminaries', NZ: 'preliminaries', status: 'cosmetic' },
  provisionalSum: { UK: 'provisional sum', US: 'allowance', AU: 'provisional sum', NZ: 'provisional sum', status: 'cosmetic' },
  billOfQuantities: { UK: 'bill of quantities', US: 'schedule of values', AU: 'bill of quantities', NZ: 'bill of quantities', status: 'cosmetic' },
  dayRate: { UK: 'day rate', US: 'time and materials', AU: 'day rate', NZ: 'day rate', status: 'cosmetic' },
  invoice: { UK: 'invoice', US: 'invoice', AU: 'tax invoice', NZ: 'tax invoice', status: 'cosmetic' },
  vat: {
    UK: 'VAT', US: 'sales tax', AU: 'GST', NZ: 'GST',
    status: 'statutory',
    note: 'Not a translation. US sales tax is levied differently from VAT/GST and construction treatment varies by state. Rates and reverse-charge rules are NOT interchangeable.',
  },

  // ---- People and parties ---------------------------------------------
  mainContractor: { UK: 'main contractor', US: 'general contractor', AU: 'head contractor', NZ: 'main contractor', status: 'cosmetic' },
  subcontractor: { UK: 'subcontractor', US: 'subcontractor', AU: 'subcontractor', NZ: 'subcontractor', status: 'cosmetic' },
  operative: { UK: 'operative', US: 'field worker', AU: 'worker', NZ: 'worker', status: 'cosmetic' },
  siteManager: { UK: 'site manager', US: 'superintendent', AU: 'site manager', NZ: 'site manager', status: 'cosmetic' },
  quantitySurveyor: { UK: 'quantity surveyor', US: 'cost estimator', AU: 'quantity surveyor', NZ: 'quantity surveyor', status: 'cosmetic' },

  // ---- Programme and completion ----------------------------------------
  programme: { UK: 'programme', US: 'schedule', AU: 'programme', NZ: 'programme', status: 'cosmetic' },
  snagging: { UK: 'snagging', US: 'punch list', AU: 'defects list', NZ: 'defects list', status: 'cosmetic' },
  practicalCompletion: {
    UK: 'practical completion', US: 'substantial completion', AU: 'practical completion', NZ: 'practical completion',
    status: 'statutory',
    note: 'Triggers retention release and defect periods under the contract. The word maps; the contractual consequences do not.',
  },
  defectsPeriod: {
    UK: 'defects liability period', US: 'warranty period', AU: 'defects liability period', NZ: 'defects liability period',
    status: 'statutory',
    note: 'Duration and what it covers are contractual and jurisdictional.',
  },

  // ---- Health and safety ------------------------------------------------
  // The acronym spelled out. rams-approve.js writes "RAMS (Risk Assessment &
  // Method Statement)" to someone who may never have seen the acronym, and
  // the expansion is different in each place: a SWMS is a Safe Work Method
  // Statement, a JHA a Job Hazard Analysis.
  ramsFull: {
    UK: 'Risk Assessment & Method Statement',
    US: 'Job Hazard Analysis',
    AU: 'Safe Work Method Statement',
    NZ: 'Safe Work Method Statement',
    status: 'statutory',
    note: 'Spelled-out form of the rams entry. Same warning applies: the app stores and labels the customer\'s own document, it does not generate one.',
  },
  rams: {
    UK: 'RAMS', US: 'JHA', AU: 'SWMS', NZ: 'SWMS',
    status: 'statutory',
    note: 'AU SWMS is mandated for high-risk construction work with prescribed content; NZ follows similar practice under HSWA. WIRED ON PURPOSE (pkg976): this app STORES and LABELS the customer\'s own uploaded document and does not generate one, so the label follows the document rather than claiming anything about it. If a builder is ever added, the generated document needs review - the label alone never did.',
  },
  siteInduction: { UK: 'site induction', US: 'site orientation', AU: 'site induction', NZ: 'site induction', status: 'cosmetic' },
  toolboxTalk: { UK: 'toolbox talk', US: 'toolbox talk', AU: 'toolbox talk', NZ: 'toolbox talk', status: 'cosmetic' },

  // ---- Materials and building ------------------------------------------
  rooflight: { UK: 'rooflight', US: 'skylight', AU: 'skylight', NZ: 'skylight', status: 'cosmetic' },
  cladding: { UK: 'cladding', US: 'siding', AU: 'cladding', NZ: 'cladding', status: 'cosmetic' },
  scaffold: { UK: 'scaffold', US: 'scaffolding', AU: 'scaffold', NZ: 'scaffold', status: 'cosmetic' },
  skip: { UK: 'skip', US: 'dumpster', AU: 'skip bin', NZ: 'skip', status: 'cosmetic' },
  lorry: { UK: 'lorry', US: 'truck', AU: 'truck', NZ: 'truck', status: 'cosmetic' },
  carPark: { UK: 'car park', US: 'parking lot', AU: 'car park', NZ: 'car park', status: 'cosmetic' },
  storey: { UK: 'storey', US: 'story', AU: 'storey', NZ: 'storey', status: 'cosmetic' },

  // ---- Company and admin ------------------------------------------------
  companyNumber: { UK: 'company number', US: 'EIN', AU: 'ABN', NZ: 'NZBN', status: 'cosmetic' },
  postcode: { UK: 'postcode', US: 'ZIP code', AU: 'postcode', NZ: 'postcode', status: 'cosmetic' },
  turnover: { UK: 'turnover', US: 'revenue', AU: 'turnover', NZ: 'turnover', status: 'cosmetic' },
  labourer: { UK: 'labourer', US: 'laborer', AU: 'labourer', NZ: 'labourer', status: 'cosmetic' },
}

// UK-ONLY CONCEPTS WITH NO EQUIVALENT ANYWHERE ELSE.
//
// These are not translation problems. CIS is a UK HMRC scheme; there is no US,
// AU or NZ counterpart, so the module should be switched OFF for a non-UK
// tenant rather than renamed. Listed here so the decision is recorded
// somewhere rather than discovered by a customer.
export const UK_ONLY = [
  'CIS',                    // Construction Industry Scheme (HMRC deductions)
  'reverse charge VAT',     // UK domestic reverse charge for construction
  'CSCS',                   // UK card scheme; US/AU/NZ have their own, not equivalent
  'Building Regulations',   // jurisdiction-specific by definition
  'Companies House',
]

// Concepts in other markets with no UK equivalent, so nothing here maps
// backwards. Recorded for when those markets are actually supported.
export const NOT_IN_UK = {
  US: ['mechanic\'s lien', 'lien waiver', 'AIA G702/G703', 'Davis-Bacon', 'W-9'],
  AU: ['Security of Payment adjudication', 'ABN withholding', 'white card'],
  NZ: ['Construction Contracts Act payment schedule', 'IRD number'],
}
