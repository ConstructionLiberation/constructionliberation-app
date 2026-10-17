// THE SITE APP'S SIGN-IN, PROVED ON THE SERVER (1211). The PIN sign-in used to be
// remembered only in the browser; nothing on the server checked who later
// requests came from. Now a successful sign-in returns this token - signed,
// naming the Site App user and the company, lasting a working day - and routes
// that must know who is asking (purchase orders, setting a PIN) check it.
// The browser sends it as the x-ops-token header.
import crypto from 'crypto'
import { getOpsUsers } from './db'
import { currentTenantId } from './tenantContext'

const SECRET = () => process.env.PORTAL_SECRET || process.env.SESSION_SECRET || 'rock-portal-dev-secret'
const b64url = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const sign = (body) => crypto.createHmac('sha256', SECRET()).update(`ops:${body}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function createOpsToken({ uid, tenantId = null, hours = 14 }) {
  const body = b64url(JSON.stringify({ u: String(uid), t: tenantId || null, exp: Date.now() + hours * 3600000 }))
  return `${body}.${sign(body)}`
}
export function verifyOpsToken(token, expectedTenantId = null) {
  if (!token || !String(token).includes('.')) return null
  const [body, sig] = String(token).split('.')
  if (sign(body) !== sig) return null
  try {
    const p = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
    if (!p.exp || p.exp < Date.now()) return null
    if (expectedTenantId && String(p.t || '') !== String(expectedTenantId)) return null
    return { uid: p.u }
  } catch { return null }
}
// the signed-in Site App user making this request - active, in this company - or null
export async function opsUserFromReq(req) {
  const t = verifyOpsToken(req.headers && (req.headers['x-ops-token'] || req.headers['X-Ops-Token']), currentTenantId())
  if (!t) return null
  const u = ((await getOpsUsers()) || []).find(x => String(x.id) === String(t.uid) && x.active !== false)
  return u || null
}
