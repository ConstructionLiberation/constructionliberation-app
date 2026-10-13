import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import EstimatingShell, { Heading, ErrorBar, estApi } from '../../components/EstimatingShell'
import { useFormat } from '../../components/TenantProvider'
import { COLUMNS, BASE_UNITS, UNIT_LABEL, checkProduct, usableRate, withRates } from '../../lib/priceList'
import { pctText } from '../../lib/priceAdjust'
import { CheckPanel, SecBtn, F, saveCsv, readRows, th, td, tdR, inp, btn } from '../../components/LibraryParts'

// ESTIMATING > PRICE LIST (1083).
// Every product works back to a rate per base unit (m2, m, nr, l, kg) - and,
// where a coverage is given, a rate per m2. Upload the price-list file (the
// converter's output, or a download from here, edited); it is CHECKED first and
// nothing changes until you press Import. Rules: lib/priceList.js.

const NEEDS = '__needs__'
const ALL = '__all__'

export default function PriceListPage() {
  const { money } = useFormat()
  // Prices and rates to 2 decimal places (1108) - the exact figure is still used in every calculation.
  const m4 = (v) => v == null ? '' : money(v, { dp: 2 })
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [section, setSection] = useState(ALL)
  const [q, setQ] = useState('')
  const [check, setCheck] = useState(null)      // { summary, rows, fileName }
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(null)        // { product, originalRef }
  const [adjusting, setAdjusting] = useState(false)

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
      const rows = await readRows(file, 'Price list')   // shared: CSV read as text (1085/1086)
      const d = await estApi('/api/estimating/price-list', { action: 'check', rows, fileName: file.name })
      setCheck({ summary: d.summary, rows, fileName: file.name })
    } catch (e) { setErr(`Could not read that file: ${e.message}`) }
    setBusy(false)
  }
  async function doImport() {
    setBusy(true); setErr('')
    try {
      await estApi('/api/estimating/price-list', { action: 'import', rows: check.rows, fileName: check.fileName, keepAdjustments: check.keep || [] })
      setCheck(null); await load()
    } catch (e) { setErr(e.message); if (e.data?.summary) setCheck(c => ({ ...c, summary: e.data.summary })) }
    setBusy(false)
  }
  // CSV (1085). Rates are written as VALUES - a CSV cannot hold formulas. On
  // upload the rate columns are ignored and worked out again, so they can never
  // disagree with the price and quantity. A byte-order mark makes Excel read
  // the file as UTF-8 (the £ and ² survive).
  // Downloads give the supplier's LIST prices - increases and discounts stay in
  // the app (1094), so a file sent round again never has them twice.
  const listProducts = () => products.map(p => withRates({ ...p, price: p.basePrice ?? p.price }))
  function downloadCsv() {
    const round = (v, dp) => v == null ? '' : +Number(v).toFixed(dp)
    // Inputs at FULL precision, as text: a CSV writer shortens long numbers
    // (a girth quantity of 34.0909...) and the re-uploaded rate would drift.
    const exact = (v) => typeof v === 'number' ? String(v) : (v ?? '')
    saveCsv([COLUMNS.map(([, l]) => l), ...listProducts().map(p => COLUMNS.map(([k]) =>
      k === 'rate' ? round(p.rate, 4) : k === 'rateM2' ? round(p.rateM2, 4) : exact(p[k])))],
      `Price-list-${new Date().toISOString().slice(0, 10)}.csv`)
  }
  function downloadBlank() {
    saveCsv([COLUMNS.map(([, l]) => l)], 'Price-list-template.csv')
  }

  function download() {
    const head = COLUMNS.map(([, label]) => label)
    const body = listProducts().map((p, i) => {
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
          {products.length > 0 && <button onClick={downloadCsv} style={btn} title="The price list with all its rates, as CSV">Download CSV</button>}
          {products.length > 0 && <button onClick={() => setAdjusting(true)} style={btn} title="A supplier's price increase or discount, on all their products">Increase / discount</button>}
          {products.length > 0 && <button onClick={download} style={btn} title="The price list as an Excel file, rates as formulas">Download Excel</button>}
          <button onClick={downloadBlank} style={btn} title="Just the column headings, to fill in and upload">Blank template (CSV)</button>
          {products.length > 0 && <button onClick={() => setEdit({ product: { ref: '', section: section !== ALL && section !== NEEDS ? section : '', description: '', supplier: '', code: '', price: '', sellingUnit: '', qty: '', baseUnit: '', coverage: '', priceDate: '', notes: '' }, originalRef: null })} style={btn}>+ Add product</button>}
          <label style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Working…' : 'Upload price list'}
            <input type="file" accept=".xlsx,.xls,.xlsm,.csv" disabled={busy} style={{ display: 'none' }} onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>} />
      <ErrorBar error={err} onClose={() => setErr('')} />
      {(data?.adjustments || []).length > 0 && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
          {data.adjustments.map(a => (
            <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '2px 0' }}>
              <span>Rates include <strong>{pctText(a.pct)}</strong> {a.pct < 0 ? 'discount' : 'increase'} for <strong>{a.supplier}</strong> from {a.from ? a.from.split('-').reverse().join('/') : '—'}{a.note ? ` - ${a.note}` : ''}</span>
              <button onClick={async () => { if (!window.confirm(`Remove the ${pctText(a.pct)} for ${a.supplier}? Its products go back to the list price.`)) return; try { await estApi('/api/estimating/price-list', { action: 'unadjust', id: a.id }); await load() } catch (e) { setErr(e.message) } }} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12.5 }}>Remove</button>
            </div>
          ))}
        </div>
      )}
      {adjusting && <AdjustDialog suppliers={[...new Set(products.map(p => p.supplier).filter(Boolean))].sort()} onClose={() => setAdjusting(false)} onDone={async () => { setAdjusting(false); await load() }} />}

      {check && (check.summary.adjustmentsInFile || []).length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 10, fontSize: 13 }}>
          <strong>Price increases / discounts in force for suppliers in this file.</strong> Keep applying them on top of the new prices? Untick any the new list already includes, or it is counted twice.
          {check.summary.adjustmentsInFile.map(a => (
            <label key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={(check.keep || []).includes(a.id)} onChange={e => setCheck(c => ({ ...c, keep: e.target.checked ? [...(c.keep || []), a.id] : (c.keep || []).filter(x => x !== a.id) }))} />
              Keep {pctText(a.pct)} for {a.supplier} (from {a.from ? a.from.split('-').reverse().join('/') : '—'}{a.note ? ` - ${a.note}` : ''})
            </label>
          ))}
        </div>
      )}
      {check && <CheckPanel s={check.summary} fileName={check.fileName} busy={busy} m4={m4} onImport={doImport} onCancel={() => setCheck(null)} />}

      {!data ? <div style={{ color: '#aaa', padding: 30 }}>Loading…</div> : !products.length ? (
        <div style={{ background: '#fff', border: '1px dashed #d4d4d0', borderRadius: 12, padding: 32, textAlign: 'center', color: '#666', fontSize: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a19', marginBottom: 6 }}>No price list yet</div>
          Upload your price-list file (Excel or CSV). It is checked first - nothing changes until you press Import.
          <div style={{ marginTop: 6 }}>No file yet? <button onClick={downloadBlank} style={{ border: 'none', background: 'none', color: '#0f766e', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: 0, textDecoration: 'underline' }}>Download the blank template (CSV)</button> - one row per product.</div>
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
                      <tr key={p.ref} onClick={() => setEdit({ product: { ...p, price: p.basePrice ?? p.price }, originalRef: p.ref, adjusted: p.adjusted })} style={{ cursor: 'pointer', background: ok ? undefined : '#fffbeb' }}>
                        <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{p.ref}</td>
                        <td style={{ ...td, minWidth: 260 }}>{p.description}{(section === ALL || q.trim()) && <div style={{ fontSize: 11, color: '#aaa' }}>{p.section}</div>}</td>
                        <td style={td}>{p.supplier}</td>
                        <td style={{ ...td, color: '#666' }}>{p.code}</td>
                        <td style={tdR} title={p.adjusted && p.adjusted !== 1 ? `List price ${m4(p.basePrice)}` : ''}>{p.price != null ? m4(p.price) : <span style={{ color: '#d97706' }}>none</span>}{p.adjusted && p.adjusted !== 1 && <div style={{ fontSize: 10.5, color: '#2563eb' }}>{pctText(p.adjusted - 1)} on {m4(p.basePrice)}</div>}</td>
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
          <F label={edit.adjusted && edit.adjusted !== 1 ? `Supplier LIST price (${pctText(edit.adjusted - 1)} applied on top)` : 'Supplier price'}><input value={p.price ?? ''} onChange={set('price')} inputMode="decimal" style={inp} /></F>
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


// INCREASE / DISCOUNT (1094): one or more suppliers, a %, a date, a note.
function AdjustDialog({ suppliers, onClose, onDone }) {
  const [picked, setPicked] = useState([])
  const [pct, setPct] = useState('')
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  async function save() {
    setErr('')
    try { await estApi('/api/estimating/price-list', { action: 'adjust', suppliers: picked, pct: parseFloat(pct) / 100, from, note }); await onDone() } catch (e) { setErr(e.message) }
  }
  const shown = suppliers.filter(s => s.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Supplier increase or discount</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        <div style={{ fontSize: 12.5, color: '#666', marginBottom: 10 }}>Applied to every product from the supplier, on top of their list price - kept underneath, so it can be removed exactly. Several on one supplier compound.</div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a supplier…" style={{ ...inp, marginBottom: 6 }} />
        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8, padding: 6, marginBottom: 10 }}>
          {shown.map(s => <label key={s} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '3px 2px', cursor: 'pointer' }}><input type="checkbox" checked={picked.includes(s)} onChange={e => setPicked(p => e.target.checked ? [...p, s] : p.filter(x => x !== s))} />{s}</label>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <F label="% (minus for a discount)"><input value={pct} onChange={e => setPct(e.target.value)} placeholder="e.g. 10 or -5" inputMode="decimal" style={inp} /></F>
          <F label="From"><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp} /></F>
          <F label="Note (e.g. supplier's letter)" span={2}><input value={note} onChange={e => setNote(e.target.value)} style={inp} /></F>
        </div>
        {err && <div style={{ color: '#b42318', fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={btn}>Cancel</button>
          <button onClick={save} disabled={!picked.length || !pct} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', opacity: !picked.length || !pct ? 0.5 : 1 }}>Apply to {picked.length || 0} supplier{picked.length === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  )
}
