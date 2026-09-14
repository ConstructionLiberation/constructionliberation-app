import { getOpsProjects } from '../../lib/db'
import { loadPreStarts, isPreStartDone, preStartSentAt } from '../../lib/preStartDone'
import {
  getSubmissionIndex, saveSubmissionIndex,
  getSubmission, saveSubmission, deleteSubmission,
  getForms,
} from '../../lib/db'
import { formDateOf } from '../../lib/formDates'
import withTenant from '../../lib/withTenant'

// Allow larger bodies (photos are URLs, but signatures/answers can add up).
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

// GET    /api/submissions              -> { submissions: [index] }
// GET    /api/submissions?id=...       -> { submission }
// POST   /api/submissions { submission } -> save, returns { submission }
async function handler(req, res) {
  if (req.method === 'GET') {
    const { id } = req.query
    if (id) {
      const submission = await getSubmission(id)
      if (!submission) return res.status(404).json({ error: 'Not found' })
      return res.json({ submission })
    }
    const idx = await getSubmissionIndex()

    // PRE-STARTS BELONG IN THIS LIST TOO.
    //
    // Pre-Start Minutes are not a Site App form. They live in their own store,
    // one record per project at ops:prestart:{projectNo}, filled in from the
    // project page rather than submitted through the Forms App.
    //
    // So nothing ever wrote one into the submission index, and Completed Forms -
    // which reads exactly this - could never show one however many had been
    // done. lib/preStartDone.js already documents the same confusion from the
    // Forms Missing side; this is the other half of it.
    //
    // Presented as index entries rather than stored as submissions: no duplicate
    // record, no migration of the ones already done, and one source of truth
    // for a Pre-Start. isPreStartDone is the SAME rule the Forms Missing page
    // and the Monday chaser use - a Pre-Start counts as done when it has been
    // SENT, not merely saved.
    let preStarts = []
    try {
      const projects = await getOpsProjects()
      const nos = projects.map(p => p.projectNo || p.jobNo).filter(Boolean)
      const recs = await loadPreStarts(nos)
      preStarts = Object.entries(recs)
        .filter(([, rec]) => isPreStartDone(rec))
        .map(([no, rec]) => ({
          id: `prestart:${no}`,
          formId: 'pre-start',
          formTitle: 'Pre-Start Minutes',
          projectNo: no,
          projectName: (projects.find(p => (p.projectNo || p.jobNo) === no) || {}).name || no,
          operative: rec.preparedBy || rec.chairedBy || '',
          submittedAt: preStartSentAt(rec),
          flags: [],
          // So the page can route to the project's pre-start rather than a
          // submission that does not exist.
          isPreStart: true,
        }))
    } catch {
      // A Pre-Start lookup failing must not empty the Completed Forms list.
    }

    const all = [...idx, ...preStarts]
    // newest first
    all.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))
    return res.json({ submissions: all })
  }

  if (req.method === 'POST') {
    const { submission } = req.body || {}
    if (!submission || !submission.formId) {
      return res.status(400).json({ error: 'Missing submission' })
    }
    try {
      const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const now = Date.now()
      const full = {
        id,
        formId: submission.formId,
        formTitle: submission.formTitle || '',
        projectId: submission.projectId || '',
        projectName: submission.projectName || '',
        operative: submission.operative || '',
        answers: submission.answers || {},
        flags: submission.flags || [],   // manager-notify triggers captured at fill time
        draft: !!submission.draft,
        submittedAt: now,
      }
      await saveSubmission(id, full)

      // Lightweight index entry (no answers) so listing is cheap.
      const idx = await getSubmissionIndex()
      idx.push({
        id,
        formId: full.formId,
        formTitle: full.formTitle,
        projectId: full.projectId,
        projectName: full.projectName,
        operative: full.operative,
        flagCount: (full.flags || []).length,
        draft: full.draft,
        submittedAt: now,
        // THE DATE THE FORM IS ABOUT. A Daily Site Diary written up on Friday for
        // Monday belongs to Monday, and Forms Missing scores it on this rather than
        // on when it was typed. Resolved SERVER-SIDE from the form definition so it
        // cannot drift if the client changes, and stored on the index because the
        // index deliberately holds no answers.
        formDate: await (async () => {
          try {
            const forms = await getForms()
            const def = (forms || []).find(f => f.id === full.formId)
            return formDateOf(def, full.answers)
          } catch { return '' }
        })(),
      })
      await saveSubmissionIndex(idx)

      return res.json({ submission: full })
    } catch (e) {
      console.error('submission save failed:', e)
      return res.status(500).json({ error: `Save failed: ${e.message || 'server error'}` })
    }
  }

  if (req.method === 'PUT') {
    const { id, answers } = req.body || {}
    if (!id) return res.status(400).json({ error: 'Missing id' })
    try {
      const full = await getSubmission(id)
      if (!full) return res.status(404).json({ error: 'Not found' })
      full.answers = answers || full.answers
      full.editedAt = Date.now()
      await saveSubmission(id, full)
      return res.json({ submission: full })
    } catch (e) {
      console.error('submission update failed:', e)
      return res.status(500).json({ error: `Update failed: ${e.message || 'server error'}` })
    }
  }

  if (req.method === 'DELETE') {
    const id = req.query.id || (req.body && req.body.id)
    if (!id) return res.status(400).json({ error: 'Missing id' })
    try {
      await deleteSubmission(id)
      return res.json({ ok: true, id })
    } catch (e) {
      console.error('submission delete failed:', e)
      return res.status(500).json({ error: `Delete failed: ${e.message || 'server error'}` })
    }
  }

  res.status(405).end()
}

export default withTenant(handler)
