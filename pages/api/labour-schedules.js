import { requireArea } from '../../lib/portalAuth'
import withTenant from '../../lib/withTenant'
import { loadProject, persistProject } from '../../lib/projectStore'
import { buildLabourLines, subTotal, round2 } from '../../lib/labourSchedule'
import { companyName } from '../../lib/tenantSettings'
import { currencySymbol } from '../../lib/locale'
import { pdfText } from '../../lib/pdfText'

// LABOUR RATES SCHEDULES (1073) - stored on the project record as
//   project.labourSchedules = {
//     rates:    { [lineKey]: number }     rates typed on the main schedule
//     packages: [{ id, name, createdAt, createdBy, lines: [...] }]
//   }
// A package is a schedule sent to one subcontract installer: a SNAPSHOT of the
// chosen lines with the rates they were sent at. A line can be in one package
// at a time; deleting a package frees its lines.
//
// GET  ?projectId=                         -> { schedules }
// GET  ?projectId=&download=<id>&format=xlsx|pdf   -> the file, NO budget figures
// POST { action: 'save-rates', projectId, rates }          merge typed rates
// POST { action: 'create', projectId, name, keys, rates }  new subbie schedule
// POST { action: 'delete', projectId, id }
//
// Commercial area, as the contracted rates. The lines are rebuilt on the
// SERVER from the project's own rates and variations (lib/labourSchedule.js),
// so a schedule always holds what the project actually says.

const empty = () => ({ rates: {}, packages: [] })
const clean = (s) => ({ rates: (s && typeof s.rates === 'object' && s.rates) || {}, packages: Array.isArray(s?.packages) ? s.packages : [] })
const num = (v) => { if (v === '' || v == null) return null; const x = parseFloat(v); return isNaN(x) ? null : round2(x) }

