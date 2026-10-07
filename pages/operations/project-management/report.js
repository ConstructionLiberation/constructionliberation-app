import { useState, useEffect, useMemo } from 'react'
import OperationsShell, { PageHeading } from '../../../components/OperationsShell'
import { INK, GOLD, th, td, Loading, EmptyCard, primaryBtn, ghostBtn, linkBtn } from '../../../components/opsUI'
import { sectionsFor, newSectionKey, SECTION_TYPES, BUILT_IN_SECTIONS, CUSTOM_AFTER } from '../../../lib/projectReportTemplate'
import { autofillReport } from '../../../lib/projectReportAutofill'

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const parseLocal = (d) => { if (!d) return null; const [y, m, day] = String(d).split('-').map(Number); return new Date(y, (m || 1) - 1, day || 1) }
const fmtDMY = (d) => { const dt = parseLocal(d); return dt ? dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' }
const money = (n) => { const v = parseFloat(n); return isNaN(v) ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(v) }
const PAGE_SIZE = 50

export default function ReportPage() {
  // The extra sections this customer has added under Works completed. Loaded
  // once here and handed to the report modal, so opening a report does not
  // re-fetch it.
  const [template, setTemplate] = useState({ sections: [] })
  const [tplOpen, setTplOpen] = useState(false)
  const [reports, setReports] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [meName, setMeName] = useState('')
  const [edit, setEdit] = useState(null)
  const [view, setView] = useState(null)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState({ key: 'updatedAt', dir: 'desc' })
  const [filters, setFilters] = useState({ project: '', status: '', completedBy: '', customer: '', from: '', to: '' })
  const setF = (patch) => { setFilters(p => ({ ...p, ...patch })); setPage(0) }

  async function load() {
    setLoading(true)
    try {
      const [r, p] = await Promise.all([
        fetch('/api/project-reports').then(r => r.json()).catch(() => ({})),
        fetch('/api/ops-projects').then(r => r.json()).catch(() => ({})),
      ])
      setReports(r.reports || [])
      setProjects((p.projects || []).map(x => ({ no: x.projectNo, name: x.projectName || '', address: x.location || '', customer: x.customer || '' })))
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    fetch('/api/project-report-template').then(r => r.json())
      .then(d => setTemplate(d.template || { sections: [] })).catch(() => {})
  }, [])
  useEffect(() => { fetch('/api/portal-auth?action=me').then(r => r.json()).then(d => setMeName(d.user?.name || '')).catch(() => {}) }, [])

  function toggleSort(key) { setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }) }
  const arrow = (key) => sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''

  const filterOpts = useMemo(() => {
    const uniq = (g) => [...new Set(reports.map(g).filter(Boolean))].sort()
    return { projects: uniq(r => `${r.projectNo || ''}${r.projectName ? ' — ' + r.projectName : ''}`), completedBy: uniq(r => r.completedBy), customers: uniq(r => r.customerName) }
  }, [reports])

  const rows = useMemo(() => {
    let arr = reports.filter(r => {
      if (filters.project && `${r.projectNo || ''}${r.projectName ? ' — ' + r.projectName : ''}` !== filters.project) return false
      if (filters.status && (r.status || 'draft') !== filters.status) return false
      if (filters.completedBy && r.completedBy !== filters.completedBy) return false
      if (filters.customer && r.customerName !== filters.customer) return false
      if (filters.from && (!r.date || parseLocal(r.date) < parseLocal(filters.from))) return false
      if (filters.to && (!r.date || parseLocal(r.date) > parseLocal(filters.to))) return false
      return true
    })
    const val = (r) => {
      if (sort.key === 'project') return `${r.projectNo || ''} ${r.projectName || ''}`.toLowerCase()
      if (sort.key === 'date') return r.date || ''
      if (sort.key === 'customer') return (r.customerName || '').toLowerCase()
      if (sort.key === 'completedBy') return (r.completedBy || '').toLowerCase()
      if (sort.key === 'status') return r.status || ''
      return r.updatedAt || 0
    }
    return [...arr].sort((a, b) => { const av = val(a), bv = val(b); if (av < bv) return sort.dir === 'asc' ? -1 : 1; if (av > bv) return sort.dir === 'asc' ? 1 : -1; return 0 })
  }, [reports, filters, sort])
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  async function del(r) {
    if (!confirm(`Delete report ${r.reportId || ''}?`)) return
    await fetch('/api/project-reports', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id }) })
    load()
  }

  return (
    <OperationsShell active="pm:report" section="pm" title="Project Report" wide>
      <PageHeading title="Project Reports" sub="Site reports — completed on desktop."
        action={<div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setTplOpen(true)} style={ghostBtn}>Edit template</button>
          <button onClick={() => setEdit('new')} style={primaryBtn}>+ Add new</button>
        </div>} />

      {tplOpen && <TemplateModal template={template} onClose={() => setTplOpen(false)}
        onSaved={(t) => { setTemplate(t); setTplOpen(false) }} />}

      {loading ? <Loading /> : reports.length === 0 ? (
        <EmptyCard title="No reports yet" body="Click “Add new” to create the first site report." />
      ) : (
        <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'flex-end' }}>
          <FilterSel label="Project" value={filters.project} onChange={v => setF({ project: v })} options={filterOpts.projects} />
          <FilterSel label="Status" value={filters.status} onChange={v => setF({ status: v })} options={[{ v: 'draft', l: 'Draft' }, { v: 'complete', l: 'Submitted' }]} raw />
          <FilterSel label="Completed By" value={filters.completedBy} onChange={v => setF({ completedBy: v })} options={filterOpts.completedBy} />
          <FilterSel label="Customer Company" value={filters.customer} onChange={v => setF({ customer: v })} options={filterOpts.customers} />
          <div><div style={lbl}>Date from</div><input type="date" value={filters.from} onChange={e => setF({ from: e.target.value })} style={fInput} /></div>
          <div><div style={lbl}>Date to</div><input type="date" value={filters.to} onChange={e => setF({ to: e.target.value })} style={fInput} /></div>
          {(filters.project || filters.status || filters.completedBy || filters.customer || filters.from || filters.to) &&
            <button onClick={() => setFilters({ project: '', status: '', completedBy: '', customer: '', from: '', to: '' })} style={{ ...ghostBtn, padding: '7px 12px' }}>Clear</button>}
          <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#888', alignSelf: 'center' }}>{rows.length} report{rows.length === 1 ? '' : 's'}</div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 950 }}>
            <thead><tr style={{ background: '#faf9f7' }}>
              <th style={{ ...th, cursor: 'pointer' }} onClick={() => toggleSort('project')}>Project{arrow('project')}</th>
              <th style={{ ...th, cursor: 'pointer' }} onClick={() => toggleSort('date')}>Completion Date{arrow('date')}</th>
              <th style={{ ...th, cursor: 'pointer' }} onClick={() => toggleSort('customer')}>Customer Company{arrow('customer')}</th>
              <th style={{ ...th, cursor: 'pointer' }} onClick={() => toggleSort('completedBy')}>Completed By{arrow('completedBy')}</th>
              <th style={{ ...th, cursor: 'pointer' }} onClick={() => toggleSort('status')}>Status{arrow('status')}</th>
              <th style={{ ...th, textAlign: 'right' }}></th>
            </tr></thead>
            <tbody>
              {pageRows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #f0f0f0', background: (r.status !== 'complete') ? '#fffbeb' : '#fff' }}>
                  <td style={td}><strong>{r.projectNo || '—'}</strong>{r.projectName ? <div style={{ fontSize: 11, color: '#999' }}>{r.projectName}</div> : null}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDMY(r.date)}</td>
                  <td style={td}>{r.customerName || '—'}</td>
                  <td style={td}>{r.completedBy || '—'}</td>
                  <td style={td}>{r.status === 'complete'
                    ? <span style={{ fontSize: 11.5, color: '#16a34a', background: '#dcfce7', padding: '2px 10px', borderRadius: 12, fontWeight: 600 }}>Submitted</span>
                    : <span style={{ fontSize: 11.5, color: '#b45309', background: '#fef3c7', padding: '2px 10px', borderRadius: 12, fontWeight: 700 }}>● DRAFT</span>}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setView(r.id)} style={linkBtn}>View</button>
                    <button onClick={() => setEdit(r.id)} style={linkBtn}>Edit</button>
                    <button onClick={() => del(r)} style={{ ...linkBtn, color: '#dc2626' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16, alignItems: 'center' }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={ghostBtn}>‹ Prev</button>
            <span style={{ fontSize: 13, color: '#666' }}>Page {page + 1} of {pageCount}</span>
            <button disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)} style={ghostBtn}>Next ›</button>
          </div>
        )}
        </>
      )}

      {edit && <ReportModal template={template} id={edit === 'new' ? null : edit} projects={projects} meName={meName} allReports={reports} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
      {view && <ViewModal id={view} onClose={() => setView(null)} onEdit={() => { setEdit(view); setView(null) }} />}
    </OperationsShell>
  )
}

