// SUPPLIER QUERIES ON BILLS (1242) - from Bills to Check: "Query with supplier" emails the
// supplier a link that opens ONE query with no portal account (a random token is the key);
// they reply and can attach a credit note or document; the person who raised it is told.
//   bills:queries          -> { billId: query }
//     query = { id, billId, token, status: 'open' | 'answered' | 'resolved',
//               to, supplier, bill: { number, reference, date, subTotal, total },
//               po: { number, net, billed } | null, raisedBy, raisedByEmail,
//               messages: [{ at, from: 'us' | 'supplier', by, text, files: [{ name, path, type }] }],
//               createdAt, resolvedAt, resolvedBy }
//   bills:query-token:<t>  -> { billId }
// Files go to the PRIVATE store (lib/privateFiles) - no public address. The supplier's replies go to
// the portal user who raised the query: emailed to them, and on the bill (the email's reply-to is them too).
import crypto from 'crypto'
import { get, set } from './db'
import { fromEmail, baseUrl, companyName } from './tenantSettings'
import { putPrivate, prefixFor, privateReady } from './privateFiles'

export const QUERIES_KEY = 'bills:queries'
export const TOKEN_KEY = (t) => `bills:query-token:${t}`
export const MAX_FILE = 3 * 1024 * 1024
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const money = (n) => `£${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const loadQueries = async () => (await get(QUERIES_KEY).catch(() => null)) || {}
export const saveQueries = (q) => set(QUERIES_KEY, q)
export async function queryByToken(token) {
  const t = String(token || '')
  if (!/^[a-f0-9]{40}$/.test(t)) return null
  const ref = await get(TOKEN_KEY(t)).catch(() => null)
  if (!ref) return null
  const q = (await loadQueries())[ref.billId]
  return q && q.token === t ? q : null
}
export const supplierLink = (q) => `${baseUrl()}/bill-query?t=${q.token}`

async function mail({ to, subject, html, replyTo, attachments }) {
  const key = process.env.RESEND_API_KEY
  if (!key) return { error: 'Email is not set up (RESEND_API_KEY missing).' }
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail('notify'), to: Array.isArray(to) ? to : [to], ...(replyTo && EMAIL.test(replyTo) ? { reply_to: replyTo } : {}), subject: String(subject).slice(0, 300), html, ...(attachments && attachments.length ? { attachments } : {}) }) })
  if (!r.ok) { const t = await r.text().catch(() => ''); return { error: `The email could not be sent (${r.status}) ${t.slice(0, 200)}` } }
  return { ok: true }
}
const para = (t) => String(t || '').split('\n').map(l => `<p style="margin:0 0 8px">${esc(l) || '&nbsp;'}</p>`).join('')
const wrap = (inner) => `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:640px">${inner}</div>`
const button = (href, text) => `<p><a href="${href}" style="display:inline-block;background:#0f766e;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none">${text}</a></p>`
const billLine = (q) => `your invoice ${esc(q.bill.number || q.bill.reference || '')}${q.bill.date ? ` dated ${esc(q.bill.date.split('-').reverse().join('/'))}` : ''} (${money(q.bill.total)} inc VAT)${q.po ? ` against our purchase order ${esc(q.po.number)}` : ''}`

// START: the query, its link, and the email to the supplier
export async function startQuery({ bill, po, to, message, by, byEmail, byPhone }) {
  if (!EMAIL.test(String(to || ''))) return { error: 'Give the supplier\'s email address.' }
  if (!String(message || '').trim()) return { error: 'Write the query.' }
  const all = await loadQueries()
  if (all[bill.id] && all[bill.id].status !== 'resolved') return { error: 'This bill already has an open query - reply to it instead.' }
  const now = new Date().toISOString()
  const q = { id: `bq_${Date.now().toString(36)}`, billId: bill.id, token: crypto.randomBytes(20).toString('hex'), status: 'open', to: String(to).trim().toLowerCase(),
    supplier: bill.contactName || '', bill: { number: bill.number || '', reference: bill.reference || '', date: bill.date || '', subTotal: bill.subTotal, total: bill.total },
    po: po ? { number: po.number, net: po.net, billed: po.billed } : null, raisedBy: by || '', raisedByEmail: byEmail || '',
    messages: [{ at: now, from: 'us', by: by || '', text: String(message).trim(), files: [] }], createdAt: now }
  const co = companyName() || ''
  const sig = `<p style="margin:14px 0 0">Kind regards,</p><p style="margin:6px 0 0"><strong>${esc(by)}</strong>${co ? `<br>${esc(co)}` : ''}${byEmail ? `<br>${esc(byEmail)}` : ''}${byPhone ? `<br>${esc(byPhone)}` : ''}</p>`
  const sent = await mail({ to: q.to, replyTo: byEmail, subject: `Query on ${q.bill.number ? `invoice ${q.bill.number}` : 'your invoice'}${q.po ? ` - PO ${q.po.number}` : ''} - ${co}`,
    html: wrap(`${para(message)}${button(supplierLink(q), 'View the query and reply')}<p style="color:#666;font-size:13px">This is about ${billLine(q)}. Use the link to reply and to attach a credit note or any document - no account needed.</p>${sig}`) })
  if (sent.error) return sent
  all[bill.id] = q
  await saveQueries(all)
  await set(TOKEN_KEY(q.token), { billId: bill.id })
  return { query: q }
}

