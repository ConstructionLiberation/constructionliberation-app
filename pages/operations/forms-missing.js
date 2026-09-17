import { useState, useEffect, useMemo } from 'react'
import { businessNow } from '../../lib/businessDate'
import OperationsShell, { PageHeading } from '../../components/OperationsShell'
import { INK, GOLD, Loading, ghostBtn, th, td } from '../../components/opsUI'
import { waiveKey } from '../../lib/formsWaived'

const DAY = 86400000
const parseISO = (s) => { if (!s) return null; const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1) }
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const mondayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); const wd = (x.getDay() + 6) % 7; return new Date(x.getTime() - wd * DAY) }
const wcLabel = (m) => `W/C ${parseISO(m).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`

const FORM_ORDER = ['Pre-Start', 'Start on Site Checklist', 'Daily Site Diary', 'Works Area Handover', 'Water Ingress Report']

export default function FormsMissingPage() {
  const thisMon = iso(mondayOf(businessNow()))
  const [fromMon, setFromMon] = useState(thisMon)
  const [toMon, setToMon] = useState(thisMon)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showOnly, setShowOnly] = useState('all')   // all | missing | done
  const [fForm, setFForm] = useState('')
  const [fPerson, setFPerson] = useState('')

  const wcOptions = useMemo(() => {
    const base = mondayOf(businessNow()); const opts = []
    for (let i = -104; i <= 52; i++) opts.push(iso(new Date(base.getTime() + i * 7 * DAY)))
    return opts
  }, [])

  async function load() {
    setLoading(true)
    try {
      const d = await fetch(`/api/forms-missing?from=${encodeURIComponent(fromMon)}&to=${encodeURIComponent(toMon)}`).then(r => r.json())
      setData(d)
    } catch { setData({ rows: [], summary: { required: 0, completed: 0, pct: 100 }, byForm: {} }) }
    setLoading(false)
  }
  useEffect(() => { load() }, [fromMon, toMon])

  const [waiving, setWaiving] = useState('')
  const [waiveErr, setWaiveErr] = useState('')

  // MARK ONE NOT NEEDED, OR PUT IT BACK.
  //
  // The row is updated in place rather than reloading. A reload would close nothing but
  // would rebuild the whole table underneath an open modal and lose the reading
  // position, which on a long missing list is the difference between one click and
  // finding your place again.
  async function toggleWaive(row, on) {
    const key = waiveKey(row)
    if (!key) return
    setWaiving(key); setWaiveErr('')
    try {
      const d = await fetch('/api/forms-missing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'waive', key, on }),
      }).then(r => r.json())
      if (d.error) { setWaiveErr(d.error); return }
      setData(prev => {
        if (!prev) return prev
        const rows = prev.rows.map(r => waiveKey(r) === key ? { ...r, waived: on ? true : false } : r)
        // The cards have to move with it - that is the point of the exercise. Counted
        // here from the same rows the table shows, so the two cannot disagree.
        const byForm = {}
        for (const k of Object.keys(prev.byForm || {})) byForm[k] = { required: 0, completed: 0 }
        let required = 0, completed = 0
        for (const r of rows) {
          if (r.upcoming || r.waived) continue
          if (!byForm[r.formType]) byForm[r.formType] = { required: 0, completed: 0 }
          byForm[r.formType].required++
          required++
          if (r.done) { byForm[r.formType].completed++; completed++ }
        }
        return { ...prev, rows, byForm, summary: { required, completed, pct: required ? Math.round((completed / required) * 100) : 100 } }
      })
    } catch (e) { setWaiveErr(e.message || 'Could not save') }
    finally { setWaiving('') }
  }


  const people = useMemo(() => data ? [...new Set(data.rows.map(r => r.responsible).filter(v => v && v !== '—'))].sort() : [], [data])

  // Which card was clicked. null = closed, '' = the overall card (every form type),
  // otherwise the form type.
  const [drill, setDrill] = useState(null)
  // x and Escape only, never a backdrop click - the same rule as every other modal.
  useEffect(() => {
    if (drill === null) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setDrill(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drill])

  // The DRILL-DOWN READS data.rows, NOT the filtered rows above.
  //
  // The cards are built from the API's own summary, which knows nothing about the
  // page's status/form/person filters. Opening a card against the filtered list would
  // show a count that did not match the number on the card you just pressed.
  const drillRows = useMemo(() => {
    if (!data || drill === null) return { missing: [], done: [], upcoming: [], waived: [], label: '' }
    const all = data.rows.filter(r => drill === '' || r.formType === drill)
    // Sorted on the date the column now SHOWS. Sorting by week while displaying a
    // specific date makes a list look unordered.
    const keyDate = (r) => (r.done ? (r.doneDate || r.dueDate) : r.dueDate) || r.week
    const by = (a, b) => keyDate(a).localeCompare(keyDate(b))
      || String(a.projectNo).localeCompare(String(b.projectNo), undefined, { numeric: true })
      || FORM_ORDER.indexOf(a.formType) - FORM_ORDER.indexOf(b.formType)
    return {
      // Waived rows leave every other bucket. They are not missing, they are not done,
      // and leaving them in Missing greyed out would keep them in the list people are
      // trying to clear.
      missing: all.filter(r => !r.done && !r.upcoming && !r.waived).sort(by),
      done: all.filter(r => r.done && !r.waived).sort(by),
      upcoming: all.filter(r => r.upcoming && !r.waived).sort(by),
      waived: all.filter(r => r.waived).sort(by),
      label: drill === '' ? 'All required forms' : drill,
    }
  }, [data, drill])

  const rows = useMemo(() => {
    if (!data) return []
    return data.rows.filter(r => {
      if (showOnly === 'missing' && (r.done || r.upcoming)) return false
      if (showOnly === 'done' && !r.done) return false
      if (fForm && r.formType !== fForm) return false
      if (fPerson && r.responsible !== fPerson) return false
      return true
    }).sort((a, b) => {
      // On the date the column shows, not the week - see the pop-out.
      const k = (r) => (r.done ? (r.doneDate || r.dueDate) : r.dueDate) || r.week
      return k(a).localeCompare(k(b))
        || a.projectNo.localeCompare(b.projectNo, undefined, { numeric: true })
        || FORM_ORDER.indexOf(a.formType) - FORM_ORDER.indexOf(b.formType)
    })
  }, [data, showOnly, fForm, fPerson])

  // FIFTY AT A TIME.
  //
  // Every required form for every project for the whole range came out in one
  // table - hundreds of rows on a long range, which is slow to render and
  // impossible to read. The filters above narrow it, but the default view is the
  // one people land on.
  //
  // Page resets whenever the filters change, so changing a filter cannot leave
  // you looking at page 6 of a 2-page list and concluding there is nothing there.
  const PAGE_SIZE = 50
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [showOnly, fForm, fPerson, data])
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <OperationsShell active="forms:missing" section="forms" title="Forms — Missing" wide>
      <PageHeading title="Forms — Missing" sub="Required vs completed tracked forms for the selected weeks, with the person responsible." />

      {/* range */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div><div style={lbl}>From</div>
          <select value={fromMon} onChange={e => { const v = e.target.value; setFromMon(v); if (parseISO(v) > parseISO(toMon)) setToMon(v) }} style={{ ...fInput, minWidth: 180, fontFamily: 'inherit' }}>
            {wcOptions.map(m => <option key={m} value={m}>{wcLabel(m)}</option>)}
          </select>
        </div>
        <div><div style={lbl}>To</div>
          <select value={toMon} onChange={e => setToMon(e.target.value)} style={{ ...fInput, minWidth: 180, fontFamily: 'inherit' }}>
            {wcOptions.filter(m => parseISO(m) >= parseISO(fromMon)).map(m => <option key={m} value={m}>{wcLabel(m)}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12, color: '#888', alignSelf: 'flex-end', paddingBottom: 8 }}>
          Showing {wcLabel(fromMon)} → {wcLabel(toMon)}{loading ? ' · loading…' : (data ? ` · ${data.rows?.length || 0} rows` : '')}
        </div>
      </div>

      {loading || !data ? <Loading /> : (
        <>
          {/* summary cards */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
            <Card onClick={() => setDrill('')} title="See every required form, missing and completed">
              {data.summary.required ? <>
                <div style={cardNum}>{data.summary.pct}%</div>
                <div style={cardLbl}>Completed</div>
                <Bar pct={data.summary.pct} />
              </> : <>
                <div style={{ ...cardNum, color: '#bbb' }}>N/A</div>
                <div style={cardLbl}>Completed</div>
              </>}
              <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{data.summary.completed} of {data.summary.required} required forms</div>
            </Card>
            {FORM_ORDER.map(ft => {
              const b = data.byForm[ft] || { required: 0, completed: 0 }
              const na = !b.required   // no forms needed for this type
              const pct = na ? null : Math.round((b.completed / b.required) * 100)
              return (
                <Card key={ft} small onClick={() => setDrill(ft)} title={`See the ${ft} forms, missing and completed`}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 4 }}>{ft}</div>
                  {na ? (
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#bbb' }}>N/A</div>
                  ) : (
                    <div style={{ fontSize: 20, fontWeight: 800, color: pct === 100 ? '#16a34a' : (pct >= 50 ? '#ca8a04' : '#dc2626') }}>{pct}%</div>
                  )}
                  <div style={{ fontSize: 12, color: '#666' }}>{b.completed}/{b.required} done{b.required - b.completed > 0 ? ` · ${b.required - b.completed} missing` : ''}</div>
                </Card>
              )
            })}
          </div>

          {/* filters */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
            <div><div style={lbl}>Status</div>
              <select value={showOnly} onChange={e => setShowOnly(e.target.value)} style={{ ...fInput, fontFamily: 'inherit' }}>
                <option value="all">All statuses</option>
                <option value="missing">Missing</option>
                <option value="done">Completed</option>
              </select>
            </div>
            <div><div style={lbl}>Form</div>
              <select value={fForm} onChange={e => setFForm(e.target.value)} style={{ ...fInput, fontFamily: 'inherit' }}>
                <option value="">All forms</option>
                {FORM_ORDER.map(ft => <option key={ft} value={ft}>{ft}</option>)}
              </select>
            </div>
            <div><div style={lbl}>Responsible</div>
              <select value={fPerson} onChange={e => setFPerson(e.target.value)} style={{ ...fInput, minWidth: 150, fontFamily: 'inherit' }}>
                <option value="">Anyone</option>
                {people.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {(showOnly !== 'all' || fForm || fPerson) && <button onClick={() => { setShowOnly('all'); setFForm(''); setFPerson('') }} style={{ ...ghostBtn, padding: '7px 12px' }}>Clear</button>}
            <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#666', alignSelf: 'center' }}>{rows.length} row{rows.length === 1 ? '' : 's'}</div>
          </div>

          {/* table */}
          <div style={{ border: '1px solid #ececec', borderRadius: 12, overflow: 'auto', background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: '#faf9f7' }}>
                  {/* Same as the pop-out: the date the row is about, not the Monday
                      of its week. The heading cannot change per row here, because the
                      table mixes completed and missing - so it reads "Date" and each
                      cell says which it is. */}
                  <th style={{ ...th, textAlign: 'left' }}>Date</th>
                  <th style={{ ...th, textAlign: 'left' }}>Project</th>
                  <th style={{ ...th, textAlign: 'left' }}>Form</th>
                  <th style={{ ...th, textAlign: 'left' }}>Responsible</th>
                  <th style={{ ...th, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={5} style={{ ...td, color: '#aaa', textAlign: 'center', padding: 20 }}>No required forms for this range/filters.</td></tr>}
                {pageRows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f2f2f2', background: r.upcoming ? '#f5fbff' : (r.done ? '#fff' : '#fffaf7') }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{(() => {
                      const d = (r.done ? (r.doneDate || r.dueDate) : r.dueDate) || ''
                      if (!d) return <span style={{ color: '#999' }}>W/C {parseISO(r.week).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                      return (
                        <>
                          {parseISO(d).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: '2-digit' })}
                          {/* Which date this is. Without it a mixed list of completed
                              and missing rows shows two different kinds of date in one
                              column with nothing to tell them apart. */}
                          <div style={{ fontSize: 10, color: '#aaa' }}>{r.done ? 'completed' : (r.upcoming ? 'expected' : 'needed')}</div>
                        </>
                      )
                    })()}</td>
                    <td style={td}>{r.projectNo}{r.projectName && r.projectName !== r.projectNo ? ` — ${r.projectName}` : ''}</td>
                    {/* The day used to be tacked on here because the Date column was
                        only the week. It is the Date column now, so repeating it would
                        show the same date twice on every diary row. */}
                    <td style={td}>{r.formType}</td>
                    <td style={td}>{r.responsible}{r.role ? <span style={{ color: '#aaa', fontSize: 11 }}> ({r.role})</span> : ''}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {r.upcoming
                        ? <span style={{ fontSize: 11.5, color: '#0369a1', background: '#e0f2fe', padding: '2px 10px', borderRadius: 12, fontWeight: 600 }} title="Water-ingress visit within the next 2 weeks — will be required once marked Actual on the Gantt">Upcoming</span>
                        : r.done
                        ? <span style={{ fontSize: 11.5, color: '#16a34a', background: '#dcfce7', padding: '2px 10px', borderRadius: 12, fontWeight: 600 }}>Completed</span>
                        : <span style={{ fontSize: 11.5, color: '#b91c1c', background: '#fee2e2', padding: '2px 10px', borderRadius: 12, fontWeight: 600 }}>Missing</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 4px', fontSize: 13 }}>
              <div style={{ color: '#777' }}>
                Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, rows.length)} of {rows.length}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}
                  style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #ddd', background: '#fff', cursor: safePage === 0 ? 'default' : 'pointer', opacity: safePage === 0 ? 0.45 : 1 }}>Previous</button>
                <span style={{ color: '#777' }}>Page {safePage + 1} of {pageCount}</span>
                <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}
                  style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #ddd', background: '#fff', cursor: safePage >= pageCount - 1 ? 'default' : 'pointer', opacity: safePage >= pageCount - 1 ? 0.45 : 1 }}>Next</button>
              </div>
            </div>
          )}
          {drill !== null && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3vh 2vw' }}>
              <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 'min(1100px, 96vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>{drillRows.label}</div>
                    <div style={{ fontSize: 12.5, color: '#888', marginTop: 2 }}>
                      {wcLabel(fromMon)} to {wcLabel(toMon)} &middot; {drillRows.done.length} completed, {drillRows.missing.length} missing
                      {drillRows.upcoming.length ? `, ${drillRows.upcoming.length} upcoming` : ''}
                      {drillRows.waived.length ? `, ${drillRows.waived.length} not needed` : ''}
                    </div>
                  </div>
                  <button onClick={() => setDrill(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#999', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
                </div>

                <div style={{ overflowY: 'auto', padding: '4px 18px 18px' }}>
                  {/* MISSING FIRST. They are the reason anybody opens this. */}
                  {waiveErr && (
                    <div style={{ marginTop: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '8px 11px', fontSize: 12.5 }}>{waiveErr}</div>
                  )}
                  {[['Missing', drillRows.missing, '#b91c1c', '#fee2e2'],
                    ['Upcoming', drillRows.upcoming, '#0369a1', '#e0f2fe'],
                    ['Completed', drillRows.done, '#16a34a', '#dcfce7'],
                    /* LAST, and its own section. Somewhere to undo a waive - one made by
                       mistake is otherwise gone with no way back from this screen. */
                    ['Not needed', drillRows.waived, '#8a6d1a', '#fffbeb']].map(([title, list, colour, bg]) => (
                    list.length === 0 ? null : (
                      <div key={title} style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: colour, marginBottom: 6 }}>
                          {title} ({list.length})
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead><tr style={{ background: '#faf9f7' }}>
                            {/* The date this row is actually about, not the Monday of
                                its week. Completed rows show the date it was done on -
                                for a diary that is its own Site Diary Date - and
                                outstanding rows show the date it is needed for. */}
                            <th style={{ ...th, textAlign: 'left' }}>{title === 'Completed' ? 'Date completed' : 'Date needed'}</th>
                            <th style={{ ...th, textAlign: 'left' }}>Project</th>
                            {drill === '' && <th style={{ ...th, textAlign: 'left' }}>Form</th>}
                            <th style={{ ...th, textAlign: 'left' }}>Responsible</th>
                            {/* Only where it means something. A completed form does not
                                need waiving, and an upcoming one is not counted yet. */}
                            {(title === 'Missing' || title === 'Not needed') && (
                              <th style={{ ...th, textAlign: 'left', whiteSpace: 'nowrap' }}>Not needed</th>
                            )}
                          </tr></thead>
                          <tbody>
                            {list.map((r, i) => (
                              <tr key={i} style={{ borderTop: '1px solid #f2f2f2', background: bg === '#fee2e2' ? '#fffaf7' : '#fff' }}>
                                <td style={{ ...td, whiteSpace: 'nowrap' }}>{(() => {
                                  const d = (r.done ? (r.doneDate || r.dueDate) : r.dueDate) || ''
                                  // No specific date on the obligation - fall back to
                                  // the week rather than showing a blank cell.
                                  if (!d) return <span style={{ color: '#999' }}>W/C {parseISO(r.week).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                                  return parseISO(d).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: '2-digit' })
                                })()}</td>
                                <td style={td}>{r.projectNo}{r.projectName && r.projectName !== r.projectNo ? ` - ${r.projectName}` : ''}</td>
                                {drill === '' && <td style={td}>{r.formType}</td>}
                                <td style={td}>{r.responsible}{r.role ? <span style={{ color: '#aaa', fontSize: 11 }}> ({r.role})</span> : ''}</td>
                                {(title === 'Missing' || title === 'Not needed') && (
                                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                      <input type="checkbox"
                                        checked={!!r.waived}
                                        disabled={waiving === waiveKey(r)}
                                        onChange={e => toggleWaive(r, e.target.checked)} />
                                      {r.waived && r.waivedBy
                                        ? <span style={{ fontSize: 11, color: '#8a6d1a' }}>{r.waivedBy}</span>
                                        : null}
                                    </label>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  ))}
                  {drillRows.missing.length === 0 && drillRows.done.length === 0 && drillRows.upcoming.length === 0 && drillRows.waived.length === 0 && (
                    <div style={{ padding: 26, textAlign: 'center', color: '#aaa', fontSize: 13.5 }}>
                      No forms are required for this over the selected weeks.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
            Ticking <strong>Not needed</strong> on a form removes it from the totals for good - a day
            somebody was on site but no form was genuinely due. It stays removed whatever dates are
            filtered later, and can be put back from the Not needed list.
          </div>
          <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>“Responsible” is who receives the Monday notification: the Contracts Manager for Pre-Start, and the designated Site Supervisor (or the qualified supervisor allocated on the Gantt) for the other forms.</div>
        </>
      )}
    </OperationsShell>
  )
}

const Card = ({ children, small, onClick, title }) => (
  <div onClick={onClick} title={title}
    style={{
      background: '#fff', border: '1px solid #ececec', borderRadius: 12, padding: 16,
      minWidth: small ? 150 : 210, flex: '0 0 auto',
      cursor: onClick ? 'pointer' : 'default',
      // A card that does something should look like it does. Without this the only
      // way to find out is to click one.
      boxShadow: onClick ? '0 1px 2px rgba(0,0,0,.04)' : 'none',
    }}>
    {children}
    {onClick && <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 6 }}>Click to see the forms</div>}
  </div>
)
const Bar = ({ pct }) => (
  <div style={{ height: 8, background: '#f0efe9', borderRadius: 6, overflow: 'hidden', marginTop: 8 }}>
    <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#16a34a' : (pct >= 50 ? GOLD : '#dc2626') }} />
  </div>
)
const cardNum = { fontSize: 34, fontWeight: 800, color: INK, lineHeight: 1 }
const cardLbl = { fontSize: 12, color: '#888', marginTop: 2 }
const lbl = { fontSize: 11, color: '#888', marginBottom: 3 }
const fInput = { padding: '7px 9px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 12.5 }
