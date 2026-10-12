import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import EstimatingShell, { Heading, ErrorBar, estApi } from '../../components/EstimatingShell'
import { useFormat } from '../../components/TenantProvider'
import { COLUMNS, BASE_UNITS, UNIT_LABEL, checkProduct, usableRate } from '../../lib/priceList'

// ESTIMATING > PRICE LIST (1083).
// Every product works back to a rate per base unit (m2, m, nr, l, kg) - and,
// where a coverage is given, a rate per m2. Upload the price-list file (the
// converter's output, or a download from here, edited); it is CHECKED first and
// nothing changes until you press Import. Rules: lib/priceList.js.

const NEEDS = '__needs__'
const ALL = '__all__'

export default function PriceListPage() {
  const { money } = useFormat()
  const m4 = (v) => v == null ? '' : money(v, { dp: v < 1 ? 4 : 2 })
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [section, setSection] = useState(ALL)
  const [q, setQ] = useState('')
  const [check, setCheck] = useState(null)      // { summary, rows, fileName }
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(null)        // { product, originalRef }

  const load = () => estApi('/api/estimating/price-list').then(setData).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])

  const products = data?.products || []
  const sections = data?.index?.sections || []
  const needs = useMemo(() => products.filter(p => !usableRate(p)), [products])
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    // A search looks through EVERY product, whichever section is open - the
    // section list is for browsing, the search box for finding.
    if (words.length) return products.filter(p => words.every(w => `${p.ref} ${p.description} ${p.supplier} ${p.code} ${p.section}`.toLowerCase().includes(w)))
    return section === NEEDS ? needs : section === ALL ? products : products.filter(p => p.section === section)
  }, [products, needs, section, q])

  async function pickFile(file) {
    if (!file) return
    setErr(''); setBusy(true)
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const sheet = wb.Sheets['Price list'] || wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })
      const d = await estApi('/api/estimating/price-list', { action: 'check', rows, fileName: file.name })
      setCheck({ summary: d.summary, rows, fileName: file.name })
    } catch (e) { setErr(`Could not read that file: ${e.message}`) }
    setBusy(false)
  }
  async function doImport() {
    setBusy(true); setErr('')
    try {
      await estApi('/api/estimating/price-list', { action: 'import', rows: check.rows, fileName: check.fileName })
      setCheck(null); await load()
    } catch (e) { setErr(e.message); if (e.data?.summary) setCheck(c => ({ ...c, summary: e.data.summary })) }
    setBusy(false)
  }
  function download() {
    const head = COLUMNS.map(([, label]) => label)
    const body = products.map((p, i) => {
      const r = i + 2
      return COLUMNS.map(([k]) => {
        if (k === 'rate') return { t: 'n', f: `IF(AND(ISNUMBER(F${r}),ISNUMBER(H${r}),H${r}>0),F${r}/H${r},"")` }
        if (k === 'rateM2') return { t: 'n', f: `IF(AND(ISNUMBER(J${r}),ISNUMBER(K${r}),K${r}>0),J${r}/K${r},"")` }
        return p[k] ?? ''
      })
    })
    const ws = XLSX.utils.aoa_to_sheet([head, ...body])
    ws['!cols'] = [10, 26, 52, 16, 16, 13, 16, 12, 9, 13, 14, 14, 12, 40].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Price list')
    XLSX.writeFile(wb, `Price-list-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const idx = data?.index
  return (
    <EstimatingShell active="price-list" title="Price List" wide>
      <Heading title="Price List"
        sub={idx ? `${idx.count.toLocaleString()} products in ${sections.length} sections · updated ${new Date(idx.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${idx.updatedBy ? ` by ${idx.updatedBy}` : ''}${idx.source ? ` · from ${idx.source}` : ''}` : 'No price list yet'}
        action={<div style={{ display: 'flex', gap: 8 }}>
          {products.length > 0 && <button onClick={download} style={btn}>Download</button>}
          {products.length > 0 && <button onClick={() => setEdit({ product: { ref: '', section: section !== ALL && section !== NEEDS ? section : '', description: '', supplier: '', code: '', price: '', sellingUnit: '', qty: '', baseUnit: '', coverage: '', priceDate: '', notes: '' }, originalRef: null })} style={btn}>+ Add product</button>}
          <label style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Working…' : 'Upload price list'}
            <input type="file" accept=".xlsx,.xls,.xlsm,.csv" disabled={busy} style={{ display: 'none' }} onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>} />
      <ErrorBar error={err} onClose={() => setErr('')} />

      {check && <CheckPanel s={check.summary} fileName={check.fileName} busy={busy} m4={m4} onImport={doImport} onCancel={() => setCheck(null)} />}

      {!data ? <div style={{ color: '#aaa', padding: 30 }}>Loading…</div> : !products.length ? (
        <div style={{ background: '#fff', border: '1px dashed #d4d4d0', borderRadius: 12, padding: 32, textAlign: 'center', color: '#666', fontSize: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a19', marginBottom: 6 }}>No price list yet</div>
          Upload your price-list file. It is checked first - nothing changes until you press Import.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 8, maxHeight: '75vh', overflowY: 'auto', position: 'sticky', top: 12 }}>
            <SecBtn on={section === ALL} onClick={() => setSection(ALL)} label="All products" n={products.length} />
            <SecBtn on={section === NEEDS} onClick={() => setSection(NEEDS)} label="Needs attention" n={needs.length} warn />
            <div style={{ borderTop: '1px solid #f0efec', margin: '6px 0' }} />
            {sections.map(s => <SecBtn key={s.name} on={section === s.name} onClick={() => setSection(s.name)} label={s.name} n={s.count} />)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search description, supplier, code or Ref…" style={{ flex: 1, fontSize: 13.5, padding: '9px 12px', border: '1px solid #d4d4d0', borderRadius: 8, fontFamily: 'inherit' }} />
              <span style={{ fontSize: 12.5, color: '#888', whiteSpace: 'nowrap' }}>{shown.length.toLocaleString()} shown</span>
            </div>
            {section === NEEDS && <div style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>No usable rate yet - a price, a quantity per selling unit or a base unit is missing. They cannot be priced in a build-up until completed.</div>}
            <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, overflow: 'auto', maxHeight: '72vh' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
                <thead><tr>{['Ref', 'Description', 'Supplier', 'Code', 'Price', 'Sold as', 'Qty', 'Unit', 'Rate', 'Coverage', 'Rate / m²', 'Price date'].map((h, i) => <th key={h} style={{ ...th, textAlign: i >= 4 && i !== 5 && i !== 7 && i !== 11 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {shown.slice(0, 400).map(p => {
                    const ok = usableRate(p)
                    return (
                      <tr key={p.ref} onClick={() => setEdit({ product: { ...p }, originalRef: p.ref })} style={{ cursor: 'pointer', background: ok ? undefined : '#fffbeb' }}>
                        <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{p.ref}</td>
                        <td style={{ ...td, minWidth: 260 }}>{p.description}{(section === ALL || q.trim()) && <div style={{ fontSize: 11, color: '#aaa' }}>{p.section}</div>}</td>
                        <td style={td}>{p.supplier}</td>
                        <td style={{ ...td, color: '#666' }}>{p.code}</td>
                        <td style={tdR}>{p.price != null ? m4(p.price) : <span style={{ color: '#d97706' }}>none</span>}</td>
                        <td style={{ ...td, color: '#666' }}>{p.sellingUnit}</td>
                        <td style={tdR}>{p.qty ?? <span style={{ color: '#d97706' }}>—</span>}</td>
                        <td style={td}>{p.baseUnit ? UNIT_LABEL[p.baseUnit] : <span style={{ color: '#d97706' }}>—</span>}</td>
                        <td style={{ ...tdR, fontWeight: 600 }}>{p.rate != null ? `${m4(p.rate)}/${UNIT_LABEL[p.baseUnit] || '?'}` : ''}</td>
                        <td style={tdR}>{p.coverage ? `${+p.coverage.toFixed(3)} m²/${UNIT_LABEL[p.baseUnit] || '?'}` : ''}</td>
                        <td style={{ ...tdR, fontWeight: 600, color: '#0f766e' }}>{p.rateM2 != null ? m4(p.rateM2) : ''}</td>
                        <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{p.priceDate ? p.priceDate.split('-').reverse().join('/') : ''}</td>
                      </tr>
                    )
                  })}
                  {!shown.length && <tr><td colSpan={12} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 26 }}>Nothing matches.</td></tr>}
                </tbody>
              </table>
            </div>
            {shown.length > 400 && <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>Showing the first 400 - pick a section or search to narrow it.</div>}
          </div>
        </div>
      )}

      {edit && <ProductEditor edit={edit} sections={sections.map(s => s.name)} m4={m4} onClose={() => setEdit(null)}
        onSaved={async () => { setEdit(null); await load() }} />}
    </EstimatingShell>
  )
}

function CheckPanel({ s, fileName, busy, m4, onImport, onCancel }) {
  const [showWarn, setShowWarn] = useState(false)
  const warnKinds = {}
  for (const w of s.warnings) { const k = w.msg.replace(/'.*$/, '').replace(/ - .*$/, ''); warnKinds[k] = (warnKinds[k] || 0) + 1 }
  const blocked = s.errors.length > 0
  return (
    <div style={{ background: '#fff', border: `2px solid ${blocked ? '#f5c2c2' : '#99f6e4'}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{blocked ? 'This file cannot be imported yet' : 'Ready to import'} <span style={{ fontWeight: 400, color: '#888', fontSize: 13 }}>· {fileName}</span></div>
          <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
            {s.products.toLocaleString()} products in {s.sections} sections · <strong>{s.added}</strong> new · <strong>{s.changed}</strong> changed · <strong style={{ color: s.removed ? '#b42318' : undefined }}>{s.removed}</strong> removed
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={btn}>Cancel</button>
          <button onClick={onImport} disabled={blocked || busy} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', opacity: blocked || busy ? 0.45 : 1 }}>Import</button>
        </div>
      </div>
      {blocked && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#b42318', marginBottom: 4 }}>{s.errors.length} error{s.errors.length === 1 ? '' : 's'} - fix these in the file and upload it again:</div>
          <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 12.5 }}>
            {s.errors.slice(0, 200).map((e, i) => <div key={i} style={{ padding: '2px 0' }}>Row {e.row}{e.ref ? ` (${e.ref})` : ''}: {e.msg}</div>)}
          </div>
        </div>
      )}
      {s.warnings.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: '#92400e' }}>
          {s.warnings.length} warning{s.warnings.length === 1 ? '' : 's'} (these import, and show under Needs attention): {Object.entries(warnKinds).map(([k, n]) => `${n} × ${k.toLowerCase()}`).join(' · ')}
          {' '}<button onClick={() => setShowWarn(v => !v)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12.5, padding: 0 }}>{showWarn ? 'Hide' : 'Show'}</button>
          {showWarn && <div style={{ maxHeight: 180, overflow: 'auto', marginTop: 4, color: '#555' }}>{s.warnings.slice(0, 400).map((w, i) => <div key={i}>Row {w.row}{w.ref ? ` (${w.ref})` : ''}: {w.msg}</div>)}</div>}
        </div>
      )}
      {s.removed > 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: '#b42318' }}>Removed - in the current list but not in this file: {s.removedRefs.join(' · ')}{s.removed > s.removedRefs.length ? ` … and ${s.removed - s.removedRefs.length} more` : ''}</div>}
      {s.priceChanged.length > 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: '#555' }}>Rates changing: {s.priceChanged.slice(0, 12).map(c => `${c.ref} ${c.from != null ? m4(c.from) : '—'} → ${c.to != null ? m4(c.to) : '—'}`).join(' · ')}{s.priceChanged.length > 12 ? ` … and ${s.priceChanged.length - 12} more` : ''}</div>}
    </div>
  )
}

