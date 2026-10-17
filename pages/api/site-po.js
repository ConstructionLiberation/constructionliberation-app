// SITE APP PURCHASE ORDERS (1211) - operatives raise POs for their own projects;
// the project's Contracts Manager approves or rejects them. Every request must
// carry the Site App sign-in token (x-ops-token) - nothing here trusts the browser
// about who is asking.
//
//   GET                       -> { me, projects, settings, contacts, people, mine, approvals }
//   GET ?id=                  -> { po }                 (mine, or one I approve)
//   GET ?products=<supplier>  -> { products }
//   POST { action: 'create', po }        an operative raises it -> AWAITING CM APPROVAL; the CM is emailed
//   POST { action: 'approve', id }       the project's CM -> APPROVED: numbered, into Deliveries; the operative is emailed
//   POST { action: 'reject', id, reason } the project's CM -> REJECTED; the operative is emailed
//
// An approved PO is sent to the supplier from the portal (Purchase Orders), as any other.
import withTenant from '../../lib/withTenant'
import { opsUserFromReq } from '../../lib/opsToken'
import { get, getOpsProjects, getCachedProjects, getPortalUsers, getProject } from '../../lib/db'
import { findProjectCM, userCanAccess } from '../../lib/ramsNotify'
import { fromEmail, siteAppUrl, companyName } from '../../lib/tenantSettings'
import { listPos, loadPo, savePo, takeNumber, loadPoSettings } from '../../lib/purchaseOrders'
import { newId, esc, money, cleanLines, EMAIL, xeroContacts, setDelivery, sitePeople, supplierProducts, resolveSupplier, buildFields, completeProblem } from '../../lib/poData'
import { poTotal, poGross } from '../../lib/poShared'

const nameOf = (u) => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || ''
async function myProjects(user) {
  const [ops, cached] = await Promise.all([getOpsProjects(), getCachedProjects().catch(() => null)])
  const xeroByJob = new Map(((cached || []).filter(p => p && p.jobNo)).map(p => [String(p.jobNo).toLowerCase(), String(p.xeroId || '')]))
  return (ops || []).filter(p => (p.status || 'active') === 'active' && userCanAccess(user, p.projectNo))
    .map(p => ({ projectNo: p.projectNo, name: (p.data && p.data.projectName) || '', projectId: xeroByJob.get(String(p.projectNo).toLowerCase()) || `job:${p.projectNo}`, _p: p }))
}
// the address from Project Details - the commercial override, else the IHM (as the portal does)
async function addressOf(proj) {
  try {
    const { resolveProjectPeople } = await import('../../lib/projectPeople')
    const [ops, users, settings] = await Promise.all([get('ops:projects'), getPortalUsers(), proj.projectId.startsWith('job:') ? null : getProject(proj.projectId)])
    return (resolveProjectPeople({ jobNo: proj.projectNo, opsProjects: ops || [], users: users || [], override: (settings && settings.peopleOverride) || {} }) || {}).projectAddress || ''
  } catch { return '' }
}
const isProjectCm = async (user, proj) => { const cm = await findProjectCM(proj._p); return !!(cm && cm.id && String(cm.id) === String(user.id)) }
async function mail(to, subject, html) {
  const key = process.env.RESEND_API_KEY
  if (!key || !to) return false
  try { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: fromEmail('notify'), to: [to], subject, html }) }); return r.ok } catch { return false }
}
const summary = (po) => `<p style="margin:0 0 6px"><strong>${esc(po.number || 'New purchase order')}</strong> - ${esc([po.jobNo, po.projectName].filter(Boolean).join(' '))}</p><p style="margin:0 0 6px">${esc(po.contactName || po.supplier)} - ${money(poGross(po))} inc VAT (${money(poTotal(po))} ex VAT)</p><p style="margin:0 0 12px;color:#555">Raised by ${esc(po.raisedBy)}</p>`
const button = (href, text) => `<p><a href="${href}" style="display:inline-block;background:#0f766e;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none">${text}</a></p>`

