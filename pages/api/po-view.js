// THE SUPPLIER'S PURCHASE ORDER PAGE (1199) - no portal login. The token in the
// address IS the authentication: signed, it names ONE purchase order and the
// company, and it expires. It returns that PO and the company's letterhead details
// (logo inline, so the logo route stays behind sign-in) - nothing else.
import withTenant from '../../lib/withTenant'
import { currentTenantId } from '../../lib/tenantContext'
import { companyName } from '../../lib/tenantSettings'
import { loadCompany, publicCompany } from '../../lib/companyDetails'
import { loadPo, verifyPoToken, poTotal, poVat, poGross, poVatRate } from '../../lib/purchaseOrders'
import { listDocs } from '../../lib/documentsStore'
import { privateReady, shortLink } from '../../lib/privateFiles'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const t = verifyPoToken(String(req.query.token || ''), currentTenantId())
  if (!t) return res.status(403).json({ error: 'This link is not valid or has expired. Please ask us for a new one.' })
  const po = await loadPo(t.id)
  if (!po || po.status === 'draft' || po.status === 'awaiting-approval' || po.status === 'rejected') return res.status(404).json({ error: 'This purchase order no longer exists.' })
  // AN ACCESS-ROUTE DOCUMENT (1200) - only one attached to THIS PO, via a link that expires in minutes
  const attach = (await listDocs('po', po.id).catch(() => [])) || [], access = (await listDocs('po-access', po.id).catch(() => [])) || []
  const docs = [...attach, ...access]   // attachments, and access route documents (1202)
  if (req.query.doc) {
    const d = docs.find(x => x.id === String(req.query.doc))
    if (!d || !privateReady()) return res.status(404).json({ error: 'That document is not available.' })
    try { return res.redirect(302, await shortLink(d.pathname)) } catch { return res.status(502).json({ error: 'The document could not be opened.' }) }
  }
  const c = await loadCompany().catch(() => null)
  const logo = c && typeof c.logo === 'string' && c.logo.startsWith('data:image/') ? c.logo : null
  return res.status(200).json({
    po: { number: po.number, status: po.status, jobNo: po.jobNo, projectName: po.projectName, supplier: po.contactName || po.supplier, lines: po.lines, total: poTotal(po), vat: poVat(po), gross: poGross(po), vatRate: poVatRate(po), noVat: po.vat === 'none',
      deliveryAddress: po.deliveryAddress, deliveryDate: po.deliveryDate, notes: po.notes,
      moffett: po.moffett || '', artics: po.artics || '', accessRoutes: po.accessRoutes || '', siteContact: po.siteContact || null, confirmationsTo: po.confirmationsTo || '',
      documents: access.map(d => ({ id: d.id, name: d.name })), attachments: attach.map(d => ({ id: d.id, name: d.name })), raisedBy: po.raisedBy, raisedAt: po.raisedAt, cancelledAt: po.cancelledAt || null },
    company: { name: companyName(), ...(publicCompany(c) || {}), logo },
  })
}
export default withTenant(handler)
