import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import EstimatingShell, { Heading, ErrorBar, estApi } from '../../components/EstimatingShell'
import { useFormat } from '../../components/TenantProvider'
import { CheckPanel, SecBtn, th, td, tdR, inp, btn } from '../../components/LibraryParts'
import BuildupEditor, { NumBox } from '../../components/BuildupEditor'
import DocumentsPanel from '../../components/DocumentsPanel'
import { LINE_TYPES, BU_UNITS, BU_UNIT_LABEL, COST_CATEGORIES, LINE_COLUMNS, SIZE_COLUMNS, RULE_COLUMNS, DESC_COLUMNS, varText, varsText, rateFor, evalQty, qtyProblem, normalizeTemplate, variableLibrary } from '../../lib/buildups'

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
    // categories added on their own, with no build-ups yet (1116)
    for (const c of data?.categories || []) if (![...m.keys()].some(k => k.toLowerCase() === c.toLowerCase())) m.set(c, 0)
    return [...m.entries()].sort((a, b) => a[0] === NOCAT ? -1 : b[0] === NOCAT ? 1 : a[0].localeCompare(b[0]))
  }, [templates, data])
  // Build-ups NOT IN USE are left out unless "Show hidden" is on (1137).
  const [showHidden, setShowHidden] = useState(false)
  const [useMenu, setUseMenu] = useState(false)
  const visible = useMemo(() => showHidden ? templates : templates.filter(t => !t.hidden), [templates, showHidden])
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length) return visible.filter(t => words.every(w => `${t.section} ${t.description}`.toLowerCase().includes(w)))
    return cat == null ? [] : visible.filter(t => (t.section || NOCAT) === cat)
  }, [visible, cat, q])
  async function setInUse(refs, inUse) {
    setData(d => ({ ...d, templates: d.templates.map(t => refs.includes(t.ref) ? { ...t, hidden: !inUse || undefined } : t) }))
    try { await estApi(API, { action: 'set-hidden', refs, hidden: !inUse }) } catch (e) { setErr(e.message); await load() }
  }

  async function pickFile(file) {
    if (!file) return
    setErr(''); setBusy(true)
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const sh = (n) => wb.Sheets[n] ? XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) : []
      const sheets = { lines: sh('Build-ups'), sizes: sh('Sizes'), rules: sh('Product rules'), descriptions: sh('Descriptions') }
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
  function workbook(listIn) {
    const list = (listIn || []).map(normalizeTemplate)   // written cleaned - comments cleared (1102)
    const wb = XLSX.utils.book_new()
    const add = (name, cols, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cols.map(([, l]) => l), ...rows]), name)
    // Every setting a line has goes out - an own item's rate, Apply size, in the
    // description, variable cells (1098) - so a download uploads back unchanged.
    add('Build-ups', LINE_COLUMNS, list.flatMap(t => t.lines.map(l => [t.section, t.description, t.unit, l.id.replace(/^L/, ''), l.type, l.label, (l.offers || []).join(';'), l.default || '', l.amount ?? '', l.qty || '', l.waste ?? '', l.increase ?? '', l.cost || '', l.comment || '', l.override ?? '', l.applySize === true ? 'yes' : (Array.isArray(l.applySize) ? l.applySize.join(' + ') : (l.applySize || '')), l.inDescription ? 'yes' : '', varText(l), l.ownName || ''])))
    add('Sizes', SIZE_COLUMNS, list.flatMap(t => (t.sizes || []).map(z => [t.section, t.description, z.name, z.value ?? '', z.comment || '', z.required ? 'yes' : ''])))
    add('Product rules', RULE_COLUMNS, [])   // product rules are gone (1098) - waste lives on each line
    add('Descriptions', DESC_COLUMNS, list.filter(t => (t.descText || '').trim() || (t.descVars || []).length || t.profit != null).map(t => [t.section, t.description, t.descText || '', varsText(t.descVars), t.profit ?? '']))
    return wb
  }
  const download = () => XLSX.writeFile(workbook(templates), `Build-ups-${new Date().toISOString().slice(0, 10)}.xlsx`)
  const downloadBlank = () => XLSX.writeFile(workbook([]), 'Build-ups-template.xlsx')

  const [varsOpen, setVarsOpen] = useState(false)   // the variables manager (1127)
  const [newCat, setNewCat] = useState(null)       // the "+ New category" box (1116)
  async function addCategory(name, quiet) {
    const n = String(name || '').trim()
    if (!n) return
    try { await estApi(API, { action: 'add-category', name: n }); if (!quiet) { setNewCat(null); setCat(n); setQ('') } await load() }
    catch (e) { if (!quiet) setErr(e.message) }
  }
  // Move a build-up up or down within its category (1125): shown at once, saved
  // straight away; every list (and the take-off picker) follows the saved order.
  async function moveBuildup(i, dir) {
    const j = i + dir
    if (j < 0 || j >= shown.length) return
    const refs = shown.map(t => t.ref); [refs[i], refs[j]] = [refs[j], refs[i]]
    setData(d => { const pos = new Map(refs.map((r, k) => [r, k])); const inCat = d.templates.filter(t => pos.has(t.ref)).sort((a, b) => pos.get(a.ref) - pos.get(b.ref)); let n = 0; return { ...d, templates: d.templates.map(t => pos.has(t.ref) ? inCat[n++] : t) } })
    try { await estApi(API, { action: 'reorder', category: cat === NOCAT ? '' : cat, refs }) } catch (e) { setErr(e.message); await load() }
  }
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
          {templates.length > 0 && <button onClick={() => setVarsOpen(true)} disabled={!!edit} style={{ ...btn, opacity: edit ? 0.5 : 1 }} title={edit ? 'Close the open build-up first' : 'Edit the description variables used across every build-up'}>Variables</button>}
          {templates.length > 0 && <button onClick={() => setEdit({ t: { section: cat && cat !== NOCAT ? cat : '', description: '', unit: 'm2', sizes: [], lines: [], rules: [] }, originalRef: null })} style={btn}>+ New build-up</button>}
          <label style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', cursor: busy || noLib ? 'default' : 'pointer', opacity: busy || noLib ? 0.5 : 1 }} title={noLib ? 'Upload the price list and labour rates first' : ''}>
            {busy ? 'Working…' : 'Upload build-ups'}
            <input type="file" accept=".xlsx,.xls,.xlsm" disabled={busy || noLib} style={{ display: 'none' }} onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>} />
      <ErrorBar error={err} onClose={() => setErr('')} />
      {varsOpen && <VariablesManager templates={templates} onClose={() => setVarsOpen(false)} onDone={async () => { await load() }} />}
      {noLib && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>Upload the {!lib.products.length ? 'price list' : 'labour rates'} first - every build-up line is checked against it, and rates are worked out from it.</div>}
      {check && <CheckPanel s={check.summary} fileName={check.fileName} busy={busy} m4={m2} onImport={doImport} onCancel={() => setCheck(null)} noun="build-ups" />}

      {!data ? <div style={{ color: '#aaa', padding: 30 }}>Loading…</div> : !templates.length ? (
        <div style={{ background: '#fff', border: '1px dashed #d4d4d0', borderRadius: 12, padding: 32, textAlign: 'center', color: '#666', fontSize: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a19', marginBottom: 6 }}>No build-ups yet</div>
          Upload your build-ups file (three sheets: Build-ups, Sizes, Product rules). It is checked first - nothing changes until you press Import.
          <div style={{ marginTop: 6 }}><button onClick={downloadBlank} style={{ border: 'none', background: 'none', color: '#0f766e', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: 0, textDecoration: 'underline' }}>Download the blank template</button></div>
        </div>
      ) : (
        // A build-up OPEN takes the full width (1105) - its lines fit on screen;
        // "All build-ups" brings the two lists back.
        <div style={{ display: 'grid', gridTemplateColumns: edit ? '1fr' : '250px 300px 1fr', gap: 14, alignItems: 'start' }}>
          {!edit && <>
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
            {/* + NEW CATEGORY (1116) - saved straight away; shows with 0 until build-ups are added */}
            {newCat == null
              ? <button onClick={() => setNewCat('')} style={{ ...btn, width: '100%', marginTop: 8, fontSize: 12.5, color: '#0f766e', borderColor: '#99f6e4' }}>+ New category</button>
              : <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input autoFocus value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="New category name" onKeyDown={e => { if (e.key === 'Enter') addCategory(newCat); if (e.key === 'Escape') setNewCat(null) }} style={{ ...inp, padding: '6px 8px', fontSize: 13 }} />
                  <button onClick={() => addCategory(newCat)} disabled={!newCat.trim()} style={{ ...btn, fontSize: 12.5, padding: '6px 10px', opacity: newCat.trim() ? 1 : 0.5 }}>Add</button>
                  <button onClick={() => setNewCat(null)} style={{ ...iconBtn }} title="Cancel">✕</button>
                </div>}
          </div>
          <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 8, maxHeight: '78vh', overflowY: 'auto' }}>
            {!shown.length && <div style={{ color: '#aaa', fontSize: 13, padding: 12 }}>{q ? 'Nothing matches.' : cat == null ? 'Pick a category.' : `No build-ups in ${cat === NOCAT ? 'No category' : cat} yet - + New build-up adds one here.`}</div>}
            {cat != null && !q && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, padding: '0 2px 6px', position: 'relative' }}>
                {templates.some(t => t.hidden && (t.section || NOCAT) === cat) && !showHidden && <span style={{ fontSize: 11, color: '#999' }}>{templates.filter(t => t.hidden && (t.section || NOCAT) === cat).length} hidden</span>}
                <button onClick={() => setUseMenu(v => !v)} title="Which build-ups are in use - hide the ones that are not" style={{ ...iconBtn, fontSize: 13, padding: '2px 6px', border: '1px solid #e8e7e3', borderRadius: 6 }}>⚙</button>
                {useMenu && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 40, width: 280, maxHeight: '60vh', overflowY: 'auto', background: '#fff', border: '1px solid #d4d4d0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>In use - {cat === NOCAT ? 'No category' : cat}</div>
                    <div style={{ fontSize: 11.5, color: '#888', marginBottom: 6 }}>Untick to hide a build-up from the lists and the take-off. Nothing is deleted.</div>
                    {templates.filter(t => (t.section || NOCAT) === cat).map(t => (
                      <label key={t.ref} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5, padding: '3px 0', cursor: 'pointer', color: t.hidden ? '#999' : '#1a1a19' }}>
                        <input type="checkbox" checked={!t.hidden} onChange={e => setInUse([t.ref], e.target.checked)} /> {t.description}
                      </label>
                    ))}
                    <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12, padding: '6px 0 0', marginTop: 6, borderTop: '1px solid #f0efec', cursor: 'pointer' }}>
                      <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} /> Show hidden build-ups in the list
                    </label>
                  </div>
                )}
              </div>
            )}
            {shown.map((t, i) => (
              <div key={t.ref} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* REORDER (1125) - within the category; hidden while searching */}
              {!q && cat != null && <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <button onClick={() => moveBuildup(i, -1)} disabled={i === 0} title="Move up" style={{ ...iconBtn, padding: '0 3px', fontSize: 11, opacity: i === 0 ? 0.25 : 1 }}>↑</button>
                <button onClick={() => moveBuildup(i, 1)} disabled={i === shown.length - 1} title="Move down" style={{ ...iconBtn, padding: '0 3px', fontSize: 11, opacity: i === shown.length - 1 ? 0.25 : 1 }}>↓</button>
              </div>}
              <button onClick={() => setEdit({ t: (() => { const c = JSON.parse(JSON.stringify(t)); delete c.hidden; return c })(), originalRef: t.ref })}
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 7, padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit', background: edit?.originalRef === t.ref ? '#f0fdfa' : 'transparent' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.hidden ? '#aaa' : '#1a1a19' }}>{t.description}{t.hidden && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: '#888', background: '#f0efec', borderRadius: 8, padding: '1px 6px' }}>hidden</span>}</div>
                <div style={{ fontSize: 11.5, color: '#999' }}>{q ? `${t.section || 'No category'} · ` : ''}{t.unit ? `per ${BU_UNIT_LABEL[t.unit]}` : 'no unit'} · {t.lines.filter(l => l.type !== 'comment').length} lines</div>
              </button>
              </div>
            ))}
          </div>
          </>}
          <div style={{ minWidth: 0 }}>
            {edit && <button onClick={() => setEdit(null)} style={{ border: 'none', background: 'none', color: '#0f766e', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '0 0 8px', fontFamily: 'inherit' }}>← All build-ups{edit.t?.section ? ` · ${edit.t.section}` : ''}</button>}
            {edit ? <Editor key={edit.key || edit.originalRef || 'new'} edit={edit} lib={lib} money={money} varLibrary={variableLibrary(templates)} categories={cats.map(c => c[0]).filter(c => c !== NOCAT)}
              onAddCategory={(n) => addCategory(n, true)}
              onCopy={(t) => {
                // COPY (1115): a new, unsaved build-up - everything copied, named
                // "(copy)" (or "(copy 2)"...) in the same category. Saved as NEW.
                const taken = new Set(templates.filter(x => (x.section || '') === (t.section || '')).map(x => x.description.toLowerCase()))
                const base = `${t.description} (copy`
                let name = `${base})`, n = 2
                while (taken.has(name.toLowerCase())) name = `${base} ${n++})`
                const copy = JSON.parse(JSON.stringify(t)); delete copy.ref
                setEdit({ t: { ...copy, description: name }, originalRef: null, copiedFrom: t.description, key: `copy-${Date.now()}` })
              }}
              onClose={() => setEdit(null)} onSaved={async (t) => { await load(); setCat(t.section || NOCAT); setEdit({ t: JSON.parse(JSON.stringify(t)), originalRef: t.ref }) }}
              onDeleted={async () => { setEdit(null); await load() }} />
              : <div style={{ color: '#aaa', fontSize: 13, padding: 20 }}>Open a build-up to see and edit it.</div>}
          </div>
        </div>
      )}
    </EstimatingShell>
  )
}

