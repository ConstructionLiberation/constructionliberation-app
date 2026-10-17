// THE CUSTOMER PROGRESS REPORT (1234). See lib/customerReport.js.
//   GET                          -> { settings: { include }, template }   (what the customer is sent)
//   POST { action: 'settings', include }
//   GET ?report=<id>             -> { to: the customer's project team, users: portal users to copy in }
//   POST { action: 'send', reportId, to: [team emails ticked], extra: [emails typed], cc: [emails], subject, message }
//        (1236) team members can be left out; any other addresses added by hand
//        -> the customer PDF (only the chosen sections), from the notifications address, to the
//           whole customer project team, copying in the chosen portal users; replies to the sender;
//           recorded on the report (customerSends)
import withTenant from '../../lib/withTenant'
import { get, set, getPortalUsers, getProject } from '../../lib/db'
import { getSessionFromReq, requireRole } from '../../lib/portalAuth'
import { CUSTOMER_KEY, customerInclude } from '../../lib/customerReport'
import { buildProjectReportPDF, openIssuesFor } from '../../lib/projectReportPdf'
import { pdfLogoUrl } from '../../lib/pdfBrand'
import { fromEmail, companyName } from '../../lib/tenantSettings'
import { resolveProjectPeople } from '../../lib/projectPeople'
import { xeroPoProjects } from '../../lib/poProjects'

