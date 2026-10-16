import { handleUpload } from '@vercel/blob-private/client'
import { requireArea } from '../../../lib/portalAuth'
import withTenant from '../../../lib/withTenant'
import { get } from '../../../lib/db'
import { resolveMerged } from '../../../lib/crmMerge'
import { loadEstimate } from '../../../lib/estimateStore'
import { loadBuildups } from '../../../lib/buildupsStore'
import { listDocs, saveDocs } from '../../../lib/documentsStore'
import { docRevisions } from '../../../lib/quoteDocs'
import { privateReady, privateToken, prefixFor, shortLink, fileExists, removeFile, MAX_BYTES, ALLOWED_TYPES } from '../../../lib/privateFiles'

// PRIVATE DOCUMENTS (1093) - Estimating area.
//   owner = { type: 'estimate', id }  (itemId optional - a document on one item / rate)
//         | { type: 'buildup', id: <template ref> }   (a document on a library build-up)
// GET  ?ownerType=&ownerId=                   -> { documents, ready }
// GET  ?ownerType=&ownerId=&download=<docId>  -> after the access check, a redirect to a link
//                                               for that one file, valid for a few minutes
// POST (browser upload, step 1) handle-upload  -> a short-lived permission to upload
//      straight to the private store, for THIS owner's folder only, within the
//      size and type limits
// POST register { ownerType, ownerId, itemId?, pathname, name }   (step 2, once uploaded)
// POST delete   { ownerType, ownerId, docId }
export const config = { api: { bodyParser: { sizeLimit: '1mb' } } }

const NOT_READY = 'Private file storage is not set up yet - an admin connects a private Blob store in Vercel (see the deploy notes for 1093).'

async function checkOwner(ownerType, ownerId) {
  if (ownerType === 'estimate') {
    const est = await loadEstimate(String(ownerId))
    if (!est) return { error: 'That estimate no longer exists', code: 404 }
    if (est.dealId) {
      const [deals, merged] = await Promise.all([get('crm:deals'), get('crm:merged')])
      const d = (deals || []).find(x => String(x.id) === resolveMerged(merged || {}, est.dealId))
      if (d && d.status === 'lost') return { error: 'This estimate is archived - its CRM deal was lost', code: 409, readOnly: true, est }
    }
    return { est }
  }
  if (ownerType === 'buildup') {
    const { items } = await loadBuildups()
    if (!items.some(t => t.ref === String(ownerId))) return { error: 'That build-up no longer exists', code: 404 }
    return {}
  }
  return { error: "ownerType must be 'estimate' or 'buildup'", code: 400 }
}

