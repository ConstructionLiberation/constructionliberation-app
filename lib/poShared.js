// Purchase orders - the parts the pages and the server share (1199). Browser-safe:
// no secrets, no storage.
export const lineTotal = (l) => Math.round((Number(l.qty) || 0) * (Number(l.price) || 0) * 100) / 100
export const poTotal = (po) => Math.round(((po && po.lines) || []).reduce((t, l) => t + lineTotal(l), 0) * 100) / 100
export const PO_STATUS = { approved: ['Approved - not sent', '#b45309'], sent: ['Sent to supplier', '#0f766e'], cancelled: ['Cancelled', '#999'] }