const REPORTS = 'ops:project-reports'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// THE CUSTOMER'S PROJECT TEAM - resolved as the dashboard and variation instructions do: the
// handover and Project Details' people override (customer contacts are not stored on a project)
async function customerTeam(projectNo) {
  const no = String(projectNo || '').trim()
  const norm = (x) => String(x || '').trim().replace(/^[#jJ]/, '').toLowerCase()
  const xp = (await xeroPoProjects().catch(() => [])).find(p => norm(p.jobNo) === norm(no))
  const settings = xp ? ((await getProject(xp.projectId).catch(() => null)) || {}) : {}
  const people = resolveProjectPeople({ jobNo: no, opsProjects: (await get('ops:projects')) || [], users: await getPortalUsers(), override: settings.peopleOverride || {} }) || {}
  let list = Array.isArray(people.customerContacts) ? people.customerContacts : []
  if (!list.length && Array.isArray(settings.peopleOverride && settings.peopleOverride.customerContacts)) list = settings.peopleOverride.customerContacts
  const seen = new Set()
  return list.map(c => ({ name: String(c.name || '').trim(), title: String(c.title || '').trim(), email: String(c.email || '').trim().toLowerCase() }))
    .filter(c => EMAIL.test(c.email) && !seen.has(c.email) && seen.add(c.email))
}

async function handler(req, res) {
  const session = getSessionFromReq(req) || {}
  if (req.method === 'GET') {
    // PREVIEW what the customer receives - the customer PDF, opened in the browser
    if (req.query.preview) {
      const report = ((await get(REPORTS)) || []).find(r => r.id === String(req.query.preview))
      if (!report) return res.status(404).json({ error: 'That report no longer exists.' })
      const only = new Set(customerInclude(await get(CUSTOMER_KEY)))
      const bytes = await buildProjectReportPDF({ report, logoUrl: pdfLogoUrl(req), openIssues: only.has('_issues') ? await openIssuesFor(report) : [], only })
      res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'inline; filename="Customer Progress Report.pdf"')
      return res.send(Buffer.from(bytes))
    }
    if (req.query.report) {
      const report = ((await get(REPORTS)) || []).find(r => r.id === String(req.query.report))
      if (!report) return res.status(404).json({ error: 'That report no longer exists.' })
      const users = (await getPortalUsers()).filter(u => u && u.active !== false && EMAIL.test(String(u.email || ''))).map(u => ({ name: u.name || u.email, email: String(u.email).toLowerCase(), role: u.role || '' }))
      return res.status(200).json({ to: await customerTeam(report.projectNo), users, sends: report.customerSends || [], projectName: report.projectName || '', reportId: report.reportId || '' })
    }
    return res.status(200).json({ settings: { include: customerInclude(await get(CUSTOMER_KEY)) }, template: (await get('ops:project-report-template').catch(() => null)) || null })   // the report template's own key
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}
  if (b.action === 'settings') {
    if (!requireRole(req, res, ['post-contract', 'management', 'admin'])) return
    const include = Array.isArray(b.include) ? [...new Set(b.include.map(String).filter(k => /^[\w-]{1,80}$/.test(k)))] : null
    if (!include) return res.status(400).json({ error: 'No sections sent' })
    await set(CUSTOMER_KEY, { include, updatedAt: new Date().toISOString(), updatedBy: session.name || '' })
    return res.status(200).json({ ok: true, settings: { include } })
  }
  if (b.action === 'send') {
    const reports = (await get(REPORTS)) || []
    const i = reports.findIndex(r => r.id === String(b.reportId || ''))
    if (i < 0) return res.status(404).json({ error: 'That report no longer exists.' })
    const report = reports[i]
    const team = await customerTeam(report.projectNo)
    const clean = (l) => [...new Set((Array.isArray(l) ? l : []).map(e => String(e || '').trim().toLowerCase()).filter(e => EMAIL.test(e)))]
    // THE RECIPIENTS (1236): the team members ticked (only ever the project's own team - a
    // ticked address must be one of them; none sent = the whole team, as before), plus any
    // addresses added by hand
    const ticked = Array.isArray(b.to) ? clean(b.to).filter(e => team.some(t => t.email === e)) : team.map(t => t.email)
    const extra = clean(b.extra).filter(e => !ticked.includes(e))
    const toEmails = [...ticked, ...extra]
    if (!toEmails.length) return res.status(400).json({ error: team.length ? 'Choose at least one person to send it to.' : 'There is no customer project team with an email address for this project - add them in Project Details, or add an email address by hand.' })
    const to = toEmails.map(e => team.find(t => t.email === e) || { name: '', title: '', email: e })
    const cc = clean(b.cc).filter(e => !toEmails.includes(e))
    const key = process.env.RESEND_API_KEY
    if (!key) return res.status(500).json({ error: 'Email is not set up (RESEND_API_KEY missing).' })
    const only = new Set(customerInclude(await get(CUSTOMER_KEY)))
    const bytes = await buildProjectReportPDF({ report, logoUrl: pdfLogoUrl(req), openIssues: only.has('_issues') ? await openIssuesFor(report) : [], only })
    const co = companyName() || ''
    const fname = `Customer Progress Report ${report.reportId || ''} - ${report.projectName || report.projectNo || ''}`.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) + '.pdf'
    const subject = String(b.subject || `${report.projectName || report.projectNo} - Customer Progress Report${report.date ? ` - ${report.date.split('-').reverse().join('/')}` : ''}`).slice(0, 300)
    const message = String(b.message || '').trim()
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:640px">${message ? message.split('\n').map(l => `<p style="margin:0 0 8px">${esc(l) || '&nbsp;'}</p>`).join('') : ''}<p style="color:#666;font-size:13px">The ${esc(co)} customer progress report for ${esc(report.projectName || report.projectNo)} is attached.</p></div>`
    const sender = String(session.email || '').trim()
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail('notify'), to: to.map(t => t.email), ...(cc.length ? { cc } : {}), ...(EMAIL.test(sender) ? { reply_to: sender } : {}), subject, html,
        attachments: [{ filename: fname, content: Buffer.from(bytes).toString('base64') }] }) })
    if (!r.ok) { const t = await r.text().catch(() => ''); return res.status(502).json({ error: `The email could not be sent (${r.status}) ${t.slice(0, 200)}` }) }
    const sent = { at: new Date().toISOString(), by: session.name || '', to: to.map(t => t.email), ...(extra.length ? { added: extra } : {}), ...(team.length > ticked.length ? { leftOut: team.filter(t => !ticked.includes(t.email)).map(t => t.email) } : {}), cc, subject }
    const next = [...reports]; next[i] = { ...report, customerSends: [...(report.customerSends || []), sent] }
    await set(REPORTS, next)
    return res.status(200).json({ ok: true, sent })
  }
  return res.status(400).json({ error: 'Unknown action' })
}
export default withTenant(handler)
