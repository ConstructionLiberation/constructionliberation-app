// SALES BY ACCOUNT CODE (1134) - for the retention tracker's Invoiced.
//
// "Invoiced" on the tracker = every invoice line in an account code that
// bookkeeping categorises as SALES (Admin > Account categorisation; code 200
// is Sales unless set otherwise) - not just code 200. Net of VAT, INCLUDING
// retention (retention is posted to a separate code, 612, which is not Sales).
//
// Kept in ITS OWN store, one per project - invoiced:bycode:<project> =
//   { [invoice key]: { date, byCode: { '200': 1000, '201': 250, '612': -50 } } }
// - because the invoice LINE lists are rewritten by several syncs (the WIP
// sync replaces them nightly without line detail) and would lose it. Only the
// two syncs that read Xero's invoice lines write here. Totals are kept for
// EVERY code, so recategorising a code in bookkeeping changes the tracker
// without a re-sync.

export const BYCODE_KEY = (projectId) => `invoiced:bycode:${projectId}`

// Totals per account code for one invoice's lines (sign -1 for a credit note).
export function codeTotals(lineItems, sign = 1) {
  const byCode = {}
  for (const line of lineItems || []) {
    const code = String(line.AccountCode ?? '').trim()
    if (!code) continue
    byCode[code] = (byCode[code] || 0) + sign * (Number(line.LineAmount) || 0)
  }
  return byCode
}

export const invoiceKeyOf = (inv) => String(inv.xeroInvoiceId || inv.invoiceNumber || '')

// The same window rule as the invoice lines: invoices dated BEFORE the window
// are kept as stored; everything in the window (or undated) is taken fresh from
// this run - so an invoice deleted or voided in Xero drops out.
export function mergeWindowed(existing, fresh, winStr) {
  const out = {}
  for (const [k, v] of Object.entries(existing || {})) if (v && v.date && winStr && v.date < winStr) out[k] = v
  for (const [k, v] of Object.entries(fresh || {})) out[k] = v
  return out
}

// Is this account code Sales? Bookkeeping's rule - the code's category in
// Admin > Account categorisation; with none set, 200 is Sales.
export function isSalesCode(code, categorisation) {
  const c = String(code)
  let cat = categorisation && categorisation[c] && categorisation[c].category
  if (cat === 'ignore') cat = 'overheads'
  if (cat) return cat === 'sales'
  return c === '200'
}

// The project's Sales total from its store -> null when it has none yet (the
// caller then keeps the figure it had).
export function salesTotal(store, categorisation) {
  const entries = Object.values(store || {})
  if (!entries.length) return null
  let total = 0
  for (const e of entries) for (const [code, amt] of Object.entries(e.byCode || {})) if (isSalesCode(code, categorisation)) total += Number(amt) || 0
  return total
}
