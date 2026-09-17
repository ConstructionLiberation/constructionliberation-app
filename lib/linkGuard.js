import { reportError } from './errorReport'
import { currentTenant } from './tenantContext'

// EVERY LINK IN AN OUTGOING EMAIL MUST BE ON THE CUSTOMER'S OWN ADDRESS.
//
// The fault this exists to catch produced no error of any kind. The variation chase
// cron built its links from req.headers.host; Vercel invokes crons against the
// DEPLOYMENT url, so every chase link pointed at rock-<hash>-rock-roofing.vercel.app.
// Vercel's Deployment Protection sits in front of those, so the customer got a Vercel
// sign-in page - before the app ran at all.
//
// The cron succeeded. Resend accepted the email. Every figure in it was right. It ran
// that way from the day it was written until a customer happened to mention it.
//
// Nothing in error reporting or cron health can catch that shape, because nothing went
// wrong. What can catch it is an INVARIANT: a link going to somebody outside the
// business must be on a host we own. That is checkable before the send, and it is true
// of every email we will ever write.
//
// WARN, DO NOT BLOCK - for now.
//
// A guard that refuses to send is worse than a bad link if the host list is ever
// incomplete: the customer gets no application at all. So this reports and lets the
// email go. Once it has run for a week with no false positives, flip BLOCK to true and
// it starts refusing instead. That is the only line that needs changing.
const BLOCK = false

// Hosts that are legitimately ours. The tenant's own list first - that is the whole
// point under multi-tenancy, where "our domain" is a different answer per customer.
export function ownHosts() {
  const out = new Set()
  try {
    const t = currentTenant()
    for (const h of (t?.hosts || [])) {
      const v = String(h || '').trim().toLowerCase()
      if (v) out.add(v)
    }
  } catch { /* no tenant in scope - fall through to the env below */ }
  if (!out.size) {
    // Single tenant: the same default the rest of the codebase uses.
    const base = process.env.PORTAL_BASE_URL || process.env.PORTAL_URL || 'https://app.rockroofing.co.uk'
    try { out.add(new URL(base).host.toLowerCase()) } catch { out.add('app.rockroofing.co.uk') }
  }
  return out
}

// Links that are fine to point elsewhere: an unsubscribe, a mailto, an anchor, and the
// blob store, which is where uploaded documents genuinely live.
function isExempt(url) {
  const u = url.toLowerCase()
  if (u.startsWith('mailto:') || u.startsWith('tel:') || u.startsWith('#')) return true
  if (u.includes('.public.blob.vercel-storage.com')) return true
  return false
}

// Returns { ok, bad } and raises an error email when something is wrong. Never throws -
// a guard that takes down a send while reporting a link problem has made things worse.
export async function checkEmailLinks(html, where, req) {
  const bad = []
  try {
    const hosts = ownHosts()
    const hrefs = String(html || '').match(/href\s*=\s*["']([^"']+)["']/gi) || []
    for (const raw of hrefs) {
      const m = /href\s*=\s*["']([^"']+)["']/i.exec(raw)
      const url = (m && m[1] || '').trim()
      if (!url || isExempt(url)) continue
      // Relative links never leave our domain, so they cannot be wrong.
      if (!/^https?:\/\//i.test(url)) continue
      let host = ''
      try { host = new URL(url).host.toLowerCase() } catch { continue }
      if (!hosts.has(host)) bad.push({ url, host })
    }

    if (bad.length) {
      await reportError({
        where: `outbound link check: ${where}`,
        error: new Error(
          `${bad.length} link(s) in an outgoing email point somewhere we do not own: `
          + bad.map(b => b.host).join(', ')
          + `. Expected one of: ${[...hosts].join(', ')}.`
        ),
        req,
        detail: { where, bad, expected: [...ownHosts()], blocked: BLOCK },
      }).catch(() => {})
    }
  } catch { /* the check itself must never break a send */ }

  return { ok: bad.length === 0, bad, blocked: BLOCK && bad.length > 0 }
}
