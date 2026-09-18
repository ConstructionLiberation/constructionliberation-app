import withTenant from '../../../lib/withTenant'
import { getClient } from '../../../lib/db'
import { requireRole } from '../../../lib/portalAuth'
import { currentTenantId } from '../../../lib/tenantContext'

// DOES THIS CUSTOMER'S DATABASE CONTAIN THIS STRING. READ ONLY. WRITES NOTHING.
//
// The leak hunt's one dependency, and the reason it is worth building before
// the test tenant exists rather than during the hunt.
//
// WHY A SCREEN IS NOT ENOUGH
// --------------------------
// Opening zztest's portal and seeing no Rock projects proves that the READ path
// resolved the right database. It proves nothing about the write path. A route
// that resolves zztest for its reads and Rock for its writes looks perfect on
// screen and quietly deposits one customer's data in another's store. Nobody
// would ever see it, because nobody looks at a database they are not using.
//
// Test B is: do a normal day's work in zztest with distinctive strings in it,
// then come here on ROCK and search for those strings. A hit is a leak. There
// is no other way to ask that question.
//
// WHICH DATABASE IT SEARCHES
// --------------------------
// The one belonging to whichever customer the ADDRESS resolves to - this route
// is wrapped in withTenant like any other. So the same URL on two hostnames
// searches two different databases, which is exactly what the test needs. The
// response says which customer answered, because a search that reports nothing
// is only meaningful if you know where it looked.
//
// GET /api/admin/find-string?q=<string>
//   &match=<pattern>   key pattern to scan, default *
//   &limit=<n>         stop after n hits, default 50
//   &keys=1            search key NAMES as well as values
//
// Case-insensitive. Values are serialised to JSON before matching, so a hit is
// found wherever it sits inside a record.
//
// WHAT IT DELIBERATELY DOES NOT RETURN
// ------------------------------------
// Never the matching value. A leak hunt is run by pasting output around, and a
// route that prints one customer's records into a browser tab to prove they
// should not be there has reproduced the leak it was built to detect. It
// returns the KEY, the size, and a short window of characters either side of
// the match so you can tell a real hit from a coincidence. That is enough to go
// and look deliberately, which is the right amount of friction.

const SNIPPET = 40

function snippet(hay, idx) {
  const from = Math.max(0, idx - SNIPPET)
  const to = Math.min(hay.length, idx + SNIPPET)
  return (from > 0 ? '...' : '') + hay.slice(from, to) + (to < hay.length ? '...' : '')
}

async function handler(req, res) {
  if (!requireRole(req, res, ['admin'])) return

  const q = String(req.query.q || '').trim()
  if (!q) {
    return res.status(400).json({
      error: 'Nothing to search for. Pass ?q=<string>.',
      tenant: currentTenantId() || '(single tenant)',
    })
  }
  // A one or two character search matches half the database and tells you
  // nothing. Refuse rather than return noise that looks like a finding.
  if (q.length < 3) {
    return res.status(400).json({ error: 'Search for at least 3 characters - anything shorter matches everywhere.' })
  }

  const match = String(req.query.match || '*')
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500)
  const alsoKeys = String(req.query.keys || '') === '1'
  const needle = q.toLowerCase()

  let redis
  try {
    redis = await getClient()
  } catch (e) {
    // getClient() refusing IS a result worth seeing plainly - it is the guard
    // this whole exercise is about. Do not let it surface as a 500 with no text.
    return res.status(503).json({ error: 'No database in scope: ' + e.message })
  }

  const hits = []
  let scanned = 0
  let unreadable = 0
  let cursor = 0
  let rounds = 0
  let truncated = false

  try {
    do {
      // COUNT is a hint, not a promise - Redis may return more or fewer. The
      // loop is bounded by rounds as well as by cursor so a pathological scan
      // cannot run until the function times out and reports nothing at all.
      const out = await redis.scan(cursor, { match, count: 500 })
      cursor = Number(Array.isArray(out) ? out[0] : 0)
      const batch = (Array.isArray(out) ? out[1] : []) || []
      rounds++

      for (const key of batch) {
        scanned++

        if (alsoKeys && String(key).toLowerCase().includes(needle)) {
          hits.push({ key, where: 'key name', bytes: null, near: null })
          if (hits.length >= limit) { truncated = true; break }
          continue
        }

        let raw
        try {
          raw = await redis.get(key)
        } catch {
          // A key of a type GET cannot read - a list, a hash, a set. Counted
          // rather than swallowed, because "nothing found" means something
          // different when part of the database could not be looked at.
          unreadable++
          continue
        }
        if (raw === null || raw === undefined) continue

        const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
        if (!text) continue
        const idx = text.toLowerCase().indexOf(needle)
        if (idx === -1) continue

        hits.push({
          key,
          where: 'value',
          bytes: text.length,
          near: snippet(text, idx),
        })
        if (hits.length >= limit) { truncated = true; break }
      }

      if (truncated) break
    } while (cursor !== 0 && rounds < 200)

    if (cursor !== 0 && !truncated) truncated = true
  } catch (e) {
    return res.status(500).json({ error: 'Scan failed: ' + e.message, scanned, hits })
  }

  return res.status(200).json({
    // WHICH DATABASE ANSWERED. The single most important field here: a clean
    // result is only evidence if you know it came from the store you meant.
    tenant: currentTenantId() || '(single tenant)',
    host: req.headers['x-forwarded-host'] || req.headers.host || null,
    query: q,
    match,
    searchedKeyNames: alsoKeys,
    keysScanned: scanned,
    keysUnreadable: unreadable,
    found: hits.length,
    truncated,
    hits,
  })
}

export default withTenant(handler)
