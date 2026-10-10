// GROSS MARGIN FROM THE XERO P&L (1032) - one rule, used by Business
// Financials and the Business Scorecard, so the two cannot disagree.
//
// Input: one month of xero:pl-benchmark ({ incomeTotal, costOfSalesTotal, ... })
// Xero reports some totals signed; the absolute value is the amount.
//
// Gross margin = (sales - cost of sales) / sales. No sales means no margin
// (null), not 0%.
export function plMonth(b) {
  const abs = (v) => Math.abs(v || 0)
  const sales = abs(b?.incomeTotal)
  const cos = abs(b?.costOfSalesTotal)
  const overheads = abs(b?.overheadsTotal)
  return { sales, cos, overheads, grossMargin: sales > 0 ? (sales - cos) / sales : null }
}

// Margin over a set of months: totals first, then the ratio. Averaging the
// monthly percentages would weight a quiet month the same as a busy one.
export function marginOver(months) {
  const t = months.reduce((a, m) => ({ sales: a.sales + m.sales, cos: a.cos + m.cos }), { sales: 0, cos: 0 })
  return { ...t, grossMargin: t.sales > 0 ? (t.sales - t.cos) / t.sales : null }
}