const lbl = { fontSize: 11, color: '#888', marginBottom: 3 }
const fInput = { padding: '7px 9px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 12.5 }
function FilterSel({ label, value, onChange, options, raw }) {
  return (
    <div>
      <div style={lbl}>{label}</div>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...fInput, minWidth: 130, maxWidth: 220, fontFamily: 'inherit' }}>
        <option value="">All</option>
        {options.map(o => raw ? <option key={o.v} value={o.v}>{o.l}</option> : <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

// ── Create / edit report ──
function ReportModal({ id, template, projects, meName, allReports, onClose, onSaved }) {
  const [f, setF] = useState({
    date: todayISO(), projectNo: '', projectName: '', projectAddress: '', customerName: '',
    completedBy: meName || '', siteComms: '', worksCompleted: '', status: 'draft',
    variationsSnapshot: [], issuesSnapshot: [], photos: [], approvalName: '', approvalDate: '',
    // Answers to the customer's own sections, keyed by section key.
    extra: {},
    // Photos added BY HAND, kept apart from the auto-collected ones. Choosing
    // a project re-pulls `photos` from submissions; anything a person added
    // must survive that, which it cannot do if the two share one array.
    manualPhotos: [],
    // The template as it stood when this report was written - see
    // lib/projectReportTemplate.js. Set on save for a new report.
    sections: null,
  })
  const [loaded, setLoaded] = useState(id ? false : true)
  const [saving, setSaving] = useState(false)
  const [autoLoading, setAutoLoading] = useState(false)
  const [err, setErr] = useState('')
  const set = (patch) => setF(prev => ({ ...prev, ...patch }))

  // Load existing report
  useEffect(() => {
    if (!id) { if (!f.completedBy && meName) set({ completedBy: meName }); return }
    fetch(`/api/project-reports?id=${id}`).then(r => r.json()).then(d => { if (d.report) setF(d.report); setLoaded(true) }).catch(() => setLoaded(true))
  }, [id])
  useEffect(() => { if (!id && meName && !f.completedBy) set({ completedBy: meName }) }, [meName])

  // When a project is chosen, auto-fill customer/address and pull variations, open issues & photos
  // When a project is chosen, fill in the customer and address and pull the
  // variations, issues and photos. The pulling itself lives in
  // lib/projectReportAutofill.js - the Site App does exactly the same thing,
  // and two copies of those rules would diverge.
  async function pickProject(no) {
    const p = projects.find(x => x.no === no)
    set({ projectNo: no, projectName: p?.name || '', customerName: p?.customer || '', projectAddress: p?.address || '' })
    if (!no) return
    setAutoLoading(true)
    try {
      const pulled = await autofillReport({
        projectNo: no, projectName: p?.name || '', allReports, excludeId: id,
      })
      // manualPhotos and extra are untouched on purpose - this runs again
      // every time the project changes.
      //
      // customerName and projectAddress are only taken from the pull when it
      // actually found them. The line above already set them from the project
      // list, and a project the dashboard has no row for would otherwise have
      // them blanked by an empty answer.
      set({
        variationsSnapshot: pulled.variationsSnapshot,
        issuesSnapshot: pulled.issuesSnapshot,
        photos: pulled.photos,
        lastReportDate: pulled.lastReportDate,
        ...(pulled.customerName ? { customerName: pulled.customerName } : {}),
        ...(pulled.projectAddress ? { projectAddress: pulled.projectAddress } : {}),
      })
    } catch (e) { console.error(e) }
    setAutoLoading(false)
  }

  // The sections this report uses: its own snapshot once saved, otherwise the
  // live template. An existing report never follows a later template change.
  const secs = sectionsFor(f, template)

  async function save(asComplete) {
    setErr('')
    if (!f.projectNo) return setErr('Select a project.')
    if (asComplete) {
      if (!f.siteComms.trim()) return setErr('Site communications is required.')
      if (!f.worksCompleted.trim()) return setErr('Works completed is required.')
      if (!f.approvalName.trim()) return setErr('Approval name is required.')
      // Required sections the customer added themselves.
      for (const sec of secs) {
        if (!sec.required) continue
        const v = (f.extra || {})[sec.key]
        const empty = sec.type === 'photos' ? !(Array.isArray(v) && v.length) : !String(v || '').trim()
        if (empty) return setErr(`${sec.label} is required.`)
      }
    }
    setSaving(true)
    try {
      // Keep what was typed. This forced today's date on submit, which silently threw
      // away an edit made two lines above it - only defaulting to today when the field
      // was genuinely left empty.
      const report = {
        ...f,
        status: asComplete ? 'complete' : 'draft',
        approvalDate: f.approvalDate || todayISO(),
        // Freeze the template onto the report the first time it is saved. A
        // later change to the template must not rewrite a report that has
        // already gone to a customer - see lib/projectReportTemplate.js.
        sections: Array.isArray(f.sections) ? f.sections : secs,
      }
      if (id) report.id = id
      const r = await fetch('/api/project-reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report }) })
      const d = await r.json()
      if (!r.ok || !d.report) throw new Error(d.error || 'Save failed')
      onSaved()
    } catch (e) { setErr(e.message || 'Could not save.') }
    setSaving(false)
  }

  if (!loaded) return <Modal title="Loading…" onClose={onClose}><Loading /></Modal>

  const L = ({ children, req }) => <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, margin: '18px 0 6px' }}>{children}{req && <span style={{ color: '#dc2626' }}> *</span>}</div>

  return (
    <Modal title={id ? 'Edit Project Report' : 'New Project Report'} onClose={onClose} wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        <div>
          <L req>Date</L>
          <input type="date" value={f.date || ''} onChange={e => set({ date: e.target.value })} style={input} />
        </div>
        <div>
          <L req>Project</L>
          <select value={f.projectNo} onChange={e => pickProject(e.target.value)} style={input}>
            <option value="">Select project…</option>
            {projects.map(p => <option key={p.no} value={p.no}>{[p.no, p.name].filter(Boolean).join(' — ')}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        <div><L>Customer company</L><input value={f.customerName || ''} onChange={e => set({ customerName: e.target.value })} style={input} /></div>
        <div><L>Your name</L><input value={f.completedBy || ''} onChange={e => set({ completedBy: e.target.value })} style={input} /></div>
      </div>
      <L>Project address</L>
      <input value={f.projectAddress || ''} onChange={e => set({ projectAddress: e.target.value })} style={input} />

      {autoLoading && <div style={{ fontSize: 12.5, color: '#ca8a04', marginTop: 12 }}>Pulling variations, issues & photos for this project…</div>}

      <L>Variations</L>
      <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: '#faf9f7' }}><th style={{ ...th, fontSize: 11 }}>No.</th><th style={{ ...th, fontSize: 11 }}>Description</th><th style={{ ...th, fontSize: 11 }}>Instructed</th><th style={{ ...th, fontSize: 11 }}>Total</th></tr></thead>
          <tbody>
            {(f.variationsSnapshot || []).length === 0 && <tr><td colSpan={4} style={{ ...td, color: '#aaa' }}>No variations.</td></tr>}
            {(f.variationsSnapshot || []).map((v, i) => <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}><td style={td}>{v.varNumber}</td><td style={td}>{v.description}</td><td style={td}>{v.instructed ? 'Yes' : 'No'}</td><td style={td}>{money(v.total)}</td></tr>)}
          </tbody>
        </table>
      </div>

      <L>Issues</L>
      <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: '#faf9f7' }}><th style={{ ...th, fontSize: 11 }}>Date Created</th><th style={{ ...th, fontSize: 11 }}>Issue Name</th><th style={{ ...th, fontSize: 11 }}>Type</th><th style={{ ...th, fontSize: 11 }}>Required Resolution</th><th style={{ ...th, fontSize: 11 }}>Status</th></tr></thead>
          <tbody>
            {(f.issuesSnapshot || []).length === 0 && <tr><td colSpan={5} style={{ ...td, color: '#aaa' }}>No new issues sent to the customer since the last report.</td></tr>}
            {(f.issuesSnapshot || []).map((i, idx) => <tr key={idx} style={{ borderTop: '1px solid #f2f2f2' }}><td style={td}>{fmtDMY(i.dateCreated)}</td><td style={td}>{i.issueName}</td><td style={td}>{(i.issueTypes || []).join(', ')}</td><td style={td}>{fmtDMY(i.requiredDate)}</td><td style={td}>{i.status}</td></tr>)}
          </tbody>
        </table>
      </div>
      {(f.issuesSnapshot || []).length > 0 && <div style={{ fontSize: 11.5, color: '#888', fontStyle: 'italic', marginTop: 6 }}>Open issues (sent to the customer) show on every report until closed; a closed issue shows once more, then drops off. Full forms are appended at the end of the report PDF.</div>}

      <L req>Site communications</L>
      <textarea value={f.siteComms || ''} onChange={e => set({ siteComms: e.target.value })} style={{ ...input, minHeight: 100, resize: 'vertical' }} placeholder="Insert all discussions and occurrences that relate to Variations, H&S, Quality, Design, Delay and Disruption." />

      <L req>Works completed</L>
      <textarea value={f.worksCompleted || ''} onChange={e => set({ worksCompleted: e.target.value })} style={{ ...input, minHeight: 90, resize: 'vertical' }} placeholder="Insert a description of works completed since our last project site report." />

      {/* The customer's own sections, in template order, under Works completed. */}
      {secs.map(sec => (
        <div key={sec.key}>
          <L req={sec.required}>{sec.label}</L>
          {sec.type === 'photos' ? (
            <PhotoAdder
              photos={(f.extra || {})[sec.key] || []}
              onChange={(list) => set({ extra: { ...(f.extra || {}), [sec.key]: list } })}
            />
          ) : (
            <textarea
              value={(f.extra || {})[sec.key] || ''}
              onChange={e => set({ extra: { ...(f.extra || {}), [sec.key]: e.target.value } })}
              style={{ ...input, minHeight: sec.type === 'list' ? 110 : 90, resize: 'vertical' }}
              placeholder={sec.type === 'list' ? 'One per line.' : ''}
            />
          )}
        </div>
      ))}

      <L>Photos <span style={{ fontWeight: 400, color: '#999', fontSize: 12 }}>(auto-collected since last report)</span></L>
      {(f.photos || []).length === 0 ? <div style={{ fontSize: 12.5, color: '#999' }}>No photos found in the window.</div> : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {f.photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />)}
        </div>
      )}

      {/* ADDED BY HAND, kept separate from the auto-collected set above.
          Changing the project re-pulls those and would otherwise wipe these. */}
      <L>Additional photos <span style={{ fontWeight: 400, color: '#999', fontSize: 12 }}>(added manually)</span></L>
      <PhotoAdder photos={f.manualPhotos || []} onChange={(list) => set({ manualPhotos: list })} />

      <div style={{ marginTop: 22, padding: '16px 18px', background: '#faf9f7', borderRadius: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: GOLD, marginBottom: 8 }}>APPROVAL</div>
        <div style={{ fontSize: 12.5, color: '#555', marginBottom: 12 }}>I can confirm that the information I have provided is true and that I have completed all sections accurately and diligently.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          <div><div style={{ fontSize: 12, fontWeight: 600 }}>Name <span style={{ color: '#dc2626' }}>*</span></div><input value={f.approvalName || ''} onChange={e => set({ approvalName: e.target.value })} style={{ ...input, marginTop: 4 }} /></div>
          {/* EDITABLE. It was stamped with today and locked, which is wrong whenever the
              report is written up after the fact - a Friday walk round typed on Monday
              was dated Monday, and the Commercial Scorecard counts reports by this date,
              so it landed in the wrong week. */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Date</div>
            <input type="date" value={f.approvalDate || todayISO()}
              onChange={e => set({ approvalDate: e.target.value })}
              style={{ ...input, marginTop: 4 }} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>Defaults to today. Change it if the report is being written up for an earlier visit &mdash; this is the date it counts against on the Commercial Scorecard.</div>
      </div>

      {err && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 14 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, borderTop: '1px solid #eee', paddingTop: 18 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={() => save(false)} disabled={saving} style={ghostBtn}>{saving ? 'Saving…' : 'Save draft'}</button>
        <button onClick={() => save(true)} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : 'Save & submit'}</button>
      </div>
    </Modal>
  )
}

