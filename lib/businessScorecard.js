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
  { key: 'gmFytd', label: 'Gross margin %', basis: 'Financial year to date', unit: 'pct', mode: 'normal' },
  { key: 'invoicedFy', label: 'Total invoiced', basis: 'This financial year', unit: 'money', mode: 'normal' },
  { key: 'gmForecastFyEnd', label: 'Forecast gross margin', basis: 'To the end of the financial year', unit: 'pct', mode: 'normal' },
  { key: 'waterIngressRockFault', label: 'Water ingress issues - our fault', basis: 'Number in the month', unit: 'count', mode: 'lower' },
  { key: 'valuePriced', label: 'Value of work priced', basis: 'In the month', unit: 'money', mode: 'normal' },
  { key: 'valueSecured', label: 'Value of work secured', basis: 'In the month', unit: 'money', mode: 'normal' },
  { key: 'strikeRateValue', label: 'Strike rate on value', basis: 'Rolling 6 months, as the estimator scorecards', unit: 'pct', mode: 'normal' },
  { key: 'negotiatingPipeline', label: 'Negotiating pipeline', basis: 'Total value at month end', unit: 'money', mode: 'normal' },
  { key: 'paylessNotices', label: 'Payless notices', basis: 'As the Commercial Scorecard', unit: 'count', mode: 'lower' },
]

// Metrics the route actually computes. Empty until each is agreed.
export const CONNECTED = []
