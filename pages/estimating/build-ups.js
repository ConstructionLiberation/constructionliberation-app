import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import EstimatingShell, { Heading, ErrorBar, estApi } from '../../components/EstimatingShell'
import { useFormat } from '../../components/TenantProvider'
import { CheckPanel, SecBtn, th, td, tdR, inp, btn } from '../../components/LibraryParts'
import { LINE_TYPES, BU_UNITS, BU_UNIT_LABEL, COST_CATEGORIES, LINE_COLUMNS, SIZE_COLUMNS, RULE_COLUMNS, rateFor, evalQty, qtyProblem } from '../../lib/buildups'

// ESTIMATING > RATE BUILD-UPS (1087). Categories down the left; a build-up
// opens in the editor: name, category, unit, sizes, lines (products picked from
// each line's own list - or any product, added to it), waste and price
// increase per product, rates changed from the library shown with Revert,
// product rules, and the rate worked out live. Save overrides the template;
// Save as new keeps the original. Rules and the rate: lib/buildups.js.

const API = '/api/estimating/build-ups'
const NOCAT = '__nocat__'
const pct = (v) => v == null ? '' : +(v * 100).toFixed(4)
const fromPct = (s) => { if (s === '' || s == null) return null; const n = parseFloat(s); return Number.isNaN(n) ? NaN : n / 100 }

