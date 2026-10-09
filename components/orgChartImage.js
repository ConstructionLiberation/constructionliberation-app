// Draws the org chart to a PNG for download (1027). Plain canvas - no library,
// and real text rendering, so names with accents or macrons come out right
// (the standard PDF fonts cannot encode those).
//
// tiers:    [{ label, people:[{ name, jobRole }] }]   as on the page
// external: outsourced-service rows                    as on the page
// Returns a PNG Blob. Drawn at 2x so it stays sharp when printed or zoomed.

const SCALE = 2
const PAD = 40, GAP = 12, BOX_H = 58, TIER_GAP = 34, MAX_W = 1500
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

export async function drawOrgChart({ title, subtitle, tiers, external }) {
  const measure = document.createElement('canvas').getContext('2d')
  const textW = (t, size, weight = 400) => { measure.font = `${weight} ${size}px ${FONT}`; return measure.measureText(t || '').width }

  const sections = [...tiers.map(t => ({ label: t.label, accent: t.label === 'Other' ? '#bbbbbb' : '#be123c',
    boxes: t.people.map(p => ({ line1: p.name, line2: p.jobRole || 'No job role set' })) }))]
  const ext = (external || []).filter(r => r.service || r.provider)
  if (ext.length) sections.push({ label: 'Outsourced services', accent: '#64748b', dashed: true,
    boxes: ext.map(r => ({ line1: r.provider || r.service, line2: r.provider ? (r.service || '') : '' })) })

  // Lay each section out in rows no wider than MAX_W.
  let width = 0
  for (const s of sections) {
    s.rows = [[]]; let rowW = 0
    for (const b of s.boxes) {
      b.w = Math.max(150, Math.ceil(Math.max(textW(b.line1, 14, 600), textW(b.line2, 12))) + 28)
      if (rowW && rowW + GAP + b.w > MAX_W) { s.rows.push([]); rowW = 0 }
      s.rows[s.rows.length - 1].push(b); rowW += (rowW ? GAP : 0) + b.w
    }
    for (const r of s.rows) width = Math.max(width, r.reduce((a, b) => a + b.w, 0) + GAP * (r.length - 1))
  }
  width = Math.max(width, textW(title, 22, 700), 600) + PAD * 2
  const headH = 70
  const height = headH + sections.reduce((a, s) => a + 22 + s.rows.length * (BOX_H + GAP) - GAP + TIER_GAP, 0) + PAD

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * SCALE); canvas.height = Math.ceil(height * SCALE)
  const g = canvas.getContext('2d')
  g.scale(SCALE, SCALE)
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, width, height)
  g.textBaseline = 'alphabetic'

  g.fillStyle = '#1a1a19'; g.font = `700 22px ${FONT}`; g.textAlign = 'left'
  g.fillText(title, PAD, PAD + 8)
  g.fillStyle = '#888888'; g.font = `400 12px ${FONT}`
  g.fillText(subtitle, PAD, PAD + 28)

  let y = headH + 10
  const cx = width / 2
  sections.forEach((s, i) => {
    if (i > 0) { g.strokeStyle = '#d6d3cc'; g.lineWidth = 2; g.setLineDash([]); g.beginPath(); g.moveTo(cx, y - TIER_GAP + 6); g.lineTo(cx, y - 4); g.stroke() }
    g.fillStyle = '#999999'; g.font = `600 11px ${FONT}`; g.textAlign = 'center'
    g.fillText(s.label.toUpperCase(), cx, y + 10)
    y += 22
    for (const row of s.rows) {
      const rw = row.reduce((a, b) => a + b.w, 0) + GAP * (row.length - 1)
      let x = cx - rw / 2
      for (const b of row) {
        roundRect(g, x, y, b.w, BOX_H, 8)
        g.fillStyle = '#ffffff'; g.fill()
        g.setLineDash(s.dashed ? [5, 4] : []); g.strokeStyle = '#e1e0d9'; g.lineWidth = 1; g.stroke()
        g.setLineDash([])
        g.fillStyle = s.accent; g.fillRect(x + 1, y, b.w - 2, 3)
        g.textAlign = 'center'
        g.fillStyle = '#1a1a19'; g.font = `600 14px ${FONT}`; g.fillText(b.line1, x + b.w / 2, y + 26)
        g.fillStyle = '#888888'; g.font = `400 12px ${FONT}`; g.fillText(b.line2, x + b.w / 2, y + 44)
        x += b.w + GAP
      }
      y += BOX_H + GAP
    }
    y += TIER_GAP - GAP
  })

  return await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not create the image')), 'image/png'))
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r)
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r)
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y)
  g.closePath()
}
