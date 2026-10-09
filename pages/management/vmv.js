import { useEffect, useState } from 'react'
import ManagementShell, { Heading, ErrorBar, mgmtApi } from '../../components/ManagementShell'
import { btnDark } from '../../components/MgmtRowsTable'

// Vision, Mission and Values: three free-text boxes, saved together.
const BOXES = [
  { key: 'vision', label: 'Vision', hint: 'Where the business is going.' },
  { key: 'mission', label: 'Mission', hint: 'What the business does to get there.' },
  { key: 'values', label: 'Values', hint: 'One per line.' },
]

export default function VMV() {
  const [data, setData] = useState(null)
  const [base, setBase] = useState(null)
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  async function load() {
    try { const d = await mgmtApi('/api/management/vmv'); setData(d.data); setSaved(d.data); setBase(d.updatedAt) }
    catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  const dirty = data && saved && BOXES.some(b => (data[b.key] || '') !== (saved[b.key] || ''))

  async function save() {
    setStatus('Saving…'); setError('')
    try {
      const d = await mgmtApi('/api/management/vmv', { data, baseUpdatedAt: base })
      setSaved(d.data); setData(d.data); setBase(d.updatedAt); setStatus('Saved')
    } catch (e) { setError(e.message); setStatus('') }
  }

  return (
    <ManagementShell active="vmv" title="Vision, Mission & Values">
      <Heading title="Vision, Mission & Values"
        action={data && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#999' }}>{dirty ? 'Unsaved changes' : status}</span>
          <button onClick={save} disabled={!dirty} style={{ ...btnDark, opacity: dirty ? 1 : 0.4 }}>Save</button>
        </div>} />
      <ErrorBar error={error} onClose={() => setError('')} />
      {!data ? <div style={{ color: '#aaa', padding: 30, textAlign: 'center' }}>Loading…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {BOXES.map(b => (
            <div key={b.key} style={{ background: '#fff', border: '1px solid #e1e0d9', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: '#1a1a19' }}>{b.label}</div>
              <div style={{ fontSize: 12, color: '#aaa', margin: '2px 0 10px' }}>{b.hint}</div>
              <textarea value={data[b.key] || ''} onChange={e => { setData({ ...data, [b.key]: e.target.value }); setStatus('') }}
                rows={b.key === 'values' ? 7 : 3}
                style={{ width: '100%', boxSizing: 'border-box', fontSize: 15, lineHeight: 1.5, padding: 10, border: '1px solid #e1e0d9', borderRadius: 8, fontFamily: 'inherit', resize: 'vertical' }} />
            </div>
          ))}
        </div>
      )}
    </ManagementShell>
  )
}
