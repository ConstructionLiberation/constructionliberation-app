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
  // 1035 CONNECTED. Sales still to come this financial year: the revenue in
  // the Forecast P&L's FORECAST months (not actual, not manual). Headline:
  // their total. Graph: each forecast month.
  { key: 'salesForecast', label: 'Forecast sales', basis: 'Rest of the financial year, from the Forecast P&L', unit: 'money', mode: 'normal' },
  // 1035 CONNECTED. The Forecast P&L's gross margin for the whole financial
  // year - its Gross profit box, actual months plus forecast months plus the
  // WIP adjustments. The current forecast only: no graph (noChart).
  { key: 'gmForecastFyEnd', label: 'Forecast gross margin', basis: 'Whole financial year, from the Forecast P&L', unit: 'pct', mode: 'normal', noChart: true },
  { key: 'waterIngressRockFault', label: 'Water ingress issues - our fault', basis: 'Number in the month', unit: 'count', mode: 'lower' },
  { key: 'valuePriced', label: 'Value of work priced', basis: 'In the month', unit: 'money', mode: 'normal' },
  { key: 'valueSecured', label: 'Value of work secured', basis: 'In the month', unit: 'money', mode: 'normal' },
  // 1029. The secured work ON THE BOOKS at each month end - a stock, read at a
  // point in time - as distinct from Value of work secured above, which is the
  // flow won during the month.
  { key: 'securedAtMonthEnd', label: 'Value of secured work', basis: 'As at month end', unit: 'money', mode: 'normal' },
  // 1028. Basis provisional: the pre-contract scorecard measures this over a
  // rolling 6 months (avgValueSecured), and the business card should agree
  // with it unless decided otherwise when it is connected.
  { key: 'avgValueSecured', label: 'Average value of newly secured projects', basis: 'Rolling 6 months, as the estimator scorecards', unit: 'money', mode: 'normal' },
  // 1030. Basis provisional - which projects it averages (live at month end,
  // or everything priced) is settled when it is connected. Distinct from the
  // card above, which averages only projects newly secured.
  { key: 'avgProjectValue', label: 'Average project value', basis: 'Live projects, as at month end', unit: 'money', mode: 'normal' },
  { key: 'strikeRateValue', label: 'Strike rate on value', basis: 'Rolling 6 months, as the estimator scorecards', unit: 'pct', mode: 'normal' },
  { key: 'negotiatingPipeline', label: 'Negotiating pipeline', basis: 'Total value at month end', unit: 'money', mode: 'normal' },
  { key: 'paylessNotices', label: 'Payless notices', basis: 'As the Commercial Scorecard', unit: 'count', mode: 'lower' },
]

// Metrics the route actually computes. Empty until each is agreed.
export const CONNECTED = ['gmFytd', 'invoicedFy', 'salesForecast', 'gmForecastFyEnd']
