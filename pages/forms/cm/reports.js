import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Shell, bigBtn } from '../index'
import { INK, BRAND, fmtDate, useMyProjects, ProjectPicker, ProjectHeader, inp } from '../../../lib/cmSiteApp'
import { autofillReport } from '../../../lib/projectReportAutofill'
import { sectionsFor } from '../../../lib/projectReportTemplate'

// CM › Project Reports — project-first, the same shape the SRAT page had.
// Create, edit, delete and submit from a phone; everything written here is the
// same record the portal shows, in the same store (ops:project-reports), so a
// report started on site can be finished at a desk and the other way round.
//
// The pulling of variations, issues and photos is lib/projectReportAutofill.js,
// shared with the portal. The template sections come from the same API. Two
// implementations of either would have drifted apart within a month.

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CmReports() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [proj, setProj] = useState(null)
  const [reports, setReports] = useState([])
  const [allReports, setAllReports] = useState([])
  const [template, setTemplate] = useState({ sections: [] })
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    const s = sessionStorage.getItem('ops_operative')
    if (!s) { router.replace('/forms'); return }
    try { setUser(JSON.parse(s)) } catch {}
    setReady(true)
  }, [])

  useEffect(() => {
    fetch('/api/project-report-template').then(r => r.json())
      .then(d => setTemplate(d.template || { sections: [] })).catch(() => {})
  }, [])

  const { myProjects, loading: projLoading } = useMyProjects(user)

  async function pick(p) {
    setProj(p); setLoading(true); setReports([]); setEditing(null)
    await load(p)
    setLoading(false)
  }

  async function load(p) {
    try {
      const d = await fetch('/api/project-reports').then(r => r.json())
      const all = d.reports || []
      setAllReports(all)
      // Newest first. Unlike the SRAT page this does NOT cut off at four
      // weeks - a project report is a monthly document and hiding last
      // month's would hide the one you most want to copy from.
      setReports(all
        .filter(r => r.projectNo === p.projectNo)
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)))
    } catch {}
  }

  async function del(r) {
    if (!confirm(`Delete report ${r.reportId || ''}? This cannot be undone.`)) return
    try {
      const res = await fetch('/api/project-reports', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id }),
      })
      if (!res.ok) {
        let msg = ''
        try { msg = (await res.json()).error || '' } catch {}
        alert(msg || `Could not delete (${res.status}). Nothing has been changed.`)
        return
      }
      setLoading(true); await load(proj); setLoading(false)
    } catch (e) { alert(e.message || 'Could not delete.') }
  }

  if (!ready) return <Shell user={user}><Loading /></Shell>

  return (
    <Shell user={user} onLogout={() => { sessionStorage.removeItem('ops_operative'); router.push('/forms') }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <button onClick={() => router.push('/forms')} style={backLink}>&lsaquo; Home</button>
        <h2 style={{ fontSize: 18, color: INK, margin: '8px 0 10px' }}>Project Reports</h2>

        {!proj ? (
          projLoading ? <Loading /> : <ProjectPicker projects={myProjects} onPick={pick} subtitle="Select one of your projects." />
        ) : editing ? (
          <ReportForm
            project={proj}
            report={editing.id ? editing : null}
            template={template}
            allReports={allReports}
            meName={user?.name || ''}
            onCancel={() => setEditing(null)}
            onSaved={async () => { setEditing(null); setLoading(true); await load(proj); setLoading(false) }}
          />
        ) : (
          <>
            <ProjectHeader project={proj} onBack={() => setProj(null)} />
            <button onClick={() => setEditing({})} style={{ ...bigBtn(false), marginBottom: 16 }}>+ New project report</button>
            {loading ? <Loading /> : !reports.length ? <Empty>No project reports for this project yet.</Empty> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {reports.map(r => (
                  <div key={r.id} style={{ background: '#fff', border: '1px solid #e3e0d9', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 12, color: '#999' }}>
                        {r.reportId ? `${r.reportId} \u00b7 ` : ''}{fmtDate(r.date ? new Date(r.date).getTime() : r.createdAt)}
                      </div>
                      <StatusPill status={r.status} />
                    </div>
                    <Field label="Works completed" value={r.worksCompleted} />
                    {(r.photos || []).length + (r.manualPhotos || []).length > 0 && (
                      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                        {(r.photos || []).length + (r.manualPhotos || []).length} photo(s)
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, marginTop: 10, borderTop: '1px solid #f2f2f2', paddingTop: 10 }}>
                      <button onClick={() => setEditing(r)} style={linkish}>Edit</button>
                      <button onClick={() => del(r)} style={{ ...linkish, color: '#b91c1c' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  )
}

function ReportForm({ project, report, template, allReports, meName, onCancel, onSaved }) {
  const [f, setF] = useState(() => report || {
    date: todayISO(),
    projectNo: project.projectNo,
    projectName: project.projectName || '',
    // Left blank: autofillReport resolves both from the dashboard and sets
    // them when it runs, so they cannot disagree with the portal's version.
    projectAddress: '',
    customerName: '',
    completedBy: meName || '',
    siteComms: '', worksCompleted: '',
    variationsSnapshot: [], issuesSnapshot: [], photos: [],
    extra: {}, manualPhotos: [], sections: null,
    approvalName: meName || '', approvalDate: '',
    status: 'draft',
  })
  const [pulling, setPulling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (patch) => setF(prev => ({ ...prev, ...patch }))

  const secs = sectionsFor(f, template)

  // A NEW report pulls on open. An existing one does not - it already holds
  // the snapshot it was written with, and re-pulling would silently replace
  // what somebody saw when they wrote it.
  useEffect(() => {
    if (report) return
    let cancelled = false
    setPulling(true)
    autofillReport({
      projectNo: project.projectNo,
      projectName: project.projectName || '',
      allReports,
      excludeId: null,
    }).then(pulled => { if (!cancelled) set(pulled) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPulling(false) })
    return () => { cancelled = true }
  }, [])

  async function save(asComplete) {
    setErr('')
    if (asComplete) {
      if (!String(f.siteComms || '').trim()) return setErr('Site communications is required.')
      if (!String(f.worksCompleted || '').trim()) return setErr('Works completed is required.')
      if (!String(f.approvalName || '').trim()) return setErr('Approval name is required.')
      for (const sec of secs) {
        if (!sec.required) continue
        const v = (f.extra || {})[sec.key]
        const empty = sec.type === 'photos' ? !(Array.isArray(v) && v.length) : !String(v || '').trim()
        if (empty) return setErr(`${sec.label} is required.`)
      }
    }
    setSaving(true)
    try {
      const body = {
        ...f,
        status: asComplete ? 'complete' : 'draft',
        approvalDate: f.approvalDate || todayISO(),
        // Frozen on first save, same as the portal - a later template change
        // must not rewrite a report already issued.
        sections: Array.isArray(f.sections) ? f.sections : secs,
      }
      const r = await fetch('/api/project-reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: body }),
      })
      // Checked, not assumed.
      if (!r.ok) {
        let msg = ''
        try { msg = (await r.json()).error || '' } catch {}
        setErr(msg || `Could not save (${r.status}). Nothing has been changed.`)
        setSaving(false); return
      }
      const d = await r.json()
      if (!d.report) { setErr('Save did not return a report.'); setSaving(false); return }
      onSaved()
    } catch (e) { setErr(e.message || 'Could not save.') }
    setSaving(false)
  }

  const autoCount = (f.photos || []).length

  return (
    <div>
      <button onClick={onCancel} style={backLink}>&lsaquo; Back</button>
      <h3 style={{ fontSize: 16, color: INK, margin: '10px 0 4px' }}>
        {report ? `Edit ${report.reportId || 'report'}` : 'New project report'}
      </h3>
      <div style={{ fontSize: 12.5, color: '#888', marginBottom: 14 }}>
        {project.projectNo} &middot; {project.projectName}
      </div>

      {pulling && <div style={{ fontSize: 12.5, color: '#ca8a04', marginBottom: 12 }}>Pulling variations, issues &amp; photos\u2026</div>}

      <Lbl>Date</Lbl>
      <input type="date" value={f.date || ''} onChange={e => set({ date: e.target.value })} style={inp} />

      <Lbl>Site communications</Lbl>
      <textarea value={f.siteComms || ''} onChange={e => set({ siteComms: e.target.value })}
        style={{ ...inp, minHeight: 110 }}
        placeholder="Discussions and occurrences relating to Variations, H&S, Quality, Design, Delay and Disruption." />

      <Lbl>Works completed</Lbl>
      <textarea value={f.worksCompleted || ''} onChange={e => set({ worksCompleted: e.target.value })}
        style={{ ...inp, minHeight: 110 }}
        placeholder="What has been done since the last report." />

      {secs.map(sec => (
        <div key={sec.key}>
          <Lbl>{sec.label}{sec.required ? ' *' : ''}</Lbl>
          {sec.type === 'photos' ? (
            <PhotoAdder photos={(f.extra || {})[sec.key] || []}
              onChange={list => set({ extra: { ...(f.extra || {}), [sec.key]: list } })} />
          ) : (
            <textarea
              value={(f.extra || {})[sec.key] || ''}
              onChange={e => set({ extra: { ...(f.extra || {}), [sec.key]: e.target.value } })}
              style={{ ...inp, minHeight: sec.type === 'list' ? 110 : 90 }}
              placeholder={sec.type === 'list' ? 'One per line.' : ''} />
          )}
        </div>
      ))}

      <Lbl>Photos</Lbl>
      <div style={{ fontSize: 12.5, color: '#888', marginBottom: 8 }}>
        {autoCount ? `${autoCount} collected automatically since the last report.` : 'None collected automatically.'}
      </div>
      <PhotoAdder photos={f.manualPhotos || []} onChange={list => set({ manualPhotos: list })} />

      <Lbl>Your name</Lbl>
      <input value={f.approvalName || ''} onChange={e => set({ approvalName: e.target.value })} style={inp} />

      {err && <div style={{ fontSize: 13, color: '#b91c1c', margin: '10px 0' }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
        <button onClick={() => save(true)} disabled={saving} style={bigBtn(false)}>
          {saving ? 'Saving\u2026' : 'Submit report'}
        </button>
        <button onClick={() => save(false)} disabled={saving} style={{ ...bigBtn(true), background: '#fff' }}>
          Save as draft
        </button>
        <button onClick={onCancel} style={{ ...linkish, alignSelf: 'center', padding: 8 }}>Cancel</button>
      </div>
    </div>
  )
}

// Same job as the portal's picker, written for a phone: one button, the
// camera available, thumbnails with a remove cross.
function PhotoAdder({ photos, onChange }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function add(files) {
    setErr(''); setBusy(true)
    const out = [...(photos || [])]
    for (const file of Array.from(files || [])) {
      try {
        const dataUrl = await new Promise((res, rej) => {
          const fr = new FileReader()
          fr.onload = () => res(fr.result)
          fr.onerror = () => rej(new Error('Could not read the file'))
          fr.readAsDataURL(file)
        })
        const r = await fetch('/api/upload-photo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, dataUrl }),
        })
        if (!r.ok) {
          let msg = ''
          try { msg = (await r.json()).error || '' } catch {}
          setErr(msg || `Could not upload ${file.name} (${r.status}).`)
          continue
        }
        const d = await r.json()
        if (d.url) out.push(d.url)
        else setErr(`Upload of ${file.name} returned no address.`)
      } catch (e) { setErr(e.message || `Could not add ${file.name}.`) }
    }
    onChange(out); setBusy(false)
  }

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {(photos || []).map((p, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <img src={p} alt="" style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: 10, border: '1px solid #e3e0d9' }} />
            <button onClick={() => onChange((photos || []).filter((_, j) => j !== i))}
              style={{ position: 'absolute', top: -7, right: -7, width: 24, height: 24, borderRadius: 12, border: '1px solid #e3e0d9', background: '#fff', fontSize: 14, lineHeight: '22px', padding: 0 }}>&times;</button>
          </div>
        ))}
      </div>
      <label style={{ display: 'inline-block', padding: '10px 16px', borderRadius: 10, border: `1px solid ${BRAND}`, color: BRAND, fontWeight: 600, fontSize: 14, background: '#fff', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Uploading\u2026' : '+ Add photos'}
        <input type="file" accept="image/*" multiple capture="environment" disabled={busy}
          onChange={e => { add(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
      </label>
      {err && <div style={{ fontSize: 12.5, color: '#b91c1c', marginTop: 6 }}>{err}</div>}
    </div>
  )
}

function StatusPill({ status }) {
  const complete = status === 'complete'
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
      padding: '3px 9px', borderRadius: 20,
      background: complete ? '#eaf7ee' : '#fdf6e3',
      color: complete ? '#16a34a' : '#b45309',
    }}>{complete ? 'Submitted' : 'Draft'}</span>
  )
}

function Field({ label, value }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 11, color: '#999' }}>{label}</div>
      <div style={{ fontSize: 14, color: INK, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  )
}

function Lbl({ children }) {
  return <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, margin: '14px 0 5px' }}>{children}</div>
}

function Loading() { return <div style={{ padding: 30, textAlign: 'center', color: '#999', fontSize: 14 }}>Loading\u2026</div> }
function Empty({ children }) { return <div style={{ padding: 24, textAlign: 'center', color: '#999', fontSize: 14, background: '#fff', border: '1px solid #e3e0d9', borderRadius: 12 }}>{children}</div> }

const backLink = { background: 'transparent', border: 'none', color: BRAND, fontSize: 14, fontWeight: 600, padding: 0, cursor: 'pointer' }
const linkish = { background: 'transparent', border: 'none', color: BRAND, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }
