import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { isInstructed } from './applications'
import { buildIssuePDF } from './issuePdf'
import { sourceLabel } from './siteWeatherLabel'
import { appendMarkedDrawing } from './drawingPdf'

const A4 = [595.28, 841.89]
const M = 48
const GOLD = rgb(0.79, 0.54, 0.02)
const INK = rgb(0.1, 0.1, 0.1)
const GREY = rgb(0.5, 0.5, 0.5)
const LINE = rgb(0.85, 0.85, 0.85)

const fmtDMY = (d) => { if (!d) return '—'; const [y, m, day] = String(d).split('-'); return day ? `${day}/${m}/${y}` : d }
const money = (n) => { const v = parseFloat(n); return isNaN(v) ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(v) }

// `only` (1234): the CUSTOMER PROGRESS REPORT - a Set of the section keys the customer is sent
// (lib/customerReport); left out = the full internal report, exactly as before.
// THE ISSUES A REPORT INCLUDES (moved here in 1234 so both report routes share one copy): the
// full records of the issues it captured, only those sent to the customer (or marked sent) -
// never "do not send"
export async function openIssuesFor(report) {
  try {
    const { get } = await import('./db')
    const allIssues = (await get('ops:issues')) || []
    const ids = (report.issuesSnapshot || []).map(s => s.id).filter(Boolean)
    return ids.map(id => allIssues.find(i => i.id === id)).filter(Boolean)
      .filter(i => i.sendToCustomer !== 'nosend' && (i.sentToCustomer === true || i.sentManually === true))
  } catch { return [] }
}