async function handler(req, res) {
  const session = requireArea(req, res, 'estimating')
  if (!session) return
  const by = session.name || session.email || ''

  if (req.method === 'GET') {
    const { ownerType, ownerId, download } = req.query
    const own = await checkOwner(ownerType, ownerId)
    if (own.error && !own.readOnly) return res.status(own.code).json({ error: own.error })
    const docs = await listDocs(ownerType, String(ownerId))
    // folder: where the browser uploads this owner's files (its company's folder only)
    if (!download) return res.status(200).json({ documents: docs, ready: privateReady(), folder: prefixFor(ownerType, ownerId), maxBytes: MAX_BYTES })
    if (!privateReady()) return res.status(503).json({ error: NOT_READY })
    const doc = docs.find(d => d.id === String(download))
    if (!doc) return res.status(404).json({ error: 'That document no longer exists' })
    // Access is checked above; the browser is sent to a link for this ONE file
    // that expires in minutes.
    try { return res.redirect(302, await shortLink(doc.pathname)) }
    catch (e) { return res.status(502).json({ error: `The file could not be opened: ${e.message}` }) }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}

  // STEP 1 of an upload: the browser asks for permission; the file then goes
  // straight to the private store (no 4.5 MB limit), into this owner's folder only.
  if (b.type === 'blob.generate-client-token' || b.type === 'blob.upload-completed') {
    if (!privateReady()) return res.status(503).json({ error: NOT_READY })
    try {
      const result = await handleUpload({
        body: b, request: req, token: privateToken(),
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          const p = JSON.parse(clientPayload || '{}')
          const own = await checkOwner(p.ownerType, p.ownerId)
          if (own.error) throw new Error(own.error)
          if (!pathname.startsWith(prefixFor(p.ownerType, p.ownerId))) throw new Error('Wrong folder for this document')
          return { allowedContentTypes: ALLOWED_TYPES, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true, tokenPayload: JSON.stringify({ by }) }
        },
        onUploadCompleted: async () => {},   // the browser registers the file (step 2)
      })
      return res.status(200).json(result)
    } catch (e) { return res.status(400).json({ error: e.message }) }
  }

  const own = await checkOwner(b.ownerType, b.ownerId)
  if (own.error) return res.status(own.code).json({ error: own.error })
  const ownerId = String(b.ownerId)
  // DOCUMENTS PER REVISION (1169, 1193): each quote document is on a LIST of
  // revisions - carried forward to each new one, ticked on or off for the
  // revision being worked on. Issued revisions' lists are fixed.
  const working = own.est ? String((own.est.reopened && own.est.reopened.revision) || own.est.revision || 'A') : null
  const issued = new Set(((own.est && own.est.revisions) || []).map(r => r.revision).filter(r => !(own.est.reopened && r === own.est.reopened.revision)))
  const fixed = own.est && own.est.isIssued   // the latest revision, as issued - Create New Revision to change

  // STEP 2: record the uploaded file against its owner - only a file that
  // really is in this owner's folder of the private store.
  if (b.action === 'register') {
    if (!privateReady()) return res.status(503).json({ error: NOT_READY })
    const pathname = String(b.pathname || '')
    if (!pathname.startsWith(prefixFor(b.ownerType, ownerId))) return res.status(400).json({ error: 'That file is not in this document folder' })
    const meta = await fileExists(pathname)
    if (!meta) return res.status(404).json({ error: 'The upload did not arrive - try again' })
    if (b.itemId && own.est && !(own.est.rows || []).some(r => r.id === b.itemId)) return res.status(400).json({ error: 'That item is not on this estimate' })
    if (b.revision != null && own.est && (fixed || String(b.revision) !== working)) return res.status(400).json({ error: `Rev ${b.revision} has been issued - its documents are fixed. ${fixed ? 'Create a new revision to add documents.' : `Add documents to Rev ${working}.`}` })
    const docs = await listDocs(b.ownerType, ownerId)
    const doc = { id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, pathname, name: String(b.name || pathname.split('/').pop()).slice(0, 200),
      size: meta.size || 0, contentType: meta.contentType || '', itemId: b.itemId || null, revision: (b.revision != null && own.est && !b.itemId) ? working : null, revisions: (b.revision != null && own.est && !b.itemId) ? [working] : undefined, uploadedAt: new Date().toISOString(), uploadedBy: by }
    await saveDocs(b.ownerType, ownerId, [...docs, doc])
    return res.status(200).json({ ok: true, document: doc })
  }
  if (b.action === 'delete') {
    const docs = await listDocs(b.ownerType, ownerId)
    const doc = docs.find(d => d.id === String(b.docId))
    if (!doc) return res.status(404).json({ error: 'That document no longer exists' })
    const onIssued = own.est ? docRevisions(doc).filter(r => issued.has(r)) : []
    if (onIssued.length) return res.status(400).json({ error: `That document went out on Rev ${onIssued.join(', ')} - it cannot be deleted. Untick it to leave it off this revision.` })
    if (privateReady()) await removeFile(doc.pathname)
    await saveDocs(b.ownerType, ownerId, docs.filter(d => d.id !== doc.id))
    return res.status(200).json({ ok: true })
  }
  // ON / OFF THE REVISION BEING WORKED ON (1193) - tick a document (an older
  // revision's, or one from before revisions were tracked) onto it, or untick it
  if (b.action === 'on-revision' || b.action === 'set-revision') {
    if (!own.est) return res.status(400).json({ error: 'Only an estimate\'s documents have revisions' })
    if (fixed) return res.status(400).json({ error: `Rev ${working} has been issued - its documents are fixed. Create a new revision to change them.` })
    const docs = await listDocs(b.ownerType, ownerId)
    const doc = docs.find(d => d.id === String(b.docId))
    if (!doc) return res.status(404).json({ error: 'That document no longer exists' })
    if (doc.itemId) return res.status(400).json({ error: 'That document is on an item, not the quote' })
    const on = b.action === 'set-revision' ? true : !!b.on
    const list = docRevisions(doc).filter(r => r !== working)
    const next = on ? [...list, working] : list
    await saveDocs(b.ownerType, ownerId, docs.map(d => d.id === doc.id ? { ...d, revisions: next, revision: d.revision || (on ? working : null) } : d))
    return res.status(200).json({ ok: true, revisions: next })
  }
  return res.status(400).json({ error: "action must be 'register', 'delete' or 'on-revision'" })
}

export default withTenant(handler)
