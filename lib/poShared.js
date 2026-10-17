// Purchase orders - the parts the pages and the server share (1199). Browser-safe:
// no secrets, no storage.
export const lineTotal = (l) => Math.round((Number(l.qty) || 0) * (Number(l.price) || 0) * 100) / 100
export const poTotal = (po) => Math.round(((po && po.lines) || []).reduce((t, l) => t + lineTotal(l), 0) * 100) / 100
// VAT (1204) - standard by default, at the rate the PO was raised at; or "No VAT"
export const DEFAULT_VAT_RATE = 20
export const poVatRate = (po) => (po && po.vat === 'none') ? 0 : (po && po.vatRate != null ? Number(po.vatRate) : DEFAULT_VAT_RATE)
export const poVat = (po) => Math.round(poTotal(po) * poVatRate(po)) / 100
export const poGross = (po) => Math.round((poTotal(po) + poVat(po)) * 100) / 100
export const PO_STATUS = { draft: ['Draft', '#64748b'], approved: ['Approved - not sent', '#b45309'], sent: ['Sent to supplier', '#0f766e'], cancelled: ['Cancelled', '#999'] }