function Editor({ edit, lib, money, categories, onClose, onSaved, onDeleted, onCopy, onAddCategory, varLibrary }) {
  const [t, setT] = useState(edit.t)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (patch) => setT(x => ({ ...x, ...patch }))
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
      {edit.copiedFrom && <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>A copy of <strong>{edit.copiedFrom}</strong> - not saved yet. Rename it if you like, change what you need, then <strong>Save</strong>; it is saved as a new build-up and {edit.copiedFrom} is not changed.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 0.8fr 0.8fr', gap: 10, marginBottom: 12 }}>
        <label style={lbl}>Build-up name<input value={t.description} onChange={e => set({ description: e.target.value })} style={inp} /></label>
        {/* Not a <label>: a click inside a label also "clicks" its first button - the box - which closed the dropdown (1116) */}
        <div style={lbl}>Category<CategoryPicker value={t.section || ''} options={categories} onChange={v => set({ section: v })} onAdd={onAddCategory} /></div>
        {/* This build-up's own profit % (1119) - blank = the quote's. Set, it takes priority on every quote it is used on. */}
        <label style={lbl}>Profit % <span style={{ fontSize: 10.5, color: '#999' }}>blank = the quote's</span><NumBox pct value={t.profit ?? null} onChange={v => set({ profit: v ?? undefined })} placeholder="quote's" style={{ ...inp, borderColor: t.profit != null ? '#f59e0b' : undefined }} title="Set it and this build-up is priced at this profit % on every quote it is used on - it takes priority over the quote's profit %" /></label>
        <label style={lbl}>Unit<select value={t.unit || ''} onChange={e => set({ unit: e.target.value })} style={inp}><option value="">—</option>{BU_UNITS.map(u => <option key={u} value={u}>per {BU_UNIT_LABEL[u]}</option>)}</select></label>
      </div>
      {!t.section && <div style={warnBox}>No category - this build-up is listed under No category until it has one.</div>}

      {/* "Try the rate" is gone (1123): the summary shows the rate by supplier and
          cost category, at this build-up's own profit % - no quote settings. */}
      <BuildupEditor value={t} onChange={setT} lib={lib} money={money} varLibrary={varLibrary} summary
        rateOpts={{ profit: t.profit ?? 0, mcd: 0, labourFactor: 1 }} />

      {edit.originalRef && <div style={{ marginTop: 12 }}><DocumentsPanel ownerType="buildup" ownerId={edit.originalRef} title="Documents on this build-up" /></div>}
      {err && <div style={{ color: '#b42318', fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {edit.originalRef && <button onClick={del} style={{ ...btn, color: '#b42318', borderColor: '#f5c2c2' }}>Delete</button>}
          {onCopy && (t.description || '').trim() && <button onClick={() => onCopy(t)} style={btn} title="Open a copy of this build-up - saved as a new one; this one is not changed">Copy</button>}
        </div>
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

// THE CATEGORY DROPDOWN (1116) - drawn like the other boxes (same font, border,
// width), every category listed (type to filter), and "+ Add new category…".
function CategoryPicker({ value, options, onChange, onAdd }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(null)
  const box = useRef(null)
  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) { setOpen(false); setAdding(null); setQ('') } }
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close)
  }, [])
  const list = [...new Set(options)].sort((a, b) => a.localeCompare(b)).filter(c => c.toLowerCase().includes(q.trim().toLowerCase()))
  const pick = (v) => { onChange(v); setOpen(false); setQ(''); setAdding(null) }
  const add = () => { const n = (adding || '').trim(); if (!n) return; if (onAdd) onAdd(n); pick(n) }
  const row = { padding: '8px 9px', fontSize: 13.5, cursor: 'pointer', borderBottom: '1px solid #f4f3f0', textAlign: 'left', width: '100%', border: 'none', background: 'none', fontFamily: 'inherit', display: 'block' }
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ ...inp, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', cursor: 'pointer', textAlign: 'left', color: value ? '#1a1a19' : '#999' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || 'No category'}</span><span style={{ color: '#888', fontSize: 11, marginLeft: 8 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 40, left: 0, right: 0, top: '100%', marginTop: 3, background: '#fff', border: '1px solid #d4d4d0', borderRadius: 7, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
          <div style={{ padding: 6, borderBottom: '1px solid #f0efec' }}><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Find a category…" style={{ ...inp, padding: '6px 8px', fontSize: 13 }} /></div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            <button type="button" onClick={() => pick('')} style={{ ...row, color: '#888', background: !value ? '#f0fdfa' : 'none' }}>No category</button>
            {list.map(c => <button type="button" key={c} onClick={() => pick(c)} style={{ ...row, background: c === value ? '#f0fdfa' : 'none', fontWeight: c === value ? 600 : 400 }}>{c}</button>)}
            {!list.length && q && <div style={{ ...row, color: '#aaa', cursor: 'default' }}>No category matches</div>}
          </div>
          <div style={{ borderTop: '1px solid #e8e7e3', padding: 6 }}>
            {adding == null
              ? <button type="button" onClick={() => setAdding(q.trim())} style={{ ...row, color: '#0f766e', fontWeight: 600, borderBottom: 'none', padding: '6px 4px' }}>+ Add new category…</button>
              : <div style={{ display: 'flex', gap: 6 }}>
                  <input autoFocus value={adding} onChange={e => setAdding(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } if (e.key === 'Escape') setAdding(null) }} placeholder="New category name" style={{ ...inp, padding: '6px 8px', fontSize: 13 }} />
                  <button type="button" onClick={add} disabled={!adding.trim()} style={{ ...btn, padding: '6px 10px', fontSize: 12.5, opacity: adding.trim() ? 1 : 0.5 }}>Add</button>
                </div>}
          </div>
        </div>
      )}
    </div>
  )
}

