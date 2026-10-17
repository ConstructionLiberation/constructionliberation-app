// PURCHASE ORDERS (1199) - raised in the app from the price list.
//
// Stage 2a: raised by the office (approved on raising), sent to the supplier by
// email with a no-login link to the PO, and added to Deliveries. Nothing is written
// to Xero yet - that is stage 3 (it needs Xero write permission). A PO is a
// COMMITMENT, never a cost: costs are only ever read from approved bills in Xero.
//
//   po:index          [{ id, number, status, projectId, jobNo, projectName, supplier, total, raisedBy, raisedAt, sentAt }]
//   po:<id>           the whole PO
//   po:settings       { prefix, next, width }   - the numbering, set by an admin
//   po:counter        the last number used (atomic where the store allows)
//
// A PO: { id, number, status: 'approved'|'sent'|'cancelled', projectId, jobNo, projectName,
//   supplier (price-list name), contactId, contactName, to (email), lines: [{ ref, code,
//   description, qty, unit, price }], deliveryAddress, deliveryDate, notes, raisedBy,
//   raisedByEmail, raisedAt, approvedBy, approvedAt, sentAt, sentTo, cancelledAt, history }
import crypto from 'crypto'
import { get, set, getClient } from './db'

export const PO_INDEX = 'po:index'
export const PO_SETTINGS = 'po:settings'
const PO_KEY = (id) => `po:${id}`
const COUNTER = 'po:counter'
export const DEFAULT_PO_SETTINGS = { prefix: 'APP-PO-', next: 1, width: 4, confirmationsTo: '', vatRate: DEFAULT_VAT_RATE }

import { lineTotal, poTotal, poVat, poGross, poVatRate, DEFAULT_VAT_RATE } from './poShared'
export { lineTotal, poTotal, poVat, poGross, poVatRate }

// "next" is the REAL next number - from the counter once POs have been raised (1202)
export async function loadPoSettings() {
  const st = { ...DEFAULT_PO_SETTINGS, ...((await get(PO_SETTINGS)) || {}) }
  const last = await get(COUNTER)
  return (last != null && Number.isFinite(Number(last))) ? { ...st, next: Number(last) + 1 } : st
}
export async function savePoSettings(s) {
  const clean = { prefix: String(s.prefix ?? DEFAULT_PO_SETTINGS.prefix).replace(/[^A-Za-z0-9\-_/]/g, '').slice(0, 20), next: Math.max(1, Math.floor(Number(s.next) || 1)), width: Math.min(8, Math.max(1, Math.floor(Number(s.width) || 4))),
    confirmationsTo: String(s.confirmationsTo || '').trim().slice(0, 200),   // the default address for order confirmations (1200)
    vatRate: Math.min(100, Math.max(0, Number(s.vatRate ?? DEFAULT_VAT_RATE) || 0)) }   // the standard VAT rate for new POs (1204)
  // THE COUNTER MOVES ONLY WHEN THE NEXT NUMBER IS CHANGED (1202). Saving any other
  // setting (e.g. the confirmations address) used to put it back to the stored start
  // and reissue numbers already used.
  const current = await loadPoSettings()
  await set(PO_SETTINGS, clean)
  if (clean.next !== current.next) await set(COUNTER, clean.next - 1)
  return { ...clean }
}
// THE NEXT PO NUMBER - atomic where the store can count (two people raising at once
// never get the same number); a plain read-and-write otherwise.
export async function takeNumber() {
  const s = await loadPoSettings()
  let n
  try {
    const c = await getClient()
    if (c && typeof c.incr === 'function') {
      if ((await c.get(COUNTER)) == null) await c.set(COUNTER, s.next - 1)
      n = Number(await c.incr(COUNTER))
    }
  } catch {}
  if (!n) { const last = Number(await get(COUNTER)); n = (Number.isFinite(last) ? last : s.next - 1) + 1; await set(COUNTER, n) }
  return `${s.prefix}${String(n).padStart(s.width, '0')}`
}

export const summaryOf = (po) => ({ id: po.id, number: po.number, status: po.status, projectId: po.projectId, jobNo: po.jobNo, projectName: po.projectName, supplier: po.supplier,
  contactId: po.contactId || '', contactName: po.contactName || '',
  total: poTotal(po), vat: poVat(po), gross: poGross(po), raisedBy: po.raisedBy, raisedAt: po.raisedAt, sentAt: po.sentAt || null, deliveryDate: po.deliveryDate || '' })
export async function listPos() { return (await get(PO_INDEX)) || [] }
export async function loadPo(id) { return await get(PO_KEY(id)) }
// a draft that is deleted (1201) - only drafts can be
export async function deletePo(id) {
  try { const c = await getClient(); if (c && typeof c.del === 'function') await c.del(PO_KEY(id)); else await set(PO_KEY(id), null) } catch { await set(PO_KEY(id), null) }
  await set(PO_INDEX, ((await get(PO_INDEX)) || []).filter(x => x.id !== id))
}
export async function savePo(po) {
  await set(PO_KEY(po.id), po)
  const idx = (await get(PO_INDEX)) || []
  await set(PO_INDEX, [summaryOf(po), ...idx.filter(x => x.id !== po.id)])
}

// THE SUPPLIER'S LINK - no portal account: the token IS the authentication. It is
// signed, names ONE purchase order and the company, and expires (a year).
const SECRET = () => process.env.PORTAL_SECRET || process.env.SESSION_SECRET || 'rock-portal-dev-secret'
const b64url = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const sign = (body) => crypto.createHmac('sha256', SECRET()).update(`po:${body}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export function createPoToken({ id, tenantId = null, days = 365 }) {
  const body = b64url(JSON.stringify({ p: String(id), t: tenantId || null, exp: Date.now() + days * 86400000 }))
  return `${body}.${sign(body)}`
}
export function verifyPoToken(token, expectedTenantId = null) {
  if (!token || !String(token).includes('.')) return null
  const [body, sig] = String(token).split('.')
  if (sign(body) !== sig) return null
  try {
    const p = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
    if (!p.exp || p.exp < Date.now()) return null
    if (expectedTenantId && String(p.t || '') !== String(expectedTenantId)) return null
    return { id: p.p, tenant: p.t || null }
  } catch { return null }
}

// A DELIVERIES ROW for an approved PO - the same shape as one pulled from Xero, so the
// schedule treats both alike; source 'app'. Until stage 3 app POs are not in Xero, so
// Deliveries would not otherwise see them.
export function deliveryRowFor(po) {
  return { id: `app_${po.id}`, source: 'app', purchaseOrderId: null, appPoId: po.id, poNumber: po.number, supplier: po.contactName || po.supplier,
    orderDate: String(po.approvedAt || po.raisedAt || '').slice(0, 10), deliveryAddress: po.deliveryAddress || '', requiredDeliveryDate: po.deliveryDate || '',
    lineItems: (po.lines || []).map(l => ({ description: l.description, quantity: Number(l.qty) || 0, unit: l.unit || '' })),
    projectName: po.projectName || '', projectNo: po.jobNo || '', poSent: !!po.sentAt, supplierConfirmedDate: false, secondCheck: false,
    actualDeliveryDate: '', attachments: [], comments: '', createdAt: Date.now() }
}
