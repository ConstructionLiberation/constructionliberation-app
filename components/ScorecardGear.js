import { useState } from 'react'
import { applyLayout } from '../lib/scorecardLayout'

// THE GEAR ICON (1042) - hide and reorder a scorecard's metrics. One component
// on every scorecard, so they all behave the same.
//
// scorecard: id from lib/scorecardLayout SCORECARD_IDS
// defs:      every metric the page has, [{ key, label }], in the code's order
// layout:    the saved { order, hidden } for this scorecard (may be undefined)
// canEdit:   management or admin. Anyone else sees no gear at all.
// onSaved:   (layout) => void - the page swaps in the new layout
//
// Each change saves at once. A refused save shows the server's message and
// puts the list back as it was.
export default function ScorecardGear({ scorecard, defs, layout, canEdit, onSaved, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!canEdit) return null

  const { all } = applyLayout(defs, layout)
  const hidden = new Set((layout && layout.hidden) || [])

  async function save(order, hiddenList) {
    setBusy(true); setErr('')
    const next = { order, hidden: hiddenList }
    try {
      const r = await fetch('/api/targets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: { scorecard, ...next } }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Save failed (${r.status})`)
      onSaved(d.layouts?.[scorecard] || next)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const keys = all.map(d => d.key)
  const move = (i, by) => {
    const j = i + by
    if (j < 0 || j >= keys.length) return
    const k = [...keys];[k[i], k[j]] = [k[j], k[i]]
    save(k, [...hidden])
  }
  const toggle = (key) => save(keys, hidden.has(key) ? [...hidden].filter(x => x !== key) : [...hidden, key])
  const reset = () => save([], [])

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(v => !v)} title="Show, hide and reorder metrics" aria-label="Scorecard settings"
        style={{ background: open ? '#1a1a19' : '#fff', color: open ? '#fff' : '#555', border: '1px solid #d0d0cc', borderRadius: 7, width: 34, height: 32, fontSize: 17, cursor: 'pointer', lineHeight: 1 }}>⚙</button>
      {open && (
        <div style={{ position: 'absolute', [align]: 0, top: 'calc(100% + 6px)', zIndex: 40, background: '#fff', border: '1px solid #e1e0d9', borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.12)', padding: 12, width: 340, maxHeight: 480, overflowY: 'auto' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Metrics on this scorecard</div>
          <div style={{ fontSize: 11.5, color: '#888', marginBottom: 10 }}>Untick to hide. Arrows move a metric up or down. Applies for everyone.</div>
          {err && <div style={{ fontSize: 12, color: '#b42318', background: '#fdecec', borderRadius: 6, padding: '6px 8px', marginBottom: 8 }}>Not saved: {err}</div>}
          {all.map((d, i) => (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', borderBottom: '0.5px solid #f0efec', opacity: hidden.has(d.key) ? 0.55 : 1 }}>
              <input type="checkbox" checked={!hidden.has(d.key)} disabled={busy} onChange={() => toggle(d.key)} style={{ cursor: 'pointer' }} />
              <span style={{ flex: 1, fontSize: 13, color: '#1a1a19', lineHeight: 1.25 }}>{d.label}</span>
              <button disabled={busy || i === 0} onClick={() => move(i, -1)} title="Move up" style={arrow}>▲</button>
              <button disabled={busy || i === all.length - 1} onClick={() => move(i, 1)} title="Move down" style={arrow}>▼</button>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
            <button onClick={reset} disabled={busy} style={{ ...arrow, width: 'auto', padding: '4px 10px', fontSize: 12 }}>Reset to default</button>
            <button onClick={() => setOpen(false)} style={{ ...arrow, width: 'auto', padding: '4px 12px', fontSize: 12, background: '#1a1a19', color: '#fff', border: 'none' }}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
const arrow = { width: 26, height: 24, fontSize: 10, border: '1px solid #d0d0cc', borderRadius: 5, background: '#fff', color: '#555', cursor: 'pointer', fontFamily: 'inherit' }