async function handler(req, res) {
  const session = requireArea(req, res, 'commercial')
  if (!session) return
  const projectId = String((req.method === 'GET' ? req.query.projectId : req.body?.projectId) || '')
  if (!projectId) return res.status(400).json({ error: 'Choose a project first.' })
  const project = await loadProject(projectId)
  const sched = clean(project.labourSchedules)

  if (req.method === 'GET') {
    if (req.query.download) return download(req, res, project, sched)
    return res.status(200).json({ schedules: sched })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { action } = req.body || {}

  if (action === 'save-rates') {
    const incoming = req.body.rates || {}
    for (const [k, v] of Object.entries(incoming)) {
      if (typeof k !== 'string' || k.length > 120) continue
      const r = num(v)
      if (r == null) delete sched.rates[k]; else sched.rates[k] = r
    }
    project.labourSchedules = sched
    await persistProject(projectId, project)
    return res.status(200).json({ schedules: sched })
  }

  if (action === 'create') {
    const name = String(req.body.name || '').trim().slice(0, 120)
    if (!name) return res.status(400).json({ error: 'Give the schedule a name - e.g. the subcontractor.' })
    const keys = [...new Set((req.body.keys || []).map(String))]
    if (!keys.length) return res.status(400).json({ error: 'Tick the items to include first.' })
    // Typed rates sent with the request are saved first, so nothing typed is lost.
    for (const [k, v] of Object.entries(req.body.rates || {})) { const r = num(v); if (r == null) delete sched.rates[k]; else sched.rates[k] = r }
    const lines = buildLabourLines(project.contractedRates?.items || [], project.variations || []).filter(l => l.kind === 'item')
    const byKey = new Map(lines.map(l => [l.key, l]))
    const missing = keys.filter(k => !byKey.has(k))
    if (missing.length) return res.status(409).json({ error: `${missing.length} item(s) are no longer on the schedule - reload and try again.` })
    const taken = new Map()
    for (const p of sched.packages) for (const l of p.lines || []) taken.set(l.key, p.name)
    const clash = keys.filter(k => taken.has(k))
    if (clash.length) return res.status(409).json({ error: `${clash.length} item(s) are already in another schedule (${[...new Set(clash.map(k => taken.get(k)))].join(', ')}).` })
    const pkg = {
      id: `ls_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name, createdAt: new Date().toISOString(), createdBy: session.name || session.email || '',
      // In schedule order, with the rate it is being sent at.
      lines: lines.filter(l => keys.includes(l.key)).map(l => {
        const rate = sched.rates[l.key] ?? null
        return { key: l.key, ref: l.ref, description: l.description, qty: l.qty, unit: l.unit, rate, total: subTotal(rate, l.qty), budgetRate: l.budgetRate, budgetTotal: l.budgetTotal }
      }),
    }
    sched.packages.push(pkg)
    project.labourSchedules = sched
    await persistProject(projectId, project)
    return res.status(200).json({ schedules: sched, created: pkg.id })
  }

  if (action === 'delete') {
    const before = sched.packages.length
    sched.packages = sched.packages.filter(p => p.id !== req.body.id)
    if (sched.packages.length === before) return res.status(404).json({ error: 'That schedule no longer exists.' })
    project.labourSchedules = sched
    await persistProject(projectId, project)
    return res.status(200).json({ schedules: sched })
  }

  return res.status(400).json({ error: "action must be 'save-rates', 'create' or 'delete'" })
}

// THE FILE FOR THE SUBCONTRACTOR - ref, description, qty, unit, rate, total.
// NO budget figures: never the labour rate or total we are working to.
async function download(req, res, project, sched) {
  const pkg = sched.packages.find(p => p.id === req.query.download)
  if (!pkg) return res.status(404).json({ error: 'That schedule no longer exists.' })
  const format = req.query.format === 'pdf' ? 'pdf' : 'xlsx'
  const co = companyName() || ''
  const projName = [project.jobNo || project.projectNo || '', project.name || project.projectName || ''].filter(Boolean).join(' - ') || 'Project'
  const total = round2(pkg.lines.reduce((s, l) => s + (l.total || 0), 0))
  const safe = (s) => String(s).replace(/[^A-Za-z0-9 _.-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'schedule'
  const fname = `Labour-schedule-${safe(pkg.name)}`
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  if (format === 'xlsx') {
    const XLSX = (await import('xlsx')).default || (await import('xlsx'))
    const rows = [
      [`${co ? co + ' - ' : ''}Labour rates schedule`], [`Project: ${projName}`], [`Schedule: ${pkg.name}`], [`Issued: ${today}`], [],
      ['Ref', 'Description', 'Qty', 'Unit', 'Rate', 'Total'],
      ...pkg.lines.map(l => [l.ref || '', l.description || '', l.qty ?? '', l.unit || '', l.rate ?? '', l.total ?? '']),
      [], ['', '', '', '', 'Total', total],
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 10 }, { wch: 60 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 14 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Labour rates')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${fname}.xlsx"`)
    return res.status(200).send(buf)
  }

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const A4 = [595.28, 841.89], M = 40, W = A4[0] - M * 2
  let page = pdf.addPage(A4), y = A4[1] - M
  const INK = rgb(0.1, 0.1, 0.1), GREY = rgb(0.45, 0.45, 0.45), RULE = rgb(0.85, 0.85, 0.85), BAND = rgb(0.95, 0.95, 0.94)
  const t = (s) => pdfText(String(s ?? ''))
  const sym = pdfText(currencySymbol() || '')
  const money = (v) => v == null ? '' : `${sym}${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const cols = [{ x: 0, w: 50 }, { x: 50, w: 250 }, { x: 300, w: 45, r: true }, { x: 350, w: 40 }, { x: 390, w: 60, r: true }, { x: 450, w: W - 450, r: true }]
  const cell = (s, i, f = font, size = 9) => { const c = cols[i], txt = t(s); const x = c.r ? M + c.x + c.w - f.widthOfTextAtSize(txt, size) : M + c.x; page.drawText(txt, { x, y: y - 11, size, font: f, color: INK }) }
  const wrap = (s, width, size = 9) => { const out = []; let cur = ''; for (const w of t(s).split(/\s+/)) { const nx = cur ? `${cur} ${w}` : w; if (!cur || font.widthOfTextAtSize(nx, size) <= width) cur = nx; else { out.push(cur); cur = w } } if (cur) out.push(cur); return out.length ? out : [''] }
  const header = () => {
    page.drawRectangle({ x: M, y: y - 16, width: W, height: 16, color: BAND })
    ;['Ref', 'Description', 'Qty', 'Unit', 'Rate', 'Total'].forEach((h, i) => cell(h, i, bold, 8.5))
    y -= 18
  }
  page.drawText(t(`${co ? co + ' - ' : ''}Labour rates schedule`), { x: M, y: y - 16, size: 15, font: bold, color: INK }); y -= 24
  for (const line of [`Project: ${projName}`, `Schedule: ${pkg.name}`, `Issued: ${today}`]) { page.drawText(t(line), { x: M, y: y - 10, size: 9.5, font, color: GREY }); y -= 14 }
  y -= 8; header()
  for (const l of pkg.lines) {
    const desc = wrap(l.description || '', cols[1].w - 6)
    const h = 4 + 12 * desc.length
    if (y - h < M + 30) { page = pdf.addPage(A4); y = A4[1] - M; header() }
    cell(l.ref || '', 0)
    desc.forEach((d, k) => page.drawText(d, { x: M + cols[1].x, y: y - 11 - k * 12, size: 9, font, color: INK }))
    cell(l.qty ?? '', 2); cell(l.unit || '', 3); cell(money(l.rate), 4); cell(money(l.total), 5)
    y -= h
    page.drawLine({ start: { x: M, y: y + 1 }, end: { x: M + W, y: y + 1 }, thickness: 0.4, color: RULE })
  }
  y -= 6
  if (y < M + 30) { page = pdf.addPage(A4); y = A4[1] - M }
  cell('Total', 4, bold, 9.5); cell(money(total), 5, bold, 9.5)
  const bytes = await pdf.save()
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${fname}.pdf"`)
  return res.status(200).send(Buffer.from(bytes))
}

export default withTenant(handler)
