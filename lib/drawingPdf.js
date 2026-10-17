// A MARKED-UP DRAWING ON PDF PAGES (1233) - for the project report (and the customer's
// progress report). The drawing (an image, or the pages of a PDF) is drawn to fit a page
// of its own, and its mark-up from components/DrawingMarkup is redrawn on top exactly
// where it was drawn: every coordinate there is a FRACTION (0-1) of the drawing page, and
// the SVG overlay is 1000 x 1000 units stretched over the page - so a stroke of width w
// is w/1000 of the drawing's width.
//   shapes: arrow, line, rect, circle (ellipse in its box), free, highlight (polylines of
//   points), text (a box with words, size, bold, underline)
// Stored mark-up: an image -> a flat array (page 1); a PDF -> { "1": [...], "2": [...] }.
import { PDFDocument, StandardFonts, rgb, LineCapStyle } from 'pdf-lib'

const VIEW_WIDTH_PX = 900   // the viewer's usual width - text sizes in the mark-up are screen pixels at about this width
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); const n = m ? parseInt(m[1], 16) : 0xdc2626; return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255) }
export function markupMap(initial) {
  if (Array.isArray(initial)) return { 1: initial }
  const out = {}
  if (initial && typeof initial === 'object') for (const k of Object.keys(initial)) out[k] = Array.isArray(initial[k]) ? initial[k] : []
  return out
}
const isPdf = (d) => /pdf/i.test(d.contentType || '') || /\.pdf($|\?)/i.test(d.url || '')

// appends the drawing's page(s) to `pdf`; returns how many pages were added
export async function appendMarkedDrawing(pdf, d, { font, bold } = {}) {
  font = font || await pdf.embedFont(StandardFonts.Helvetica)
  bold = bold || await pdf.embedFont(StandardFonts.HelveticaBold)
  const can = new Map(), draws = (f, ch) => { const k = (f === bold ? 'b' : 'r') + ch; if (!can.has(k)) { try { f.encodeText(ch); can.set(k, true) } catch { can.set(k, false) } } return can.get(k) }
  const safe = (t, f = font) => [...String(t == null ? '' : t)].map(ch => (ch === '\n' || draws(f, ch)) ? ch : (ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '') || '?').split('').map(c => draws(f, c) ? c : '?').join('')).join('')
  const name = safe(d.name || 'Drawing', bold)
  const map = markupMap(d.markup)
  let bytes
  try { bytes = new Uint8Array(await (await fetch(d.url)).arrayBuffer()) } catch { bytes = null }
  const note = (msg) => { const p = pdf.addPage([595.28, 841.89]); p.drawText(name, { x: 40, y: 800, size: 13, font: bold }); p.drawText(safe(msg), { x: 40, y: 780, size: 10, font, color: rgb(0.5, 0.5, 0.5) }); return 1 }
  if (!bytes) return note('This drawing could not be read - view it in the portal.')
  // what to draw: [{ draw: (page, x, y, w, h) => void, w, h, shapes, label }]
  const parts = []
  if (isPdf(d)) {
    let count = 1
    try { count = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount() } catch { return note('This drawing PDF could not be opened - view it in the portal.') }
    const marked = Object.keys(map).map(Number).filter(n => n >= 1 && n <= count && (map[n] || []).length).sort((a, b) => a - b)
    const pageNos = marked.length ? marked : [1]
    const emb = await pdf.embedPdf(bytes, pageNos.map(n => n - 1))
    emb.forEach((e, i) => parts.push({ w: e.width, h: e.height, shapes: map[pageNos[i]] || [], label: count > 1 ? ` - page ${pageNos[i]} of ${count}` : '', draw: (pg, x, y, w, h) => pg.drawPage(e, { x, y, width: w, height: h }) }))
  } else {
    let img = null
    try { img = /png/i.test(d.contentType || '') || /\.png($|\?)/i.test(d.url || '') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes) } catch { try { img = await pdf.embedPng(bytes) } catch { img = null } }
    if (!img) return note('This drawing is in a format the PDF cannot hold (PNG and JPEG can) - view it in the portal.')
    parts.push({ w: img.width, h: img.height, shapes: map[1] || [], label: '', draw: (pg, x, y, w, h) => pg.drawImage(img, { x, y, width: w, height: h }) })
  }
  for (const part of parts) {
    const land = part.w >= part.h
    const PW = land ? 841.89 : 595.28, PH = land ? 595.28 : 841.89
    const pg = pdf.addPage([PW, PH])
    pg.drawText(`${name}${part.label}`, { x: 28, y: PH - 30, size: 12, font: bold })
    const availW = PW - 56, availH = PH - 70
    const sc = Math.min(availW / part.w, availH / part.h)
    const dw = part.w * sc, dh = part.h * sc, x0 = (PW - dw) / 2, y0 = 28 + (availH - dh) / 2
    part.draw(pg, x0, y0, dw, dh)
    pg.drawRectangle({ x: x0, y: y0, width: dw, height: dh, borderColor: rgb(0.85, 0.85, 0.83), borderWidth: 0.5 })
    drawShapes(pg, part.shapes, { x0, y0, dw, dh, PH, font, bold, safe })
  }
  return parts.length
}

