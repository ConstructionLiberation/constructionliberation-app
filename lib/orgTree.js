// ORG CHART TREE LOGIC (1031) - pure functions, no React, no storage.
//
// Shared by the current org chart, the 1-year org chart and the PNG export,
// so a move means the same thing everywhere.
//
// A chart is a set of NODES:        [{ key, ... }]
// and a set of PLACEMENTS:          { [key]: { parentKey, order } }
//
// A node with no placement is UNPLACED - it waits in the tray under the chart
// rather than being put somewhere by guesswork. A placement whose node no
// longer exists (someone who has left) is ignored, and anyone who reported to
// that person moves up to report to whoever they reported to, so a team is not
// scattered by one leaver.

// Effective parent: skip parents that are not on the chart, guard cycles.
function effectiveParent(key, placements, present) {
  const seen = new Set([key])
  let p = placements[key]?.parentKey || null
  while (p && !present.has(p)) {
    if (seen.has(p)) return null
    seen.add(p)
    p = placements[p]?.parentKey || null
  }
  if (p && seen.has(p)) return null
  return p
}

// Build the forest. Returns { roots: [tree], unplaced: [node] } where a tree is
// { node, children: [tree] }. Siblings sort by order, then by key for a stable
// result. A cycle (only possible from a hand-edited record) is broken by
// treating the looping node as a root - it shows, it does not vanish.
export function buildForest(nodes, placements = {}) {
  const byKey = new Map(nodes.map(n => [n.key, n]))
  const placed = nodes.filter(n => placements[n.key])
  const present = new Set(placed.map(n => n.key))
  const parentOf = new Map()
  for (const n of placed) parentOf.set(n.key, effectiveParent(n.key, placements, present))

  // Cycle check over the effective parents.
  const isRootByCycle = (key) => {
    const seen = new Set()
    let k = key
    while (k) { if (seen.has(k)) return true; seen.add(k); k = parentOf.get(k) || null }
    return false
  }
  for (const n of placed) if (isRootByCycle(n.key)) parentOf.set(n.key, null)

  const kids = new Map()
  for (const n of placed) {
    const p = parentOf.get(n.key) || '__root'
    if (!kids.has(p)) kids.set(p, [])
    kids.get(p).push(n)
  }
  const ord = (n) => placements[n.key]?.order ?? 0
  const sortSibs = (list) => list.sort((a, b) => ord(a) - ord(b) || String(a.key).localeCompare(String(b.key)))
  const grow = (n) => ({ node: n, children: sortSibs(kids.get(n.key) || []).map(grow) })
  const roots = sortSibs(kids.get('__root') || []).map(grow)
  const unplaced = nodes.filter(n => !placements[n.key])
  return { roots, unplaced, parentOf, byKey }
}

// Every key in the subtree under `key`, by effective parents.
export function descendants(key, nodes, placements) {
  const { parentOf } = buildForest(nodes, placements)
  const out = new Set()
  let grew = true
  while (grew) {
    grew = false
    for (const [k, p] of parentOf) if ((p === key || out.has(p)) && !out.has(k)) { out.add(k); grew = true }
  }
  return out
}

// Move `key` relative to `targetKey`:
//   'under'  - becomes the last child of target
//   'before' - same parent as target, just left of it
//   'after'  - same parent as target, just right of it
//   'root'   - top level, at the end
//   'remove' - off the chart, back to the tray (its reports move up a level)
//
// Returns NEW placements, or throws with a message the screen can show.
// Siblings at the destination are renumbered 0..n so order never drifts.
export function moveNode(nodes, placements, key, targetKey, where) {
  const next = { ...placements }
  if (where === 'remove') {
    const { parentOf } = buildForest(nodes, placements)
    const up = parentOf.get(key) || null
    for (const [k, p] of parentOf) if (p === key) next[k] = { ...next[k], parentKey: up }
    delete next[key]
    return next
  }
  if (targetKey === key) throw new Error('A person cannot be placed relative to themselves.')
  if (targetKey && descendants(key, nodes, placements).has(targetKey)) {
    throw new Error('That would put someone under a person who reports to them.')
  }
  const { parentOf } = buildForest(nodes, placements)
  const newParent = where === 'under' ? targetKey
    : where === 'root' ? null
    : (parentOf.get(targetKey) || null)

  // Current siblings at the destination, in display order, without the mover.
  const placedKeys = nodes.map(n => n.key).filter(k => placements[k])
  const sibs = placedKeys
    .filter(k => k !== key && (parentOf.get(k) || null) === newParent)
    .sort((a, b) => (placements[a]?.order ?? 0) - (placements[b]?.order ?? 0) || String(a).localeCompare(String(b)))

  let at = sibs.length
  if (where === 'before' || where === 'after') {
    const i = sibs.indexOf(targetKey)
    at = i < 0 ? sibs.length : (where === 'before' ? i : i + 1)
  }
  sibs.splice(at, 0, key)
  sibs.forEach((k, i) => { next[k] = { ...(next[k] || {}), parentKey: newParent, order: i } })
  return next
}

