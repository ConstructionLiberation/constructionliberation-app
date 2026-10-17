// SENDING A PURCHASE ORDER TO THE SUPPLIER (1215) - one copy, for the office
// (portal) and the Contracts Manager (Site App): the company template (or the
// message edited in the send box), the PO - delivery details, lines, VAT and totals -
// its attachments as files, the view / print link, reply-to the confirmations
// address. Returns { po } or { status, error }.
import { listDocs } from './documentsStore'
import { privateReady, shortLink } from './privateFiles'
import { currentTenantId } from './tenantContext'
import { fromEmail, baseUrl, companyName } from './tenantSettings'
import { savePo, loadPoSettings, createPoToken } from './purchaseOrders'
import { DEFAULT_PO_EMAIL, poEmailValues, fillPoEmail, lineTotal, poTotal, poVat, poGross, poVatRate } from './poShared'
import { esc, money, EMAIL, deliveryHtml, setDelivery } from './poData'

export const poLinkFor = (po) => `${baseUrl()}/po?token=${encodeURIComponent(createPoToken({ id: po.id, tenantId: currentTenantId() }))}`

export async function sendPurchaseOrder(po, opts = {}) {
  if (po.status !== 'approved' && po.status !== 'sent') return { status: 409, error: po.status === 'awaiting-approval' ? 'This purchase order is awaiting the CM\'s approval' : `This purchase order has been ${po.status}` }
  const now = new Date().toISOString()
    const to = String(opts.to || po.to || '').trim()
    if (!EMAIL.test(to)) return { status: 400, error: 'Enter the supplier\'s email address' }
    const key = process.env.RESEND_API_KEY
    if (!key) return { status: 500, error: 'Email is not set up for the portal' }
    const link = poLinkFor(po), co = companyName()
    // THE MESSAGE (1210): what was edited in the send box, else the company template filled in
    const st = await loadPoSettings(), vals = poEmailValues(po, co)
    const subject = String(opts.subject || '').trim() || fillPoEmail(st.emailSubject || DEFAULT_PO_EMAIL.subject, vals)
    const body = String(opts.body != null ? opts.body : '').trim() || fillPoEmail(st.emailBody || DEFAULT_PO_EMAIL.body, vals)
    // THE ATTACHMENTS, ATTACHED (1202) - the PO's attachments and its access route
    // documents go with the email as files; the email service fetches each through a
    // link that lasts minutes. They are also on the supplier's page.
    const [attachDocs, accessDocs] = await Promise.all([listDocs('po', po.id).catch(() => []), listDocs('po-access', po.id).catch(() => [])])
    let attachments = []
    if (privateReady()) {
      try { attachments = await Promise.all([...attachDocs, ...accessDocs].map(async d => ({ filename: d.name, path: await shortLink(d.pathname) }))) }
      catch (e) { return { status: 502, error: `The attachments could not be prepared: ${e.message}` } }
    }
    const rows = po.lines.map(l => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(l.description)}${l.code ? `<br><span style="color:#888;font-size:12px">${esc(l.code)}</span>` : ''}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${esc(l.qty)} ${esc(l.unit)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(l.price)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(lineTotal(l))}</td></tr>`).join('')
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:680px">
      <div style="white-space:normal;margin:0 0 18px">${esc(body).split(/\n{2,}/).map(par => `<p style="margin:0 0 10px">${par.replace(/\n/g, '<br>')}</p>`).join('')}</div>
      <h3 style="margin:0 0 4px;font-size:16px">Purchase order ${esc(po.number)}</h3><p style="margin:0 0 10px;color:#555">${esc(co)} - ${esc([po.jobNo, po.projectName].filter(Boolean).join(' '))}</p>
      ${deliveryHtml(po, accessDocs.length)}
      ${attachDocs.length ? `<p>Attached: ${attachDocs.map(d => esc(d.name)).join(', ')}</p>` : ''}
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin:10px 0"><tr style="background:#f5f5f3"><th style="padding:6px 8px;text-align:left">Item</th><th style="padding:6px 8px;text-align:right">Qty</th><th style="padding:6px 8px;text-align:right">Price</th><th style="padding:6px 8px;text-align:right">Total</th></tr>${rows}
      <tr><td colspan="3" style="padding:6px 8px;text-align:right">Subtotal (ex VAT)</td><td style="padding:6px 8px;text-align:right">${money(poTotal(po))}</td></tr>
      <tr><td colspan="3" style="padding:6px 8px;text-align:right">${po.vat === 'none' ? 'No VAT' : `VAT ${poVatRate(po)}%`}</td><td style="padding:6px 8px;text-align:right">${money(poVat(po))}</td></tr>
      <tr><td colspan="3" style="padding:8px;text-align:right;font-weight:bold">Total</td><td style="padding:8px;text-align:right;font-weight:bold">${money(poGross(po))}</td></tr></table>
      ${po.notes ? `<p><strong>Additional notes</strong><br>${esc(po.notes).replace(/\n/g, '<br>')}</p>` : ''}
      <p><a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none">View or print the purchase order</a></p>
      <p style="color:#888;font-size:12px">Raised by ${esc(po.raisedBy)}. ${po.confirmationsTo ? `Please send the order confirmation to ${esc(po.confirmationsTo)} - replying to this email reaches it.` : 'Reply to this email with any questions.'}</p></div>`
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail('notify'), to: [to], reply_to: po.confirmationsTo || po.raisedByEmail || opts.replyFallback || undefined, subject: subject.slice(0, 300), html, ...(attachments.length ? { attachments } : {}) }) })
    if (!r.ok) { const t = await r.text().catch(() => ''); return { status: 502, error: `The email could not be sent (${r.status}) ${t.slice(0, 200)}` } }
    const next = { ...po, status: 'sent', to, sentAt: now, sentTo: to, sentBy: opts.by || '', history: [...(po.history || []), { at: now, by: opts.by || '', what: `Sent to ${to}` }] }
    await savePo(next); await setDelivery(next)
    return { po: next }
}
