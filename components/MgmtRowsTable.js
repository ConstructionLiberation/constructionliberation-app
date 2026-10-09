import { useEffect, useState } from 'react'
import { mgmtApi, ErrorBar } from './ManagementShell'
import AutoTextarea from './AutoTextarea'

// An editable table over one 'rows' document (see lib/mgmtDocs.js). Used by
// the three goal trackers and Meeting Actions, so they behave identically.
//
// columns: [{ key, label, type, options?, width?, wrap? }]
//   type: 'text' | 'textarea' | 'select' | 'person' | 'user' | 'date' | 'year'
//
// 'user' (1027) is a dropdown of ACTIVE PORTAL USERS. It saves two fields:
// <key>Id, the user's id, and <key>, their name at the time - so a row still
// says who it was after that person leaves. allowAll adds an "All" choice.
//
// Each cell saves on its own when you leave it. A refused save shows the
// server's message and the cell keeps what you typed.
//
// doneField / doneValues: rows whose doneField is in doneValues are hidden
// behind "Show completed" - the tracker stays about what is still open.
export default function MgmtRowsTable({ doc, columns, people = [], doneField, doneValues = [], newRowDefaults = {}, rowColour, onRowsChange }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [drafts, setDrafts] = useState({})   // `${id}:${key}` -> unsaved text

  async function load() {
    try { setRows((await mgmtApi(`/api/management/${doc}`)).rows) } catch (e) { setError(e.message); setRows([]) }
  }
  useEffect(() => { load() }, [doc])
  // The org chart draws outsourced services from these rows, so it is told
  // whenever they change rather than holding its own stale copy.
  useEffect(() => { if (rows && onRowsChange) onRowsChange(rows) }, [rows])

  // Several fields in one save - a portal user is an id and a name together.
  async function saveFields(id, fields) {
    try {
      const d = await mgmtApi(`/api/management/${doc}`, { op: 'upsert', row: { id, ...fields } })
      setRows(d.rows); setError('')
    } catch (e) { setError(`Not saved: ${e.message}`) }
  }

  async function save(id, key, value) {
    const row = rows.find(r => r.id === id)
    if (!row || (row[key] || '') === value) { clearDraft(id, key); return }
    try {
      const d = await mgmtApi(`/api/management/${doc}`, { op: 'upsert', row: { id, [key]: value } })
      setRows(d.rows); clearDraft(id, key); setError('')
    } catch (e) { setError(`Not saved: ${e.message}`) }
  }
  const clearDraft = (id, key) => setDrafts(d => { const n = { ...d }; delete n[`${id}:${key}`]; return n })

  async function addRow() {
    try { const d = await mgmtApi(`/api/management/${doc}`, { op: 'upsert', row: { ...newRowDefaults } }); setRows(d.rows); setError('') }
    catch (e) { setError(`Row not added: ${e.message}`) }
  }
  async function removeRow(id) {
    if (!window.confirm('Delete this row? This cannot be undone.')) return
    try { const d = await mgmtApi(`/api/management/${doc}`, { op: 'delete', id }); setRows(d.rows); setError('') }
    catch (e) { setError(`Not deleted: ${e.message}`) }
  }

  if (rows === null) return <div style={{ color: '#aaa', padding: 30, textAlign: 'center' }}>Loading…</div>

  const isDone = (r) => doneField && doneValues.includes(r[doneField])
  const doneCount = rows.filter(isDone).length
  const visible = showDone ? rows : rows.filter(r => !isDone(r))

  const cell = (r, c) => {
    const k = `${r.id}:${c.key}`
    const value = k in drafts ? drafts[k] : (r[c.key] || '')
    const setDraft = (v) => setDrafts(d => ({ ...d, [k]: v }))
    const common = { value, onChange: e => setDraft(e.target.value), onBlur: e => save(r.id, c.key, e.target.value), style: inp }
    if (c.type === 'select') {
      return (
        <select {...common} onChange={e => { setDraft(e.target.value); save(r.id, c.key, e.target.value) }} onBlur={undefined}>
          <option value="">—</option>
          {c.options.map(o => <option key={o} value={o}>{o}</option>)}
          {value && !c.options.includes(value) && <option value={value}>{value}</option>}
        </select>
      )
    }
    if (c.type === 'user') {
      const ALL = '__all'
      const id = r[`${c.key}Id`] || ''
      const name = r[c.key] || ''
      const current = id || (name === 'All' ? ALL : (name ? '__text' : ''))
      const known = people.some(p => p.id === id)
      return (
        <select value={current} style={inp} onChange={e => {
          const v = e.target.value
          if (v === ALL) return saveFields(r.id, { [`${c.key}Id`]: '', [c.key]: 'All' })
          if (v === '') return saveFields(r.id, { [`${c.key}Id`]: '', [c.key]: '' })
          const p = people.find(x => x.id === v)
          if (p) saveFields(r.id, { [`${c.key}Id`]: p.id, [c.key]: p.name })
        }}>
          <option value="">—</option>
          {c.allowAll && <option value={ALL}>All</option>}
          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          {/* Someone who has left keeps their name on the row, marked, until
              it is reassigned. Typed text from before 1027 shows the same way. */}
          {id && !known && <option value={id}>{name || 'Unknown'} (no longer a portal user)</option>}
          {current === '__text' && <option value="__text">{name} (not a portal user)</option>}
        </select>
      )
    }
    if (c.type === 'date') return <input type="date" {...common} onChange={e => { setDraft(e.target.value); save(r.id, c.key, e.target.value) }} onBlur={undefined} />
    if (c.type === 'person') return <input list="mgmt-people" {...common} />
    if (c.type === 'textarea') return <AutoTextarea {...common} style={{ ...inp, lineHeight: 1.4 }} />
    return <input type="text" inputMode={c.type === 'year' ? 'numeric' : undefined} {...common} />
  }

  return (
    <div>
      <ErrorBar error={error} onClose={() => setError('')} />
      <datalist id="mgmt-people">
        <option value="All" />
        {people.map(p => <option key={p.id || p.name} value={p.name} />)}
      </datalist>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <button onClick={addRow} style={btnDark}>+ Add row</button>
        {doneField && (
          <label style={{ fontSize: 13, color: '#666', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
            Show completed ({doneCount})
          </label>
        )}
        <span style={{ fontSize: 12, color: '#aaa' }}>Changes save when you leave a box.</span>
      </div>
      <div style={{ overflowX: 'auto', border: '0.5px solid #e1e0d9', borderRadius: 8, background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              {columns.map(c => <th key={c.key} style={{ ...th, minWidth: c.width || 120 }}>{c.label}</th>)}
              <th style={{ ...th, width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={columns.length + 1} style={{ padding: 28, textAlign: 'center', color: '#aaa' }}>
                {rows.length ? 'Everything here is completed. Tick "Show completed" to see it.' : 'Nothing yet. Add the first row.'}
              </td></tr>
            )}
            {visible.map(r => (
              <tr key={r.id} style={{ borderTop: '0.5px solid #f0efec', background: rowColour ? rowColour(r) : undefined }}>
                {columns.map(c => <td key={c.key} style={td}>{cell(r, c)}</td>)}
                <td style={{ ...td, textAlign: 'center' }}>
                  <button onClick={() => removeRow(r.id)} title="Delete row" style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: 16 }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const th = { textAlign: 'left', padding: '9px 8px', fontWeight: 500, color: '#555', fontSize: 12, background: '#f8f8f7', borderBottom: '1px solid #e1e0d9', whiteSpace: 'nowrap' }
const td = { padding: '4px 6px', verticalAlign: 'top' }
const inp = { width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '6px 7px', border: '1px solid #ecebe6', borderRadius: 5, background: '#fff', fontFamily: 'inherit', color: '#1a1a19' }
export const btnDark = { fontSize: 13, padding: '7px 14px', border: 'none', borderRadius: 7, background: '#1a1a19', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }
