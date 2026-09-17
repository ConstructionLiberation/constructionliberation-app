import crypto from 'crypto'
import { get } from './db'
import { REGISTRY_KEY } from './projectRegistry'

// IN QUERY - the state the portal keeps ALONGSIDE Xero.
//
// Xero holds the cost and the fact it is tagged to the In Query tracking option.
// Everything else - who is answering it, whether they have approved it, what they
// said - is ours, and lives under one key.
//
//   bookkeeping:inquery = {
//     [invoiceKey]: {
//       assignee: { name, email, userId },     // portal user OR typed in by hand
//       status:   'query' | 'approved',
//       comments: [ { by, body, at } ],
//       updatedAt, approvedAt, approvedBy,
//     }
//   }
//
// KEYED BY INVOICE, NOT BY LINE. The table groups an invoice's lines into one row and
// a person answers the invoice, not each line of it. Keying by line would ask the
// same question five times and let one invoice be half approved.
//
// Nothing here deletes itself. When the bookkeeper re-tags a cost to a real project
// in Xero it stops arriving as In Query and simply stops appearing - the record stays
// so the Approved view can still show what was said about it.
export const INQUERY_KEY = 'bookkeeping:inquery'

// WHICH JOB IS THIS COST FOR?
//
// Xero cannot answer it - that is the whole reason the cost is In Query. So the
// project is recorded HERE, on the same record as the assignee and the comments,
// as { xeroId, jobNo, name }. It is a statement of intent by the people who know,
// not a Xero fact, and re-tagging in Xero remains the thing that actually moves it.
//
// ONE LIST, BOTH SIDES. The bookkeeper's table and the token-authenticated review
// page call the same function, because two lists that drift is how a reviewer picks
// a project the bookkeeper cannot see.
//
// Source is projects:registry, NOT Xero. The registry is our own record of every
// project Xero has ever returned, so it costs one read, it survives a tracking
// option being deleted, and - the part that matters - the review page never has to
// touch Xero. The person holding that link is often outside the business.
const JUNK = ['in query', 'old projects', 'internal', 'head office cost']

export async function inqueryProjectOptions() {
  let registry = {}
  let hidden = []
  try { registry = (await get(REGISTRY_KEY)) || {} } catch { registry = {} }
  try { hidden = (await get('config:hidden-projects')) || [] } catch { hidden = [] }
  const hide = new Set((Array.isArray(hidden) ? hidden : []).map(String))
  const out = []
  for (const [xeroId, r] of Object.entries(registry || {})) {
    if (!r || hide.has(String(xeroId))) continue
    const name = String(r.name || '').trim()
    // The tracking options that are not projects. Offering "In Query" as the answer
    // to "which job is this In Query cost for" is the obvious own goal.
    if (JUNK.includes(name.toLowerCase())) continue
    out.push({ xeroId: String(xeroId), jobNo: String(r.jobNo || ''), name })
  }
  // Job number descending, numerically - the job being asked about is nearly always
  // a recent one, and plain string sort puts J9 after J10.
  return out.sort((a, b) => String(b.jobNo).localeCompare(String(a.jobNo), undefined, { numeric: true }))
}

// One label rule, so the table, the email and the review page never disagree about
// how a project is written.
export function projectDisplay(p) {
  if (!p) return ''
  const j = String(p.jobNo || '').trim()
  const n = String(p.name || '').trim()
  if (j && n) return `${j} - ${n}`
  return j || n
}

// Normalise whatever a caller sends into the stored shape, or null to clear it.
export function projectFromId(xeroId, options) {
  const id = String(xeroId || '').trim()
  if (!id) return null
  const hit = (options || []).find(o => String(o.xeroId) === id)
  return hit ? { xeroId: hit.xeroId, jobNo: hit.jobNo, name: hit.name } : null
}

// date|supplier|reference - the same grouping the Costs tab on a project uses. Not
// the Xero invoice id, because the bookkeeping feed does not carry one.
export function invoiceKeyOf(row) {
  if (!row) return ''
  return [row.date || '', row.supplier || row.contact || '', row.reference || row.invoiceNumber || ''].join('|')
}

// The same env vars variationInstruct.js signs with, so there is one secret to set in
// Vercel rather than a second one nobody knows about until links stop verifying.
const SECRET = () => process.env.PORTAL_SECRET || process.env.SESSION_SECRET || 'rock-portal-dev-secret'
const b64url = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const sign = (body) => crypto.createHmac('sha256', SECRET()).update(body).digest('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// The review link has to work for somebody who has no portal account - a manually
// added name with an email address. So the token IS the authentication: signed, tied
// to one email, and it expires.
// Carries the customer, and is checked against the one resolved from the
// address. Passed in rather than read from request-scoped storage: this file is
// imported by components/InQueryTable.js, so a tenantContext import would drag
// async_hooks into the browser bundle and break the build. Same reason as the variation link: one signing secret across every
// customer means a link from one verifies on another's site.
export function createReviewToken({ email, tenantId = null, days = 60 }) {
  const body = b64url(JSON.stringify({
    e: String(email || '').toLowerCase(),
    t: tenantId || null,
    exp: Date.now() + days * 86400000,
  }))
  return `${body}.${sign(body)}`
}

export function verifyReviewToken(token, expectedTenantId = null) {
  if (!token || !String(token).includes('.')) return null
  const [body, sig] = String(token).split('.')
  if (sign(body) !== sig) return null
  try {
    const p = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
    if (!p.exp || p.exp < Date.now()) return null
    if (expectedTenantId && String(p.t || '') !== String(expectedTenantId)) return null
    return { email: p.e, tenant: p.t || null }
  } catch { return null }
}

// A cost is IN QUERY until somebody says otherwise. An invoice nobody has touched
// still needs answering, so the absence of a record means query, not approved.
export function statusOf(state, key) {
  const r = state && state[key]
  return (r && r.status === 'approved') ? 'approved' : 'query'
}
