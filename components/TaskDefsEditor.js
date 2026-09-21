import { useState } from 'react'

// EDIT THE CHECKLIST.
//
// Add, reword, reorder, remove. Opens over the grid rather than navigating
// away, because the point of editing a checklist is usually that you are
// looking at it and something on it is wrong.
//
// DELETING DOES NOT DESTROY HISTORY. Ticks live against the task id in a
// separate key, so a removed task disappears from the grid and its record
// stays. Re-adding the same id brings the history back. That is why the id is
// shown and why an existing task's id is not editable - changing it would
// orphan every tick ever made against it.
//
// Nothing saves until Save is pressed. Cancel throws the working copy away.

const btn = (bg, fg = '#fff') => ({
  padding: '7px 14px', borderRadius: 8, border: 'none', background: bg, color: fg,
  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
})

export default function TaskDefsEditor({ scope, cadence, tasks, onClose, onSaved }) {
  const [rows, setRows] = useState(() => tasks.map(t => ({ ...t, isNew: false })))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    const tmp = next[i]; next[i] = next[j]; next[j] = tmp
    setRows(next)
  }

  const add = () => {
    // Prefix by cadence so a weekly and a monthly task can never collide, and
    // timestamp so a re-added task gets a fresh id rather than silently
    // inheriting a deleted one's history.
    const prefix = (scope === 'bookkeeping' ? 'b' : '') + (cadence === 'weekly' ? 'w' : 'm')
    setRows([...rows, { id: `${prefix}${Date.now().toString(36)}`, text: '', isNew: true }])
  }

  const save = async () => {
    setErr('')
    const cleaned = rows.map(r => ({ id: r.id, text: String(r.text || '').trim() })).filter(r => r.text)
    if (!cleaned.length) { setErr('Keep at least one task, or the page has nothing to show.'); return }
    setBusy(true)
    try {
      const d = await fetch('/api/task-definitions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, cadence, tasks: cleaned }),
      }).then(r => r.json())
      if (!d.ok) { setErr(d.error || 'Could not save'); setBusy(false); return }
      onSaved(cadence === 'weekly' ? d.weekly : d.monthly)
      onClose()
    } catch {
      setErr('Could not save')
      setBusy(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      {/* Deliberately NOT closing on a backdrop click - half an hour of
          reworded tasks should not vanish because of a stray click. The x and
          Escape close it. */}
      <div style={{ background: '#fff', borderRadius: 14, width: 780, maxWidth: '100%', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>
            Edit {cadence} {scope} tasks
          </h2>
          <button onClick={onClose} style={{ ...btn('#f0f0f0', '#444'), padding: '4px 10px', fontSize: 16 }}>x</button>
        </div>
        <div style={{ fontSize: 12, color: '#777', marginBottom: 16 }}>
          Removing a task hides it from the grid. Ticks already recorded against it are kept.
        </div>

        {rows.map((row, i) => (
          <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2 }}>
              <button onClick={() => move(i, -1)} disabled={i === 0}
                style={{ ...btn('#f0f0f0', '#555'), padding: '1px 7px', fontSize: 11, opacity: i === 0 ? 0.35 : 1 }}>^</button>
              <button onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                style={{ ...btn('#f0f0f0', '#555'), padding: '1px 7px', fontSize: 11, opacity: i === rows.length - 1 ? 0.35 : 1 }}>v</button>
            </div>
            <textarea
              value={row.text}
              onChange={(e) => { const n = [...rows]; n[i] = { ...n[i], text: e.target.value }; setRows(n) }}
              placeholder="What should be confirmed?"
              rows={2}
              style={{ flex: 1, padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <button onClick={() => setRows(rows.filter((_, j) => j !== i))}
              style={{ ...btn('#fee2e2', '#b91c1c'), padding: '6px 10px', fontSize: 12 }}>Remove</button>
          </div>
        ))}

        <button onClick={add} style={{ ...btn('#eef2ff', '#4338ca'), marginTop: 6 }}>+ Add task</button>

        {err && <div style={{ marginTop: 14, padding: '8px 12px', background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>{err}</div>}

        <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btn('#f0f0f0', '#444')}>Cancel</button>
          <button onClick={save} disabled={busy} style={btn(busy ? '#9ca3af' : '#16a34a')}>
            {busy ? 'Saving...' : 'Save tasks'}
          </button>
        </div>
      </div>
    </div>
  )
}
