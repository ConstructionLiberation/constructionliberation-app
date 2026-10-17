// Site App calls that must say who is asking (1212) - they carry the sign-in token
// from the PIN sign-in (lib/opsToken). A 401 means the token is missing or old:
// the page asks the operative to sign in again.
export async function siteApi(path, body) {
  let token = ''
  try { token = sessionStorage.getItem('ops_token') || '' } catch {}
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ops-token': token }, body: JSON.stringify(body) } : { headers: { 'x-ops-token': token } })
  const d = await r.json().catch(() => ({}))
  if (r.status === 401) { const e = new Error('Please sign out and sign in again to use purchase orders.'); e.signIn = true; throw e }
  if (!r.ok) throw new Error(d.error || 'Something went wrong')
  return d
}
