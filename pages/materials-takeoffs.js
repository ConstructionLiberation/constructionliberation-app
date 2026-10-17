import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import { useFormat } from '../components/TenantProvider'
import CommercialNav from '../components/CommercialNav'
import ProjectSearchSelect from '../components/ProjectSearchSelect'
import MaterialsTab from '../components/MaterialsTab'
import BuildupEditor from '../components/BuildupEditor'
import { BU_UNIT_LABEL } from '../lib/buildups'
import { withMaterialRates } from '../lib/estimate'

// COMMERCIAL > MATERIALS TAKE-OFFS (1226) - the job's take-off, copied from the won
// estimate's issued revision and re-measured for construction; the quote is never
// touched. The Build-up editor and the Materials tab are the Estimating take-off's own,
// working on the job's copy - so the packs and suppliers come out exactly as there.
const INK = '#1a1a19'
const card = { background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', marginBottom: 14 }
const th = { textAlign: 'left', padding: '7px 8px', fontSize: 12, color: '#666', fontWeight: 600, borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }
const td = { padding: '6px 8px', fontSize: 13, borderBottom: '1px solid #f4f3f0', verticalAlign: 'top' }
const btn = { fontSize: 13, padding: '6px 12px', border: '1px solid #d4d4d0', background: '#fff', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }
const primary = { ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', fontWeight: 600 }
const call = async (body, q = '') => { const r = await fetch(`/api/job-takeoffs${q}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Something went wrong'); return d }
const same = (a, b) => (a == null || a === '' ? null : Number(a)) === (b == null || b === '' ? null : Number(b))

export default function MaterialsTakeoffs() {
  const { companyName, money } = useFormat()
  const [projects, setProjects] = useState(null)
  const [projectId, setProjectId] = useState('')
  const [data, setData] = useState(null)        // { takeoff, fromEstimate, lib }
  const [tk, setTk] = useState(null)            // the take-off being edited
  const [saved, setSaved] = useState('')        // JSON of the take-off as saved
  const [tab, setTab] = useState('takeoff')
  const [editing, setEditing] = useState(null)  // row id whose build-up is open
  const [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const [drafts, setDrafts] = useState(null)   // the result of Create draft POs (1229)
  useEffect(() => { call(null, '?projects=1').then(d => setProjects(d.projects || [])).catch(e => setErr(e.message)) }, [])
  async function pick(pid) {
    setProjectId(pid); setData(null); setTk(null); setErr(''); setMsg(''); setEditing(null); setTab('takeoff')
    if (!pid) return
    try { const d = await call(null, `?projectId=${encodeURIComponent(pid)}`); setData(d); setTk(d.takeoff); setSaved(JSON.stringify(d.takeoff)) } catch (e) { setErr(e.message) }
  }
  async function start() {
    setBusy(true); setErr('')
    try { const d = await call({ action: 'start', projectId }); setTk(d.takeoff); setSaved(JSON.stringify(d.takeoff)); setMsg(`Started from ${d.takeoff.quoteRef} Rev ${d.takeoff.revision} - re-measure the quantities for the job.`); setProjects(ps => (ps || []).map(p => p.projectId === projectId ? { ...p, hasTakeoff: true } : p)) } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  // DRAFT POs (1229, 1230): first the POs it could make, to choose from - then make the ticked ones
  const [chooser, setChooser] = useState(null)   // { groups, missing, already, contacts, picks: { key: { on, contactId, contactName } } }
  async function openChooser() {
    setBusy(true); setErr(''); setMsg(''); setDrafts(null)
    try {
      const r = await fetch('/api/job-takeoffs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'draft-preview', projectId }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not read the materials')
      const picks = Object.fromEntries(d.groups.map(g => [g.key, { on: g.kind === 'supplier' && !!g.contactId, contactId: g.contactId || '', contactName: g.contactName || '' }]))
      setChooser({ ...d, picks })
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  async function makeChosen() {
    const picks = Object.entries(chooser.picks).filter(([, p]) => p.on).map(([key, p]) => ({ key, contactId: p.contactId }))
    const again = (tk.draftPos || []).length > 0
    if (again && !window.confirm(`Draft POs were already made from this take-off (${tk.draftPos.length}). Make these ${picks.length} as well?`)) return
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/job-takeoffs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'draft-pos', projectId, picks, again }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not make the drafts')
      setDrafts(d); setChooser(null); setTk(d.takeoff); setSaved(JSON.stringify(d.takeoff))
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  async function save() {
    setBusy(true); setErr(''); setMsg('')
    try { const d = await call({ action: 'save', projectId, takeoff: tk }); setTk(d.takeoff); setSaved(JSON.stringify(d.takeoff)); setMsg('Saved.') } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const dirty = tk && JSON.stringify(tk) !== saved
  const setRow = (id, patch) => setTk(t => ({ ...t, rows: t.rows.map(r => r.id === id ? { ...r, ...patch } : r) }))
  // the Materials tab works on the take-off AS IT COUNTS (left-out items removed); its
  // changes (waste, allocations, rates) go back onto the whole take-off, rows untouched
  const counting = useMemo(() => tk ? { ...tk, rows: (tk.rows || []).filter(r => !(r.kind === 'item' && r.excluded)) } : null, [tk])
  const change = (fn) => setTk(t => { const r = typeof fn === 'function' ? fn({ ...t, rows: (t.rows || []).filter(x => !(x.kind === 'item' && x.excluded)) }) : fn; return { ...t, ...r, rows: t.rows } })
  const lib = data && data.lib
  const items = (tk && tk.rows || []).filter(r => r.kind === 'item')
  const changed = items.filter(r => !r.excluded && !same(r.qty, tk.originalQty && tk.originalQty[r.id])).length
  const left = items.filter(r => r.excluded).length
  const pickList = (projects || []).map(p => ({ xeroId: p.projectId, jobNo: p.jobNo, name: `${p.name}${p.fromEstimate ? ` - ${p.fromEstimate.quoteRef} Rev ${p.fromEstimate.revision}` : ''}` }))
  const editRow = editing && tk ? tk.rows.find(r => r.id === editing) : null
  return (
    <>
      <Head><title>{companyName ? `${companyName} - Materials Take-offs` : 'Materials Take-offs'}</title></Head>
      <div style={{ minHeight: '100vh', background: '#f5f6f8' }}>
        <CommercialNav active="/materials-takeoffs" />
        <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
          <h1 style={{ fontSize: 22, color: INK, margin: '0 0 4px' }}>Materials Take-offs</h1>
          <p style={{ color: '#777', fontSize: 13, margin: '0 0 14px' }}>The job's take-off, copied from the won estimate and re-measured for construction. The quote is never changed from here.</p>
          <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13 }}>Project</strong>
            {projects == null ? <span style={{ color: '#999', fontSize: 13 }}>Loading...</span> : <ProjectSearchSelect projects={pickList} value={projectId} onPick={pick} minWidth={420} />}
            {tk && <span style={{ fontSize: 12.5, color: '#0f766e' }}>From {tk.quoteRef} Rev {tk.revision}{tk.title ? ` - ${tk.title}` : ''} · {changed} re-measured · {left} left out{tk.savedAt ? ` · saved by ${tk.savedBy || 'someone'} ${new Date(tk.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</span>}
            <span style={{ flex: 1 }} />
            {tk && <button onClick={save} disabled={busy || !dirty} style={{ ...primary, opacity: (busy || !dirty) ? 0.5 : 1 }}>{busy ? 'Saving...' : 'Save'}</button>}
          </div>
          {err && <div style={{ ...card, background: '#fef2f2', color: '#b42318', fontSize: 13 }}>{err}</div>}
          {msg && <div style={{ ...card, background: '#f0fdfa', color: '#0f766e', fontSize: 13 }}>{msg}</div>}
          {projectId && data && !tk && <div style={card}>
            {data.fromEstimate
              ? <><div style={{ fontSize: 14, marginBottom: 10 }}>This project's contracted rates were built from <strong>{data.fromEstimate.quoteRef} Rev {data.fromEstimate.revision}</strong>. Start the job's materials take-off as a copy of that revision, then re-measure it.</div>
                <button onClick={start} disabled={busy} style={primary}>Start the materials take-off from {data.fromEstimate.quoteRef} Rev {data.fromEstimate.revision}</button></>
              : <div style={{ fontSize: 14 }}>This project is not linked to an estimate yet. On <a href="/contracted-rates" style={{ color: '#0f766e' }}>Contracted Rates</a>, use <strong>Build contracted rates from estimate</strong> - the take-off starts from the same revision.</div>}
          </div>}
          {tk && lib && <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[['takeoff', 'Take-off'], ['materials', 'Materials']].map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ ...btn, background: tab === k ? INK : '#fff', color: tab === k ? '#fff' : INK, borderColor: tab === k ? INK : '#d4d4d0' }}>{l}</button>)}
              {dirty && <span style={{ fontSize: 12.5, color: '#b45309', alignSelf: 'center', marginLeft: 8 }}>Not saved yet</span>}
            </div>
            {tab === 'materials' && <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14 }}>Order it</strong>
              <span style={{ fontSize: 12.5, color: '#666' }}>One draft PO per supplier - the products below at packs x pack price, plus own lines allocated to that supplier. Finish and raise each as normal.</span>
              <span style={{ flex: 1 }} />
              {dirty ? <span style={{ fontSize: 12.5, color: '#b45309' }}>Save first, so the drafts match what is saved</span>
                : <button onClick={openChooser} disabled={busy || !!chooser} style={primary}>{busy && !chooser ? 'Reading...' : (tk.draftPos || []).length ? 'Create more draft POs...' : 'Create draft POs...'}</button>}
              {(tk.draftPos || []).length > 0 && !drafts && <div style={{ flexBasis: '100%', fontSize: 12.5, color: '#555' }}>Drafts already made: {tk.draftPos.map((d, i) => <span key={d.poId}>{i ? ', ' : ''}<a href={`/operations/purchasing/po/${d.poId}`} style={{ color: '#0f766e' }}>{d.supplier}</a></span>)}</div>}
              {drafts && <div style={{ flexBasis: '100%', fontSize: 13 }}>
                {drafts.created.length > 0 && <div style={{ marginBottom: 6 }}><strong>{drafts.created.length} draft PO{drafts.created.length === 1 ? '' : 's'} made:</strong>
                  {drafts.created.map(c => <div key={c.id} style={{ display: 'flex', gap: 10, padding: '3px 0' }}><a href={`/operations/purchasing/po/${c.id}`} style={{ color: '#0f766e', fontWeight: 600, minWidth: 180 }}>{c.supplier}</a><span>{c.lines} line{c.lines === 1 ? '' : 's'}</span><span>{money(c.total)} ex VAT</span>{!c.linked && <span style={{ color: '#b45309' }}>not linked to a Xero contact - link it on Purchasing &gt; Suppliers</span>}</div>)}</div>}
                {(drafts.skipped || []).length > 0 && <div style={{ color: '#b45309' }}>Not made: {drafts.skipped.map(x => `${x.name || x.key} - ${x.reason}`).join('; ')}</div>}
              </div>}
              {chooser && <OrderChooser chooser={chooser} setChooser={setChooser} money={money} busy={busy} onMake={makeChosen} />}
            </div>}
            {tab === 'materials' ? <div style={card}><MaterialsTab est={counting} lib={lib} change={change} money={money} readOnly={false} /></div> : (
              <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Item', 'Description', 'Unit', 'Estimate qty', 'Job qty', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 3 || i === 4 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                  <tbody>{(tk.rows || []).map(r => {
                    if (r.kind === 'section') return <tr key={r.id}><td colSpan={6} style={{ ...td, fontWeight: 700, background: '#fafaf8' }}>{r.title}</td></tr>
                    if (r.kind === 'line') return <tr key={r.id}><td colSpan={6} style={{ ...td, fontSize: 11.5, color: '#888', background: '#fafaf8', textAlign: 'center', letterSpacing: 0.5 }}>BELOW THE LINE - rate-only and optional items</td></tr>
                    if (r.kind !== 'item') return null
                    const orig = tk.originalQty ? tk.originalQty[r.id] : null, diff = !same(r.qty, orig)
                    return <tr key={r.id} style={{ opacity: r.excluded ? 0.45 : 1 }}>
                      <td style={{ ...td, whiteSpace: 'nowrap', color: '#666' }}>{r.itemNo || ''}</td>
                      <td style={{ ...td, textDecoration: r.excluded ? 'line-through' : 'none' }}>{r.description}{r.rateOnly ? <span style={{ color: '#999', fontSize: 11.5 }}> (rate only)</span> : null}</td>
                      <td style={td}>{BU_UNIT_LABEL[r.unit] || r.unit || ''}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#777' }}>{orig == null ? '-' : orig.toLocaleString('en-GB')}</td>
                      <td style={{ ...td, textAlign: 'right', width: 110 }}>
                        {r.rateOnly ? <span style={{ color: '#999' }}>-</span> : <input type="number" step="any" value={r.qty == null ? '' : r.qty} disabled={r.excluded} onChange={e => setRow(r.id, { qty: e.target.value === '' ? null : Number(e.target.value) })}
                          style={{ width: 90, fontSize: 13, padding: '4px 6px', border: `1px solid ${diff ? '#7c3aed' : '#d4d4d0'}`, background: diff ? '#f5f3ff' : '#fff', borderRadius: 6, textAlign: 'right', fontFamily: 'inherit' }} title={diff ? 'Re-measured for the job' : ''} />}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button onClick={() => setEditing(editing === r.id ? null : r.id)} disabled={r.excluded} style={{ ...btn, padding: '3px 9px', fontSize: 12 }}>{editing === r.id ? 'Close build-up' : 'Build-up'}</button>{' '}
                        <button onClick={() => setRow(r.id, { excluded: !r.excluded })} style={{ ...btn, padding: '3px 9px', fontSize: 12, color: r.excluded ? '#0f766e' : '#b42318' }}>{r.excluded ? 'Put back' : 'Leave out'}</button>
                      </td>
                    </tr>
                  })}</tbody>
                </table>
              </div>)}
            {tab === 'takeoff' && editRow && <div style={card}>
              <div style={{ fontSize: 13, marginBottom: 8 }}><strong>{editRow.itemNo ? `${editRow.itemNo} ` : ''}{editRow.description}</strong> <span style={{ color: '#888' }}>- the build-up for this job (the estimate and the library are not changed)</span></div>
              {/* exactly as the Estimating take-off does it: the build-up WITH the item's unit in, each
                  change applied to the CURRENT build-up, the unit taken back out */}
              <BuildupEditor value={{ ...editRow.buildup, unit: editRow.unit }}
                onChange={(fn) => setTk(t => ({ ...t, rows: t.rows.map(r => { if (r.id !== editRow.id) return r; const n = typeof fn === 'function' ? fn({ ...r.buildup, unit: r.unit }) : fn; const { unit, ...rest } = n; return { ...r, buildup: rest } }) }))}
                lib={withMaterialRates(lib, tk.materialRates)} money={money} rateTitle="Rate"
                rateOpts={{ profit: editRow.profit != null ? editRow.profit : ((tk.settings || {}).profit || 0), mcd: (tk.settings || {}).mcd || 0, labourFactor: (tk.settings || {}).labourFactor ?? 1, jobQty: editRow.rateOnly || editRow.qty == null ? null : Number(editRow.qty) }} />
            </div>}
          </>}
        </div>
      </div>
    </>
  )
}

