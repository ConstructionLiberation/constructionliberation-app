// Purchase orders - the parts the pages and the server share (1199). Browser-safe:
// no secrets, no storage.
export const lineTotal = (l) => Math.round((Number(l.qty) || 0) * (Number(l.price) || 0) * 100) / 100
export const poTotal = (po) => Math.round(((po && po.lines) || []).reduce((t, l) => t + lineTotal(l), 0) * 100) / 100
// VAT (1204) - standard by default, at the rate the PO was raised at; or "No VAT"
export const DEFAULT_VAT_RATE = 20
export const poVatRate = (po) => (po && po.vat === 'none') ? 0 : (po && po.vatRate != null ? Number(po.vatRate) : DEFAULT_VAT_RATE)
export const poVat = (po) => Math.round(poTotal(po) * poVatRate(po)) / 100
export const poGross = (po) => Math.round((poTotal(po) + poVat(po)) * 100) / 100
// THE EMAIL TO THE SUPPLIER (1210) - a company template, filled in from the PO and
// editable before each send. The PO itself (delivery details, lines, totals,
// attachments, the link) always follows the message, added by the server.
export const PO_EMAIL_FIELDS = [['poNumber', 'PO number'], ['supplierName', 'Supplier'], ['projectName', 'Project'], ['jobNo', 'Job number'],
  ['deliveryDate', 'Delivery required'], ['raisedBy', 'Raised by'], ['companyName', 'Company name'], ['confirmationsTo', 'Order confirmations to']]
export const DEFAULT_PO_EMAIL = {
  subject: 'Purchase order {{poNumber}} - {{companyName}} - {{jobNo}}',
  body: 'Dear {{supplierName}},\n\nPlease find our purchase order {{poNumber}} for {{projectName}} below.\n\nPlease confirm receipt and the delivery date to {{confirmationsTo}}, and quote {{poNumber}} on your invoice.\n\nKind regards,\n{{raisedBy}}\n{{companyName}}',
}
export function poEmailValues(po, companyName) {
  const d = po && po.deliveryDate ? new Date(po.deliveryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  return { poNumber: (po && po.number) || '', supplierName: (po && (po.contactName || po.supplier)) || '', projectName: (po && po.projectName) || '', jobNo: (po && po.jobNo) || '',
    deliveryDate: d, raisedBy: (po && po.raisedBy) || '', companyName: companyName || '', confirmationsTo: (po && po.confirmationsTo) || '' }
}
export const fillPoEmail = (text, values) => String(text || '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in values ? values[k] : m)).replace(/ - {2,}/g, ' - ').replace(/( - )+$/g, '')
// A PO TICKED INTO A CASH FLOW FORECAST forecasts only what is still committed on it now -
// once billed that part is an actual cost (1223). Full note: lib/poForecast.js.
export function poLineAmount(m, committedById, saved, remainingByRef) {
  const s = Number(saved) || 0
  if (!m) return s
  // A COST-REMAINING LINE ticked in (1232) - never more than the CM's figure for it NOW; nothing
  // once the CM removes it; the saved figure if the costs remaining could not be read
  if (m.remRef && !m.poId) {
    if (!remainingByRef) return s
    const c = remainingByRef[m.remRef]
    if (c == null) return 0
    return Math.max(0, Math.min(s, Number(c) || 0))
  }
  if (!m.poId || !committedById) return s
  const c = committedById[m.poId]
  if (c == null) return 0
  return Math.max(0, Math.min(s, Number(c) || 0))
}
// a line that is LABOUR (a cost-remaining line in the labour category) - its money is labour, not materials
export const isLabourLine = (m) => !!(m && m.category === 'labour')

export const PO_STATUS = { closed: ['Billed - closed', '#475569'], 'awaiting-approval': ['Awaiting CM approval', '#7c3aed'], rejected: ['Rejected by CM', '#b42318'], draft: ['Draft', '#64748b'], approved: ['Approved - not sent', '#b45309'], sent: ['Sent to supplier', '#0f766e'], cancelled: ['Cancelled', '#999'] }
