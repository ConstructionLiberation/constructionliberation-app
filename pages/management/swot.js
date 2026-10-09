import { useEffect, useState } from 'react'
import ManagementShell, { Heading, ErrorBar, mgmtApi } from '../../components/ManagementShell'
import { btnDark } from '../../components/MgmtRowsTable'
import AutoTextarea from '../../components/AutoTextarea'

// SWOT: four lists in the usual 2 x 2. Add, edit and remove points, then Save.
const QUADS = [
  { key: 'strengths', label: 'Strengths', colour: '#16a34a', bg: '#f0fdf4' },
  { key: 'weaknesses', label: 'Weaknesses', colour: '#dc2626', bg: '#fef2f2' },
  { key: 'opportunities', label: 'Opportunities', colour: '#2563eb', bg: '#eff6ff' },
  { key: 'threats', label: 'Threats', colour: '#d97706', bg: '#fffbeb' },
]

export default function SWOT() {
  const [data, setData] = useState(null)
  const [saved, setSaved] = useState(null)
  const [base, setBase] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  async function load() {
    try { const d = await mgmtApi('/api/management/swot'); setData(d.data); setSaved(d.data); setBase(d.updatedAt) }
    catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  const dirty = data && saved && JSON.stringify(data) !== JSON.stringify(saved)
  const setList = (k, list) => { setData({ ...data, [k]: list }); setStatus('') }

  async function save() {
    setStatus('Saving…'); setError('')
    // Blank points are dropped on the server; drop them here too so the
    // screen matches what was stored.
    const clean = Object.fromEntries(QUADS.map(q => [q.key, (data[q.key] || []).map(s => s.trim()).filter(Boolean)]))
    try {
      const d = await mgmtApi('/api/management/swot', { data: clean, baseUpdatedAt: base })
      setData(d.data); setSaved(d.data); setBase(d.updatedAt); setStatus('Saved')
    } catch (e) { setError(e.message); setStatus('') }
  }

  return (
    <ManagementShell active="swot" title="SWOT Analysis">
      <Heading title="SWOT Analysis"
        action={data && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#999' }}>{dirty ? 'Unsaved changes' : status}</span>
          <button onClick={save} disabled={!dirty} style={{ ...btnDark, opacity: dirty ? 1 : 0.4 }}>Save</button>
        </div>} />
      <ErrorBar error={error} onClose={() => setError('')} />
      {!data ? <div style={{ color: '#aaa', padding: 30, textAlign: 'center' }}>Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
          {QUADS.map(q => {
            const list = data[q.key] || []
            return (
              <div key={q.key} style={{ background: q.bg, border: `1px solid ${q.colour}33`, borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: q.colour, marginBottom: 10 }}>{q.label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {list.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <AutoTextarea value={item}
                        onChange={e => setList(q.key, list.map((x, j) => j === i ? e.target.value : x))}
                        style={{ flex: 1, fontSize: 14, lineHeight: 1.4, padding: '6px 8px', border: '1px solid #e1e0d9', borderRadius: 6, fontFamily: 'inherit', background: '#fff' }} />
                      <button onClick={() => setList(q.key, list.filter((_, j) => j !== i))} title="Remove"
                        style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16, padding: '4px 2px' }}>×</button>
                    </div>
                  ))}
                  <button onClick={() => setList(q.key, [...list, ''])}
                    style={{ alignSelf: 'flex-start', marginTop: 4, fontSize: 13, background: '#fff', border: `1px dashed ${q.colour}88`, color: q.colour, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    + Add
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </ManagementShell>
  )
}
