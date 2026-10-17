// A PURCHASE ORDER AS A PDF (1224) - the "Download" button on the PO. The same content
// the supplier sees on their link: letterhead, the PO, delivery details, lines, VAT and
// totals. Built like the app's other PDFs (pdf-lib, A4, Helvetica).
// Helvetica draws only the Windows Latin set; any other character (a Polish name, an
// emoji in the notes) makes pdf-lib throw, so every string goes through safe() first.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { lineTotal, poTotal, poVat, poGross, poVatRate } from './poShared'

const A4 = [595.28, 841.89], M = 44
const INK = rgb(0.1, 0.1, 0.1), GREY = rgb(0.45, 0.45, 0.45), LINE = rgb(0.85, 0.85, 0.83), SHADE = rgb(0.96, 0.96, 0.95), TEAL = rgb(0.06, 0.46, 0.43)
const money = (n) => `£${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const long = (s) => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }
const STAMP = { draft: 'DRAFT', 'awaiting-approval': 'AWAITING APPROVAL', rejected: 'REJECTED', cancelled: 'CANCELLED' }

export async function buildPoPDF({ po, company = {}, logoUrl = null }) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  // KEEP a character the font can draw (é, ó, ü, £...); only otherwise use its plain letter
  // (ź -> z, ř -> r), a letter with no plain form from a small table (Ł -> L), else '?'
  const can = new Map()
  const draws = (ch) => { if (!can.has(ch)) { try { font.encodeText(ch); can.set(ch, true) } catch { can.set(ch, false) } } return can.get(ch) }
  const PLAIN = { 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ħ': 'H', 'ħ': 'h', 'ı': 'i', 'Ŀ': 'L', 'ŀ': 'l', 'ĸ': 'k', 'Ŧ': 'T', 'ŧ': 't' }
  const safe = (t) => [...String(t == null ? '' : t)].map(ch => {
    if (ch === '\n' || ch === '\t' || draws(ch)) return ch
    if (PLAIN[ch]) return PLAIN[ch]
    const base = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    return base && [...base].every(draws) ? base : '?'
  }).join('')
  let page = pdf.addPage(A4), y = A4[1] - M
  const W = A4[0] - M * 2
  const pages = [page]
  const newPage = () => { page = pdf.addPage(A4); pages.push(page); y = A4[1] - M }
  const ensure = (h) => { if (y - h < M + 30) { newPage(); return true } return false }
  const wrap = (text, size, f, width) => {
    const out = []
    for (const para of safe(text).split('\n')) {
      let line = ''
      for (const w of para.split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (f.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w } else line = t }
      out.push(line)
    }
    return out.length ? out : ['']
  }
  const text = (s, x, yy, { f = font, size = 9.5, color = INK } = {}) => page.drawText(safe(s), { x, y: yy, size, font: f, color })
  const right = (s, xr, yy, o = {}) => { const f = o.f || font, size = o.size || 9.5; text(s, xr - f.widthOfTextAtSize(safe(s), size), yy, o) }

  // LETTERHEAD - logo left, company right
  let logo = null
  try {
    if (company.logo && /^data:image\/(png|jpe?g);base64,/i.test(company.logo)) {
      const bytes = Buffer.from(company.logo.split(',')[1], 'base64')
      logo = /png/i.test(company.logo.slice(0, 20)) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
    } else if (logoUrl) {
      const bytes = new Uint8Array(await (await fetch(logoUrl)).arrayBuffer())
      logo = /\.png($|\?)/i.test(logoUrl) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
    }
  } catch { logo = null }
  const top = y
  if (logo) { const h = 46, w = Math.min(170, logo.width * (h / logo.height)); page.drawImage(logo, { x: M, y: top - h, width: w, height: h }) }
  let ry = top - 9
  right(company.name || '', A4[0] - M, ry, { f: bold, size: 11 }); ry -= 13
  for (const l of [...String(company.address || '').split(/\n|,\s*(?=[A-Z0-9])/).map(s => s.trim()).filter(Boolean),
    [company.phone, company.email].filter(Boolean).join(' · '), company.vatNumber ? `VAT ${company.vatNumber}` : '', company.companyNumber ? `Company no. ${company.companyNumber}` : ''].filter(Boolean)) { right(l, A4[0] - M, ry, { size: 8.5, color: GREY }); ry -= 11 }
  y = Math.min(top - 56, ry - 6)

  // THE PO
  text(`Purchase order ${po.number || ''}`.trim(), M, y - 16, { f: bold, size: 17 }); 
  if (STAMP[po.status]) right(STAMP[po.status], A4[0] - M, y - 15, { f: bold, size: 12, color: rgb(0.71, 0.14, 0.09) })
  y -= 30
  text(`Raised ${long(po.raisedAt)}${po.raisedBy ? ` by ${po.raisedBy}` : ''}`, M, y, { color: GREY, size: 9 }); y -= 22
  const cols = [['Supplier', po.contactName || po.supplier || ''], ['Project', [po.jobNo, po.projectName].filter(Boolean).join(' ')], ['Delivery required', long(po.deliveryDate)]]
  cols.forEach(([k, v], i) => { const x = M + i * (W / 3); text(k, x, y, { size: 8, color: GREY }); wrap(v, 10, bold, W / 3 - 10).slice(0, 2).forEach((l, j) => text(l, x, y - 13 - j * 12, { f: bold, size: 10 })) })
  y -= 44

  // DELIVERY DETAILS
  const yes = (v) => v === 'yes' ? 'Yes' : v === 'no' ? 'No' : ''
  const rows = [['Deliver to', po.deliveryAddress], ['Moffett offload required', yes(po.moffett)], ['Artics permitted', yes(po.artics)], ['Special access routes', po.accessRoutes],
    ['Site contact', po.siteContact && po.siteContact.name ? `${po.siteContact.name}${po.siteContact.phone ? ` - ${po.siteContact.phone}` : ''}` : ''], ['Order confirmations to', po.confirmationsTo]].filter(([, v]) => v)
  for (const [k, v] of rows) { const ls = wrap(v, 9.5, font, W - 140); ensure(ls.length * 12 + 4); text(k, M, y, { size: 8.5, color: GREY }); ls.forEach((l, j) => text(l, M + 140, y - j * 12)); y -= ls.length * 12 + 4 }
  y -= 10

  // LINES - the header repeats on a new page
  const cx = { qty: A4[0] - M - 190, price: A4[0] - M - 90, total: A4[0] - M }
  const head = () => { page.drawRectangle({ x: M, y: y - 16, width: W, height: 18, color: SHADE }); text('Item', M + 6, y - 11, { f: bold, size: 9 }); right('Qty', cx.qty, y - 11, { f: bold, size: 9 }); right('Price', cx.price, y - 11, { f: bold, size: 9 }); right('Total', cx.total - 6, y - 11, { f: bold, size: 9 }); y -= 22 }
  ensure(40); head()
  for (const l of po.lines || []) {
    const desc = wrap(`${l.description || ''}${l.code ? `  (${l.code})` : ''}`, 9.5, font, cx.qty - M - 70)
    const h = desc.length * 12 + 6
    if (ensure(h)) head()
    desc.forEach((d, j) => text(d, M + 6, y - 9 - j * 12))
    right(`${l.qty ?? ''}${l.unit ? ` ${l.unit}` : ''}`, cx.qty, y - 9); right(money(l.price), cx.price, y - 9); right(money(lineTotal(l)), cx.total - 6, y - 9)
    y -= h; page.drawLine({ start: { x: M, y: y + 2 }, end: { x: A4[0] - M, y: y + 2 }, thickness: 0.5, color: LINE })
  }
  // TOTALS
  ensure(60); y -= 6
  const tot = (k, v, b = false) => { right(k, cx.price, y - 9, { f: b ? bold : font }); right(v, cx.total - 6, y - 9, { f: b ? bold : font }); y -= 15 }
  tot('Subtotal (ex VAT)', money(poTotal(po))); tot(po.vat === 'none' ? 'No VAT' : `VAT ${poVatRate(po)}%`, money(poVat(po)))
  page.drawLine({ start: { x: cx.price - 110, y: y + 2 }, end: { x: A4[0] - M, y: y + 2 }, thickness: 1, color: INK }); tot('Total', money(poGross(po)), true)
  y -= 8
  if (po.notes) { ensure(30); text('Additional notes', M, y, { size: 8.5, color: GREY }); y -= 13; for (const l of wrap(po.notes, 9.5, font, W)) { ensure(12); text(l, M, y); y -= 12 } y -= 6 }
  if (Array.isArray(po.attachmentNames) && po.attachmentNames.length) { ensure(24); text(`Attached: ${po.attachmentNames.join(', ')}`, M, y, { size: 8.5, color: GREY }); y -= 14 }

  // FOOTER on every page
  const foot = `Please quote ${po.number || 'this purchase order number'} on your invoice.${po.confirmationsTo ? ` Please send the order confirmation to ${po.confirmationsTo}.` : ''}`
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 18 }, end: { x: A4[0] - M, y: M + 18 }, thickness: 0.5, color: LINE })
    p.drawText(safe(foot), { x: M, y: M + 6, size: 8, font: bold, color: TEAL })
    const pn = `Page ${i + 1} of ${pages.length}`; p.drawText(pn, { x: A4[0] - M - font.widthOfTextAtSize(pn, 8), y: M - 6, size: 8, font, color: GREY })
  })
  return pdf.save()
}