// ── View (read-only) with PDF download ──
function ViewModal({ id, onClose, onEdit }) {
  const [r, setR] = useState(null)
  useEffect(() => { fetch(`/api/project-reports?id=${id}`).then(x => x.json()).then(d => setR(d.report)).catch(() => {}) }, [id])
  if (!r) return <Modal title="Loading…" onClose={onClose}><Loading /></Modal>
  const Row = ({ label, children }) => <div style={{ marginBottom: 14 }}><div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 4 }}>{label}</div><div style={{ fontSize: 13.5, color: '#333', whiteSpace: 'pre-wrap' }}>{children}</div></div>
  return (
    <Modal title={`${r.reportId || 'Report'} — ${r.projectName || r.projectNo || ''}`} onClose={onClose} wide>
      <div style={{ marginBottom: 12 }}>
        {r.status === 'complete'
          ? <span style={{ fontSize: 11.5, color: '#16a34a', background: '#dcfce7', padding: '3px 12px', borderRadius: 12, fontWeight: 600 }}>Complete · Rev {r.revision || 0}</span>
          : <span style={{ fontSize: 11.5, color: '#b45309', background: '#fef3c7', padding: '3px 12px', borderRadius: 12, fontWeight: 700 }}>● DRAFT</span>}
      </div>
      <Row label="Project">{r.projectNo} {r.projectName ? `— ${r.projectName}` : ''}</Row>
      <Row label="Customer Company">{r.customerName || '—'}</Row>
      <Row label="Address">{r.projectAddress || '—'}</Row>
      <Row label="Completion date">{fmtDMY(r.date)} · by {r.completedBy || '—'}</Row>
      <Row label="Site communications">{r.siteComms || '—'}</Row>
      <Row label="Works completed">{r.worksCompleted || '—'}</Row>
      {/* The customer's own sections, from the report's OWN snapshot. */}
      {(Array.isArray(r.sections) ? r.sections : []).map(sec => {
        const val = (r.extra || {})[sec.key]
        if (sec.type === 'photos') {
          const urls = Array.isArray(val) ? val : []
          if (!urls.length) return null
          return (
            <Row key={sec.key} label={`${sec.label} (${urls.length})`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {urls.map((p, i) => <a key={i} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} /></a>)}
              </div>
            </Row>
          )
        }
        const txt = String(val == null ? '' : val).trim()
        if (!txt) return null
        return <Row key={sec.key} label={sec.label}>{txt}</Row>
      })}

      {(r.manualPhotos || []).length > 0 && <Row label={`Additional photos (${r.manualPhotos.length})`}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{r.manualPhotos.map((p, i) => <a key={i} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} /></a>)}</div></Row>}

      {(r.photos || []).length > 0 && <Row label={`Photos (${r.photos.length})`}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{r.photos.map((p, i) => <a key={i} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} /></a>)}</div></Row>}
      <Row label="Approval">{r.approvalName || '—'} · {fmtDMY(r.approvalDate)}</Row>
      {r.revisions?.length > 0 && <Row label="Revision history">{r.revisions.map(v => `Rev ${v.rev} — ${new Date(v.at).toLocaleString('en-GB')} by ${v.by || '—'}`).join('\n')}</Row>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, borderTop: '1px solid #eee', paddingTop: 18 }}>
        <a href={`/api/project-report-pdf?id=${r.id}`} target="_blank" rel="noreferrer" style={{ ...ghostBtn, textDecoration: 'none', display: 'inline-block' }}>Download PDF</a>
        <button onClick={onEdit} style={primaryBtn}>Edit</button>
      </div>
    </Modal>
  )
}

