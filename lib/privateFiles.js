import { del, head, issueSignedToken, presignUrl, put } from '@vercel/blob-private'
import { currentTenant } from './tenantContext'

// PRIVATE FILES (1093) - estimate documents, documents on a rate. Server only.
//
// A SEPARATE, PRIVATE Vercel Blob store (token BLOB_PRIVATE_READ_WRITE_TOKEN),
// using the newer blob library under its own name (@vercel/blob-private), so
// every existing upload in the portal is untouched. Files here have no public
// address: they are read ONLY through /api/estimating/documents, which checks
// who is asking first.
//
// Paths: <company id>/<owner type>/<owner id>/<random>-<file name> - one
// company's files can never be addressed from another's.
export const MAX_BYTES = 50 * 1024 * 1024
export const ALLOWED_TYPES = [
  'application/pdf', 'image/*', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-outlook', 'message/rfc822', 'application/zip',
]

export const privateToken = () => process.env.BLOB_PRIVATE_READ_WRITE_TOKEN || ''
export const privateReady = () => !!privateToken()
export const companyId = () => { const t = currentTenant(); return (t && t.id) || 'default' }

// A safe folder name for an owner id (a build-up's ref holds spaces and '::').
export const folderOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'x'
export const prefixFor = (ownerType, ownerId) => `${companyId()}/${ownerType}/${folderOf(ownerId)}/`

// A link to ONE private file, read-only, that stops working after a few
// minutes - issued only after the route has checked who is asking. Large files
// open directly from storage (nothing passes through the 4.5 MB function limit).
export const LINK_MINUTES = 5
export async function shortLink(pathname) {
  const validUntil = Date.now() + LINK_MINUTES * 60 * 1000
  const signed = await issueSignedToken({ token: privateToken(), pathname, operations: ['get'], validUntil })
  const { presignedUrl } = await presignUrl(signed, { operation: 'get', pathname, access: 'private', validUntil })
  return presignedUrl
}
export async function fileExists(pathname) {
  try { return await head(pathname, { token: privateToken() }) } catch { return null }
}
export async function removeFile(pathname) {
  try { await del(pathname, { token: privateToken() }) } catch {}
}

// WRITE A FILE from the server (1242) - for a supplier's document on a bill query, sent
// through a page with no portal sign-in. Private: read back only through a checked route.
export async function putPrivate(pathname, body, contentType) {
  const r = await put(pathname, body, { access: 'private', token: privateToken(), contentType: contentType || 'application/octet-stream', addRandomSuffix: false, allowOverwrite: false })
  return r && r.pathname ? r.pathname : pathname
}
