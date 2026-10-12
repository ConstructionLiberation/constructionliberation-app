import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import EstimatingShell, { Heading, ErrorBar, estApi } from '../../components/EstimatingShell'
import { useFormat } from '../../components/TenantProvider'
import { LABOUR_COLUMNS, LABOUR_UNITS, LABOUR_UNIT_LABEL, checkLabour, labourUsable, hourlyRate } from '../../lib/labourRates'
import { CheckPanel, SecBtn, F, saveCsv, readRows, th, td, tdR, inp, btn } from '../../components/LibraryParts'

// ESTIMATING > LABOUR RATES (1086). One rate per labour item - the price per
// m2, m or nr the estimate uses. Where a rate came from goes in Notes, for
// reference only. Plus THE DAY RATE: a setting every estimate starts from.
// Uploads are checked first; nothing changes until Import. Rules:
// lib/labourRates.js. Shared screen parts: components/LibraryParts.js.

const NEEDS = '__needs__'
const ALL = '__all__'
const API = '/api/estimating/labour-rates'

export default function LabourRatesPage() {
  const { money } = useFormat()
  const m2 = (v) => v == null ? '' : money(v, { dp: 2 })
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [section, setSection] = useState(ALL)
  const [q, setQ] = useState('')
  const [check, setCheck] = useState(null)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(null)

  const load = () => estApi(API).then(setData).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])

  const items = data?.items || []
  const sections = data?.index?.sections || []
  const needs = useMemo(() => items.filter(it => !labourUsable(it)), [items])
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length) return items.filter(it => words.every(w => `${it.ref} ${it.description} ${it.notes} ${it.section}`.toLowerCase().includes(w)))
    return section === NEEDS ? needs : section === ALL ? items : items.filter(it => it.section === section)
  }, [items, needs, section, q])

  async function pickFile(file) {
    if (!file) return
    setErr(''); setBusy(true)
    try {
      const rows = await readRows(file, 'Labour rates')
      const d = await estApi(API, { action: 'check', rows, fileName: file.name })
      setCheck({ summary: d.summary, rows, fileName: file.name })
    } catch (e) { setErr(`Could not read that file: ${e.message}`) }
    setBusy(false)
  }
  async function doImport() {
    setBusy(true); setErr('')
    try { await estApi(API, { action: 'import', rows: check.rows, fileName: check.fileName }); setCheck(null); await load() }
    catch (e) { setErr(e.message); if (e.data?.summary) setCheck(c => ({ ...c, summary: e.data.summary })) }
    setBusy(false)
  }
  const exact = (v) => typeof v === 'number' ? String(v) : (v ?? '')
  const downloadCsv = () => saveCsv([LABOUR_COLUMNS.map(([, l]) => l), ...items.map(it => LABOUR_COLUMNS.map(([k]) => exact(it[k])))], `Labour-rates-${new Date().toISOString().slice(0, 10)}.csv`)
  const downloadBlank = () => saveCsv([LABOUR_COLUMNS.map(([, l]) => l)], 'Labour-rates-template.csv')
  function downloadExcel() {
    const ws = XLSX.utils.aoa_to_sheet([LABOUR_COLUMNS.map(([, l]) => l), ...items.map(it => LABOUR_COLUMNS.map(([k]) => it[k] ?? ''))])
    ws['!cols'] = [10, 34, 56, 11, 8, 12, 50].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Labour rates')
    XLSX.writeFile(wb, `Labour-rates-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const idx = data?.index
  return (
    <EstimatingShell active="labour-rates" title="Labour Rates" wide>
      <Heading title="Labour Rates"
        sub={idx ? `${idx.count.toLocaleString()} labour items in ${sections.length} sections · updated ${new Date(idx.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${idx.updatedBy ? ` by ${idx.updatedBy}` : ''}${idx.source ? ` · from ${idx.source}` : ''}` : 'No labour rates yet'}
        action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {items.length > 0 && <button onClick={downloadCsv} style={btn}>Download CSV</button>}
          {items.length > 0 && <button onClick={downloadExcel} style={btn}>Download Excel</button>}
          <button onClick={downloadBlank} style={btn}>Blank template (CSV)</button>
          {items.length > 0 && <button onClick={() => setEdit({ item: { ref: '', section: section !== ALL && section !== NEEDS ? section : '', description: '', rate: '', unit: '', rateDate: '', notes: '' }, originalRef: null })} style={btn}>+ Add item</button>}
          <label style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Working…' : 'Upload labour rates'}
            <input type="file" accept=".xlsx,.xls,.xlsm,.csv" disabled={busy} style={{ display: 'none' }} onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>} />
      <ErrorBar error={err} onClose={() => setErr('')} />

      {data && <DayRate settings={data.settings} money={money} onSaved={load} />}
      {check && <CheckPanel s={check.summary} fileName={check.fileName} busy={busy} m4={m2} onImport={doImport} onCancel={() => setCheck(null)} noun="labour items" />}

      {!data ? <div style={{ color: '#aaa', padding: 30 }}>Loading…</div> : !items.length ? (
        <div style={{ background: '#fff', border: '1px dashed #d4d4d0', borderRadius: 12, padding: 32, textAlign: 'center', color: '#666', fontSize: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a19', marginBottom: 6 }}>No labour rates yet</div>
          Upload your labour-rates file (Excel or CSV). It is checked first - nothing changes until you press Import.
          <div style={{ marginTop: 6 }}>No file yet? <button onClick={downloadBlank} style={{ border: 'none', background: 'none', color: '#0f766e', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: 0, textDecoration: 'underline' }}>Download the blank template (CSV)</button> - one row per labour item.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 8, maxHeight: '75vh', overflowY: 'auto', position: 'sticky', top: 12 }}>
            <SecBtn on={section === ALL} onClick={() => setSection(ALL)} label="All labour items" n={items.length} />
            <SecBtn on={section === NEEDS} onClick={() => setSection(NEEDS)} label="Needs attention" n={needs.length} warn />
            <div style={{ borderTop: '1px solid #f0efec', margin: '6px 0' }} />
            {sections.map(s => <SecBtn key={s.name} on={section === s.name} onClick={() => setSection(s.name)} label={s.name} n={s.count} />)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search description, notes or Ref…" style={{ flex: 1, fontSize: 13.5, padding: '9px 12px', border: '1px solid #d4d4d0', borderRadius: 8, fontFamily: 'inherit' }} />
              <span style={{ fontSize: 12.5, color: '#888', whiteSpace: 'nowrap' }}>{shown.length.toLocaleString()} shown</span>
            </div>
            {section === NEEDS && <div style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>No usable rate yet - a rate or a unit is missing (or the rate is 0). They cannot be priced in a build-up until completed.</div>}
            <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, overflow: 'auto', maxHeight: '72vh' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
                <thead><tr>{['Ref', 'Description', 'Rate', 'Unit', 'Rate date', 'Notes'].map((h, i) => <th key={h} style={{ ...th, textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {shown.slice(0, 400).map(it => (
                    <tr key={it.ref} onClick={() => setEdit({ item: { ...it }, originalRef: it.ref })} style={{ cursor: 'pointer', background: labourUsable(it) ? undefined : '#fffbeb' }}>
                      <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{it.ref}</td>
                      <td style={{ ...td, minWidth: 280 }}>{it.description}{(section === ALL || q.trim()) && <div style={{ fontSize: 11, color: '#aaa' }}>{it.section}</div>}</td>
                      <td style={{ ...tdR, fontWeight: 600 }}>{it.rate != null ? m2(it.rate) : <span style={{ color: '#d97706' }}>none</span>}</td>
                      <td style={td}>{it.unit ? `per ${LABOUR_UNIT_LABEL[it.unit]}` : <span style={{ color: '#d97706' }}>—</span>}</td>
                      <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{it.rateDate ? it.rateDate.split('-').reverse().join('/') : ''}</td>
                      <td style={{ ...td, color: '#666' }}>{it.notes}</td>
                    </tr>
                  ))}
                  {!shown.length && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 26 }}>Nothing matches.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {edit && <LabourEditor edit={edit} sections={sections.map(s => s.name)} m2={m2} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await load() }} />}
    </EstimatingShell>
  )
}

// THE DAY RATE - a setting, not an item. Never filled in for a company.
function DayRate({ settings, money, onSaved }) {
  const [editing, setEditing] = useState(!settings)
  const [f, setF] = useState({ dayRate: settings?.dayRate ?? '', hoursPerDay: settings?.hoursPerDay ?? 8 })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const hr = hourlyRate({ dayRate: Number(f.dayRate), hoursPerDay: Number(f.hoursPerDay) })
  async function save() {
    setBusy(true); setErr('')
    try { await estApi(API, { action: 'settings', dayRate: f.dayRate, hoursPerDay: f.hoursPerDay }); setEditing(false); await onSaved() } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const box = { background: settings ? '#f0fdfa' : '#fffbeb', border: `1px solid ${settings ? '#99f6e4' : '#fde68a'}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }
  if (!editing && settings) return (
    <div style={box}>
      <div style={{ fontSize: 14 }}><strong>Day rate {money(settings.dayRate, { dp: 2 })}</strong> · {settings.hoursPerDay} hours a day → <strong>{money(hourlyRate(settings), { dp: 2 })} an hour</strong></div>
      <div style={{ fontSize: 12, color: '#888', flex: 1 }}>Every estimate starts from this and can change it.{settings.updatedBy ? ` Set by ${settings.updatedBy}` : ''}{settings.updatedAt ? `, ${new Date(settings.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.</div>
      <button onClick={() => setEditing(true)} style={btn}>Change</button>
    </div>
  )
  return (
    <div style={box}>
      <div style={{ fontSize: 14, fontWeight: 600, color: settings ? '#1a1a19' : '#92400e' }}>{settings ? 'Change the day rate' : 'Day rate - not set yet'}</div>
      <label style={{ fontSize: 12, color: '#666' }}>Day rate <input value={f.dayRate} onChange={e => setF({ ...f, dayRate: e.target.value })} inputMode="decimal" style={{ ...inp, width: 110, display: 'inline-block', marginLeft: 6 }} /></label>
      <label style={{ fontSize: 12, color: '#666' }}>Hours a day <input value={f.hoursPerDay} onChange={e => setF({ ...f, hoursPerDay: e.target.value })} inputMode="decimal" style={{ ...inp, width: 70, display: 'inline-block', marginLeft: 6 }} /></label>
      <span style={{ fontSize: 13, color: '#555' }}>{hr ? `→ ${money(hr, { dp: 2 })} an hour` : ''}</span>
      <div style={{ flex: 1 }} />
      {err && <span style={{ color: '#b42318', fontSize: 12.5 }}>{err}</span>}
      {settings && <button onClick={() => { setEditing(false); setF({ dayRate: settings.dayRate, hoursPerDay: settings.hoursPerDay }) }} style={btn}>Cancel</button>}
      <button onClick={save} disabled={busy} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  )
}

function LabourEditor({ edit, sections, m2, onClose, onSaved }) {
  const [it, setIt] = useState(edit.item)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const preview = checkLabour(it)
  const set = (k) => (e) => setIt({ ...it, [k]: e.target.value })
  async function save() {
    setBusy(true); setErr('')
    try { await estApi(API, { action: 'save', item: it, originalRef: edit.originalRef }); await onSaved() } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  async function del() {
    if (!window.confirm(`Delete ${edit.originalRef} "${edit.item.description}"?`)) return
    setBusy(true); setErr('')
    try { await estApi(API, { action: 'delete', ref: edit.originalRef }); await onSaved() } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '90vh', overflow: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{edit.originalRef ? `Edit ${edit.originalRef}` : 'Add labour item'}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <F label="Ref"><input value={it.ref} onChange={set('ref')} style={inp} /></F>
          <F label="Section" span={3}><input list="lr-sections" value={it.section} onChange={set('section')} style={inp} /><datalist id="lr-sections">{sections.map(s => <option key={s} value={s} />)}</datalist></F>
          <F label="Description" span={4}><input value={it.description} onChange={set('description')} style={inp} /></F>
          <F label="Rate"><input value={it.rate ?? ''} onChange={set('rate')} inputMode="decimal" style={inp} /></F>
          <F label="Unit"><select value={it.unit || ''} onChange={set('unit')} style={inp}><option value="">—</option>{LABOUR_UNITS.map(u => <option key={u} value={u}>per {LABOUR_UNIT_LABEL[u]}</option>)}</select></F>
          <F label="Rate date" span={2}><input type="date" value={it.rateDate || ''} onChange={set('rateDate')} style={inp} /></F>
          <F label="Notes - where the rate came from (reference only)" span={4}><input value={it.notes || ''} onChange={set('notes')} style={inp} /></F>
        </div>
        <div style={{ marginTop: 14, background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, padding: '10px 12px', fontSize: 13.5 }}>
          {labourUsable(preview.item) ? <>Rate: <strong>{m2(preview.item.rate)} per {LABOUR_UNIT_LABEL[preview.item.unit]}</strong></> : <span style={{ color: '#92400e' }}>No usable rate yet - needs a rate above 0 and a unit.</span>}
          {preview.errors.length > 0 && <div style={{ color: '#b42318', marginTop: 4 }}>{preview.errors.join(' · ')}</div>}
        </div>
        {err && <div style={{ color: '#b42318', fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <div>{edit.originalRef && <button onClick={del} disabled={busy} style={{ ...btn, color: '#b42318', borderColor: '#f5c2c2' }}>Delete</button>}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btn}>Cancel</button>
            <button onClick={save} disabled={busy || preview.errors.length > 0} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', opacity: busy || preview.errors.length ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
