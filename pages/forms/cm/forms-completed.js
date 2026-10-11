import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Shell } from '../index'
import { INK, BRAND, useMyProjects } from '../../../lib/cmSiteApp'
import SubmissionModal from '../../../components/SubmissionModal'

// CM › FORMS COMPLETED (1082) - set up like the portal's Completed page.
//
// Opens straight onto every form submitted on THIS CONTRACTS MANAGER'S projects
// (or every live project, where they have been given all-projects access - the
// same rule as every CM screen, lib/cmSiteApp useMyProjects). No project to pick
// first.
//   Days      Today / Yesterday / Last 7 days / Last 30 days / Custom (From-To),
//             grouped under a heading per day, newest first
//   Filters   project, form type
//   Each form type, project, operative, time submitted, flags; tap to open it
// Dates are LOCAL days: a form submitted at 23:30 belongs to that day, not the
// next (the portal page reads typed dates as midnight UTC, which shifts them an
// hour in UK summer time).

const DAY = 86400000
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime() }
const fromInput = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime() }
const toInput = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['custom', 'Custom']]

// Which of my projects a submission belongs to - matched on project number or
// name, as the forms record either.
function projectOf(s, projects) {
  const pn = String(s.projectName || ''), pid = String(s.projectId || '')
  return projects.find(p =>
    (p.projectNo && (pid === p.projectNo || pn === p.projectNo || pn.includes(p.projectNo))) ||
    (p.projectName && pn === p.projectName)) || null
}