function ProductEditor({ edit, sections, m4, onClose, onSaved }) {
  const [p, setP] = useState(edit.product)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const preview = checkProduct(p)
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value })
  async function save() {
    setBusy(true); setErr('')
    try { await estApi('/api/estimating/price-list', { action: 'save', product: p, originalRef: edit.originalRef }); await onSaved() } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  async function del() {
    if (!window.confirm(`Delete ${edit.originalRef} "${edit.product.description}" from the price list?`)) return
    setBusy(true); setErr('')
    try { await estApi('/api/estimating/price-list', { action: 'delete', ref: edit.originalRef }); await onSaved() } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const r = preview.product
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 760, maxHeight: '90vh', overflow: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{edit.originalRef ? `Edit ${edit.originalRef}` : 'Add product'}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <F label="Ref"><input value={p.ref} onChange={set('ref')} style={inp} /></F>
          <F label="Section" span={3}><input list="pl-sections" value={p.section} onChange={set('section')} style={inp} /><datalist id="pl-sections">{sections.map(s => <option key={s} value={s} />)}</datalist></F>
          <F label="Description" span={4}><input value={p.description} onChange={set('description')} style={inp} /></F>
          <F label="Supplier" span={2}><input value={p.supplier} onChange={set('supplier')} style={inp} /></F>
          <F label="Supplier code" span={2}><input value={p.code} onChange={set('code')} style={inp} /></F>
          <F label="Supplier price"><input value={p.price ?? ''} onChange={set('price')} inputMode="decimal" style={inp} /></F>
          <F label="Sold as (e.g. roll 21 m²)"><input value={p.sellingUnit} onChange={set('sellingUnit')} style={inp} /></F>
          <F label="Qty per selling unit"><input value={p.qty ?? ''} onChange={set('qty')} inputMode="decimal" style={inp} /></F>
          <F label="Base unit"><select value={p.baseUnit || ''} onChange={set('baseUnit')} style={inp}><option value="">—</option>{BASE_UNITS.map(u => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</select></F>
          <F label="Coverage (m² per base unit)"><input value={p.coverage ?? ''} onChange={set('coverage')} inputMode="decimal" placeholder="optional" style={inp} /></F>
          <F label="Price date"><input type="date" value={p.priceDate || ''} onChange={set('priceDate')} style={inp} /></F>
          <F label="Notes" span={2}><input value={p.notes || ''} onChange={set('notes')} style={inp} /></F>
        </div>
        <div style={{ marginTop: 14, background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, padding: '10px 12px', fontSize: 13.5 }}>
          {r.rate != null ? <>Rate: <strong>{m4(r.rate)} per {UNIT_LABEL[r.baseUnit] || '?'}</strong>{r.rateM2 != null && <> · by coverage <strong style={{ color: '#0f766e' }}>{m4(r.rateM2)} per m²</strong></>}</> : <span style={{ color: '#92400e' }}>No rate yet - needs a price, a quantity per selling unit and a base unit.</span>}
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

const F = ({ label, span = 1, children }) => <label style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#666' }}>{label}{children}</label>
const SecBtn = ({ on, onClick, label, n, warn }) => (
  <button onClick={onClick} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%', textAlign: 'left', border: 'none', borderRadius: 7, padding: '7px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, background: on ? '#1a1a19' : 'transparent', color: on ? '#fff' : warn && n ? '#92400e' : '#333' }}>
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span><span style={{ opacity: 0.6 }}>{n}</span>
  </button>
)
const th = { padding: '9px 10px', fontSize: 11.5, fontWeight: 600, color: '#666', background: '#faf9f7', borderBottom: '1px solid #ecebe6', position: 'sticky', top: 0, whiteSpace: 'nowrap' }
const td = { padding: '7px 10px', borderBottom: '1px solid #f4f3f0', verticalAlign: 'top' }
const tdR = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }
const inp = { width: '100%', boxSizing: 'border-box', fontSize: 13.5, padding: '8px 9px', border: '1px solid #d4d4d0', borderRadius: 7, fontFamily: 'inherit' }
const btn = { fontSize: 13, padding: '8px 14px', border: '1px solid #d4d4d0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', display: 'inline-block' }
