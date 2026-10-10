import { useState, useRef, useLayoutEffect } from 'react'
import { buildForest, moveNode, descendants, dottedRoute } from '../lib/orgTree'

// THE ORG CHART, DRAWN AND EDITED (1031). Used by the current and the 1-year
// charts.
//
// nodes:      [{ key, title, subtitle, accent, dashed, tag }]
// placements: { key: { parentKey, order } }      - see lib/orgTree.js
// editable:   show the editing controls
// onChange:   async (nextPlacements) => void     - the page saves; a throw is
//             shown by the page and the chart stays as it was
// onEditNode: optional - adds an "Edit details" button (1-year chart)
//
// Two ways to move someone, because drag-and-drop does not work on a phone or
// tablet:
//   DRAG a card onto another card - the middle puts it UNDER that person, the
//        left or right edge puts it BESIDE them. Drag to the tray to take it
//        off the chart. Drag to the top bar for the top level.
//   CLICK a card - a panel opens with "Reports to", move left / right, and
//        remove. Works everywhere.
// 1060:
//   node.comment   a short line shown under the role (e.g. "Office")
//   dotted         [{ from, to }] - dotted lines between cards: a working
//                  relationship outside the reporting line. Drawn behind the
//                  cards; only between cards that are on the chart.
//   onDottedChange async (next) => void - omit to show lines without editing
export default function OrgTree({ nodes, placements, editable, onChange, onEditNode, onError, trayTitle = 'Not on the chart yet', dotted = [], onDottedChange }) {
  const [dragKey, setDragKey] = useState(null)
  const [hover, setHover] = useState(null)       // { key, where }
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)

  const { roots, unplaced, parentOf, byKey } = buildForest(nodes, placements)

  // DOTTED LINES (1060). The tree is laid out by CSS, so where a card ends up
  // is only known once it is on screen: measure each card (data-orgkey)
  // against the chart's own box and draw the lines in an SVG behind the cards.
  // Re-measured whenever the chart changes size.
  const chartRef = useRef(null)
  const [lines, setLines] = useState([])
  const placedSet = new Set(nodes.filter(n => placements[n.key]).map(n => n.key))
  const liveDotted = (dotted || []).filter(l => placedSet.has(l.from) && placedSet.has(l.to))
  const dottedSig = JSON.stringify(liveDotted) + '|' + JSON.stringify(placements) + '|' + nodes.map(n => n.key + (n.comment || '')).join(',')
  useLayoutEffect(() => {
    const box = chartRef.current
    if (!box) { setLines([]); return }
    const measure = () => {
      const b = box.getBoundingClientRect()
      const at = (k) => { const el = box.querySelector(`[data-orgkey="${CSS.escape(k)}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height } }
      // Straight runs at right angles (1061) - lib/orgTree.js dottedRoute, the
      // same route the PNG draws.
      setLines(liveDotted.map(l => {
        const a = at(l.from), c = at(l.to)
        if (!a || !c) return null
        const pts = dottedRoute(a, c)
        return { d: pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' '), key: l.from + '|' + l.to }
      }).filter(Boolean))
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro) ro.observe(box)
    return () => { if (ro) ro.disconnect() }
  }, [dottedSig])

  async function changeDotted(next) {
    if (!onDottedChange || busy) return
    setBusy(true)
    try { await onDottedChange(next) } finally { setBusy(false) }
  }

  async function move(key, targetKey, where) {
    if (busy) return
    let next
    try { next = moveNode(nodes, placements, key, targetKey, where) }
    catch (e) { onError && onError(e.message); return }
    setBusy(true)
    try { await onChange(next) } finally { setBusy(false) }
  }

  const whereFromEvent = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    return x < 0.25 ? 'before' : (x > 0.75 ? 'after' : 'under')
  }

  const card = (n) => {
    const isHover = hover?.key === n.key && dragKey && dragKey !== n.key
    const edge = isHover && hover.where !== 'under' ? hover.where : null
    const isSel = selected === n.key
    return (
      <div
        data-orgkey={n.key}
        draggable={editable && !busy}
        onDragStart={e => { setDragKey(n.key); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.key) }}
        onDragEnd={() => { setDragKey(null); setHover(null) }}
        onDragOver={editable ? (e => { if (!dragKey || dragKey === n.key) return; e.preventDefault(); const w = whereFromEvent(e); if (hover?.key !== n.key || hover?.where !== w) setHover({ key: n.key, where: w }) }) : undefined}
        onDragLeave={editable ? (() => setHover(h => h?.key === n.key ? null : h)) : undefined}
        onDrop={editable ? (e => { e.preventDefault(); const k = dragKey; const w = whereFromEvent(e); setHover(null); setDragKey(null); if (k && k !== n.key) move(k, n.key, w) }) : undefined}
        onClick={editable ? (() => setSelected(isSel ? null : n.key)) : undefined}
        style={{
          position: 'relative', zIndex: 1, background: isHover && !edge ? '#fff7ed' : '#fff',
          border: `1px ${n.dashed ? 'dashed' : 'solid'} ${isSel ? '#1a1a19' : (isHover && !edge ? '#f59e0b' : '#e1e0d9')}`,
          borderTop: `3px solid ${n.accent || '#be123c'}`, borderRadius: 8, padding: '9px 12px',
          minWidth: 140, maxWidth: 200, textAlign: 'center', cursor: editable ? 'grab' : 'default',
          opacity: dragKey === n.key ? 0.4 : 1, boxShadow: isSel ? '0 0 0 2px #1a1a1922' : 'none',
        }}>
        {edge && <div style={{ position: 'absolute', top: -4, bottom: -4, [edge === 'before' ? 'left' : 'right']: -7, width: 4, borderRadius: 2, background: '#f59e0b' }} />}
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1a1a19', lineHeight: 1.25 }}>{n.title || '—'}</div>
        {n.subtitle && <div style={{ fontSize: 11.5, color: '#888', marginTop: 2, lineHeight: 1.25 }}>{n.subtitle}</div>}
        {n.comment && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3, fontStyle: 'italic', lineHeight: 1.25 }}>{n.comment}</div>}
        {n.tag && <div style={{ fontSize: 10, marginTop: 4, color: n.accent || '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{n.tag}</div>}
      </div>
    )
  }

  const branch = (t) => (
    <li key={t.node.key}>
      {card(t.node)}
      {t.children.length > 0 && <ul>{t.children.map(branch)}</ul>}
    </li>
  )

  // The selected person's options, for the click-to-move panel.
  const sel = selected && byKey.get(selected)
  const selPlaced = sel && !!placements[selected]
  const blocked = sel ? descendants(selected, nodes, placements) : new Set()
  const parentChoices = sel ? nodes.filter(n => placements[n.key] && n.key !== selected && !blocked.has(n.key)) : []
  const sibs = selPlaced ? nodes.filter(n => placements[n.key] && (parentOf.get(n.key) || null) === (parentOf.get(selected) || null))
    .sort((a, b) => (placements[a.key]?.order ?? 0) - (placements[b.key]?.order ?? 0) || String(a.key).localeCompare(String(b.key))) : []
  const sIdx = sibs.findIndex(n => n.key === selected)

  return (
    <div>
      <style>{TREE_CSS}</style>
      {liveDotted.length > 0 && <div style={{ fontSize: 11.5, color: '#888', marginBottom: 6 }}>┄ Dotted line: works with, but does not report to.</div>}

      {editable && (
        <div
          onDragOver={e => { if (dragKey) e.preventDefault() }}
          onDrop={e => { e.preventDefault(); const k = dragKey; setDragKey(null); setHover(null); if (k) move(k, null, 'root') }}
          style={{ border: '1px dashed #d6d3cc', borderRadius: 8, padding: '7px 10px', fontSize: 12, color: '#999', textAlign: 'center', marginBottom: 14, background: dragKey ? '#fffbeb' : 'transparent' }}>
          Drag here for the top level · drop on a person's middle to put someone under them, on their left or right edge to put someone beside them
        </div>
      )}

      {sel && editable && (
        <div style={{ background: '#fff', border: '1px solid #1a1a19', borderRadius: 10, padding: 12, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          <strong>{sel.title}</strong>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#555' }}>
            Reports to
            <select value={selPlaced ? (parentOf.get(selected) || '__top') : ''} disabled={busy}
              onChange={e => { const v = e.target.value; if (!v) return; v === '__top' ? move(selected, null, 'root') : move(selected, v, 'under') }}
              style={{ fontSize: 13, padding: '5px 7px', border: '1px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }}>
              {!selPlaced && <option value="">Choose…</option>}
              <option value="__top">Nobody - top level</option>
              {parentChoices.map(n => <option key={n.key} value={n.key}>{n.title}{n.subtitle ? ` - ${n.subtitle}` : ''}</option>)}
            </select>
          </label>
          {selPlaced && (
            <>
              <button disabled={busy || sIdx <= 0} onClick={() => move(selected, sibs[sIdx - 1].key, 'before')} style={smallBtn}>◀ Move left</button>
              <button disabled={busy || sIdx < 0 || sIdx >= sibs.length - 1} onClick={() => move(selected, sibs[sIdx + 1].key, 'after')} style={smallBtn}>Move right ▶</button>
              <button disabled={busy} onClick={() => { move(selected, null, 'remove'); setSelected(null) }} style={smallBtn}>Take off chart</button>
            </>
          )}
          {onEditNode && <button onClick={() => onEditNode(selected)} style={smallBtn}>Edit details</button>}
          {onDottedChange && selPlaced && (() => {
            const mine = (dotted || []).filter(l => l.from === selected || l.to === selected)
            const linked = new Set(mine.map(l => l.from === selected ? l.to : l.from))
            const choices = nodes.filter(n => placements[n.key] && n.key !== selected && !linked.has(n.key))
            return (
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', borderLeft: '1px solid #e1e0d9', paddingLeft: 10 }}>
                <select value="" disabled={busy} onChange={e => { const v = e.target.value; if (v) changeDotted([...(dotted || []), { from: selected, to: v }]) }}
                  style={{ fontSize: 13, padding: '5px 7px', border: '1px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }}>
                  <option value="">Dotted line to…</option>
                  {choices.map(n => <option key={n.key} value={n.key}>{n.title}{n.subtitle ? ` - ${n.subtitle}` : ''}</option>)}
                </select>
                {mine.map(l => {
                  const other = byKey.get(l.from === selected ? l.to : l.from)
                  return (
                    <span key={l.from + '|' + l.to} style={{ fontSize: 12, border: '1px dashed #9ca3af', borderRadius: 999, padding: '3px 4px 3px 9px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      ┄ {other ? other.title : '?'}
                      <button title="Remove this dotted line" disabled={busy} onClick={() => changeDotted((dotted || []).filter(x => x !== l))}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, lineHeight: 1 }}>×</button>
                    </span>
                  )
                })}
              </span>
            )
          })()}
          <button onClick={() => setSelected(null)} style={{ ...smallBtn, marginLeft: 'auto' }}>Done</button>
        </div>
      )}

      <div style={{ overflowX: 'auto', padding: '6px 0 16px' }}>
        {roots.length === 0 ? (
          <div style={{ color: '#aaa', textAlign: 'center', padding: 24, fontSize: 13 }}>
            {editable ? 'Nobody is on the chart yet. Drag someone up from below, or click them and choose who they report to.' : 'Nobody is on the chart yet.'}
          </div>
        ) : (
          <div ref={chartRef} style={{ position: 'relative', display: 'inline-block', minWidth: '100%' }}>
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 0 }}>
              {lines.map(l => <path key={l.key} d={l.d} fill="none" stroke="#8b8b85" strokeWidth="1.5" strokeDasharray="5 4" />)}
            </svg>
            <div className="oc"><ul className="oc-roots">{roots.map(branch)}</ul></div>
          </div>
        )}
      </div>

      {(editable || unplaced.length > 0) && (
        <div
          onDragOver={editable ? (e => { if (dragKey && placements[dragKey]) e.preventDefault() }) : undefined}
          onDrop={editable ? (e => { e.preventDefault(); const k = dragKey; setDragKey(null); setHover(null); if (k && placements[k]) move(k, null, 'remove') }) : undefined}
          style={{ marginTop: 18, border: '1px dashed #d6d3cc', borderRadius: 10, padding: 12, background: dragKey && placements[dragKey] ? '#fffbeb' : '#fcfcfb' }}>
          <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: '#999', marginBottom: 8 }}>{trayTitle} ({unplaced.length})</div>
          {unplaced.length === 0
            ? <div style={{ fontSize: 12, color: '#bbb' }}>Everyone is placed. Drag a card here to take it off the chart.</div>
            : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{unplaced.map(n => <div key={n.key}>{card(n)}</div>)}</div>}
        </div>
      )}
    </div>
  )
}

const smallBtn = { fontSize: 12, padding: '5px 10px', border: '1px solid #d0d0cc', borderRadius: 6, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }

// Connector lines between a person and the people under them. Plain CSS -
// lines need pseudo-elements, which inline styles cannot express.
const LINE = '1.5px solid #cfccc4'
const TREE_CSS = `
.oc ul { position: relative; display: flex; justify-content: center; margin: 0; padding: 18px 0 0; }
.oc li { list-style: none; position: relative; display: flex; flex-direction: column; align-items: center; padding: 18px 6px 0; }
.oc li::before, .oc li::after { content: ''; position: absolute; top: 0; right: 50%; width: 50%; height: 18px; border-top: ${LINE}; }
.oc li::after { right: auto; left: 50%; border-left: ${LINE}; }
.oc li:only-child::before, .oc li:only-child::after { display: none; }
.oc li:only-child { padding-top: 0; }
.oc li:first-child::before, .oc li:last-child::after { border: 0 none; }
.oc li:last-child::before { border-right: ${LINE}; border-radius: 0 6px 0 0; }
.oc li:first-child::after { border-radius: 6px 0 0 0; }
.oc ul ul::before { content: ''; position: absolute; top: 0; left: 50%; height: 18px; border-left: ${LINE}; }
.oc ul.oc-roots { padding-top: 0; gap: 28px; }
.oc ul.oc-roots > li { padding-top: 0; }
.oc ul.oc-roots > li::before, .oc ul.oc-roots > li::after { display: none; }
`
