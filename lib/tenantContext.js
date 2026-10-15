// WHICH CUSTOMER IS THIS REQUEST FOR.
//
// The problem this solves: getClient() is called from roughly 200 places, none
// of which have the request. The web address that says which customer it is
// arrives at the front door of an API route; getClient() lives several calls
// deep. Nothing carries it between the two.
//
// AsyncLocalStorage does. withTenant() puts the customer in here at the start of
// a request, and anything running inside that request - however deep - can read
// it back. No argument is threaded through, no helper signature changes.
//
// It is per-request, not global. Two requests for different customers running at
// the same moment in the same warm function each see their own. A plain module
// variable would NOT do this: the second request would overwrite the first, and
// the first would finish by reading the second customer's id. That is the single
// most dangerous way to build this, and it looks identical in the editor.

import { AsyncLocalStorage } from 'async_hooks'

const storage = new AsyncLocalStorage()

// Run fn with this tenant in scope.
// meta.source (1080): the route or scheduled job running - so anything done
// inside it (an email sent, say) can say what caused it. A nested run inherits
// its parent's source.
export function runWithTenant(tenant, fn, meta = {}) {
  const parent = storage.getStore()
  return storage.run({ tenant, source: meta.source || (parent && parent.source) || '' }, fn)
}
export function currentSource() {
  const s = storage.getStore()
  return (s && s.source) || ''
}

// The tenant for the request currently running, or null outside one.
// Returns the whole record, not just the id - callers need the database
// credentials, the timezone, the module list.
export function currentTenant() {
  const s = storage.getStore()
  return (s && s.tenant) || null
}

// THE COMPANY'S OWN DETAILS for this request (1166) - loaded by withTenant
export function setCompany(c) { const s = storage.getStore(); if (s) s.company = c || null }
export function currentCompany() { const s = storage.getStore(); return (s && s.company) || null }

export function currentTenantId() {
  const t = currentTenant()
  return t ? t.id : null
}