export async function buildProjectReportPDF({ report, logoUrl, openIssues, only = null }) {
  const inc = (k) => !only || only.has(k)
  const customer = !!only
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique)
  let page = pdf.addPage(A4)
  let y = A4[1] - M
  const width = A4[0] - M * 2

  let logoImg = null
  if (logoUrl) { try { const b = new Uint8Array(await (await fetch(logoUrl)).arrayBuffer()); logoImg = /\.png$/i.test(logoUrl) ? await pdf.embedPng(b) : await pdf.embedJpg(b) } catch {} }

  const newPage = () => { page = pdf.addPage(A4); y = A4[1] - M }
  const ensure = (h) => { if (y - h < M) newPage() }
  const wrap = (text, size, f) => {
    const words = String(text ?? '').split(/\s+/); const lines = []; let line = ''
    for (const w of words) { const t = line ? line + ' ' + w : w; if (f.widthOfTextAtSize(t, size) > width) { if (line) lines.push(line); line = w } else line = t }
    if (line) lines.push(line); return lines.length ? lines : ['']
  }
  const text = (t, { f = font, size = 10, color = INK, indent = 0, gap = 4 } = {}) => {
    for (const line of wrap(t, size, f)) { ensure(size + gap); page.drawText(line, { x: M + indent, y: y - size, size, font: f, color }); y -= size + gap }
  }
  const gap = (n = 6) => { y -= n }
  const heading = (t) => { gap(6); ensure(20); page.drawText(t.toUpperCase(), { x: M, y: y - 12, size: 11, font: bold, color: GOLD }); y -= 18; page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: LINE }); gap(8) }

  // Header
  const lh = 40
  if (logoImg) page.drawImage(logoImg, { x: M, y: y - lh, width: lh, height: lh })
  page.drawText(customer ? 'Customer Progress Report' : 'Project Site Report', { x: M + (logoImg ? 56 : 0), y: y - 24, size: 20, font: bold, color: INK })
  y -= lh + 6
  page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 1, color: GOLD }); gap(12)

  text(`${report.projectName || ''}${report.projectNo ? ` — ${report.projectNo}` : ''}`, { f: bold, size: 13 })
  if (report.projectAddress) text(report.projectAddress, { color: GREY, size: 9.5 })
  if (report.customerName) text(`Customer: ${report.customerName}`, { color: GREY, size: 9.5 })
  if (report.reportId) text(`Report: ${report.reportId}`, { color: GREY, size: 9.5 })
  text(`${customer ? 'Report date' : 'Completion date'}: ${fmtDMY(report.date)}`, { color: GREY, size: 9.5 })
  text(`Completed by: ${report.completedBy || '—'}`, { color: GREY, size: 9.5 })
  // status pill - the internal report only
  if (!customer) {
  gap(4); ensure(24)
  const done = report.status === 'complete'
  const bc = done ? rgb(0.06, 0.65, 0.35) : rgb(0.79, 0.54, 0.02)
  const bbg = done ? rgb(0.86, 0.99, 0.91) : rgb(1, 0.98, 0.92)
  page.drawRectangle({ x: M, y: y - 22, width: 130, height: 22, color: bbg, borderColor: bc, borderWidth: 1 })
  page.drawText(done ? 'STATUS: SUBMITTED' : 'STATUS: DRAFT', { x: M + 8, y: y - 15, size: 9.5, font: bold, color: bc })
  y -= 26
  } else gap(8)

  // written text keeps its line breaks (1237) - text() alone runs lines together
  const paras = (t, o) => { const s = String(t == null ? '' : t); if (!s.trim()) { text('—', o); return } for (const p of s.split('\n')) { if (p.trim()) text(p, o); else gap(4) } }

  // Variations to instruct
  const vs = report.variationsSnapshot || []
  if (inc('_variations')) { heading(customer ? 'Variations - instructed and not yet instructed' : 'Variations priced awaiting instruction')
  if (!vs.length) text('None.', { color: GREY, size: 10 })
  else {
    // A TABLE (1237): No. | Description | Instructed (Yes green, No red) | Total
    const GREEN = rgb(0.09, 0.5, 0.24), RED = rgb(0.72, 0.11, 0.11), cNo = M + 4, cDesc = M + 46, cIns = A4[0] - M - 150, cTot = A4[0] - M - 6
    const descW = cIns - cDesc - 10, row = (cells, { head = false } = {}) => {
      // wrapped straight to the description column's width
      const lines = head ? [cells.desc] : (() => { const out = []; let cur = ''; for (const w of String(cells.desc || '').split(/\s+/)) { const t = cur ? cur + ' ' + w : w; if (font.widthOfTextAtSize(t, 9.5) > descW && cur) { out.push(cur); cur = w } else cur = t } out.push(cur); return out })()
      const h = Math.max(1, lines.length) * 12 + 6
      ensure(h)
      if (head) page.drawRectangle({ x: M, y: y - h + 2, width: A4[0] - 2 * M, height: h, color: rgb(0.96, 0.96, 0.95) })
      const f = head ? bold : font, top = y - 12
      page.drawText(String(cells.no), { x: cNo, y: top, size: 9.5, font: f, color: INK })
      lines.forEach((l, k) => page.drawText(l, { x: cDesc, y: top - k * 12, size: 9.5, font: f, color: INK }))
      page.drawText(cells.ins, { x: cIns, y: top, size: 9.5, font: head ? bold : bold, color: head ? INK : (cells.ins === 'Yes' ? GREEN : RED) })
      const tw = f.widthOfTextAtSize(cells.tot, 9.5); page.drawText(cells.tot, { x: cTot - tw, y: top, size: 9.5, font: f, color: INK })
      y -= h; page.drawLine({ start: { x: M, y: y + 2 }, end: { x: A4[0] - M, y: y + 2 }, thickness: 0.5, color: LINE })
    }
    row({ no: 'No.', desc: 'Description', ins: 'Instructed', tot: 'Total' }, { head: true })
    for (const v of vs) row({ no: v.varNumber || '—', desc: v.description || '', ins: isInstructed(v) ? 'Yes' : 'No', tot: money(v.total) })
    gap(4)
  }
  }

  // Open issues — only those included (sent/marked sent to customer). Match the appended forms.
  const includedIds = new Set((openIssues || []).map(i => i.id))
  if (inc('_issues')) {
  heading('Issues still to be resolved')
  const iss = (report.issuesSnapshot || []).filter(s => !s.id || includedIds.has(s.id))
  if (!iss.length) text('None.', { color: GREY, size: 10 })
  else {
    text('Date Created · Issue Name · Type · Required Resolution · Status', { f: bold, size: 9 })
    for (const i of iss) text(`${fmtDMY(i.dateCreated)} · ${i.issueName || ''} · ${(i.issueTypes || []).join(', ')} · Req: ${fmtDMY(i.requiredDate)} · ${i.status || 'Open'}`, { size: 9.5, indent: 6 })
    gap(4)
    text('The full issue forms for the open issues listed above are appended at the end of this report.', { f: italic, size: 9, color: GREY })
  }
  }

  // Site communications
  if (inc('_siteComms')) { heading('Site communications')
  paras(report.siteComms, { size: 10 }) }

  // Works completed
  if (inc('_worksCompleted')) { heading('Works completed')
  paras(report.worksCompleted, { size: 10 }) }
  // (1233) the marked-up drawings (drawn in full at the end), planned works, customer notes
  const drawings = inc('_drawings') && Array.isArray(report.drawingsSnapshot) ? report.drawingsSnapshot : []
  if (drawings.length) { heading('Drawings'); text(`Marked up to show the works completed - ${drawings.length === 1 ? 'the drawing follows' : `the ${drawings.length} drawings follow`} on the next pages: ${drawings.map(d => d.name).join(', ')}`, { size: 10 }) }
  if (inc('_plannedWorks') && String(report.plannedWorks || '').trim()) { heading('Planned works in the next 1 - 2 weeks'); paras(report.plannedWorks, { size: 10 }) }
  if (inc('_customerNotes') && String(report.customerNotes || '').trim()) { heading('Additional notes for customer report'); paras(report.customerNotes, { size: 10 }) }

  // THE CUSTOMER'S OWN SECTIONS, under Works completed and in their order.
  //
  // Read from report.sections - the copy frozen onto the report when it was
  // saved - never from the live template. A report issued in March must keep
  // reading the way it read in March.
  const extraSections = Array.isArray(report.sections) ? report.sections : []
  const extraPhotoUrls = []
  for (const sec of extraSections) {
    if (!inc(sec.key)) continue
    const val = (report.extra || {})[sec.key]
    if (sec.type === 'photos') {
      // Gathered here and drawn with the photos below, so they are embedded
      // by the one piece of code that knows how.
      if (Array.isArray(val)) extraPhotoUrls.push({ label: sec.label, urls: val })
      continue
    }
    const txt = String(val == null ? '' : val).trim()
    if (!txt) continue
    heading(sec.label)
    if (sec.type === 'list') {
      for (const line of txt.split('\n').map(l => l.trim()).filter(Boolean)) {
        text('\u2022  ' + line, { size: 10 })
      }
    } else {
      paras(txt, { size: 10 })
    }
  }

  // THE MARKED-UP DRAWINGS, before the photos (1237): each on a page of its own, then the photos
  // carry on from a fresh page after them
  if (drawings.length) {
    for (const d of drawings) { try { await appendMarkedDrawing(pdf, d, { font, bold }) } catch (e) { /* one bad drawing must not lose the report */ } }
    newPage()
  }

  // Photos. Auto-collected first, then anything added by hand - both are
  // report photos as far as the customer is concerned, so they run together
  // under one heading rather than being split by how they got there.
  const manual = (report.manualPhotos || []).filter(p => typeof p === 'string' && /^https?:|^data:/.test(p))
  const photos = [...(inc('_photos') ? (report.photos || []) : []), ...(inc('_manualPhotos') ? manual : [])].filter(p => typeof p === 'string' && /^https?:|^data:/.test(p))
  // ONE embedder, used by the Photos block and by every custom photo section.
  // Two copies of this would drift the moment one of them learned about a new
  // image format.
  async function drawPhoto(p) {
    try {
      let bytes
      if (p.startsWith('data:')) bytes = Uint8Array.from(Buffer.from(p.split(',')[1], 'base64'))
      else bytes = new Uint8Array(await (await fetch(p)).arrayBuffer())
      let img; try { img = await pdf.embedJpg(bytes) } catch { img = await pdf.embedPng(bytes) }
      const maxW = width, maxH = 280; let iw = img.width, ih = img.height
      const scale = Math.min(maxW / iw, maxH / ih, 1); iw *= scale; ih *= scale
      ensure(ih + 10); page.drawImage(img, { x: M, y: y - ih, width: iw, height: ih }); y -= ih + 12
    } catch {}
  }

  if (photos.length) {
    heading('Photos')
    for (const p of photos) await drawPhoto(p)
  }

  // Photo sections the customer defined, each under its own heading so the
  // reader knows what they are looking at. Same embedding as above, which is
  // why it is a shared function rather than a second copy of it.
  for (const block of extraPhotoUrls) {
    const urls = (block.urls || []).filter(p => typeof p === 'string' && /^https?:|^data:/.test(p))
    if (!urls.length) continue
    heading(block.label)
    for (const p of urls) await drawPhoto(p)
  }

  // Weather for the report's week (1067) - after the photos, before approval.
  // A plain table: one row per day, flags last.
  if (inc('_weather') && Array.isArray(report.weather?.days) && report.weather.days.length) {
    heading(`Weather (Source: ${sourceLabel(report.weather)})`)
    text('The 14 days to the report date.', { size: 8.5, color: GREY })
    const cols = [0, 70, 175, 250, 300, 380]
    const head = ['Day', 'Conditions', 'High / low', 'Rain', 'Wind / gusts', 'Flags']
    ensure(14)
    head.forEach((h, i) => page.drawText(h, { x: M + cols[i], y: y - 9, size: 8.5, font: bold, color: GREY }))
    y -= 14
    for (const d of report.weather.days) {
      ensure(13)
      const day = new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
      const cells = [day, String(d.desc || '—'), `${d.tMax ?? '—'} / ${d.tMin ?? '—'} C`, `${d.rainMm ?? '—'} mm`, `${d.windMph ?? '—'} / ${d.gustMph ?? '—'} mph`, (d.flags || []).join(', ')]
      cells.forEach((c, i) => page.drawText(c, { x: M + cols[i], y: y - 9, size: 9, font: i === 5 && c ? bold : font, color: INK }))
      y -= 13
    }
    text(`Postcode ${report.weather.postcode || '—'} · ${report.weather.source || 'Open-Meteo'}. Flags: rain 1 mm+, heavy rain 10 mm+, high wind gusts 30 mph+, frost 0 C or below.`, { size: 8, color: GREY })
  }

  // Approval
  if (inc('_approval')) {
  heading('Approval')
  text('I can confirm that the information I have provided is true and that I have completed all sections accurately and diligently.', { size: 9.5, color: GREY })
  gap(4)
  text(`Name: ${report.approvalName || '—'}`, { f: bold, size: 10 })
  text(`Date: ${fmtDMY(report.approvalDate)}`, { size: 10 })
  }


  // Append the full open-issue forms after the signature/approval page.
  const issuesToAppend = inc('_issues') ? (openIssues || []).filter(Boolean) : []
  for (const issue of issuesToAppend) {
    try {
      const issueBytes = await buildIssuePDF({ issue, project: { projectName: report.projectName, projectNo: report.projectNo }, logoUrl })
      const src = await PDFDocument.load(issueBytes, { ignoreEncryption: true })
      const copied = await pdf.copyPages(src, src.getPageIndices())
      for (const pg of copied) pdf.addPage(pg)
    } catch (e) { /* skip a bad issue form */ }
  }

  // Digital signature / revision footer on EVERY page (incl. appended issue forms)
  const stamp = () => {
    const pages = pdf.getPages()
    if (customer) { pages.forEach((pg, i) => pg.drawText(`${report.reportId ? `${report.reportId} · ` : ''}Customer Progress Report · ${report.projectName || report.projectNo || ''} · page ${i + 1} of ${pages.length}`, { x: M, y: 24, size: 7.5, font: italic, color: GREY })); return }
    for (const pg of pages) {
      const revText = `Digitally signed · Rev ${report.revision || 0} · Last amended ${new Date(report.updatedAt || Date.now()).toLocaleString('en-GB')} by ${report.approvalName || report.completedBy || '—'}`
      pg.drawText(revText, { x: M, y: 24, size: 7.5, font: italic, color: GREY })
    }
  }
  stamp()

  return await pdf.save()
}