// DOTTED LINE ROUTE (1061) - straight runs at right angles, shared by the
// screen and the PNG so both draw the same line.
//
// a, c: { x, y, w, h } boxes in the same coordinates. Returns [[x, y], ...]
// points to join with straight lines:
//   same row                -> one horizontal line between the facing sides
//   side by side, different levels -> across from the facing side, down (or up)
//                              at the midpoint between them, across into the
//                              other's facing side: e.g. right, down, right
//   one above the other     -> one vertical line between the facing edges
export function dottedRoute(a, c) {
  const midY = (b) => b.y + b.h / 2
  const right = (b) => b.x + b.w
  const sameRow = Math.abs(midY(a) - midY(c)) < Math.min(a.h, c.h) / 2
  const [l, r] = a.x <= c.x ? [a, c] : [c, a]
  const gapX = r.x - right(l)                      // > 0 when side by side
  if (sameRow) {
    if (gapX > 0) { const y = midY(l); return [[right(l), y], [r.x, y]] }
    // Overlapping in the same row (should not happen in a tree) - stay put.
    return [[l.x + l.w / 2, midY(l)], [r.x + r.w / 2, midY(r)]]
  }
  if (gapX > 0) {
    const x1 = right(l), x2 = r.x, mx = Math.round((x1 + x2) / 2)
    return [[x1, midY(l)], [mx, midY(l)], [mx, midY(r)], [x2, midY(r)]]
  }
  // Horizontally overlapping, different levels: straight up/down through the
  // middle of the overlap, from the upper box's bottom to the lower box's top.
  const [u, d] = a.y <= c.y ? [a, c] : [c, a]
  const ox = Math.round((Math.max(u.x, d.x) + Math.min(right(u), right(d))) / 2)
  return [[ox, u.y + u.h], [ox, d.y]]
}

