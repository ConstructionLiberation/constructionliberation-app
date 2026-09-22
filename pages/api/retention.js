import { requireRole } from '../../lib/portalAuth'
import { invalidateDashboardCache } from '../../lib/dashboardCache'
import { getProject, saveProject, getClient } from '../../lib/db'
import withTenant from '../../lib/withTenant'

async function handler(req, res) {
  // READING AND WRITING ARE DIFFERENT PERMISSIONS.
  //
  // One guard covered both, and it left out `accounts` - so the bookkeeper
  // could open the Retention tab in Bookkeeping (an iframe of this page, in
  // VIEW_ONLY_TABS, clearly meant for them) and be refused the manual entries
  // behind it. The page turned that 403 into an empty array and rendered the
  // Xero-derived rows alone, so their figures quietly disagreed with everyone
  // else's and nothing said why.
  //
  // Accounts read. They do not write: the entries are the post-contract
  // team's record, and the tab is view-only by design.
  const READ_ROLES = ['post-contract', 'accounts', 'management', 'admin']
  const WRITE_ROLES = ['post-contract', 'management', 'admin']
  if (!requireRole(req, res, req.method === 'GET' ? READ_ROLES : WRITE_ROLES)) return;
  const redis = await getClient()
  const KEY = 'retention:entries'

  if (req.method === 'GET') {
    try {
      const data = await redis.get(KEY)
      return res.json({ entries: data || [] })
    } catch { return res.json({ entries: [] }) }
  }

  if (req.method === 'POST') {
    // BULK IMPORT.
    //
    // Nine rows one at a time is nine round trips and nine cache clears, and a failure
    // half way leaves you not knowing which landed. One request, one write.
    //
    // Matched on REF. Re-uploading the same file updates those rows rather than creating
    // a second set - the commonest reason to upload again is that a figure was wrong.
    if (Array.isArray(req.body?.entries)) {
      // ROWS WITHOUT A REFERENCE ARE SKIPPED - AND NOW SAID SO.
      //
      // This filter silently dropped every row with no ourRef. Import a hundred
      // rows, twelve of them missing a reference, and the reply said "88 added"
      // with no mention of the twelve. Nobody counts the rows afterwards, so
      // they are simply gone - and a retention row that never arrived looks
      // exactly like one that was never there.
      //
      // Still skipped, because ourRef is what rows are matched on and a row
      // without one cannot be updated later. But now reported.
      const all_incoming = req.body.entries.filter(Boolean)
      const incoming = all_incoming.filter(e => String(e.ourRef || '').trim())
      const skipped = all_incoming.length - incoming.length
      let all = []
      try { const d = await redis.get(KEY); if (d) all = d } catch {}

      let added = 0, updated = 0
      for (const e of incoming) {
        const ref = String(e.ourRef).trim().toLowerCase()
        const i = all.findIndex(x => String(x.ourRef || '').trim().toLowerCase() === ref)
        if (i >= 0) { all[i] = { ...all[i], ...e, id: all[i].id }; updated++ }
        else {
          all.push({ ...e, id: `ret_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, manual: true, trackerOnly: true })
          added++
        }
      }
      await redis.set(KEY, all)
      try { await invalidateDashboardCache(redis) } catch {}
      return res.json({
        entries: all, added, updated, skipped,
        // Named so the page can say which ones, rather than only how many.
        skippedRows: skipped
          ? all_incoming.filter(e => !String(e.ourRef || '').trim())
              .map(e => e.projectName || e.customer || e.description || '(blank row)').slice(0, 20)
          : [],
      })
    }

    const { entry } = req.body
    if (!entry) return res.status(400).json({ error: 'Missing entry' })
    let entries = []
    try { const d = await redis.get(KEY); if (d) entries = d } catch {}
    if (entry.id) {
      // Update existing
      entries = entries.map(e => e.id === entry.id ? { ...e, ...entry } : e)
    } else {
      // New entry (either a pure manual row, or a manual OVERRIDE of a Xero row
      // — the latter carries an xeroId).
      entry.id = `ret_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      entry.manual = entry.xeroId ? false : true
      entries.push(entry)
    }
    await redis.set(KEY, entries)
    // The Retention Tracker is the source of truth for a project's stage
    // (live/defects/complete), which Project Financials reads. Any save may change
    // status, so always refresh the dashboard cache.
    try { await invalidateDashboardCache(redis) } catch {}
    // comment back to the project's retentionComments so Project Details stays in
    // step. (Only comments sync back — all other fields are read-only from the
    // project; manual VAT stays only in the tracker.)
    try {
      if (entry.xeroId && entry.comments != null) {
        const settings = (await getProject(entry.xeroId)) || {}
        if ((settings.retentionComments || '') !== entry.comments) {
          await saveProject(entry.xeroId, { ...settings, retentionComments: entry.comments })
          try { await invalidateDashboardCache(redis) } catch {}
        }
      }
    } catch (e) { console.error('retention comment write-back failed:', e) }

    return res.json({ entries })
  }

  if (req.method === 'DELETE') {
    const { id } = req.body
    let entries = []
    try { const d = await redis.get(KEY); if (d) entries = d } catch {}
    entries = entries.filter(e => e.id !== id)
    await redis.set(KEY, entries)
    try { await invalidateDashboardCache(redis) } catch {}
    return res.json({ entries })
  }

  res.status(405).end()
}

export default withTenant(handler)