export default function BuildUpsPage() {
  const { money } = useFormat()
  const m2 = (v) => v == null ? '—' : money(v, { dp: 2 })
  const [data, setData] = useState(null)
  const [lib, setLib] = useState({ product: {}, labour: {}, products: [], labourItems: [] })
  const [err, setErr] = useState('')
  const [cat, setCat] = useState(null)
  const [q, setQ] = useState('')
  const [check, setCheck] = useState(null)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(null)       // { t, originalRef }

  async function load() {
    try {
      const [b, p, l] = await Promise.all([estApi(API), estApi('/api/estimating/price-list'), estApi('/api/estimating/labour-rates')])
      setData(b)
      setLib({ product: Object.fromEntries(p.products.map(x => [x.ref, x])), labour: Object.fromEntries(l.items.map(x => [x.ref, x])), products: p.products, labourItems: l.items })
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  const templates = data?.templates || []
  const cats = useMemo(() => {
    const m = new Map()
    for (const t of templates) m.set(t.section || NOCAT, (m.get(t.section || NOCAT) || 0) + 1)
    return [...m.entries()].sort((a, b) => a[0] === NOCAT ? -1 : b[0] === NOCAT ? 1 : a[0].localeCompare(b[0]))
  }, [templates])
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length) return templates.filter(t => words.every(w => `${t.section} ${t.description}`.toLowerCase().includes(w)))
    return cat == null ? [] : templates.filter(t => (t.section || NOCAT) === cat)
  }, [templates, cat, q])

  async function pickFile(file) {
    if (!file) return
    setErr(''); setBusy(true)
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const sh = (n) => wb.Sheets[n] ? XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) : []
      const sheets = { lines: sh('Build-ups'), sizes: sh('Sizes'), rules: sh('Product rules') }
      const d = await estApi(API, { action: 'check', sheets, fileName: file.name })
      setCheck({ summary: d.summary, sheets, fileName: file.name })
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  async function doImport() {
    setBusy(true); setErr('')
    try { await estApi(API, { action: 'import', sheets: check.sheets, fileName: check.fileName }); setCheck(null); await load() }
    catch (e) { setErr(e.message); if (e.data?.summary) setCheck(c => ({ ...c, summary: e.data.summary })) }
    setBusy(false)
  }
  function workbook(list) {
    const wb = XLSX.utils.book_new()
    const add = (name, cols, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cols.map(([, l]) => l), ...rows]), name)
    add('Build-ups', LINE_COLUMNS, list.flatMap(t => t.lines.map(l => [t.section, t.description, t.unit, l.id.replace(/^L/, ''), l.type, l.label, (l.offers || []).join(';'), l.default || '', l.amount ?? '', l.qty || '', l.waste ?? '', l.increase ?? '', l.cost || '', l.comment || ''])))
    add('Sizes', SIZE_COLUMNS, list.flatMap(t => (t.sizes || []).map(z => [t.section, t.description, z.name, z.value ?? '', z.comment || ''])))
    add('Product rules', RULE_COLUMNS, list.flatMap(t => (t.rules || []).map(r => [t.section, t.description, (t.lines.find(l => l.id === r.line) || {}).label || r.line, r.ref, r.waste])))
    return wb
  }
  const download = () => XLSX.writeFile(workbook(templates), `Build-ups-${new Date().toISOString().slice(0, 10)}.xlsx`)
  const downloadBlank = () => XLSX.writeFile(workbook([]), 'Build-ups-template.xlsx')

  async function catAction(kind, name) {
    const label = name === NOCAT ? '' : name
    if (kind === 'rename') {
      const to = window.prompt(`Rename the category "${label}" to:`, label)
      if (to == null || !to.trim() || to.trim() === label) return
      try { await estApi(API, { action: 'rename-category', from: label, to: to.trim() }); setCat(to.trim()); await load() } catch (e) { setErr(e.message) }
    } else {
      if (!window.confirm(`Delete the category "${label}"? Its build-ups stay, under No category.`)) return
      try { await estApi(API, { action: 'delete-category', name: label }); setCat(NOCAT); await load() } catch (e) { setErr(e.message) }
    }
  }

  const idx = data?.index
  const noLib = data && (!lib.products.length || !lib.labourItems.length)
  return (
    <EstimatingShell active="build-ups" title="Rate Build-ups" wide>
      <Heading title="Rate Build-ups"
        sub={idx ? `${idx.count} build-ups in ${cats.filter(c => c[0] !== NOCAT).length} categories · updated ${new Date(idx.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${idx.updatedBy ? ` by ${idx.updatedBy}` : ''}` : 'No build-ups yet'}
        action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {templates.length > 0 && <button onClick={download} style={btn}>Download</button>}
          <button onClick={downloadBlank} style={btn}>Blank template</button>
          {templates.length > 0 && <button onClick={() => setEdit({ t: { section: cat && cat !== NOCAT ? cat : '', description: '', unit: 'm2', sizes: [], lines: [], rules: [] }, originalRef: null })} style={btn}>+ New build-up</button>}
          <label style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', cursor: busy || noLib ? 'default' : 'pointer', opacity: busy || noLib ? 0.5 : 1 }} title={noLib ? 'Upload the price list and labour rates first' : ''}>
            {busy ? 'Working…' : 'Upload build-ups'}
            <input type="file" accept=".xlsx,.xls,.xlsm" disabled={busy || noLib} style={{ display: 'none' }} onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>} />
      <ErrorBar error={err} onClose={() => setErr('')} />
      {noLib && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>Upload the {!lib.products.length ? 'price list' : 'labour rates'} first - every build-up line is checked against it, and rates are worked out from it.</div>}
      {check && <CheckPanel s={check.summary} fileName={check.fileName} busy={busy} m4={m2} onImport={doImport} onCancel={() => setCheck(null)} noun="build-ups" />}

      {!data ? <div style={{ color: '#aaa', padding: 30 }}>Loading…</div> : !templates.length ? (
        <div style={{ background: '#fff', border: '1px dashed #d4d4d0', borderRadius: 12, padding: 32, textAlign: 'center', color: '#666', fontSize: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a19', marginBottom: 6 }}>No build-ups yet</div>
          Upload your build-ups file (three sheets: Build-ups, Sizes, Product rules). It is checked first - nothing changes until you press Import.
          <div style={{ marginTop: 6 }}><button onClick={downloadBlank} style={{ border: 'none', background: 'none', color: '#0f766e', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: 0, textDecoration: 'underline' }}>Download the blank template</button></div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '250px 300px 1fr', gap: 14, alignItems: 'start' }}>
          <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 8, maxHeight: '78vh', overflowY: 'auto', position: 'sticky', top: 12 }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search build-ups…" style={{ ...inp, marginBottom: 8 }} />
            {cats.map(([name, n]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}><SecBtn on={cat === name && !q} onClick={() => { setCat(name); setQ('') }} label={name === NOCAT ? 'No category' : name} n={n} warn={name === NOCAT} /></div>
                {name !== NOCAT && cat === name && !q && <>
                  <button title="Rename category" onClick={() => catAction('rename', name)} style={iconBtn}>✎</button>
                  <button title="Delete category" onClick={() => catAction('delete', name)} style={iconBtn}>✕</button>
                </>}
              </div>
            ))}
          </div>
          <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 8, maxHeight: '78vh', overflowY: 'auto' }}>
            {!shown.length && <div style={{ color: '#aaa', fontSize: 13, padding: 12 }}>{q ? 'Nothing matches.' : 'Pick a category.'}</div>}
            {shown.map(t => (
              <button key={t.ref} onClick={() => setEdit({ t: JSON.parse(JSON.stringify(t)), originalRef: t.ref })}
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 7, padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit', background: edit?.originalRef === t.ref ? '#f0fdfa' : 'transparent' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a19' }}>{t.description}</div>
                <div style={{ fontSize: 11.5, color: '#999' }}>{q ? `${t.section || 'No category'} · ` : ''}{t.unit ? `per ${BU_UNIT_LABEL[t.unit]}` : 'no unit'} · {t.lines.filter(l => l.type !== 'comment').length} lines</div>
              </button>
            ))}
          </div>
          <div style={{ minWidth: 0 }}>
            {edit ? <Editor key={edit.originalRef || 'new'} edit={edit} lib={lib} money={money} categories={cats.map(c => c[0]).filter(c => c !== NOCAT)}
              onClose={() => setEdit(null)} onSaved={async (t) => { await load(); setCat(t.section || NOCAT); setEdit({ t: JSON.parse(JSON.stringify(t)), originalRef: t.ref }) }}
              onDeleted={async () => { setEdit(null); await load() }} />
              : <div style={{ color: '#aaa', fontSize: 13, padding: 20 }}>Open a build-up to see and edit it.</div>}
          </div>
        </div>
      )}
    </EstimatingShell>
  )
}