// DOTTED LINES THAT GO AROUND CARDS (1062).
//
// routeAround(a, c, obstacles) - a, c and every obstacle are { x, y, w, h }
// boxes in one coordinate space; obstacles are ALL the cards on the chart
// (a and c may be among them). Returns [[x, y], ...] joined by straight runs
// that are only ever horizontal or vertical and never pass through a card -
// every card keeps a clear margin round it.
//
// How: the classic orthogonal connector method. Candidate x and y lines are
// every card's padded edges plus the midlines of the gaps between them; their
// crossings outside any card are the grid. The line may leave a and enter c
// through the middle of any side. A shortest-path search over that grid costs
// distance plus a penalty per bend, so it prefers few, clean turns. If no
// route exists it falls back to dottedRoute (1061).
export function routeAround(a, c, obstacles = [], opts = {}) {
  const PAD = opts.pad ?? 10, BEND = opts.bend ?? 40
  const boxes = obstacles.map(b => ({ x1: b.x - PAD, y1: b.y - PAD, x2: b.x + b.w + PAD, y2: b.y + b.h + PAD }))
  const same = (b, r) => Math.abs(b.x - r.x) < 0.5 && Math.abs(b.y - r.y) < 0.5 && Math.abs(b.w - r.w) < 0.5
  const pa = { x1: a.x - PAD, y1: a.y - PAD, x2: a.x + a.w + PAD, y2: a.y + a.h + PAD }
  const pc = { x1: c.x - PAD, y1: c.y - PAD, x2: c.x + c.w + PAD, y2: c.y + c.h + PAD }
  if (!obstacles.some(b => same(b, a))) boxes.push(pa)
  if (!obstacles.some(b => same(b, c))) boxes.push(pc)
  const inside = (x, y) => boxes.some(b => x > b.x1 + 1e-6 && x < b.x2 - 1e-6 && y > b.y1 + 1e-6 && y < b.y2 - 1e-6)
  const hBlocked = (y, xa, xb) => { const lo = Math.min(xa, xb), hi = Math.max(xa, xb); return boxes.some(b => y > b.y1 + 1e-6 && y < b.y2 - 1e-6 && lo < b.x2 - 1e-6 && hi > b.x1 + 1e-6) }
  const vBlocked = (x, ya, yb) => { const lo = Math.min(ya, yb), hi = Math.max(ya, yb); return boxes.some(b => x > b.x1 + 1e-6 && x < b.x2 - 1e-6 && lo < b.y2 - 1e-6 && hi > b.y1 + 1e-6) }

  // Ports: the middle of each side, just outside the margin. dir: the way the
  // line runs out of (or into) that side - 'h' or 'v'.
  const ports = (b, p) => [
    { edge: [b.x + b.w, b.y + b.h / 2], at: [p.x2, b.y + b.h / 2], dir: 'h' },
    { edge: [b.x, b.y + b.h / 2], at: [p.x1, b.y + b.h / 2], dir: 'h' },
    { edge: [b.x + b.w / 2, b.y + b.h], at: [b.x + b.w / 2, p.y2], dir: 'v' },
    { edge: [b.x + b.w / 2, b.y], at: [b.x + b.w / 2, p.y1], dir: 'v' },
  ]
  const from = ports(a, pa), to = ports(c, pc)

  // Candidate lines: padded edges, ports, and the middle of every gap.
  const xsRaw = [...boxes.flatMap(b => [b.x1, b.x2]), ...from.map(p => p.at[0]), ...to.map(p => p.at[0])]
  const ysRaw = [...boxes.flatMap(b => [b.y1, b.y2]), ...from.map(p => p.at[1]), ...to.map(p => p.at[1])]
  const withMids = (v) => { const s = [...new Set(v)].sort((p, q) => p - q); const out = [...s]; for (let i = 1; i < s.length; i++) out.push((s[i - 1] + s[i]) / 2); return [...new Set(out)].sort((p, q) => p - q) }
  const xs = withMids(xsRaw), ys = withMids(ysRaw)

  // Grid points outside every card.
  const id = new Map(), pts = []
  const key = (x, y) => `${x},${y}`
  for (const y of ys) for (const x of xs) if (!inside(x, y)) { id.set(key(x, y), pts.length); pts.push([x, y]) }
  const snap = (v, arr) => arr.reduce((best, n) => Math.abs(n - v) < Math.abs(best - v) ? n : best, arr[0])
  const nodeOf = ([x, y]) => id.get(key(snap(x, xs), snap(y, ys)))

  // Neighbours along each line, where the run between them is clear.
  const adj = pts.map(() => [])
  const byY = new Map(), byX = new Map()
  pts.forEach(([x, y], i) => { (byY.get(y) || byY.set(y, []).get(y)).push(i); (byX.get(x) || byX.set(x, []).get(x)).push(i) })
  for (const row of byY.values()) { row.sort((i, j) => pts[i][0] - pts[j][0]); for (let k = 1; k < row.length; k++) { const i = row[k - 1], j = row[k]; if (!hBlocked(pts[i][1], pts[i][0], pts[j][0])) { const d = pts[j][0] - pts[i][0]; adj[i].push([j, d, 'h']); adj[j].push([i, d, 'h']) } } }
  for (const col of byX.values()) { col.sort((i, j) => pts[i][1] - pts[j][1]); for (let k = 1; k < col.length; k++) { const i = col[k - 1], j = col[k]; if (!vBlocked(pts[i][0], pts[i][1], pts[j][1])) { const d = pts[j][1] - pts[i][1]; adj[i].push([j, d, 'v']); adj[j].push([i, d, 'v']) } } }

  // Shortest path with a bend penalty: state = (point, direction of travel).
  const N = pts.length, dist = new Float64Array(N * 2).fill(Infinity), prev = new Int32Array(N * 2).fill(-1)
  const heap = []
  const push = (s, d) => { heap.push([d, s]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;[heap[p], heap[i]] = [heap[i], heap[p]]; i = p } }
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break;[heap[m], heap[i]] = [heap[i], heap[m]]; i = m } } return top }
  const D = (dir) => dir === 'h' ? 0 : 1
  for (const p of from) { const n = nodeOf(p.at); if (n == null) continue; const s = n * 2 + D(p.dir); if (dist[s] > 0) { dist[s] = 0; push(s, 0) } }
  const goal = new Map()
  for (const p of to) { const n = nodeOf(p.at); if (n != null) (goal.get(n) || goal.set(n, []).get(n)).push(p) }
  let best = null, bestCost = Infinity
  while (heap.length) {
    const [d, s] = pop()
    if (d > dist[s] || d >= bestCost) continue
    const n = s >> 1, dir = s & 1
    if (goal.has(n)) for (const p of goal.get(n)) { const cost = d + (D(p.dir) === dir ? 0 : BEND); if (cost < bestCost) { bestCost = cost; best = { s, p } } }
    for (const [m, len, ed] of adj[n]) { const nd = D(ed), t = m * 2 + nd, c2 = d + len + (nd === dir ? 0 : BEND); if (c2 < dist[t]) { dist[t] = c2; prev[t] = s; push(t, c2) } }
  }
  if (!best) return dottedRoute(a, c)

  // Walk back, then add the short stubs to the cards' edges.
  const chain = []
  for (let s = best.s; s !== -1; s = prev[s]) chain.push(pts[s >> 1])
  chain.reverse()
  const startPort = from.find(p => nodeOf(p.at) === id.get(key(...chain[0])))
  const path = [startPort ? startPort.edge : chain[0], ...chain, best.p.edge]
  // Drop points that sit on a straight run.
  const out = []
  for (const q of path) {
    if (out.length && out[out.length - 1][0] === q[0] && out[out.length - 1][1] === q[1]) continue
    if (out.length >= 2) { const [p0, p1] = [out[out.length - 2], out[out.length - 1]]; if ((p0[0] === p1[0] && p1[0] === q[0]) || (p0[1] === p1[1] && p1[1] === q[1])) { out[out.length - 1] = q; continue } }
    out.push(q)
  }
  return out
}
