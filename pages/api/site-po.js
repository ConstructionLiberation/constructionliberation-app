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
import { sendPurchaseOrder } from '../../lib/poSend'
import { decidePo, mail, summary } from '../../lib/poApprove'

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
      const cm = !!proj && await isProjectCm(user, proj)
      // the CM can change it until it is SENT (1213)
      return res.status(200).json({ po, canDecide: po.status === 'awaiting-approval' && cm, canEdit: cm && (po.status === 'awaiting-approval' || po.status === 'approved'), canSend: cm && po.status === 'approved' })
    }
    const all = await listPos()
    const mine = all.filter(p => String(p.raisedByOps || '') === String(user.id))
    const approvals = [], approvedUnsent = []
    for (const p of all.filter(x => x.status === 'awaiting-approval' || x.status === 'approved')) { const proj = projOf(p); if (proj && await isProjectCm(user, proj)) (p.status === 'approved' ? approvedUnsent : approvals).push(p) }
    const st = await loadPoSettings()
    return res.status(200).json({ me: { id: user.id, name: nameOf(user), isCM: user.accessLevel === 'contracts-manager' },
      projects: await Promise.all(projects.map(async p => ({ projectNo: p.projectNo, name: p.name, projectId: p.projectId, address: await addressOf(p) }))),
      settings: { confirmationsTo: st.confirmationsTo || '', vatRate: st.vatRate }, contacts: await xeroContacts(), people: await sitePeople(), mine, approvals, approvedUnsent })
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
    const po = { id: newId(), number: null, status: 'awaiting-approval', ...fields, vatRate: st.vatRate,
      raisedBy: by, raisedByEmail: user.email || '', raisedByOps: user.id, raisedAt: now, history: [{ at: now, by, what: 'Raised in the Site App - awaiting CM approval' }] }
    await savePo(po)
    const cm = await findProjectCM(proj._p)
    let told = false
    if (cm && cm.email) told = await mail(cm.email, `PO to approve - ${proj.projectNo} ${proj.name} - ${po.contactName || po.supplier}`,
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Hi ${esc(cm.firstName || '')},</p><p>${esc(by)} has raised a purchase order for your approval. Nothing goes to the supplier until you approve it.</p>${summary(po)}${button(siteAppUrl(), 'Open the Site App to approve')}</div>`)
    return res.status(200).json({ ok: true, po, cmNotified: told, cmName: cm ? nameOf(cm) || cm.firstName || '' : '' })
  }
  // THE CM EDITS IT (1213) - while it awaits them, or once approved until the office
  // sends it. The same full check; the project stays as raised.
  if (b.action === 'update') {
    const po = await loadPo(String(b.id || ''))
    const proj = po && projOf(po)
    if (!po || !proj || !(await isProjectCm(user, proj))) return res.status(403).json({ error: 'Only the project\'s Contracts Manager can change this purchase order.' })
    if (po.status !== 'awaiting-approval' && po.status !== 'approved') return res.status(409).json({ error: `This purchase order has been ${po.status} - it can no longer be changed` })
    const src = b.po || {}
    const r0 = await resolveSupplier(src); if (r0.error) return res.status(400).json({ error: r0.error })
    const sup = r0.sup, lines = cleanLines(src.lines)
    const fields = buildFields({ ...src, projectId: po.projectId, jobNo: po.jobNo, projectName: po.projectName }, sup, lines)
    const why = await completeProblem(fields, sup, lines); if (why) return res.status(400).json({ error: why })
    if (!EMAIL.test(fields.confirmationsTo)) return res.status(400).json({ error: 'The order confirmations address is not a valid email address' })
    const next = { ...po, ...fields, history: [...(po.history || []), { at: now, by, what: 'Changed by the CM' }] }
    await savePo(next)
    if (next.status === 'approved') await setDelivery(next)
    return res.status(200).json({ ok: true, po: next })
  }
  // SEND AN APPROVED PO (1215) - the project's CM, from the Site App
  if (b.action === 'send') {
    const po = await loadPo(String(b.id || ''))
    const proj = po && projOf(po)
    if (!po || !proj || !(await isProjectCm(user, proj))) return res.status(403).json({ error: 'Only the project\'s Contracts Manager can send this purchase order.' })
    if (po.status !== 'approved') return res.status(409).json({ error: po.status === 'sent' ? 'This purchase order has already been sent' : 'Approve it first' })
    const s = await sendPurchaseOrder(po, { by, replyFallback: user.email })
    if (s.error) return res.status(s.status || 400).json({ error: s.error })
    return res.status(200).json({ ok: true, po: s.po })
  }
  if (b.action === 'approve' || b.action === 'reject') {
    const po = await loadPo(String(b.id || ''))
    const proj = po && projOf(po)
    if (!po || !proj || !(await isProjectCm(user, proj))) return res.status(403).json({ error: 'Only the project\'s Contracts Manager can decide this purchase order.' })
    // the shared decision (lib/poApprove, 1216) - the CM deciding, so no one else to tell
    const r = await decidePo(po, { action: b.action, by, reason: b.reason, send: !!b.send, replyFallback: user.email })
    if (r.error) return res.status(r.status || 400).json({ error: r.error })
    return res.status(200).json({ ok: true, ...r })
  }
  return res.status(400).json({ error: 'Unknown action' })
}
export default withTenant(handler)