function Editor({ edit, lib, money, categories, onClose, onSaved, onDeleted }) {
  const [t, setT] = useState(edit.t)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [calc, setCalc] = useState({ profit: '', mcd: '', factor: '1' })
  const [showAll, setShowAll] = useState({})     // lineId -> true: pick from the whole price list / labour rates
  const set = (patch) => setT(x => ({ ...x, ...patch }))
  const setLine = (id, patch) => setT(x => ({ ...x, lines: x.lines.map(l => l.id === id ? { ...l, ...patch } : l) }))
  const move = (i, d) => setT(x => { const ls = [...x.lines]; const j = i + d; if (j < 0 || j >= ls.length) return x; [ls[i], ls[j]] = [ls[j], ls[i]]; return { ...x, lines: ls } })
  const nextId = () => `L${Math.max(0, ...t.lines.map(l => parseInt(String(l.id).replace(/\D/g, ''), 10) || 0)) + 1}`
  const addLine = (type) => setT(x => ({ ...x, lines: [...x.lines, { id: nextId(), type, label: '', offers: [], default: '', amount: null, qty: type === 'comment' ? '' : '1', waste: null, increase: null, cost: type === 'labour' ? 'Labour' : type === 'lump sum' ? 'Delivery' : type === 'comment' ? '' : 'Materials', comment: '' }] }))
  const sizeNames = (t.sizes || []).map(z => z.name)
  const r = rateFor(t, lib, { profit: (parseFloat(calc.profit) || 0) / 100, mcd: (parseFloat(calc.mcd) || 0) / 100, labourFactor: parseFloat(calc.factor) || 1 })
  const lineCost = Object.fromEntries(r.lines.map(x => [x.id, x]))
  const label = (ref, kind) => { const x = kind === 'labour' ? lib.labour[ref] : lib.product[ref]; return x ? `${x.description}${kind === 'labour' ? ` (${money(x.rate, { dp: 2 })}/${x.unit})` : ''}` : `${ref} (not in the ${kind === 'labour' ? 'labour rates' : 'price list'})` }

  async function save(asNew) {
    let tpl = t
    if (asNew) {
      const name = window.prompt('Name for the new build-up:', `${t.description} (copy)`)
      if (!name || !name.trim()) return
      tpl = { ...t, description: name.trim() }
    }
    setBusy(true); setErr('')
    try {
      const d = await estApi(API, { action: 'save', template: tpl, originalRef: asNew ? null : edit.originalRef })
      await onSaved(d.template)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  async function del() {
    if (!window.confirm(`Delete the build-up "${t.description}"?`)) return
    try { await estApi(API, { action: 'delete', ref: edit.originalRef }); await onDeleted() } catch (e) { setErr(e.message) }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 0.8fr', gap: 10, marginBottom: 12 }}>
        <label style={lbl}>Build-up name<input value={t.description} onChange={e => set({ description: e.target.value })} style={inp} /></label>
        <label style={lbl}>Category<input list="bu-cats" value={t.section || ''} onChange={e => set({ section: e.target.value })} placeholder="No category" style={inp} /><datalist id="bu-cats">{categories.map(c => <option key={c} value={c} />)}</datalist></label>
        <label style={lbl}>Unit<select value={t.unit || ''} onChange={e => set({ unit: e.target.value })} style={inp}><option value="">—</option>{BU_UNITS.map(u => <option key={u} value={u}>per {BU_UNIT_LABEL[u]}</option>)}</select></label>
      </div>
      {!t.section && <div style={warnBox}>No category - this build-up is listed under No category until it has one.</div>}

      <Block title="Sizes" hint="Quantities can use these, e.g. Size1*1.1. Rename them (Girth, Height...) - and the quantities that use them.">
        {(t.sizes || []).map((z, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <input value={z.name} onChange={e => {
              const old = z.name, nm = e.target.value
              setT(x => ({ ...x, sizes: x.sizes.map((s, j) => j === i ? { ...s, name: nm } : s),
                lines: x.lines.map(l => ({ ...l, qty: old && l.qty ? l.qty.replace(new RegExp(`\\b${old}\\b`, 'g'), nm) : l.qty })) }))
            }} style={{ ...inp, width: 160 }} />
            <input value={z.value ?? ''} onChange={e => setT(x => ({ ...x, sizes: x.sizes.map((s, j) => j === i ? { ...s, value: e.target.value === '' ? null : parseFloat(e.target.value) } : s) }))} placeholder="value" inputMode="decimal" style={{ ...inp, width: 100 }} />
            <span style={{ fontSize: 11.5, color: '#999', flex: 1 }}>{z.comment}</span>
            <button onClick={() => setT(x => ({ ...x, sizes: x.sizes.filter((_, j) => j !== i) }))} style={iconBtn} title="Remove size">✕</button>
          </div>
        ))}
        <button onClick={() => setT(x => ({ ...x, sizes: [...(x.sizes || []), { name: `Size${(x.sizes || []).length + 1}`, value: null, comment: '' }] }))} style={smallBtn}>+ Size</button>
      </Block>

      <Block title="Lines">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
            <thead><tr>{['', 'Type', 'Label', 'Product / labour / amount', 'Rate', 'Qty', 'Waste %', 'Incr %', 'Cost cat.', 'Line cost', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 9 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {t.lines.map((l, i) => {
                const lc = lineCost[l.id] || {}
                const isProd = l.type === 'material' || l.type === 'labour'
                const choices = showAll[l.id] ? (l.type === 'labour' ? lib.labourItems.map(x => x.ref) : lib.products.map(x => x.ref)) : [...new Set([...(l.offers || []), ...(l.default ? [l.default] : [])])]
                const qp = qtyProblem(l.qty, sizeNames)
                return (
                  <tr key={l.id} style={{ background: l.type === 'comment' ? '#fafaf9' : undefined }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><button onClick={() => move(i, -1)} style={iconBtn} title="Up">↑</button><button onClick={() => move(i, 1)} style={iconBtn} title="Down">↓</button></td>
                    <td style={td}><select value={l.type} onChange={e => setLine(l.id, { type: e.target.value })} style={{ ...cellInp, width: 92 }}>{LINE_TYPES.map(x => <option key={x}>{x}</option>)}</select></td>
                    <td style={td}><input value={l.label} onChange={e => setLine(l.id, { label: e.target.value })} style={{ ...cellInp, width: 140 }} /></td>
                    <td style={{ ...td, minWidth: 260 }}>
                      {isProd && <>
                        <select value={l.default || ''} onChange={e => {
                          const v = e.target.value
                          setLine(l.id, { default: v, override: null, offers: v && !(l.offers || []).includes(v) ? [...(l.offers || []), v] : l.offers })
                        }} style={{ ...cellInp, width: '100%' }}>
                          <option value="">— choose —</option>
                          {choices.map(ref => <option key={ref} value={ref}>{label(ref, l.type)}</option>)}
                        </select>
                        <label style={{ fontSize: 10.5, color: '#888', display: 'flex', gap: 4, marginTop: 2, alignItems: 'center' }}>
                          <input type="checkbox" checked={!!showAll[l.id]} onChange={e => setShowAll(s => ({ ...s, [l.id]: e.target.checked }))} />
                          any {l.type === 'labour' ? 'labour item' : 'product'} ({(l.offers || []).length} on this line's list)
                        </label>
                      </>}
                      {(l.type === 'fixed rate' || l.type === 'lump sum') && <input value={l.amount ?? ''} onChange={e => setLine(l.id, { amount: e.target.value === '' ? null : parseFloat(e.target.value) })} placeholder={l.type === 'lump sum' ? 'amount per job (on the estimate)' : 'amount per unit'} inputMode="decimal" style={{ ...cellInp, width: '100%' }} />}
                      {l.type === 'comment' && <input value={l.comment} onChange={e => setLine(l.id, { comment: e.target.value })} style={{ ...cellInp, width: '100%' }} />}
                      {l.type !== 'comment' && l.comment && <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>{l.comment}</div>}
                    </td>
                    <td style={td}>
                      {isProd && (lc.libRate != null || l.override != null) && <>
                        <input value={l.override ?? ''} onChange={e => setLine(l.id, { override: e.target.value === '' ? null : parseFloat(e.target.value) })} placeholder={lc.libRate != null ? (+lc.libRate.toFixed(4)).toString() : ''} inputMode="decimal" style={{ ...cellInp, width: 70, borderColor: l.override != null ? '#f59e0b' : undefined }} />
                        {l.override != null && <div><span style={{ fontSize: 10, fontWeight: 700, color: '#b45309' }}>CHANGED</span> <button onClick={() => setLine(l.id, { override: null })} style={{ ...iconBtn, fontSize: 10.5, color: '#2563eb' }}>Revert to {l.type === 'labour' ? 'labour rate' : 'price list'}</button></div>}
                      </>}
                    </td>
                    <td style={td}>{l.type !== 'comment' && <input value={l.qty || ''} onChange={e => setLine(l.id, { qty: e.target.value })} placeholder="per job" style={{ ...cellInp, width: 80, borderColor: qp ? '#dc2626' : undefined }} title={qp || (l.qty && sizeNames.length ? `= ${evalQty(l.qty, Object.fromEntries((t.sizes || []).map(z => [z.name, z.value])))}` : '')} />}</td>
                    <td style={td}>{(l.type === 'material' || l.type === 'fixed rate') && <input value={pct(l.waste)} onChange={e => setLine(l.id, { waste: fromPct(e.target.value) })} style={{ ...cellInp, width: 52 }} />}{lc.ruleApplied && <div style={{ fontSize: 10, color: '#0f766e' }}>rule</div>}</td>
                    <td style={td}>{l.type === 'material' && <input value={pct(l.increase)} onChange={e => setLine(l.id, { increase: fromPct(e.target.value) })} style={{ ...cellInp, width: 52 }} />}</td>
                    <td style={td}>{l.type !== 'comment' && <select value={l.cost || ''} onChange={e => setLine(l.id, { cost: e.target.value })} style={{ ...cellInp, width: 98 }}><option value="">—</option>{COST_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>}</td>
                    <td style={{ ...tdR, fontWeight: 600 }}>{lc.cost != null ? money(lc.cost, { dp: 2 }) : ''}</td>
                    <td style={td}><button onClick={() => setT(x => ({ ...x, lines: x.lines.filter(y => y.id !== l.id), rules: (x.rules || []).filter(rr => rr.line !== l.id) }))} style={iconBtn} title="Remove line">✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {LINE_TYPES.map(x => <button key={x} onClick={() => addLine(x)} style={smallBtn}>+ {x}</button>)}
          <button onClick={() => addLine('labour') || setT(x => ({ ...x, lines: x.lines.map((l, i, a) => i === a.length - 1 ? { ...l, label: 'Management', cost: 'Management' } : l) }))} style={smallBtn} title="Management is not in build-ups by default - add it where needed">+ management</button>
        </div>
      </Block>

      <Block title="Product rules" hint="When this product is chosen on this line, its waste is this %.">
        {(t.rules || []).map((rr, i) => {
          const ln = t.lines.find(l => l.id === rr.line)
          return (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <select value={rr.line} onChange={e => setT(x => ({ ...x, rules: x.rules.map((y, j) => j === i ? { ...y, line: e.target.value } : y) }))} style={{ ...inp, width: 170 }}>{t.lines.filter(l => l.type === 'material').map(l => <option key={l.id} value={l.id}>{l.label || l.id}</option>)}</select>
              <select value={rr.ref} onChange={e => setT(x => ({ ...x, rules: x.rules.map((y, j) => j === i ? { ...y, ref: e.target.value } : y) }))} style={{ ...inp, flex: 1 }}>
                <option value="">— product —</option>{(ln?.offers || []).map(ref => <option key={ref} value={ref}>{label(ref, 'material')}</option>)}</select>
              <input value={pct(rr.waste)} onChange={e => setT(x => ({ ...x, rules: x.rules.map((y, j) => j === i ? { ...y, waste: fromPct(e.target.value) } : y) }))} style={{ ...inp, width: 70 }} /><span style={{ fontSize: 12 }}>%</span>
              <button onClick={() => setT(x => ({ ...x, rules: x.rules.filter((_, j) => j !== i) }))} style={iconBtn}>✕</button>
            </div>
          )
        })}
        <button onClick={() => { const first = t.lines.find(l => l.type === 'material'); if (first) setT(x => ({ ...x, rules: [...(x.rules || []), { line: first.id, ref: '', waste: 0 }] })) }} style={smallBtn}>+ Product rule</button>
      </Block>

      <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: 12, marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
          <strong style={{ fontSize: 13 }}>Try the rate</strong>
          <label>Profit % <input value={calc.profit} onChange={e => setCalc({ ...calc, profit: e.target.value })} style={{ ...cellInp, width: 56 }} /></label>
          <label>MCD % <input value={calc.mcd} onChange={e => setCalc({ ...calc, mcd: e.target.value })} style={{ ...cellInp, width: 56 }} /></label>
          <label>Labour factor <input value={calc.factor} onChange={e => setCalc({ ...calc, factor: e.target.value })} style={{ ...cellInp, width: 56 }} /></label>
          <span style={{ color: '#888' }}>(for trying only - an estimate sets its own)</span>
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: 13, flexWrap: 'wrap' }}>
          <span>Materials {money(r.materials + r.fixed, { dp: 2 })}</span><span>Labour {money(r.labour, { dp: 2 })}</span>
          <span>Profit {money(r.profit, { dp: 2 })}</span><span>MCD {money(r.mcd, { dp: 2 })}</span>
          <strong style={{ fontSize: 15, color: '#0f766e' }}>Rate {money(r.rate, { dp: 2 })}{t.unit ? ` per ${BU_UNIT_LABEL[t.unit]}` : ''}</strong>
        </div>
        {r.missing.length > 0 && <div style={{ fontSize: 12, color: '#92400e', marginTop: 6 }}>Not yet in the rate: {r.missing.slice(0, 8).join(' · ')}{r.missing.length > 8 ? ` … and ${r.missing.length - 8} more` : ''}</div>}
      </div>

      {err && <div style={{ color: '#b42318', fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <div>{edit.originalRef && <button onClick={del} style={{ ...btn, color: '#b42318', borderColor: '#f5c2c2' }}>Delete</button>}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={btn}>Close</button>
          {edit.originalRef && <button onClick={() => save(true)} disabled={busy} style={btn}>Save as new template</button>}
          <button onClick={() => save(false)} disabled={busy} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}>{busy ? 'Saving…' : edit.originalRef ? 'Save (override template)' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function Block({ title, hint, children }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a19' }}>{title} {hint && <span style={{ fontWeight: 400, color: '#999', fontSize: 11.5 }}>{hint}</span>}</div>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  )
}
const lbl = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#666' }
const cellInp = { fontSize: 12.5, padding: '5px 6px', border: '1px solid #d4d4d0', borderRadius: 6, fontFamily: 'inherit', boxSizing: 'border-box' }
const iconBtn = { border: 'none', background: 'none', cursor: 'pointer', color: '#888', fontSize: 13, padding: '2px 4px', fontFamily: 'inherit' }
const smallBtn = { fontSize: 12, padding: '5px 10px', border: '1px solid #d4d4d0', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }
const warnBox = { fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 10px', marginBottom: 8 }