export default function CmFormsCompleted() {
  const router = useRouter()
  const [user, setUser] = useState(null); const [ready, setReady] = useState(false)
  const [subs, setSubs] = useState(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(null)
  const [range, setRange] = useState('7')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [fProject, setFProject] = useState('')
  const [fType, setFType] = useState('')

  useEffect(() => {
    const s = sessionStorage.getItem('ops_operative')
    if (!s) { router.replace('/forms'); return }
    try { setUser(JSON.parse(s)) } catch {}
    setReady(true)
  }, [])
  const { myProjects, loading: projLoading } = useMyProjects(user)

  useEffect(() => {
    if (!ready) return
    fetch('/api/submissions').then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Could not load forms (${r.status})`)
      setSubs((d.submissions || []).filter(s => !s.isIssue))
    }).catch(e => setErr(e.message))
  }, [ready])

  // Every form on my projects, with its project attached.
  const mine = useMemo(() => (subs || []).map(s => ({ s, p: projectOf(s, myProjects) })).filter(x => x.p), [subs, myProjects])
  const types = useMemo(() => [...new Set(mine.map(x => x.s.formTitle).filter(Boolean))].sort(), [mine])

  const [lo, hi] = useMemo(() => {
    const today = startOfDay(Date.now())
    if (range === 'today') return [today, today + DAY]
    if (range === 'yesterday') return [today - DAY, today]
    if (range === '7') return [today - 6 * DAY, today + DAY]
    if (range === '30') return [today - 29 * DAY, today + DAY]
    const a = fromInput(from), b = fromInput(to)
    return [a ?? -Infinity, b != null ? b + DAY : Infinity]
  }, [range, from, to])

  const rows = mine.filter(({ s, p }) => {
    const t = s.submittedAt || 0
    return t >= lo && t < hi && (!fProject || p.projectNo === fProject) && (!fType || s.formTitle === fType)
  }).sort((a, b) => (b.s.submittedAt || 0) - (a.s.submittedAt || 0))

  // Group under one heading per day.
  const groups = []
  for (const r of rows) {
    const day = startOfDay(r.s.submittedAt || 0)
    if (!groups.length || groups[groups.length - 1].day !== day) groups.push({ day, items: [] })
    groups[groups.length - 1].items.push(r)
  }
  const dayLabel = (d) => {
    const today = startOfDay(Date.now())
    if (d === today) return 'Today'
    if (d === today - DAY) return 'Yesterday'
    return new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  }
  const time = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  if (!ready) return <Shell user={user}><Loading /></Shell>
  const sel = { width: '100%', fontSize: 14, padding: '9px 10px', border: '1px solid #ddd8ce', borderRadius: 10, background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box' }
  return (
    <Shell user={user} onLogout={() => { sessionStorage.removeItem('ops_operative'); router.push('/forms') }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <button onClick={() => router.push('/forms')} style={backLink}>‹ Home</button>
        <h2 style={{ fontSize: 18, color: INK, margin: '8px 0 10px' }}>Forms Completed</h2>

        {/* Days */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {RANGES.map(([id, label]) => (
            <button key={id} onClick={() => {
                setRange(id)
                if (id === 'custom' && !from && !to) { setFrom(toInput(Date.now() - 6 * DAY)); setTo(toInput(Date.now())) }
              }}
              style={{ border: `1px solid ${range === id ? INK : '#ddd8ce'}`, background: range === id ? INK : '#fff', color: range === id ? '#fff' : '#555', borderRadius: 20, padding: '7px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
          ))}
        </div>
        {range === 'custom' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <label style={lbl}>From<input type="date" value={from} onChange={e => setFrom(e.target.value)} style={sel} /></label>
            <label style={lbl}>To<input type="date" value={to} onChange={e => setTo(e.target.value)} style={sel} /></label>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <label style={lbl}>Project
            <select value={fProject} onChange={e => setFProject(e.target.value)} style={sel}>
              <option value="">All my projects</option>
              {myProjects.map(p => <option key={p.projectNo} value={p.projectNo}>{p.projectNo}{p.projectName && p.projectName !== p.projectNo ? ` — ${p.projectName}` : ''}</option>)}
            </select>
          </label>
          <label style={lbl}>Form type
            <select value={fType} onChange={e => setFType(e.target.value)} style={sel}>
              <option value="">All forms</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>

        {err ? <Empty>{err}</Empty>
          : (subs == null || projLoading) ? <Loading />
          : !myProjects.length ? <Empty>No live projects have you as Contracts Manager.</Empty>
          : (
            <>
              <div style={{ fontSize: 12.5, color: '#888', margin: '0 2px 8px' }}>{rows.length} form{rows.length === 1 ? '' : 's'}{fProject || fType ? ' (filtered)' : ''}</div>
              {!rows.length ? <Empty>No forms {range === 'today' ? 'submitted today yet' : 'in this period'}{fProject || fType ? ' for these filters' : ''}.</Empty> : groups.map(g => (
                <div key={g.day} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 2px 6px' }}>{dayLabel(g.day)} <span style={{ color: '#aaa', fontWeight: 600 }}>· {g.items.length}</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {g.items.map(({ s, p }) => (
                      <button key={s.id} onClick={() => setOpen(s)} style={{ textAlign: 'left', background: '#fff', border: '1px solid #e3e0d9', borderRadius: 12, padding: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ fontWeight: 700, color: INK, fontSize: 14 }}>{s.formTitle || 'Form'}</div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                            {(s.flags || []).length > 0 && <span style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>{(s.flags || []).length} flag{(s.flags || []).length === 1 ? '' : 's'}</span>}
                            <span style={{ fontSize: 12.5, color: '#888' }}>{time(s.submittedAt)}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 12.5, color: '#555', marginTop: 4 }}>{p.projectNo}{p.projectName && p.projectName !== p.projectNo ? ` — ${p.projectName}` : ''}</div>
                        <div style={{ fontSize: 12.5, color: '#888', marginTop: 2 }}>{s.operative || '—'}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
      </div>
      {open && <SubmissionModal sub={open} onClose={() => setOpen(null)} onSaved={(u) => { setSubs(prev => (prev || []).map(x => x.id === u.id ? { ...x, ...u } : x)); setOpen(null) }} />}
    </Shell>
  )
}

const backLink = { background: 'transparent', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }
const lbl = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#777', fontWeight: 600 }
const Loading = () => <div style={{ textAlign: 'center', color: '#aaa', padding: 30 }}>Loading…</div>
const Empty = ({ children }) => <div style={{ background: '#fff', border: '1px dashed #d9d5cc', borderRadius: 14, padding: 24, textAlign: 'center', color: '#999', fontSize: 14 }}>{children}</div>
