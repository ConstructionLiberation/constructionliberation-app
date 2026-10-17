// COMMITTED COSTS (1221) - what has been ordered on a project but not yet billed.
// For each purchase order that is approved, sent or closed: the bills on the same
// project (the project's cost lines from Xero) that carry its PO number - in the
// bill's reference, its number or a line's description - from the same supplier.
//   billed    = those bill lines, ex VAT
//   committed = the PO's value ex VAT less what has been billed, never below 0;
//               0 once the PO is CLOSED ("Mark as fully billed").
// One copy, for the PO list, the project page and (next) the forecast margin.
import { get } from './db'
import { listPos, loadPo } from './purchaseOrders'
import { poTotal } from './poShared'

const ACTIVE = ['approved', 'sent', 'closed']
const alnum = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// the forms a PO number is written in on a bill: the whole number (APP-PO-0002 ->
// apppo0002), and the "PO-0002" part when the number contains one (po0002)
export function poKeys(number) {
  const whole = alnum(number)
  const m = String(number || '').match(/po[\s\-_/]*\d+/i)
  return [...new Set([whole, m ? alnum(m[0]) : ''].filter(k => k.length >= 4))]
}
// the key in the text, not followed by another digit (PO-0002 is not PO-00021)
function mentions(text, keys) {
  const t = alnum(text)
  return keys.some(k => { let i = t.indexOf(k); while (i >= 0) { if (!/\d/.test(t[i + k.length] || '')) return true; i = t.indexOf(k, i + 1) } return false })
}
// BILLS LINKED TO A PO BY HAND on Bills to check (1240): { billId: poId }. A linked bill counts
// against THAT PO only - never also matched automatically to another.
export const BILL_LINKS = 'bills:links'
export async function billLinks() { return (await get(BILL_LINKS).catch(() => null)) || {} }
// THE MATCHING RULE, for whole bills too (Bills to check): its PO number in the text, same supplier
export function billMentionsPo(po, contactId, text) {
  const keys = poKeys(po.number)
  return !!keys.length && (!contactId || !po.contactId || contactId === po.contactId) && mentions(text, keys)
}
export function billedAgainst(po, costLines, links = {}) {
  const keys = poKeys(po.number)
  const hits = (costLines || []).filter(l => {
    if (!l) return false
    const linked = l.billId && links[l.billId]
    if (linked) return linked === po.id
    return !!keys.length && (!l.contactId || !po.contactId || l.contactId === po.contactId) && mentions(`${l.reference || ''} ${l.invoiceNumber || ''} ${l.description || ''}`, keys)
  })
  if (!hits.length) return { billed: 0, bills: [] }
  const billed = Math.round(hits.reduce((a, l) => a + (Number(l.amount) || 0), 0) * 100) / 100
  const bills = Object.values(hits.reduce((m, l) => { const k = l.billId || l.invoiceNumber || l.reference || l.date; (m[k] = m[k] || { ref: l.invoiceNumber || l.reference || '', date: l.date, supplier: l.supplier, amount: 0 }).amount += Number(l.amount) || 0; return m }, {}))
  return { billed, bills }
}
export function committedOf(po, costLines, links = {}) {
  const net = poTotal(po)
  const { billed, bills } = billedAgainst(po, costLines, links)
  const committed = po.status === 'closed' ? 0 : Math.max(0, Math.round((net - billed) * 100) / 100)
  return { id: po.id, number: po.number, status: po.status, supplier: po.supplier, deliveryDate: po.deliveryDate || '', net, billed, committed, bills }
}
// a project's purchase orders and its committed total
export async function committedFor(projectId) {
  const pid = String(projectId || '')
  const lines = (await get(`costs:lines:${pid}`).catch(() => null)) || []
  const links = await billLinks()
  const out = []
  for (const s of await listPos()) {
    if (String(s.projectId || '') !== pid || !ACTIVE.includes(s.status)) continue
    const po = await loadPo(s.id); if (po) out.push(committedOf(po, lines, links))
  }
  return { projectId: pid, committed: Math.round(out.reduce((a, p) => a + p.committed, 0) * 100) / 100,
    billed: Math.round(out.reduce((a, p) => a + p.billed, 0) * 100) / 100, open: out.filter(p => p.committed > 0).length, pos: out }
}
