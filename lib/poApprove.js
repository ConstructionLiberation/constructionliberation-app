// DECIDING A PURCHASE ORDER RAISED IN THE SITE APP (1216) - approve (and send),
// or reject - one copy for the project's Contracts Manager (Site App) and for any
// portal user covering when the CM is away. Returns { po, sent?, sendError? } or
// { status, error }. When someone other than the CM decides, the CM is told.
import { esc, money, setDelivery } from './poData'
import { fromEmail } from './tenantSettings'
import { savePo, takeNumber, loadPoSettings } from './purchaseOrders'
import { poTotal, poGross } from './poShared'
import { sendPurchaseOrder } from './poSend'

export async function mail(to, subject, html) {
  const key = process.env.RESEND_API_KEY
  if (!key || !to) return false
  try { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: fromEmail('notify'), to: [to], subject, html }) }); return r.ok } catch { return false }
}
export const summary = (po) => `<p style="margin:0 0 6px"><strong>${esc(po.number || 'New purchase order')}</strong> - ${esc([po.jobNo, po.projectName].filter(Boolean).join(' '))}</p><p style="margin:0 0 6px">${esc(po.contactName || po.supplier)} - ${money(poGross(po))} inc VAT (${money(poTotal(po))} ex VAT)</p><p style="margin:0 0 12px;color:#555">Raised by ${esc(po.raisedBy)}</p>`

// action 'approve' | 'reject'; by = who decided; where = e.g. ' by Mike Fleming in the portal'
// (blank for the CM in the Site App); cm = { email, firstName } to tell when it is not them
export async function decidePo(po, { action, by, where = '', reason: reasonIn = '', send = false, replyFallback = '', cm = null }) {
  const now = new Date().toISOString()
  const tellCm = async (p, what) => { if (cm && cm.email) await mail(cm.email, `PO ${what.split(' by ')[0]} for you - ${p.number || p.jobNo} ${p.contactName || p.supplier}`, `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Hi ${esc(cm.firstName || '')},</p><p>A purchase order on your project was ${esc(what)} while you were away.</p>${summary(p)}</div>`) }
    if (po.status !== 'awaiting-approval') return { status: 409, error: `This purchase order has already been ${po.status === 'approved' || po.status === 'sent' ? 'approved' : po.status}.` }
    if (action === 'reject') {
      const reason = String(reasonIn || '').trim().slice(0, 500)
      if (!reason) return { status: 400, error: 'Say why it is rejected' }
      const next = { ...po, status: 'rejected', rejectedBy: by, rejectedAt: now, rejectReason: reason, history: [...(po.history || []), { at: now, by, what: `Rejected${where}: ${reason}` }] }
      await savePo(next)
      await mail(po.raisedByEmail, `PO rejected - ${po.jobNo} ${po.contactName || po.supplier}`, `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Your purchase order was rejected by ${esc(by)}:</p><p><em>${esc(reason)}</em></p>${summary(po)}</div>`)
      await tellCm(next, `rejected by ${by}`)
      return { po: next }
    }
    // APPROVED: numbered now, at the VAT rate in force; into Deliveries; ready for the office to send
    const next = { ...po, number: await takeNumber(), status: 'approved', vatRate: (await loadPoSettings()).vatRate, approvedBy: by, approvedAt: now, history: [...(po.history || []), { at: now, by, what: where ? `Approved${where}` : 'Approved by the CM' }] }
    await savePo(next); await setDelivery(next)
    // APPROVE AND SEND (1215) - the same email the office sends; "approve only" leaves it for the office
    if (send) {
      const s = await sendPurchaseOrder(next, { by, replyFallback })
      if (s.error) { await tellCm(next, `approved by ${by}`); return { po: next, sendError: s.error } }
      await mail(po.raisedByEmail, `PO approved and sent - ${next.number} - ${po.jobNo} ${po.contactName || po.supplier}`, `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Your purchase order was approved by ${esc(by)} and sent to the supplier.</p>${summary(s.po)}</div>`)
      await tellCm(s.po, `approved and sent by ${by}`)
      return { po: s.po, sent: true }
    }
    await mail(po.raisedByEmail, `PO approved - ${next.number} - ${po.jobNo} ${po.contactName || po.supplier}`, `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Your purchase order was approved by ${esc(by)}. The office will send it to the supplier.</p>${summary(next)}</div>`)
    await tellCm(next, `approved by ${by}`)
    return { po: next }
}
