import { getPreStart, savePreStart } from '../../lib/db'
import withTenant from '../../lib/withTenant'

// GET  /api/pre-start?no=J247   -> { data }
// POST /api/pre-start { projectNo, data } -> { ok }
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

async function handler(req, res) {
  if (req.method === 'GET') {
    const no = req.query.no
    if (!no) return res.status(400).json({ error: 'Missing project number' })
    const data = await getPreStart(no)
    return res.json({ data })
  }
  if (req.method === 'POST') {
    const { projectNo, data } = req.body || {}
    if (!projectNo) return res.status(400).json({ error: 'Missing project number' })
    try {
      // MERGE, DO NOT REPLACE.
      //
      // This wrote { ...data } straight over the stored record, so anything the
      // client did not send back was erased - including sentAt, sentManually,
      // recipients and statuses, which are the PROOF a Pre-Start was issued.
      //
      // It has not bitten, because the autosave stops once stage is 'sent' and
      // both save paths send a complete payload. But that is a guard in a
      // different file holding this one up. A third caller, or a change to that
      // guard, and a Pre-Start that was issued reads as never issued - it
      // reappears in Forms Missing and the Monday chaser emails the Contracts
      // Manager about it again.
      //
      // Same shape as the write that lost the Gas Lane application: a save that
      // assumes the client holds the whole truth.
      const existing = (await getPreStart(projectNo)) || {}
      const record = { ...existing, ...data, projectNo, updatedAt: Date.now() }
      await savePreStart(projectNo, record)
      return res.json({ ok: true, data: record })
    } catch (e) {
      console.error('pre-start save failed:', e)
      return res.status(500).json({ error: e.message || 'Save failed' })
    }
  }
  res.status(405).end()
}

export default withTenant(handler)
