import { getClient } from './db'
import { currentTenant, currentSource } from './tenantContext'

// THE SENT-EMAIL LOG (1080).
//
// Every email the portal sends goes to one place - the email service at
// https://api.resend.com/emails - from some 30 different files. Rather than
// change each one (and hope every future one remembers), the server's fetch is
// wrapped ONCE: any call to that address is passed through untouched, and the
// result is recorded in the company's own database:
//
//   email:log  (newest first, capped at CAP)
//     { at, from, to[], cc[], bcc[], subject, attachments, source, ok, status, error }
//
// source = the route or scheduled job that sent it (lib/tenantContext.js).
//
// RULES
//   - The email and its response are never altered. The response is CLONED to
//     read an error, so the caller still reads its own body.
//   - Recording can never break sending: every step is guarded.
//   - The company is read at SEND time, never at module load - a module is
//     loaded once per server and would otherwise freeze one company's identity.
//   - Outside a company's context (nothing to attribute it to) nothing is kept.

export const EMAIL_LOG_KEY = 'email:log'
export const EMAIL_LOG_CAP = 3000
const RESEND = /^https:\/\/api\.resend\.com\/emails(\/batch)?(\?|$)/

const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String).slice(0, 50)

export function entryFor(payload, { ok, status, error, source, at = Date.now() }) {
  const p = payload || {}
  return {
    at, from: String(p.from || ''),
    to: list(p.to), cc: list(p.cc), bcc: list(p.bcc),
    subject: String(p.subject || '').slice(0, 250),
    attachments: Array.isArray(p.attachments) ? p.attachments.length : 0,
    source: source || '', ok: !!ok, status: status || 0, error: error ? String(error).slice(0, 300) : null,
  }
}

async function record(entries) {
  if (!entries.length || !currentTenant()) return
  const c = await getClient()
  if (!c.lpush) return
  await c.lpush(EMAIL_LOG_KEY, ...entries)
  await c.ltrim(EMAIL_LOG_KEY, 0, EMAIL_LOG_CAP - 1)
}

export function installEmailLog() {
  if (typeof globalThis.fetch !== 'function' || globalThis.__emailLogInstalled) return
  globalThis.__emailLogInstalled = true
  const orig = globalThis.fetch
  globalThis.fetch = async function emailLoggingFetch(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    const method = String((init && init.method) || 'GET').toUpperCase()
    if (method !== 'POST' || !RESEND.test(url)) return orig(input, init)

    let payloads = []
    try {
      const b = init && typeof init.body === 'string' ? JSON.parse(init.body) : null
      payloads = Array.isArray(b) ? b : b ? [b] : []
    } catch { payloads = [] }

    let res = null, thrown = null
    try { res = await orig(input, init) } catch (e) { thrown = e }

    try {
      let error = thrown ? (thrown.message || 'Network error') : null
      if (res && !res.ok) {
        try { const t = await res.clone().text(); try { error = JSON.parse(t).message || t } catch { error = t || `HTTP ${res.status}` } }
        catch { error = `HTTP ${res.status}` }
      }
      const meta = { ok: !!(res && res.ok) && !error, status: res ? res.status : 0, error, source: currentSource() }
      await record((payloads.length ? payloads : [{}]).map(p => entryFor(p, meta)))
    } catch { /* recording must never break sending */ }

    if (thrown) throw thrown
    return res
  }
}

export async function readEmailLog({ limit = 500 } = {}) {
  const c = await getClient()
  if (!c.lrange) return []
  const rows = await c.lrange(EMAIL_LOG_KEY, 0, Math.min(limit, EMAIL_LOG_CAP) - 1)
  return (rows || []).map(r => (typeof r === 'string' ? (() => { try { return JSON.parse(r) } catch { return null } })() : r)).filter(Boolean)
}
