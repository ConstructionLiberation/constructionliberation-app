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
// priorityField (1049): adds a flag button at the start of each row. Flagged
// rows read 'high', show a red flag and a red bar down the left edge, sort to
// the top (otherwise keeping their order), and can be shown on their own.
export default function MgmtRowsTable({ doc, columns, people = [], doneField, doneValues = [], newRowDefaults = {}, rowColour, onRowsChange, priorityField, sortByPerson = false }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [highOnly, setHighOnly] = useState(false)
  // SORT BY PERSON (1050): 'added' (the order rows were added) or 'person'
  // (grouped A-Z by the portal-user column). For this visit only.
  const [sortBy, setSortBy] = useState('added')
  // FILTER BY USER (1029). Offered whenever the table has a portal-user
  // column - the three goal trackers and Meeting Actions. Matches on the user
  // id where the row has one, and on the name for rows from before 1027 or for
  // someone who has left. Rows set to "All" count as everyone's, so they stay
  // in when one person is picked.
  const [userFilter, setUserFilter] = useState('')
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
  const userCol = columns.find(c => c.type === 'user')
  const rowUserKey = (r) => {
    if (!userCol) return ''
    const id = r[`${userCol.key}Id`], name = r[userCol.key] || ''
    if (id) return `id:${id}`
    if (name === 'All') return 'all'
    return name ? `name:${name.trim().toLowerCase()}` : ''
  }
  const matchesUser = (r) => {
    if (!userFilter) return true
    const k = rowUserKey(r)
    if (userFilter === '__none') return !k
    return k === userFilter || k === 'all'
  }
  // Everyone who can be picked: current users, then anyone named on a row who
  // is not one (leavers, typed names), so their rows can still be found.
  const filterOptions = !userCol ? [] : (() => {
    const opts = people.map(p => ({ value: `id:${p.id}`, label: p.name }))
    const seen = new Set(opts.map(o => o.value))
    for (const r of rows) {
      const k = rowUserKey(r)
      if (k && k !== 'all' && !seen.has(k)) { seen.add(k); opts.push({ value: k, label: `${r[userCol.key] || 'Unknown'} (not a current user)` }) }
    }
    return opts
  })()

  const filtered = rows.filter(matchesUser)
  const doneCount = filtered.filter(isDone).length
  const isHigh = (r) => !!priorityField && r[priorityField] === 'high'
  const shown = (showDone ? filtered : filtered.filter(r => !isDone(r))).filter(r => !highOnly || isHigh(r))
  // High priority first; otherwise the order they were added in (a stable sort).
  // By person: "All" first, then names A-Z, unassigned last - and within each
  // person, high priority first, then the order added. Otherwise high
  // priority first, then the order added.
  const personRank = (r) => {
    const n = userCol ? String(r[userCol.key] || '').trim() : ''
    return n === 'All' ? '0' : (n ? `1${n.toLowerCase()}` : '2')
  }
  const visible = shown.map((r, i) => ({ r, i })).sort((a, b) =>
    (sortBy === 'person' ? personRank(a.r).localeCompare(personRank(b.r)) : 0)
    || (isHigh(b.r) - isHigh(a.r))
    || a.i - b.i).map(x => x.r)
  const highCount = priorityField ? filtered.filter(isHigh).length : 0

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
        {userCol && (
          <select value={userFilter} onChange={e => setUserFilter(e.target.value)}
            style={{ fontSize: 13, padding: '6px 8px', border: '1px solid #d0d0cc', borderRadius: 7, fontFamily: 'inherit', background: userFilter ? '#fffbeb' : '#fff' }}>
            <option value="">All users</option>
            {filterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            <option value="__none">Nobody assigned</option>
          </select>
        )}
        {doneField && (
          <label style={{ fontSize: 13, color: '#666', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
            Show completed ({doneCount})
          </label>
        )}
        {sortByPerson && userCol && (
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} title="Sort"
            style={{ fontSize: 13, padding: '6px 8px', border: '1px solid #d0d0cc', borderRadius: 7, fontFamily: 'inherit', background: sortBy !== 'added' ? '#fffbeb' : '#fff' }}>
            <option value="added">Sort: as added</option>
            <option value="person">Sort: by person</option>
          </select>
        )}
        {priorityField && (
          <label style={{ fontSize: 13, color: '#666', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={highOnly} onChange={e => setHighOnly(e.target.checked)} />
            High priority only ({highCount})
          </label>
        )}
        <span style={{ fontSize: 12, color: '#aaa' }}>Changes save when you leave a box.</span>
      </div>
      <div style={{ overflowX: 'auto', border: '0.5px solid #e1e0d9', borderRadius: 8, background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              {priorityField && <th style={{ ...th, width: 118 }}>Priority</th>}
              {columns.map(c => <th key={c.key} style={{ ...th, minWidth: c.width || 120 }}>{c.label}</th>)}
              <th style={{ ...th, width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={columns.length + (priorityField ? 2 : 1)} style={{ padding: 28, textAlign: 'center', color: '#aaa' }}>
                {!rows.length ? 'Nothing yet. Add the first row.'
                  : !filtered.length ? 'Nothing for this user. Choose "All users" to see everything.'
                  : highOnly && !visible.length ? 'No high-priority goals here. Untick "High priority only" to see everything.'
                  : 'Everything here is completed. Tick "Show completed" to see it.'}
              </td></tr>
            )}
            {visible.map(r => (
              <tr key={r.id} style={{ borderTop: '0.5px solid #f0efec', background: rowColour ? rowColour(r) : undefined,
                boxShadow: isHigh(r) ? 'inset 4px 0 0 #dc2626' : undefined }}>
                {priorityField && (
                  <td style={{ ...td, textAlign: 'center', verticalAlign: 'middle' }}>
                    {/* A HIGH PRIORITY badge (1052, was a flag): solid red when set,
                        a faint outline of the same badge when not. Click to switch. */}
                    <button onClick={() => saveFields(r.id, { [priorityField]: isHigh(r) ? '' : 'high' })}
                      title={isHigh(r) ? 'High priority - click to clear' : 'Click to mark as high priority'}
                      aria-pressed={isHigh(r)}
                      style={{
                        cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
                        fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, lineHeight: 1,
                        padding: '5px 8px', borderRadius: 999,
                        border: `1px solid ${isHigh(r) ? '#dc2626' : '#dcdcd6'}`,
                        background: isHigh(r) ? '#dc2626' : 'transparent',
                        color: isHigh(r) ? '#fff' : '#c4c4bf',
                      }}>HIGH PRIORITY</button>
                  </td>
                )}
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