// Pick photos from the device, upload each one, keep the returned URLs.
// Used for manual report photos and for any custom section of type `photos`.
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
        // CHECKED, not assumed. An upload that fails silently leaves a report
        // looking complete with a photo nobody can open.
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
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {(photos || []).map((p, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <a href={p} target="_blank" rel="noreferrer">
              <img src={p} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
            </a>
            <button
              onClick={() => onChange((photos || []).filter((_, j) => j !== i))}
              title="Remove"
              style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '18px', padding: 0 }}
            >&times;</button>
          </div>
        ))}
      </div>
      <label style={{ ...ghostBtn, display: 'inline-block', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Uploading\u2026' : '+ Add photos'}
        <input type="file" accept="image/*" multiple disabled={busy}
          onChange={e => { add(e.target.files); e.target.value = '' }}
          style={{ display: 'none' }} />
      </label>
      {err && <div style={{ fontSize: 12.5, color: '#b91c1c', marginTop: 6 }}>{err}</div>}
    </div>
  )
}

// Edit the extra sections every future report will carry.
function TemplateModal({ template, onClose, onSaved }) {
  const [rows, setRows] = useState(() => (template && template.sections ? template.sections : []).map(s => ({ ...s })))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const patch = (i, p) => setRows(rs => rs.map((r, j) => (i === j ? { ...r, ...p } : r)))
  const move = (i, d) => setRows(rs => {
    const next = [...rs]; const j = i + d
    if (j < 0 || j >= next.length) return rs
    ;[next[i], next[j]] = [next[j], next[i]]
    return next.map((r, k) => ({ ...r, order: k + 1 }))
  })

  async function save() {
    setErr(''); setSaving(true)
    const payload = { sections: rows.map((r, i) => ({ ...r, order: i + 1 })) }
    try {
      const r = await fetch('/api/project-report-template', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: payload }),
      })
      if (!r.ok) {
        let msg = ''
        try { msg = (await r.json()).error || '' } catch {}
        setErr(msg || `Could not save (${r.status}). Nothing has been changed.`)
        setSaving(false); return
      }
      const d = await r.json()
      onSaved(d.template || payload)
    } catch (e) { setErr(e.message || 'Could not save.') }
    setSaving(false)
  }

  return (
    <Modal title="Edit report template" onClose={onClose} wide>
      <div style={{ fontSize: 12.5, color: '#666', marginBottom: 16 }}>
        The whole report, in order. The greyed rows are built in and cannot be
        changed; your own sections sit under Works completed and are editable.
        Reports already written keep the sections they were written with, so
        changing this does not alter anything already issued.
      </div>

      {BUILT_IN_SECTIONS.map(b => (
        <div key={b.key}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto', gap: 10,
            alignItems: 'center', padding: '9px 11px', marginBottom: 8,
            background: '#f7f7f6', border: '1px solid #ededeb', borderRadius: 8,
            color: '#8a8a85', fontSize: 13,
          }}>
            <div>
              {b.label}
              {b.required && <span style={{ color: '#c9a9a9', marginLeft: 4 }}>*</span>}
              {b.note && <span style={{ fontSize: 11.5, marginLeft: 8, fontStyle: 'italic' }}>{b.note}</span>}
            </div>
            <div style={{ fontSize: 11, letterSpacing: 0.3, textTransform: 'uppercase' }}>Built in</div>
          </div>

          {/* The customer's own sections, in position. */}
          {b.key === CUSTOM_AFTER && (
            <div style={{ borderLeft: `2px solid ${GOLD}`, paddingLeft: 12, marginLeft: 4, marginBottom: 8 }}>
              {rows.length === 0 && (
                <div style={{ fontSize: 12.5, color: '#999', padding: '4px 0 10px' }}>
                  No sections of your own yet. The report is exactly as it is today.
                </div>
              )}

              {rows.map((r, i) => (
                <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 100px auto', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <input value={r.label} onChange={e => patch(i, { label: e.target.value })}
                    placeholder="Heading" style={{ ...input, margin: 0 }} />
                  <select value={r.type} onChange={e => patch(i, { type: e.target.value })} style={{ ...input, margin: 0 }}>
                    <option value="text">Free text</option>
                    <option value="list">List</option>
                    <option value="photos">Photos</option>
                  </select>
                  <label style={{ fontSize: 12.5, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={!!r.required} onChange={e => patch(i, { required: e.target.checked })} />
                    Required
                  </label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => move(i, -1)} disabled={i === 0} style={miniBtn} title="Move up">&uarr;</button>
                    <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} style={miniBtn} title="Move down">&darr;</button>
                    <button onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} style={miniBtn} title="Remove">&times;</button>
                  </div>
                </div>
              ))}

              <button
                onClick={() => setRows(rs => [...rs, { key: newSectionKey(), label: '', type: 'text', required: false, order: rs.length + 1 }])}
                style={{ ...ghostBtn, marginTop: 2 }}
              >+ Add section</button>
            </div>
          )}
        </div>
      ))}

      {err && <div style={{ fontSize: 12.5, color: '#b91c1c', marginTop: 10 }}>{err}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? 'Saving\u2026' : 'Save template'}</button>
      </div>
    </Modal>
  )
}

// Module scope: ReportModal, PhotoAdder and TemplateModal all use it, and a
// const declared inside one component is not in scope in another - it
// compiles and throws when the component renders.
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }

const miniBtn = { width: 26, height: 26, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: '24px', padding: 0 }

function Modal({ title, children, onClose, wide }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3vh 2vw', overflowY: 'auto' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: wide ? 880 : 620, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 26px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, background: '#fff', borderRadius: '14px 14px 0 0', zIndex: 2 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: INK }}>{title}</h2>
          <button onClick={onClose} style={{ fontSize: 24, border: 'none', background: 'none', cursor: 'pointer', color: '#999' }}>×</button>
        </div>
        <div style={{ padding: '8px 26px 26px' }}>{children}</div>
      </div>
    </div>
  )
}
