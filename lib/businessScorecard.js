// THE BUSINESS SCORECARD'S METRICS (1026).
//
// One list, read by the page (cards, trend table, targets) and by
// /api/management/scorecard (which fills the series). Adding a metric is a
// line here plus its calculation in the route.
//
// NONE ARE CONNECTED YET, deliberately. Each needs a decision before it can
// be computed honestly - the financial year, which projects count, what
// "secured" means for this card - and the agreed order is to build the page,
// then settle the metrics one at a time. Until a metric is connected the
// route returns null for every month and the card says so. It never shows a
// zero that means "not measured".
//
// unit:  'pct' (stored as a fraction, 0.25 = 25%) | 'money' | 'count'
// mode:  'normal' higher is better | 'lower' lower is better
// basis: how each month's figure is read - shown under the label
export const BUSINESS_METRICS = [
  // 1032 CONNECTED. Each month: that month's gross profit / sales, from the
  // Xero P&L Business Financials reads. Headline: the financial year to date,
  // first month to last FULL month.
  { key: 'gmFytd', label: 'Gross margin %', basis: 'Each month - headline is the margin for the period', unit: 'pct', mode: 'normal' },
  // 1033 CONNECTED, renamed Total sales in 1034. Each month: that month's
  // sales on the Xero P&L. Headline: the total over the selected range -
  // the financial year to date by default. The key stays 'invoicedFy' so a
  // target already set is kept.
  { key: 'invoicedFy', label: 'Total sales', basis: 'Each month - headline is the total for the period', unit: 'money', mode: 'normal' },
  // 1035, reworked 1037. The financial year's sales as forecast: finished
  // months are ACTUAL Xero sales (blue), this month onwards is the Forecast
  // P&L (orange). Headline: the two added together - the year's total as it
  // stands. hasForecast: the page draws <key>__f as the orange line.
  { key: 'salesForecast', label: 'Forecast sales', basis: 'Financial year: actual to date + forecast from this month', unit: 'money', mode: 'normal', hasForecast: true },
  // 1035 CONNECTED. The Forecast P&L's gross margin for the whole financial
  // year - its Gross profit box, actual months plus forecast months plus the
  // WIP adjustments. The current forecast only: no graph (noChart).
  { key: 'gmForecastFyEnd', label: 'Forecast gross margin', basis: 'Whole financial year, from the Forecast P&L', unit: 'pct', mode: 'normal', noChart: true },
  // 1039 CONNECTED. Water Ingress Reports answered "our fault", by the date
  // on the form. Every report counts. Headline: the total for the period.
  // drill: clicking a month lists the reports behind it. See lib/waterIngress.js.
  { key: 'waterIngressRockFault', label: 'Water ingress - our fault', basis: 'Reports by the date on the form - headline is the total for the period', unit: 'count', mode: 'lower', drill: true },
  // 1040 CONNECTED. The estimator scorecard's "Total value of work priced"
  // (all estimators): every value change in the month, summed. Headline: the
  // total for the period. lib/precontractTotals.js, shared with that page.
  { key: 'valuePriced', label: 'Value of work priced', basis: 'Value changes in the month - headline is the total for the period', unit: 'money', mode: 'normal' },
  // 1047: the same, for EXISTING customers only - an organisation we had
  // already won a different project for, before the date (lib/precontractTotals).
  { key: 'valuePricedExisting', label: 'Value of work priced - existing customers', basis: 'Customers we had already won work from - headline is the total for the period', unit: 'money', mode: 'normal' },
  // 1040 CONNECTED. The estimator scorecard's "Total value of work secured"
  // (all estimators): the value of deals won in the month. Headline: the total
  // for the period. Same shared rule.
  { key: 'valueSecured', label: 'Value of work secured', basis: 'Won value in the month - headline is the total for the period', unit: 'money', mode: 'normal' },
  // 1047: the same, for EXISTING customers only.
  { key: 'valueSecuredExisting', label: 'Value of work secured - existing customers', basis: 'Customers we had already won work from - headline is the total for the period', unit: 'money', mode: 'normal' },
  // 1029's "Value of secured work - as at month end" REMOVED in 1040, by
  // decision: Value of work secured above is the one secured-work card.
  // 1028; 1041 won-from-Negotiating; 1056 MATCHED TO THE SALES SCORECARD:
  // every won project except variations, rolling 6 months to each month end
  // (lib/precontractTotals avgSecuredRolling - the same function). Headline:
  // the last full month.
  { key: 'avgValueSecured', label: 'Average value of secured project', basis: 'Rolling 6 months, excluding variations - as the sales scorecard - headline is the last full month', unit: 'money', mode: 'normal' },
  // 1030, CONNECTED 1045: average AFA of live (In progress) projects at each
  // month end - RECORDED going forward, since nothing stores past AFA or
  // status. See lib/liveProjectValue.js.
  { key: 'avgProjectValue', label: 'Average value of live projects', basis: 'Average AFA of In progress projects at each month end - recorded from Oct 2026', unit: 'money', mode: 'normal' },
  // 1041 CONNECTED: the estimator scorecard's strike rate (value), all
  // estimators - won value / decided value, rolling six months to each month
  // end. Headline: the latest month's.
  { key: 'strikeRateValue', label: 'Strike rate on value', basis: 'Rolling 6 months, whole business - headline is the last full month', unit: 'pct', mode: 'normal' },
  // 1048: the same strike rate, EXISTING customers only (lib/precontractTotals
  // strikeRateExistingTo). Headline: the last full month.
  { key: 'strikeRateExisting', label: 'Strike rate on value - existing customers', basis: 'Rolling 6 months, customers we had already won work from - headline is the last full month', unit: 'pct', mode: 'normal' },
  // 1041 CONNECTED: open deals at Negotiating, total value at each month end
  // (today for this month). Headline: the latest.
  { key: 'negotiatingPipeline', label: 'Negotiating pipeline', basis: 'Total value at each month end - headline is the last month end', unit: 'money', mode: 'normal' },
  // 1041 CONNECTED: credit notes, exactly as the Commercial Scorecard counts
  // them (manual month adjustments included). Headline: the period total.
  { key: 'paylessNotices', label: 'Payless notices', basis: 'Credit notes, as the Commercial Scorecard - headline is the total, with the average per month', unit: 'count', mode: 'lower' },
]

// Metrics the route actually computes. Empty until each is agreed.
// 1044: unless stated otherwise, every metric counts FINISHED months only -
// see isFull() in pages/api/management/scorecard.js.
export const CONNECTED = ['gmFytd', 'invoicedFy', 'salesForecast', 'gmForecastFyEnd', 'waterIngressRockFault', 'valuePriced', 'valueSecured', 'avgValueSecured', 'strikeRateValue', 'negotiatingPipeline', 'paylessNotices', 'avgProjectValue', 'valuePricedExisting', 'valueSecuredExisting', 'strikeRateExisting']
