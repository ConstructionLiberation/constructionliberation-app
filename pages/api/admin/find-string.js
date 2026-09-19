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

  // HOW MANY KEYS ARE THERE, ACCORDING TO THE DATABASE ITSELF.
  //
  // On 20 September this route reported keysScanned: 500, complete: true on a
  // database that DBSIZE says holds 14,308 keys. It scanned 3% of it and said
  // it had finished. Every "found: 0" it produced that day was worthless,
  // including the one used to conclude that the zztest tenant was clean.
  //
  // A diagnostic that cannot state its own coverage is worse than no
  // diagnostic, because a clean result from it gets believed. So coverage is
  // now measured against the database's own count, and `complete` is only ever
  // true when the whole keyspace was walked.
  let totalKeys = null
  let dbsizeError = null
  try {
    if (typeof redis.dbsize === 'function') totalKeys = await redis.dbsize()
    else if (typeof redis.dbSize === 'function') totalKeys = await redis.dbSize()
    else dbsizeError = 'no dbsize method on the client'
  } catch (e) {
    // Reported, never swallowed. The previous version caught this into null and
    // the reason was invisible - the exact silent-failure pattern this codebase
    // keeps being bitten by.
    dbsizeError = e.message || String(e)
  }
  if (typeof totalKeys === 'string') totalKeys = parseInt(totalKeys, 10)
  if (!Number.isFinite(totalKeys)) totalKeys = null

  const hits = []
  let scanned = 0
  let unreadable = 0
  let rounds = 0
  let hitLimitReached = false
  let outOfTime = false
  let outOfRounds = false

  // THE CURSOR IS A STRING AND MUST BE PASSED BACK EXACTLY AS GIVEN.
  //
  // It used to be run through Number() and compared with 0. That is the most
  // likely reason the scan stopped after two rounds on a 14,308-key database:
  // a cursor that does not survive the round trip ends the loop, and the loop
  // ending was being read as the keyspace being exhausted.
  let cursor = '0'
  let first = true

  // A value search does a GET per key. Fourteen thousand of those will not
  // finish inside a serverless invocation, so this was ALWAYS going to be
  // partial - it simply was not saying so. A key-name search (keys=1) needs no
  // GETs and can cover the whole keyspace comfortably.
  const started = Date.now()
  const BUDGET_MS = alsoKeys ? 40000 : 20000
  const MAX_ROUNDS = 2000

  try {
    while (first || cursor !== '0') {
      first = false
      if (Date.now() - started > BUDGET_MS) { outOfTime = true; break }
      if (rounds >= MAX_ROUNDS) { outOfRounds = true; break }

      const out = await redis.scan(cursor, { match, count: 1000 })
      // Both shapes seen in the wild: [cursor, keys] and { cursor, keys }.
      const nextCursor = Array.isArray(out) ? out[0] : (out && out.cursor)
      const batch = (Array.isArray(out) ? out[1] : (out && out.keys)) || []
      cursor = String(nextCursor === undefined || nextCursor === null ? '0' : nextCursor)
      rounds++

      for (const key of batch) {
        scanned++

        if (alsoKeys) {
          if (String(key).toLowerCase().includes(needle)) {
            hits.push({ key, where: 'key name', bytes: null, near: null })
            if (hits.length >= limit) { hitLimitReached = true; break }
          }
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

        hits.push({ key, where: 'value', bytes: text.length, near: snippet(text, idx) })
        if (hits.length >= limit) { hitLimitReached = true; break }
      }

      if (hitLimitReached) break
    }
  } catch (e) {
    return res.status(500).json({ error: 'Scan failed: ' + e.message, scanned, rounds, hits })
  }

  const walkedWholeKeyspace = cursor === '0' && !hitLimitReached && !outOfTime && !outOfRounds
  // Coverage is the honest number. If the database reported its size and the
  // scan saw fewer keys than that, the answer is partial whatever the cursor
  // said.
  const coveredAll = totalKeys === null ? walkedWholeKeyspace : (walkedWholeKeyspace && scanned >= totalKeys)

  return res.status(200).json({
    // WHICH DATABASE ANSWERED. A clean result is only evidence if you know it
    // came from the store you meant.
    tenant: currentTenantId() || '(single tenant)',
    host: req.headers['x-forwarded-host'] || req.headers.host || null,
    query: q,
    match,
    searchedKeyNames: alsoKeys,

    // ---- COVERAGE. READ THESE BEFORE BELIEVING found. ----
    keysInDatabase: totalKeys,
    dbsizeError,
    keysScanned: scanned,
    coverage: totalKeys ? Math.round((scanned / totalKeys) * 1000) / 10 + '%' : null,
    // TRUE only when the whole keyspace was walked AND as many keys were seen
    // as the database says it holds. A "found: 0" with complete:false proves
    // nothing whatsoever.
    complete: coveredAll,
    stoppedBecause: coveredAll ? null
      : hitLimitReached ? `hit the limit of ${limit} results - raise limit=`
      : outOfTime ? 'ran out of time - narrow it with match=, or use keys=1'
      : outOfRounds ? 'ran out of scan rounds'
      : 'the cursor did not return to 0',

    keysUnreadable: unreadable,
    scanRounds: rounds,
    found: hits.length,
    hits,
  })
}

export default withTenant(handler)