// CHOOSE THE DRAFT POs TO MAKE (1230) - each PO it could make, ticked or not; a supplier to
// choose for a category of your own (e.g. "Insulation"), the lines not allocated, or a
// price-list supplier not yet linked to Xero
function OrderChooser({ chooser, setChooser, money, busy, onMake }) {
  const setPick = (key, patch) => setChooser(c => ({ ...c, picks: { ...c.picks, [key]: { ...c.picks[key], ...patch } } }))
  const n = Object.values(chooser.picks).filter(p => p.on).length
  const KIND = { supplier: 'price-list supplier', category: 'your category', unallocated: 'not allocated on the take-off' }
  return (
    <div style={{ flexBasis: '100%', border: '1px solid #99f6e4', borderRadius: 10, padding: 12, marginTop: 4 }}>
      <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Choose the draft POs to make</strong> <span style={{ color: '#666' }}>- tick the ones you want; anything without a supplier needs one choosing first.</span></div>
      {!chooser.groups.length ? <div style={{ color: '#999', fontSize: 13 }}>Nothing to order on this take-off yet - choose products on the items, or allocate their own lines.</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>{['', 'PO for', 'Lines', 'Total ex VAT', 'Supplier (Xero contact)'].map((h, i) => <th key={i} style={{ textAlign: i === 2 || i === 3 ? 'right' : 'left', padding: '5px 8px', color: '#666', fontWeight: 600, borderBottom: '1px solid #eee' }}>{h}</th>)}</tr></thead>
          <tbody>{chooser.groups.map(g => { const p = chooser.picks[g.key] || {}; const needs = !p.contactId && g.kind !== 'supplier'
            return <tr key={g.key} style={{ borderBottom: '1px solid #f4f3f0' }}>
              <td style={{ padding: '6px 8px', width: 26 }}><input type="checkbox" checked={!!p.on} disabled={needs} onChange={e => setPick(g.key, { on: e.target.checked })} title={needs ? 'Choose a supplier first' : ''} /></td>
              <td style={{ padding: '6px 8px' }}><strong>{g.name}</strong> <span style={{ color: '#999', fontSize: 11.5 }}>{KIND[g.kind]}</span></td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{g.lines.length}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{money(g.total)}</td>
              <td style={{ padding: '6px 8px', minWidth: 280 }}><ContactPick contacts={chooser.contacts || []} value={p.contactName} hint={g.kind === 'supplier' && !p.contactId ? 'not linked - choose its Xero contact' : 'choose a supplier'}
                onPick={(c) => setPick(g.key, { contactId: c.id, contactName: c.name, on: true })} /></td>
            </tr> })}</tbody>
        </table>)}
      {(chooser.missing || []).length > 0 && <div style={{ fontSize: 12.5, color: '#b45309', marginTop: 8 }}>Not on any PO - no product chosen: {chooser.missing.join('; ')}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button onClick={onMake} disabled={busy || !n} style={{ fontSize: 13, padding: '6px 14px', border: 'none', background: '#0f766e', color: '#fff', borderRadius: 7, cursor: 'pointer', opacity: (busy || !n) ? 0.5 : 1, fontWeight: 600 }}>{busy ? 'Making...' : `Create ${n} draft PO${n === 1 ? '' : 's'}`}</button>
        <button onClick={() => setChooser(null)} style={{ fontSize: 13, padding: '6px 12px', border: '1px solid #d4d4d0', background: '#fff', borderRadius: 7, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  )
}

// a Xero contact, typed to search (suppliers first)
function ContactPick({ contacts, value, hint, onPick }) {
  const [q, setQ] = useState(null)
  const words = String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const found = q === null ? [] : contacts.filter(c => words.every(w => `${c.name} ${c.priceList || ''}`.toLowerCase().includes(w))).slice(0, 12)
  return (
    <div style={{ position: 'relative' }}>
      <input value={q === null ? (value || '') : q} placeholder={hint} onFocus={() => setQ('')} onChange={e => setQ(e.target.value)} onBlur={() => setTimeout(() => setQ(null), 150)}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '5px 8px', border: `1px solid ${value ? '#d4d4d0' : '#f59e0b'}`, borderRadius: 6, fontFamily: 'inherit' }} />
      {q !== null && <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 2, background: '#fff', border: '1px solid #d4d4d0', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.08)', maxHeight: 240, overflowY: 'auto' }}>
        {!found.length ? <div style={{ padding: '7px 10px', fontSize: 12.5, color: '#aaa' }}>{contacts.length ? 'No contact matches' : 'No Xero contacts read yet - Purchasing > Suppliers > Refresh from Xero'}</div>
          : found.map(c => <div key={c.id} onMouseDown={e => { e.preventDefault(); onPick(c); setQ(null) }} style={{ padding: '6px 10px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #f4f3f0' }}>{c.name}{c.supplier ? <span style={{ color: '#999', fontSize: 11 }}> · supplier</span> : null}</div>)}
      </div>}
    </div>
  )
}
