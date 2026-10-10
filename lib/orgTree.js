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