// A MESSAGE on the query - ours (emails the supplier) or the supplier's (tells whoever raised it)
export async function addMessage(billId, { from, by, text, file, byEmail }) {
  const all = await loadQueries(); const q = all[billId]
  if (!q) return { error: 'That query no longer exists.' }
  if (!String(text || '').trim() && !file) return { error: 'Write a reply or attach a document.' }
  const now = new Date().toISOString(), files = []
  if (file) {
    if (!privateReady()) return { error: 'Documents cannot be stored yet (the private store is not set up).' }
    const bytes = Buffer.from(String(file.data || ''), 'base64')
    if (!bytes.length) return { error: 'The document arrived empty.' }
    if (bytes.length > MAX_FILE) return { error: 'That document is over 3 MB - please send a smaller copy.' }
    const safe = String(file.name || 'document').replace(/[^\w .()-]+/g, '').slice(0, 120) || 'document'
    const path = await putPrivate(`${prefixFor('bill-query', billId)}${Date.now().toString(36)}-${safe}`, bytes, file.type)
    files.push({ name: safe, path, type: String(file.type || '') })
  }
  q.messages = [...(q.messages || []), { at: now, from, by: by || (from === 'supplier' ? q.supplier : ''), text: String(text || '').trim(), files }]
  q.status = from === 'supplier' ? 'answered' : 'open'
  all[billId] = q
  await saveQueries(all)
  const co = companyName() || ''
  if (from === 'supplier' && q.raisedByEmail) await mail({ to: q.raisedByEmail, subject: `${q.supplier} replied - query on ${q.bill.number || 'their invoice'}`, html: wrap(`<p><strong>${esc(q.supplier)}</strong> replied to the query on ${billLine(q).replace('your invoice', 'their invoice').replace('our purchase order', 'PO')}:</p>${para(text)}${files.length ? `<p>Attached: ${files.map(f => esc(f.name)).join(', ')}</p>` : ''}${button(`${baseUrl()}/bookkeeping-bills`, 'Open Bills to Check')}`) }).catch(() => {})
  if (from === 'us') { const r = await mail({ to: q.to, replyTo: byEmail, subject: `Re: query on ${q.bill.number ? `invoice ${q.bill.number}` : 'your invoice'} - ${co}`, html: wrap(`${para(text)}${button(supplierLink(q), 'View the query and reply')}<p style="margin-top:14px">Kind regards,<br><strong>${esc(by)}</strong>${co ? `<br>${esc(co)}` : ''}</p>`) }); if (r.error) return r }
  return { query: q }
}

export async function setStatus(billId, status, by) {
  const all = await loadQueries(); const q = all[billId]
  if (!q) return { error: 'That query no longer exists.' }
  q.status = status
  if (status === 'resolved') { q.resolvedAt = new Date().toISOString(); q.resolvedBy = by || '' } else { delete q.resolvedAt; delete q.resolvedBy }
  all[billId] = q; await saveQueries(all)
  return { query: q }
}

// what the SUPPLIER sees - no tokens, no internal names beyond the sender's
export const publicView = (q) => ({ status: q.status, supplier: q.supplier, bill: q.bill, po: q.po, company: companyName() || '',
  messages: (q.messages || []).map((m, i) => ({ at: m.at, from: m.from, by: m.from === 'us' ? (m.by || companyName() || '') : (m.by || q.supplier), text: m.text, files: (m.files || []).map((f, j) => ({ name: f.name, i, j })) })) })