// THE VARIABLES MANAGER (1127): every description variable used across the
// build-ups - rename it, change its options, or delete it - for EVERY build-up
// using it at once.
function VariablesManager({ templates, onClose, onDone }) {
  const lib = variableLibrary(templates)
  const uses = (name) => templates.filter(t => (t.descVars || []).some(v => v.name.toLowerCase() === name.toLowerCase())).length
  const [sel, setSel] = useState(lib[0]?.name || null)
  const cur = lib.find(v => v.name === sel)
  const [name, setName] = useState(cur?.name || '')
  const [opts, setOpts] = useState((cur?.options || []).join('\n'))
  const [msg, setMsg] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const pick = (v) => { setSel(v.name); setName(v.name); setOpts((v.options || []).join('\n')); setMsg(''); setErr('') }
  async function save() {
    setBusy(true); setErr(''); setMsg('')
    try {
      const d = await estApi(API, { action: 'edit-variable', from: sel, to: name.trim(), options: opts.split('\n') })
      await onDone(); setSel(name.trim()); setMsg(`Saved - ${d.changed} build-up${d.changed === 1 ? '' : 's'} updated.`)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  async function del() {
    if (!window.confirm(`Delete "${sel}" from all ${uses(sel)} build-up${uses(sel) === 1 ? '' : 's'} using it? It is removed from their descriptions too.`)) return
    setBusy(true); setErr('')
    try { const d = await estApi(API, { action: 'delete-variable', name: sel }); await onDone(); setMsg(`Deleted from ${d.changed} build-up${d.changed === 1 ? '' : 's'}.`); setSel(null) } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 760, maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <strong style={{ fontSize: 16 }}>Description variables</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        <div style={{ fontSize: 12.5, color: '#666', marginBottom: 12 }}>Changes apply to every build-up using the variable. Quotes already priced keep their own copies.</div>
        {!lib.length ? <div style={{ color: '#999', fontSize: 13 }}>No variables yet - add one with Insert variable in a build-up's description.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, minHeight: 0, flex: 1 }}>
            <div style={{ overflowY: 'auto', borderRight: '1px solid #f0efec', paddingRight: 8 }}>
              {lib.map(v => (
                <button key={v.name} onClick={() => pick(v)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 7, padding: '7px 9px', marginBottom: 2, cursor: 'pointer', fontFamily: 'inherit', background: v.name === sel ? '#f0fdfa' : 'transparent' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: v.name === sel ? '#0f766e' : '#1a1a19' }}>{v.name}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{(v.options || []).length ? `${v.options.length} options` : 'typed value'} · {uses(v.name)} build-up{uses(v.name) === 1 ? '' : 's'}</div>
                </button>
              ))}
            </div>
            {cur ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: 12, color: '#666' }}>Name<input value={name} onChange={e => setName(e.target.value)} style={{ ...inp, marginTop: 3 }} /></label>
                <label style={{ fontSize: 12, color: '#666' }}>Options to choose from - one per line (none = a typed value)
                  <textarea value={opts} onChange={e => setOpts(e.target.value)} rows={10} style={{ ...inp, marginTop: 3, fontFamily: 'inherit', resize: 'vertical' }} /></label>
                {err && <div style={{ color: '#b42318', fontSize: 12.5 }}>{err}</div>}
                {msg && <div style={{ color: '#15803d', fontSize: 12.5 }}>{msg}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button onClick={del} disabled={busy} style={{ ...btn, color: '#b42318', borderColor: '#f5c2c2' }}>Delete</button>
                  <button onClick={save} disabled={busy || !name.trim()} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', opacity: busy || !name.trim() ? 0.5 : 1 }}>Save - {uses(sel)} build-up{uses(sel) === 1 ? '' : 's'}</button>
                </div>
              </div>
            ) : <div style={{ color: '#999', fontSize: 13 }}>{msg || 'Pick a variable.'}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
