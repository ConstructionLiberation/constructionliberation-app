// SUPPLIER QUERIES - our side (1242). Purchasing. See lib/billQueries.js.
//   POST { action: 'start', billId, to, message }
//   POST { action: 'reply', billId, message }
//   POST { action: 'resolve' | 'reopen', billId }
//   GET  ?billId=&i=&j=   -> a short-lived link to one document on the query
import withTenant from '../../lib/withTenant'
import { getPortalUsers } from '../../lib/db'
import { requireArea } from '../../lib/portalAuth'
import { sortBills, billsSettings } from '../../lib/billsCheck'
import { startQuery, addMessage, setStatus, loadQueries } from '../../lib/billQueries'
import { shortLink } from '../../lib/privateFiles'

async function handler(req, res) {
  const session = requireArea(req, res, 'purchasing')
  if (!session) return
  if (req.method === 'GET') {
    const q = (await loadQueries())[String(req.query.billId || '')]
    const f = q && q.messages && q.messages[Number(req.query.i)] && q.messages[Number(req.query.i)].files[Number(req.query.j)]
    if (!f) return res.status(404).json({ error: 'That document is not on the query.' })
    res.setHeader('Cache-Control', 'no-store')
    return res.redirect(302, await shortLink(f.path))
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}, billId = String(b.billId || '')
  const me = (await getPortalUsers()).find(u => (session.id && u.id === session.id) || (session.email && String(u.email || '').toLowerCase() === String(session.email).toLowerCase())) || {}
  const by = me.name || session.name || '', byEmail = me.email || session.email || '', byPhone = me.phone || ''
  let r
  if (b.action === 'start') {
    const all = await sortBills()
    const bill = Object.values(all.groups).flat().find(x => x.id === billId)
    if (!bill) return res.status(404).json({ error: 'That bill is not in Bills to Check - refresh from Xero.' })
    r = await startQuery({ bill, po: bill.po || null, to: b.to, message: b.message, by, byEmail, byPhone })
  } else if (b.action === 'reply') r = await addMessage(billId, { from: 'us', by, byEmail, text: b.message })
  else if (b.action === 'resolve' || b.action === 'reopen') r = await setStatus(billId, b.action === 'resolve' ? 'resolved' : 'open', by)
  else return res.status(400).json({ error: 'Unknown action' })
  if (r.error) return res.status(400).json({ error: r.error })
  return res.status(200).json(await sortBills())
}
export default withTenant(handler)