function drawShapes(pg, shapes, { x0, y0, dw, dh, PH, font, bold, safe }) {
  const X = (fx) => x0 + Number(fx || 0) * dw, Y = (fy) => y0 + dh - Number(fy || 0) * dh
  const sv = (fy) => PH - Y(fy)                 // the same point in SVG space (y down from the top)
  const sw = (w) => Math.max(0.4, Number(w || 3) * dw / 1000)
  for (const sh of shapes || []) {
    try {
      const colour = hexRgb(sh.colour), op = sh.opacity ?? 1
      if (sh.type === 'free' || sh.type === 'highlight') {
        const pts = (sh.pts || []); if (pts.length < 2) continue
        const isHl = sh.type === 'highlight'
        const path = pts.map((p, i) => `${i ? 'L' : 'M'} ${X(p.x).toFixed(2)} ${sv(p.y).toFixed(2)}`).join(' ')
        pg.drawSvgPath(path, { x: 0, y: PH, borderColor: colour, borderWidth: sw(isHl ? (sh.width || 16) : (sh.width || 3)), borderOpacity: isHl ? (sh.opacity ?? 0.35) : op, borderLineCap: LineCapStyle.Round })
        continue
      }
      if (sh.type === 'text') {
        const x1 = sh.x1 ?? sh.x ?? 0, y1 = sh.y1 ?? sh.y ?? 0, x2 = sh.x2 ?? (x1 + 0.2)
        const f = sh.bold ? bold : font, size = Math.max(5, (sh.fontSize || 18) * dw / VIEW_WIDTH_PX)
        const boxW = Math.max(20, Math.abs(X(x2) - X(x1))), left = Math.min(X(x1), X(x2))
        let ty = Y(Math.min(y1, sh.y2 ?? y1)) - size
        for (const para of safe(sh.text || '', f).split('\n')) {
          let line = ''
          const out = []
          for (const w of para.split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (f.widthOfTextAtSize(t, size) > boxW && line) { out.push(line); line = w } else line = t }
          out.push(line)
          for (const l of out) { pg.drawText(l, { x: left, y: ty, size, font: f, color: colour, opacity: op }); if (sh.underline && l) pg.drawLine({ start: { x: left, y: ty - 1.5 }, end: { x: left + f.widthOfTextAtSize(l, size), y: ty - 1.5 }, thickness: Math.max(0.5, size / 14), color: colour, opacity: op }); ty -= size * 1.2 }
        }
        continue
      }
      const xa = X(Math.min(sh.x1, sh.x2)), xb = X(Math.max(sh.x1, sh.x2)), ya = Y(Math.max(sh.y1, sh.y2)), yb = Y(Math.min(sh.y1, sh.y2))
      if (sh.type === 'rect') { pg.drawRectangle({ x: xa, y: ya, width: xb - xa, height: yb - ya, borderColor: colour, borderWidth: sw(sh.width), borderOpacity: op }); continue }
      if (sh.type === 'circle') { pg.drawEllipse({ x: (xa + xb) / 2, y: (ya + yb) / 2, xScale: (xb - xa) / 2, yScale: (yb - ya) / 2, borderColor: colour, borderWidth: sw(sh.width), borderOpacity: op }); continue }
      // line / arrow
      const ax = X(sh.x1), ay = Y(sh.y1), bx = X(sh.x2), by = Y(sh.y2), t = sw(sh.width)
      pg.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: t, color: colour, opacity: op, lineCap: LineCapStyle.Round })
      if (sh.type === 'arrow') {
        // the head: as the overlay's marker - 10 long and 8 wide, in units of the stroke
        const ang = Math.atan2(by - ay, bx - ax), L = 10 * t * 0.8, W = 4 * t * 0.8
        const tip = { x: bx, y: by }, base = { x: bx - L * Math.cos(ang), y: by - L * Math.sin(ang) }
        const l = { x: base.x + W * Math.sin(ang), y: base.y - W * Math.cos(ang) }, r = { x: base.x - W * Math.sin(ang), y: base.y + W * Math.cos(ang) }
        pg.drawSvgPath(`M ${tip.x} ${PH - tip.y} L ${l.x} ${PH - l.y} L ${r.x} ${PH - r.y} Z`, { x: 0, y: PH, color: colour, opacity: op })
      }
    } catch { /* one odd shape must not lose the drawing */ }
  }
}