async function handler(req, res) {
  const user = await opsUserFromReq(req)
  if (!user) return res.status(401).json({ error: 'Please sign in again.' })
  const projects = await myProjects(user)
  const projOf = (po) => projects.find(p => String(p.projectNo).toLowerCase() === String(po.jobNo || '').toLowerCase())
  if (req.method === 'GET') {
    if (req.query.products) return res.status(200).json({ products: await supplierProducts(String(req.query.products)) })
    if (req.query.id) {
      const po = await loadPo(String(req.query.id))
      const proj = po && projOf(po)
      if (!po || !(String(po.raisedByOps) === String(user.id) || (proj && await isProjectCm(user, proj)))) return res.status(404).json({ error: 'That purchase order is not available.' })
      return res.status(200).json({ po, canDecide: po.status === 'awaiting-approval' && !!proj && await isProjectCm(user, proj) })
    }
    const all = await listPos()
    const mine = all.filter(p => String(p.raisedByOps || '') === String(user.id))
    const approvals = []
    for (const p of all.filter(x => x.status === 'awaiting-approval')) { const proj = projOf(p); if (proj && await isProjectCm(user, proj)) approvals.push(p) }
    const st = await loadPoSettings()
    return res.status(200).json({ me: { id: user.id, name: nameOf(user), isCM: user.accessLevel === 'contracts-manager' },
      projects: await Promise.all(projects.map(async p => ({ projectNo: p.projectNo, name: p.name, projectId: p.projectId, address: await addressOf(p) }))),
      settings: { confirmationsTo: st.confirmationsTo || '', vatRate: st.vatRate }, contacts: await xeroContacts(), people: await sitePeople(), mine, approvals })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}
  const now = new Date().toISOString(), by = nameOf(user)
  if (b.action === 'create') {
    const src = b.po || {}
    // the project: one of MINE, its details from the server - not from the phone
    const proj = projects.find(p => String(p.projectNo) === String(src.projectNo || src.jobNo || ''))
    if (!proj) return res.status(403).json({ error: 'Pick one of your projects' })
    const r0 = await resolveSupplier(src); if (r0.error) return res.status(400).json({ error: r0.error })
    const sup = r0.sup, lines = cleanLines(src.lines)
    const fields = buildFields({ ...src, projectId: proj.projectId, jobNo: proj.projectNo, projectName: proj.name }, sup, lines)
    const why = await completeProblem(fields, sup, lines); if (why) return res.status(400).json({ error: why })
    if (!EMAIL.test(fields.confirmationsTo)) return res.status(400).json({ error: 'The order confirmations address is not a valid email address' })
    const st = await loadPoSettings()
    const po = { id: newId(), number: null, status: 'awaiting-approval', ...fields, vatRate: st.vatRate, to: (sup && sup.email) || '',
      raisedBy: by, raisedByEmail: user.email || '', raisedByOps: user.id, raisedAt: now, history: [{ at: now, by, what: 'Raised in the Site App - awaiting CM approval' }] }
    await savePo(po)
    const cm = await findProjectCM(proj._p)
    let told = false
    if (cm && cm.email) told = await mail(cm.email, `PO to approve - ${proj.projectNo} ${proj.name} - ${po.contactName || po.supplier}`,
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Hi ${esc(cm.firstName || '')},</p><p>${esc(by)} has raised a purchase order for your approval. Nothing goes to the supplier until you approve it.</p>${summary(po)}${button(siteAppUrl(), 'Open the Site App to approve')}</div>`)
    return res.status(200).json({ ok: true, po, cmNotified: told, cmName: cm ? nameOf(cm) || cm.firstName || '' : '' })
  }
  if (b.action === 'approve' || b.action === 'reject') {
    const po = await loadPo(String(b.id || ''))
    const proj = po && projOf(po)
    if (!po || !proj || !(await isProjectCm(user, proj))) return res.status(403).json({ error: 'Only the project\'s Contracts Manager can decide this purchase order.' })
    if (po.status !== 'awaiting-approval') return res.status(409).json({ error: `This purchase order has already been ${po.status === 'approved' || po.status === 'sent' ? 'approved' : po.status}.` })
    if (b.action === 'reject') {
      const reason = String(b.reason || '').trim().slice(0, 500)
      if (!reason) return res.status(400).json({ error: 'Say why it is rejected' })
      const next = { ...po, status: 'rejected', rejectedBy: by, rejectedAt: now, rejectReason: reason, history: [...(po.history || []), { at: now, by, what: `Rejected: ${reason}` }] }
      await savePo(next)
      await mail(po.raisedByEmail, `PO rejected - ${po.jobNo} ${po.contactName || po.supplier}`, `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Your purchase order was rejected by ${esc(by)}:</p><p><em>${esc(reason)}</em></p>${summary(po)}</div>`)
      return res.status(200).json({ ok: true, po: next })
    }
    // APPROVED: numbered now, at the VAT rate in force; into Deliveries; ready for the office to send
    const next = { ...po, number: await takeNumber(), status: 'approved', vatRate: (await loadPoSettings()).vatRate, approvedBy: by, approvedAt: now, history: [...(po.history || []), { at: now, by, what: 'Approved by the CM' }] }
    await savePo(next); await setDelivery(next)
    await mail(po.raisedByEmail, `PO approved - ${next.number} - ${po.jobNo} ${po.contactName || po.supplier}`, `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Your purchase order was approved by ${esc(by)}. The office will send it to the supplier.</p>${summary(next)}</div>`)
    return res.status(200).json({ ok: true, po: next })
  }
  return res.status(400).json({ error: 'Unknown action' })
}
export default withTenant(handler)
