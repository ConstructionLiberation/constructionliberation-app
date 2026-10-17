// THE SERVER CALLING ITSELF (1220). A few jobs fetch the portal's own API over HTTP
// (the outstanding-invoices report and the GP snapshot -> /api/dashboard; the design
// RFI notices -> /api/planning). They carry no login, so they were refused with a 401
// on the main address. They now send this key - derived from the session secret,
// never sent to a browser - and the middleware and the Site App guard accept it.
// Web Crypto only, so the same code runs in the middleware (edge) and on the server.
export async function internalKey() {
  const secret = process.env.SESSION_SECRET || 'dev-insecure-secret-change-me'
  const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`internal:${secret}`))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}
export async function internalHeaders() { return { 'x-internal-key': await internalKey() } }
const headerOf = (req, name) => (req && req.headers && (typeof req.headers.get === 'function' ? req.headers.get(name) : req.headers[name])) || ''
export async function isInternal(req) { const h = headerOf(req, 'x-internal-key'); return !!h && h === await internalKey() }
