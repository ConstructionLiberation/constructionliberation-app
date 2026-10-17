// SUPPLIER QUERIES - the SUPPLIER'S side (1242). No portal account: the token in the link opens
// ONE query and nothing else (it is in middleware's open list, like the supplier PO page).
//   GET  ?t=           -> what the supplier sees (lib/billQueries publicView)
//   GET  ?t=&i=&j=     -> a short-lived link to a document on THIS query
//   POST { t, message, file?: { name, type, data (base64) } }   (a document up to 3 MB)
import withTenant from '../../lib/withTenant'
import { queryByToken, addMessage, publicView } from '../../lib/billQueries'
import { shortLink } from '../../lib/privateFiles'

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } }

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const q = await queryByToken(req.method === 'GET' ? req.query.t : (req.body || {}).t)
  if (!q) return res.status(404).json({ error: 'This link is not valid any more - please reply to the email you received.' })
  if (req.method === 'GET') {
    if (req.query.i != null) {
      const m = (q.messages || [])[Number(req.query.i)], f = m && (m.files || [])[Number(req.query.j)]
      if (!f) return res.status(404).json({ error: 'That document is not on this query.' })
      return res.redirect(302, await shortLink(f.path))
    }
    return res.status(200).json(publicView(q))
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (q.status === 'resolved') return res.status(400).json({ error: 'This query has been closed - please reply to the email if anything is still outstanding.' })
  const b = req.body || {}
  const f = b.file && b.file.data ? { name: String(b.file.name || 'document'), type: String(b.file.type || ''), data: String(b.file.data) } : null
  const r = await addMessage(q.billId, { from: 'supplier', text: String(b.message || '').slice(0, 5000), file: f })
  if (r.error) return res.status(400).json({ error: r.error })
  return res.status(200).json(publicView(r.query))
}
export default withTenant(handler)
