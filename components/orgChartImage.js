// Draws an org chart to a PNG (1027, redrawn as a tree in 1031). Plain canvas
// - no library, and real text rendering, so names with accents or macrons
// come out right.
//
// roots: the forest from lib/orgTree.js buildForest(), each node carrying
//        { title, subtitle, accent, dashed, tag } as on screen
// Returns a PNG Blob, drawn at 2x so it stays sharp printed or zoomed.

const SCALE = 2
const PAD = 40, H_GAP = 14, V_GAP = 44, ROOT_GAP = 36
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

// dotted (1060): [{ from, to }] node keys - drawn as dashed curves behind the
// boxes. Comments (node.comment) get their own line, and every box grows to
// fit when any card has one.
export async function drawOrgChart({ title, subtitle, roots, dotted = [] }) {
  const m = document.createElement('canvas').getContext('2d')
  const textW = (t, size, weight = 400) => { m.font = `${weight} ${size}px ${FONT}`; return m.measureText(t || '').width }

  // Pass 1: each box's width, each subtree's width.
  const size = (t) => {
    const n = t.node
    t.w = Math.min(240, Math.max(140, Math.ceil(Math.max(textW(n.title, 14, 600), textW(n.subtitle, 12), textW((n.tag || '').toUpperCase(), 10, 600), textW(n.comment, 11, 400))) + 28))
    t.children.forEach(size)
    const kids = t.children.reduce((a, c) => a + c.sw, 0) + H_GAP * Math.max(0, t.children.length - 1)
    t.sw = Math.max(t.w, kids)
    t.depth = 1 + (t.children.length ? Math.max(...t.children.map(c => c.depth)) : 0)
  }
  roots.forEach(size)
  // One box height for the whole chart: room for a comment line if any card
  // has one, so rows stay level.
  const all = []
  const walk = (t) => { all.push(t); t.children.forEach(walk) }
  roots.forEach(walk)
  const anyComment = all.some(t => t.node.comment)
  const BOX_H = anyComment ? 76 : 62

  const treesW = roots.reduce((a, r) => a + r.sw, 0) + ROOT_GAP * Math.max(0, roots.length - 1)
  const depth = roots.length ? Math.max(...roots.map(r => r.depth)) : 0
  const headH = 76
  const width = Math.max(treesW, textW(title, 22, 700), 600) + PAD * 2
  const height = headH + depth * BOX_H + Math.max(0, depth - 1) * V_GAP + PAD + 10

  // Pass 2: positions. A parent sits centred over its children.
  const place = (t, left, top) => {
    t.y = top
    if (t.children.length) {
      const kidsW = t.children.reduce((a, c) => a + c.sw, 0) + H_GAP * (t.children.length - 1)
      let x = left + (t.sw - kidsW) / 2
      for (const c of t.children) { place(c, x, top + BOX_H + V_GAP); x += c.sw + H_GAP }
    }
    t.cx = left + t.sw / 2
    t.x = t.cx - t.w / 2
  }
  let x = PAD + (width - PAD * 2 - treesW) / 2
  for (const r of roots) { place(r, x, headH); x += r.sw + ROOT_GAP }

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * SCALE); canvas.height = Math.ceil(height * SCALE)
  const g = canvas.getContext('2d')
  g.scale(SCALE, SCALE)
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, width, height)

  g.textAlign = 'left'
  g.fillStyle = '#1a1a19'; g.font = `700 22px ${FONT}`; g.fillText(title, PAD, PAD + 8)
  g.fillStyle = '#888888'; g.font = `400 12px ${FONT}`; g.fillText(subtitle, PAD, PAD + 28)

  // Lines first, so boxes sit on top of them.
  g.strokeStyle = '#cfccc4'; g.lineWidth = 1.5
  const lines = (t) => {
    if (!t.children.length) return
    const midY = t.y + BOX_H + V_GAP / 2
    g.beginPath()
    g.moveTo(t.cx, t.y + BOX_H); g.lineTo(t.cx, midY)
    const first = t.children[0].cx, last = t.children[t.children.length - 1].cx
    g.moveTo(first, midY); g.lineTo(last, midY)
    for (const c of t.children) { g.moveTo(c.cx, midY); g.lineTo(c.cx, c.y) }
    g.stroke()
    t.children.forEach(lines)
  }
  roots.forEach(lines)

  // Dotted lines (1060): between the two boxes, behind them, bowed below
  // when both sit on the same row.
  const byKey = new Map(all.map(t => [t.node.key, t]))
  g.save(); g.setLineDash([5, 4]); g.strokeStyle = '#8b8b85'; g.lineWidth = 1.5
  for (const l of dotted) {
    const a = byKey.get(l.from), c = byKey.get(l.to)
    if (!a || !c) continue
    g.beginPath()
    if (Math.abs(a.y - c.y) < 2) {
      const [p, q] = a.cx < c.cx ? [a, c] : [c, a], y = p.y + BOX_H
      g.moveTo(p.cx, y); g.bezierCurveTo(p.cx, y + 28, q.cx, y + 28, q.cx, y)
    } else {
      const [p, q] = a.y < c.y ? [a, c] : [c, a], y1 = p.y + BOX_H, y2 = q.y, my = (y1 + y2) / 2
      g.moveTo(p.cx, y1); g.bezierCurveTo(p.cx, my, q.cx, my, q.cx, y2)
    }
    g.stroke()
  }
  g.restore()

  const box = (t) => {
    const n = t.node
    roundRect(g, t.x, t.y, t.w, BOX_H, 8)
    g.fillStyle = '#ffffff'; g.fill()
    g.setLineDash(n.dashed ? [5, 4] : []); g.strokeStyle = '#e1e0d9'; g.lineWidth = 1; g.stroke(); g.setLineDash([])
    g.fillStyle = n.accent || '#be123c'; g.fillRect(t.x + 1, t.y, t.w - 2, 3)
    g.textAlign = 'center'
    g.fillStyle = '#1a1a19'; g.font = `600 14px ${FONT}`; g.fillText(fit(g, n.title || '—', t.w - 16), t.cx, t.y + 25)
    if (n.subtitle) { g.fillStyle = '#888888'; g.font = `400 12px ${FONT}`; g.fillText(fit(g, n.subtitle, t.w - 16), t.cx, t.y + 42) }
    if (n.comment) { g.fillStyle = '#6b7280'; g.font = `italic 400 11px ${FONT}`; g.fillText(fit(g, n.comment, t.w - 16), t.cx, t.y + 57) }
    if (n.tag) { g.fillStyle = n.accent || '#888888'; g.font = `600 10px ${FONT}`; g.fillText(n.tag.toUpperCase(), t.cx, t.y + (n.comment ? 71 : 56)) }
    t.children.forEach(box)
  }
  roots.forEach(box)

  return await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not create the image')), 'image/png'))
}

// Trim text with an ellipsis to fit a width, using the font already set.
function fit(g, text, max) {
  if (g.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r)
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r)
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y)
  g.closePath()
}

// Hand a Blob to the browser as a download.
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
