import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import EstimatingShell, { Heading, ErrorBar, estApi } from '../../components/EstimatingShell'
import { useFormat } from '../../components/TenantProvider'
import { th, td, tdR, inp, btn } from '../../components/LibraryParts'

// VARIATIONS (1194) - priced on the same take-off sheet as estimates, for a live
// project, then sent to that project's Variation Builder (Commercial) ready for
// sending to the customer.
export default function VariationsPage() {
  const router = useRouter()
  const { money } = useFormat()
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  // just sent from a variation's take-off (1195)
  const sent = router.query && router.query.sent ? { v: String(router.query.sent), job: String(router.query.job || ''), total: Number(router.query.total || 0), skipped: String(router.query.skipped || '') } : null
  useEffect(() => { estApi('/api/estimating/estimates').then(d => setList((d.estimates || []).filter(e => e.variation))).catch(e => setErr(e.message)) }, [])
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shown = useMemo(() => (list || []).filter(e => words.every(w => `${e.title} ${e.variation.jobNo} ${e.variation.projectName} ${e.variation.varNumber || ''}`.toLowerCase().includes(w)))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))), [list, q])
  return (
    <EstimatingShell active="variations" title="Variations">
      <Heading title="Variations" sub="Priced on the take-off sheet, then sent to the project's Variation Builder ready for sending." />
      <ErrorBar err={err} />
      {sent && <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#0f766e' }}>
        <strong>Sent as {sent.v}</strong>{sent.job ? ` for ${sent.job}` : ''} - {money(sent.total, { dp: 2 })} - it is in the <a href="/variation-builder" style={{ color: '#0f766e' }}>Variation Builder</a> ready to send to the customer.{sent.skipped ? ` Not sent (no quantity): ${sent.skipped}.` : ''}
      </div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search project, job number or variation…" style={{ ...inp, maxWidth: 380 }} />
        <span style={{ flex: 1 }} />
        <button onClick={() => setAdding(true)} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', fontWeight: 600 }}>+ Add new variation</button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, overflow: 'auto' }}>
        {!list ? <div style={{ padding: 14, color: '#aaa' }}>Loading…</div> : !shown.length ? <div style={{ padding: 14, color: '#aaa', fontSize: 13 }}>{list.length ? 'Nothing matches.' : 'No variations priced yet - "+ Add new variation" to start one.'}</div> : (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead><tr>{['Project', 'Variation', 'Total', 'In the Variation Builder', 'Last saved'].map((h, i) => <th key={h} style={{ ...th, textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>{shown.map(e => (
              <tr key={e.id} onClick={() => router.push(`/estimating/estimate/${e.id}`)} style={{ cursor: 'pointer' }}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}><strong>{e.variation.jobNo}</strong> {e.variation.projectName}</td>
                <td style={{ ...td, fontWeight: 600 }}>{e.title}</td>
                <td style={tdR}>{money(e.total, { dp: 2 })}</td>
                <td style={td}>{e.variation.varNumber
                  ? <span><span style={{ fontWeight: 700, color: '#0f766e' }}>{e.variation.varNumber}</span> <span style={{ color: '#888', fontSize: 12 }}>sent {new Date(e.variation.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></span>
                  : <span style={{ color: '#b45309', fontSize: 12 }}>not sent yet</span>}</td>
                <td style={{ ...td, color: '#888', fontSize: 12, whiteSpace: 'nowrap' }}>{e.updatedAt ? new Date(e.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}{e.updatedBy ? ` · ${e.updatedBy}` : ''}</td>
              </tr>))}</tbody>
          </table>)}
      </div>
      {adding && <NewVariation onClose={() => setAdding(false)} onCreated={(id) => router.push(`/estimating/estimate/${id}`)} />}
    </EstimatingShell>
  )
}

// ADD NEW VARIATION - pick the project (the Variation Builder's project list) and a title
function NewVariation({ onClose, onCreated }) {
  const [projects, setProjects] = useState(null)
  const [q, setQ] = useState('')
  const [pick, setPick] = useState(null)
  const [title, setTitle] = useState('')
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    Promise.all([fetch('/api/dashboard').then(r => r.json()).catch(() => ({})), fetch('/api/hidden-projects').then(r => r.json()).catch(() => ({}))]).then(([d, h]) => {
      const hidden = new Set((h.hidden || []).map(String))
      setProjects((d.projects || []).filter(p => p.xeroId && !hidden.has(String(p.xeroId))).map(p => ({ id: String(p.xeroId), jobNo: p.jobNo || p.ref || '', name: p.name || p.projectName || '' })))
    })
  }, [])
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const found = (projects || []).filter(p => words.every(w => `${p.jobNo} ${p.name}`.toLowerCase().includes(w))).slice(0, 100)
  async function create() {
    setBusy(true); setErr('')
    try { const d = await estApi('/api/estimating/estimates', { action: 'create', variation: { projectId: pick.id, jobNo: pick.jobNo, projectName: pick.name }, title: title.trim() || undefined }); onCreated(d.estimate.id) }
    catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '50px 20px' }} onMouseDown={ev => { if (ev.target === ev.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}><strong style={{ fontSize: 16 }}>New variation</strong><span style={{ flex: 1 }} /><button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button></div>
        {err && <div style={{ color: '#b42318', fontSize: 13, marginBottom: 8 }}>{err}</div>}
        {!pick ? <>
          <div style={{ fontSize: 12.5, color: '#666', marginBottom: 6 }}>Which project is it for?</div>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search job number or project…" style={{ ...inp, marginBottom: 8 }} />
          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #f0efec', borderRadius: 8 }}>
            {!projects ? <div style={{ padding: 12, color: '#aaa', fontSize: 13 }}>Loading projects…</div> : !found.length ? <div style={{ padding: 12, color: '#aaa', fontSize: 13 }}>No project matches.</div>
              : found.map(p => <button key={p.id} onClick={() => setPick(p)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid #f4f3f0', background: '#fff', padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}><strong>{p.jobNo}</strong> {p.name}</button>)}
          </div>
        </> : <>
          <div style={{ fontSize: 13, marginBottom: 10 }}>Project: <strong>{pick.jobNo}</strong> {pick.name} <button onClick={() => setPick(null)} style={{ border: 'none', background: 'none', color: '#0f766e', textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5 }}>change</button></div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#666' }}>What is the variation?
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Additional roof area over plant room" style={inp} onKeyDown={e => { if (e.key === 'Enter') create() }} /></label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button onClick={onClose} style={btn}>Cancel</button>
            <button onClick={create} disabled={busy} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', fontWeight: 600 }}>Open the take-off</button>
          </div>
        </>}
      </div>
    </div>
  )
}
