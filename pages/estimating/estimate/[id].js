import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import EstimatingShell, { ErrorBar, estApi } from '../../../components/EstimatingShell'
import { useFormat } from '../../../components/TenantProvider'
import { th, td, tdR, inp, btn } from '../../../components/LibraryParts'
import BuildupEditor, { pct, fromPct, NumBox } from '../../../components/BuildupEditor'
import { LetterTab, ClarificationsTab, DocumentsTab, QuotePreview } from '../../../components/QuoteTabs'
import DocumentsPanel from '../../../components/DocumentsPanel'
import MaterialsTab from '../../../components/MaterialsTab'
import { placeholderValues, checklistOf } from '../../../lib/quoteDocs'
import { adjustLib, pctText } from '../../../lib/priceAdjust'
import { normalizeTemplate, needsNormalizing, descriptionParts, needsAmending, missingSizes, itemsMissingSizes, missingVars, variableLibrary, missingProducts } from '../../../lib/buildups'
import { BU_UNITS, BU_UNIT_LABEL } from '../../../lib/buildups'
import { CRM_DETAILS, OWN_DETAILS, detailsFor, itemFromTemplate, uniqueItem, sectionRow, spacerRow, copyRows, lineRow, uncostedItems, uncostedText, priceEstimate, sectionTotals, priceItem, budgets, diffEstimates, prelimsRows } from '../../../lib/estimate'

// THE TAKE-OFF (1088). Everything about a quote is built here:
//   - the header and the QUOTE's profit %, MCD %, labour factor and day rate
//   - section headers (Roof area A...) and items, in the order the quote prints
//   - an item = a build-up from the library (its own copy) or a unique item;
//     its build-up opens in a POP-OUT over the take-off
//   - an item can override the quote's profit %
//   - RATE ONLY: no quantity (TBC), priced as a rate, below the line, not totalled
// Pricing: lib/estimate.js (which uses the build-up rate, lib/buildups.js).

const API = '/api/estimating/estimates'

export default function EstimatePage() {
  const router = useRouter()
  const { id } = router.query
  const { money, companyName } = useFormat()
  const m2 = (v) => v == null ? '' : money(v, { dp: 2 })
  const [est, setEst] = useState(null)
  const [base, setBase] = useState(null)        // updatedAt when opened - a stale save is refused
  const [dirty, setDirty] = useState(false)
  // AUTOSAVE (1100). A change is saved ~1.5 s after the last one. A save that
  // lands never replaces what was typed meanwhile (only its save details are
  // taken); those edits go in the next save. Someone else's save in between ->
  // autosave STOPS rather than overwrite their work. A lost connection -> retry.
  const AUTOSAVE_MS = 1500
  const [saveState, setSaveState] = useState({ kind: 'idle' })   // idle | saving | saved {at} | retry {msg} | conflict {msg}
  const estRef = useRef(null), baseRef = useRef(null), seqRef = useRef(0), savingRef = useRef(false)
  const timerRef = useRef(null), stoppedRef = useRef(false), retryRef = useRef(0), waitersRef = useRef([])
  const [lib, setLib] = useState({ product: {}, labour: {}, products: [], labourItems: [] })
  const [templates, setTemplates] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [popout, setPopout] = useState(null)    // item id
  const [picking, setPicking] = useState(false)
  const [showHeader, setShowHeader] = useState(true)
  const [showAdj, setShowAdj] = useState(false)
  const [colMenu, setColMenu] = useState(false)
  // Which optional take-off columns show (1096) - remembered in this browser.
  const [cols, setCols] = useState(() => new Set(DEFAULT_COLS))
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem('takeoff:cols') || 'null'); if (Array.isArray(v)) setCols(new Set(v)) } catch {} }, [])
  const toggleCol = (k) => setCols(c => { const n = new Set(c); n.has(k) ? n.delete(k) : n.add(k); try { localStorage.setItem('takeoff:cols', JSON.stringify([...n])) } catch {}; return n })
  // The optional columns: cost rates and totals, profit, the item's own
  // profit % and rate only, and one per supplier WITH a budget here.
  function takeoffColumns(s, totals) {
    // The supporting figures recede - smaller and grey - so Rate and Total lead (1099).
    const R = (k, v) => <td key={k} style={{ ...tdR, color: '#9a9a96', fontSize: 11.5 }}>{m2(v)}</td>
    const F = (k, v) => <td key={k} style={{ ...tdR, color: '#777', fontSize: 11.5, fontWeight: 600 }}>{m2(v)}</td>
    const list = [
      { key: 'matRate', label: 'Materials rate', heads: ['Materials rate'], render: (r, p) => [R('mr', p.materialsRate)] },
      { key: 'matTotal', label: 'Materials total', heads: ['Materials total'], render: (r, p) => [R('mt', p.materialsTotal)], foot: () => [F('mt', totals.materials)] },
      { key: 'labRate', label: 'Labour rate', heads: ['Labour rate'], render: (r, p) => [R('lr', p.labourRate)] },
      { key: 'labTotal', label: 'Labour total', heads: ['Labour total'], render: (r, p) => [R('lt', p.labourTotal)], foot: () => [F('lt', totals.labour)] },
      { key: 'profitRate', label: 'Profit rate', heads: ['Profit rate'], render: (r, p) => [R('pr', p.profitRate)] },
      { key: 'profitTotal', label: 'Profit total', heads: ['Profit total'], render: (r, p) => [R('pt', p.profitTotal)], foot: () => [F('pt', totals.profit)] },
      { key: 'profitPct', label: 'Profit % (this item)', heads: ['Profit %'], align: 'left', render: (r) => [<td key="pp" style={td}><NumBox pct value={r.profit ?? null} onChange={v => setRow(r.id, { profit: v })} placeholder={s.profit != null ? String(pct(s.profit)) : ''} style={{ ...cellInp, width: 56, borderColor: r.profit != null ? '#f59e0b' : undefined }} title="Leave blank to use the quote's profit %" /></td>] },
      { key: 'rateOnly', label: 'Rate only', heads: ['Rate only'], align: 'left', render: (r) => [<td key="ro" style={td}><input type="checkbox" checked={!!r.rateOnly} onChange={e => setRow(r.id, { rateOnly: e.target.checked })} title="No quantity: priced as a rate, below the line" /></td>] },
    ]
    for (const sup of Object.keys(totals.bySupplier || {}).filter(k => totals.bySupplier[k] > 0).sort()) {
      list.push({ key: `sup:${sup}`, label: sup, supplier: true, cells: 2, heads: [`${sup} rate`, `${sup} total`],
        render: (r, p) => { const v = (p.bySupplier || {})[sup]; return [R('sr', v), R('st', v != null && p.qty != null && !p.belowLine ? v * p.qty : null)] },
        foot: () => [<td key="sr" style={td} />, F('st', totals.bySupplier[sup])] })
    }
    return list
  }
  const [crm, setCrm] = useState(null)          // the deal's details, LIVE from the CRM
  const [linking, setLinking] = useState(false)
  const [who, setWho] = useState({ canDelete: false, admins: [] })
  const [tab, setTab] = useState('takeoff')
  const [showChecklist, setShowChecklist] = useState(false)   // re-open a completed checklist (1142)
  const [ckNew, setCkNew] = useState('')
  const [quoteDocs, setQuoteDocs] = useState(null)   // the company letter, clarifications library, T&Cs
  const [lastRev, setLastRev] = useState(null)    // the last ISSUED revision's estimate - for 'changes since'
  const [issueMsg, setIssueMsg] = useState('')
  const [sentView, setSentView] = useState(null)    // the quote just marked as sent: { revision, at, est } - printed as issued

  useEffect(() => {
    if (!id) return
    Promise.all([estApi(`${API}?id=${id}`), estApi('/api/estimating/price-list'), estApi('/api/estimating/labour-rates'), estApi('/api/estimating/build-ups'), estApi('/api/estimating/quote-templates').catch(() => ({ templates: null }))])
      .then(([e, p, l, b, q]) => {
        setQuoteDocs(q.templates)
        // Items cleaned on opening (1102): notes and old comment lines removed - saved
        // with the next change.
        setEst({ ...e.estimate, rows: (e.estimate.rows || []).map(r => r.kind === 'item' && r.buildup && needsNormalizing(r.buildup) ? { ...r, buildup: normalizeTemplate(r.buildup) } : r) }); setBase(e.estimate.updatedAt); setCrm(e.crm || null); setWho({ canDelete: !!e.canDelete, admins: e.admins || [] })
        setLib({ product: Object.fromEntries(p.products.map(x => [x.ref, x])), labour: Object.fromEntries(l.items.map(x => [x.ref, x])), products: p.products, labourItems: l.items })
        setTemplates(b.templates || [])
        const last = (e.estimate.revisions || []).slice(-1)[0]
        if (last) estApi(`${API}?id=${id}&rev=${last.revision}`).then(r => setLastRev(r.revision)).catch(() => {})
      }).catch(e => setErr(e.message))
  }, [id])
  useEffect(() => {
    const warn = (e) => { if (dirty || savingRef.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => { estRef.current = est }, [est])
  useEffect(() => { baseRef.current = base }, [base])
  const change = (fn) => { setEst(e => fn(e)); setDirty(true); seqRef.current++; schedule() }
  function schedule(ms = AUTOSAVE_MS) {
    clearTimeout(timerRef.current)
    if (stoppedRef.current) return
    timerRef.current = setTimeout(runSave, ms)
  }
  async function runSave() {
    if (savingRef.current) { schedule(400); return }
    if (stoppedRef.current || !estRef.current) return
    const seq = seqRef.current
    savingRef.current = true
    setSaveState({ kind: 'saving' })
    try {
      const d = await estApi(API, { action: 'save', estimate: estRef.current, baseUpdatedAt: baseRef.current })
      baseRef.current = d.estimate.updatedAt
      setBase(d.estimate.updatedAt)
      // Only the save details - never the content, which may have moved on.
      setEst(e => ({ ...e, updatedAt: d.estimate.updatedAt, updatedBy: d.estimate.updatedBy }))
      retryRef.current = 0
      if (seqRef.current === seq) { setDirty(false); setSaveState({ kind: 'saved', at: d.estimate.updatedAt }); waitersRef.current.splice(0).forEach(f => f(true)) }
      else schedule(300)          // edited during the save: save again
    } catch (e) {
      if (e.status === 409) {
        stoppedRef.current = true
        setSaveState({ kind: 'conflict', msg: e.message })
        waitersRef.current.splice(0).forEach(f => f(false))
      } else {
        retryRef.current = Math.min(retryRef.current + 1, 6)
        setSaveState({ kind: 'retry', msg: e.message })
        schedule(Math.min(30000, 2500 * retryRef.current))
      }
    } finally { savingRef.current = false }
  }
  // Save NOW and wait for it (Issue / Mark as sent need the estimate saved).
  function flushSave() {
    if (!dirty) return Promise.resolve(true)
    if (stoppedRef.current) return Promise.resolve(false)
    return new Promise(res => { waitersRef.current.push(res); clearTimeout(timerRef.current); runSave() })
  }
  useEffect(() => () => clearTimeout(timerRef.current), [])
  const setRow = (rid, patch) => change(e => ({ ...e, rows: e.rows.map(r => r.id === rid ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r) }))
  const setSetting = (k, v) => change(e => ({ ...e, settings: { ...e.settings, [k]: v } }))
  const move = (i, d) => change(e => { const rs = [...e.rows]; const j = i + d; if (j < 0 || j >= rs.length) return e; [rs[i], rs[j]] = [rs[j], rs[i]]; return { ...e, rows: rs } })
  // New rows go ABOVE the line unless asked for below it (1140).
  const placeRows = (rs, newRows, below) => { const k = rs.findIndex(r => r.kind === 'line'); if (below || k < 0) return [...rs, ...newRows]; return [...rs.slice(0, k), ...newRows, ...rs.slice(k)] }
  const addRow = (row, open, below) => { change(e => ({ ...e, rows: placeRows(e.rows, [row], below) })); if (open) setPopout(row.id) }
  const hasLine = (est?.rows || []).some(r => r.kind === 'line')
  // SELECT, COPY / PASTE / DELETE, HIGHLIGHT, NOTE, DRAG AND DROP (1139).
  // Copy goes to this browser's storage, so it pastes into another estimate too.
  const [sel, setSel] = useState(() => new Set())
  const [drag, setDrag] = useState(null)          // ids being dragged
  const [dropAt, setDropAt] = useState(null)      // { id, after }
  const [clipN, setClipN] = useState(0)
  const [selMsg, setSelMsg] = useState('')
  const CLIP = 'rock:takeoff-clipboard'
  useEffect(() => { try { const c = JSON.parse(localStorage.getItem(CLIP) || 'null'); setClipN(c?.rows?.length || 0) } catch {} }, [])
  const toggleSel = (id) => setSel(x => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selRows = () => (est?.rows || []).filter(r => sel.has(r.id))
  const copySel = () => {
    const rows = selRows(); if (!rows.length) return
    try { localStorage.setItem(CLIP, JSON.stringify({ rows, at: Date.now() })) } catch {}
    setClipN(rows.length); setSelMsg(`Copied ${rows.length} line${rows.length === 1 ? '' : 's'} - Paste puts them below the ticked line (or at the end), here or in another estimate.`)
  }
  const pasteRows = () => {
    let c = null; try { c = JSON.parse(localStorage.getItem(CLIP) || 'null') } catch {}
    if (!c?.rows?.length) return
    const fresh = copyRows(c.rows)
    change(e => { const rs = [...e.rows]; const last = Math.max(-1, ...rs.map((r, i) => sel.has(r.id) ? i : -1)); rs.splice(last >= 0 ? last + 1 : rs.length, 0, ...fresh); return { ...e, rows: rs } })
    setSel(new Set(fresh.map(r => r.id))); setSelMsg(`Pasted ${fresh.length} line${fresh.length === 1 ? '' : 's'}.`)
  }
  const deleteSel = () => {
    const n = sel.size; if (!n || !window.confirm(`Delete ${n} line${n === 1 ? '' : 's'}?`)) return
    change(e => ({ ...e, rows: e.rows.filter(r => !sel.has(r.id)) })); setSel(new Set()); setSelMsg('')
  }
  const highlightSel = (colour) => change(e => ({ ...e, rows: e.rows.map(r => sel.has(r.id) ? { ...r, highlight: colour || undefined } : r) }))
  const noteSel = () => change(e => ({ ...e, rows: e.rows.map(r => sel.has(r.id) && r.kind === 'item' && r.note == null ? { ...r, note: '' } : r) }))
  const moveRows = (ids, targetId, after) => change(e => {
    if (!ids?.length || ids.includes(targetId)) return e
    const moving = e.rows.filter(r => ids.includes(r.id)), rest = e.rows.filter(r => !ids.includes(r.id))
    let k = rest.findIndex(r => r.id === targetId); if (k < 0) return e
    if (after) k++
    rest.splice(k, 0, ...moving); return { ...e, rows: rest }
  })
  const HL = { yellow: '#fef9c3', orange: '#ffedd5', red: '#fee2e2', green: '#dcfce7' }
  const rowLook = (r, base) => ({ background: r.highlight ? HL[r.highlight] : base, opacity: drag?.includes(r.id) ? 0.4 : 1,
    boxShadow: dropAt?.id === r.id ? (dropAt.after ? 'inset 0 -3px 0 #0f766e' : 'inset 0 3px 0 #0f766e') : undefined })
  const dropProps = (r) => ({
    onDragOver: (e) => { if (!drag) return; e.preventDefault(); const b = e.currentTarget.getBoundingClientRect(); setDropAt({ id: r.id, after: e.clientY > b.top + b.height / 2 }) },
    onDrop: (e) => { e.preventDefault(); if (drag && dropAt) moveRows(drag, dropAt.id, dropAt.after); setDrag(null); setDropAt(null) },
  })
  const lead = (r, i) => (
    <td style={{ ...td, whiteSpace: 'nowrap' }}>
      <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} title="Tick to copy, delete, highlight, add a note or drag several" style={{ verticalAlign: 'middle', marginRight: 4 }} />
      <span draggable onDragStart={(e) => { const ids = sel.has(r.id) ? est.rows.filter(x => sel.has(x.id)).map(x => x.id) : [r.id]; setDrag(ids); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', ids.join(',')) } catch {} }}
        onDragEnd={() => { setDrag(null); setDropAt(null) }} title="Drag to move (ticked lines move together)" style={{ cursor: 'grab', color: '#aaa', padding: '0 3px', userSelect: 'none', fontSize: 13 }}>⋮⋮</span>
      <Arrows i={i} move={move} />
    </td>
  )

  const { priced, totals } = useMemo(() => est ? priceEstimate(est, lib) : { priced: {}, totals: {} }, [est, lib])
  // Items not fully costed (1142) - the same list that stops the quote being issued.
  const uncosted = useMemo(() => est ? uncostedItems(est, lib) : [], [est, lib])
  const uncMap = useMemo(() => Object.fromEntries(uncosted.map(x => [x.id, x])), [uncosted])
  const secTot = useMemo(() => est ? sectionTotals(est, priced) : {}, [est, priced])
  const bud = useMemo(() => est ? budgets(est, lib) : { byCategory: {}, bySupplier: {} }, [est, lib])
  const values = useMemo(() => {
    if (!est) return {}
    const d = detailsFor(est, crm)
    // The quote DATE (1098): never typed - today on a draft; the day it was marked
    // as sent on the copy printed then.
    const dt = sentView ? new Date(sentView.at) : new Date()
    return placeholderValues({ est: sentView ? { ...est, ...sentView.est, revision: sentView.revision } : est, details: d, total: totals.total, companyName, money, dateText: dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) })
  }, [est, crm, totals, companyName, sentView])
  const since = useMemo(() => est && lastRev ? diffEstimates(lastRev.estimate, est, lib) : [], [est, lastRev, lib])

  async function issue(andPrint) {
    // Every line costed first (1142) - the server refuses it too.
    if (uncosted.length) { setErr(`Every line needs a cost before the quote is issued - not yet costed: ${uncostedText(uncosted)}`); return }
    // Mandatory sizes (1113): no quote goes out until each has a number.
    const noSize = itemsMissingSizes(est)
    if (noSize.length) { setErr(`Enter the mandatory sizes first (Build-up on each item): ${noSize.slice(0, 6).map(x => `${x.description} - ${x.sizes.join(', ')}`).join('; ')}${noSize.length > 6 ? ` and ${noSize.length - 6} more` : ''}`); return }
    // Marked-for-amending text never prints - so check before a quote goes out (1110).
    const notChosen = (r) => [...missingProducts(r.buildup, lib), ...missingVars(r.buildup)]
    const marked = (est.rows || []).filter(r => r.kind === 'item' && r.buildup && (needsAmending(r.buildup) || notChosen(r).length))
    if (marked.length && !window.confirm(`${marked.length} item${marked.length === 1 ? "'s description needs" : "s' descriptions need"} attention (red on the take-off):\n\n${marked.slice(0, 8).map(r => '- ' + r.description + (notChosen(r).length ? ` - ${notChosen(r).join(', ')} not chosen (prints red on the quote)` : '') + (needsAmending(r.buildup) ? ' - marked for amending' : '')).join('\n')}\n\nIssue the quote anyway?`)) return
    if (dirty && !(await flushSave())) { setErr('The estimate could not be saved, so it was not issued'); return }
    const note = window.prompt(andPrint
      ? `Mark Rev ${est.revision} as SENT? It is issued - frozen as it stands, dated today${est.dealId ? ', the CRM deal value set to its total' : ''} - then the print window opens to save it as a PDF. Optional note:`
      : `Issue Rev ${est.revision}? This freezes the quote as it stands${est.dealId ? ' and sets the CRM deal value to its total' : ''}. Optional note:`, andPrint ? 'Sent' : '')
    if (note === null) return
    const asSent = JSON.parse(JSON.stringify(est))
    setBusy(true); setErr(''); setIssueMsg('')
    try {
      const d = await estApi(API, { action: 'issue', id: est.id, note, baseUpdatedAt: base })
      setLastRev({ revision: d.issued, total: d.total, estimate: JSON.parse(JSON.stringify(est)) })
      setEst(d.estimate); setBase(d.estimate.updatedAt)
      if (andPrint) {
        // Print the quote AS ISSUED (that revision, today's date) - then back to the draft.
        setSentView({ revision: d.issued, at: new Date().toISOString(), est: asSent })
        setTimeout(() => { window.print(); setTimeout(() => setSentView(null), 500) }, 300)
      }
      setIssueMsg(`Rev ${d.issued} issued at ${money(d.total, { dp: 2 })}.${d.crm ? (d.crm.updated ? ` CRM deal value ${money(d.crm.from, { dp: 2 })} → ${money(d.crm.to, { dp: 2 })}.` : d.crm.error ? ` ${d.crm.error}` : ` ${d.crm.note}`) : ''} Now working on Rev ${d.estimate.revision}.`)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  async function save() { await flushSave() }

  async function del() {
    if (!window.confirm(`Delete the estimate "${est.title}"${(est.revisions || []).length ? ' and its issued revisions' : ''}? This cannot be undone.`)) return
    try { await estApi(API, { action: 'delete', id: est.id }); setDirty(false); router.push('/estimating/estimates') } catch (e) { setErr(e.message) }
  }

  if (!est) return <EstimatingShell active="estimates" title="Estimate" wide>{err ? <ErrorBar error={err} /> : <div style={{ color: '#aaa', padding: 30 }}>Loading…</div>}</EstimatingShell>
  const s = est.settings || {}
  const item = popout && est.rows.find(r => r.id === popout)
  return (
    <EstimatingShell active="estimates" title={est.title} wide>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <a href="/estimating/estimates" style={{ fontSize: 12.5, color: '#888', textDecoration: 'none' }}>‹ Estimates</a>
          <input value={est.title} onChange={e => change(x => ({ ...x, title: e.target.value }))} style={{ display: 'block', fontSize: 21, fontWeight: 700, border: 'none', padding: '2px 0', fontFamily: 'inherit', minWidth: 420, background: 'transparent' }} />
          <div style={{ fontSize: 12.5, color: '#888' }}>
            {est.dealId ? (crm && !crm.missing ? <>CRM deal: <a href={`/crm?deal=${crm.dealId}`} style={{ color: '#0f766e' }}>{crm.title}</a>{crm.organisation ? ` · ${crm.organisation}` : ''}</> : <span style={{ color: '#b42318' }}>The linked CRM deal no longer exists</span>) : 'Not linked to a CRM deal'}
            {' · '}Rev {est.revision}{' · '}last saved {new Date(est.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{est.updatedBy ? ` by ${est.updatedBy}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {who.canDelete ? <button onClick={del} style={{ ...btn, color: '#b42318', borderColor: '#f5c2c2' }}>Delete</button>
            : <span style={{ fontSize: 11.5, color: '#999', maxWidth: 220, textAlign: 'right' }}>Only an admin can delete an estimate{who.admins.length ? ` - ask ${who.admins.join(', ')}` : ''}.</span>}
          <SaveStatus state={saveState} dirty={dirty} archived={!!crm?.archived} />
          {saveState.kind === 'conflict'
            ? <button onClick={() => window.location.reload()} style={{ ...btn, background: '#b42318', color: '#fff', borderColor: '#b42318' }}>Reload</button>
            : <button onClick={save} disabled={!dirty || !!crm?.archived || saveState.kind === 'saving'} title="It saves itself - this saves straight away" style={{ ...btn, opacity: !dirty || crm?.archived ? 0.45 : 1 }}>Save now</button>}
        </div>
      </div>
      <ErrorBar error={err} onClose={() => setErr('')} />
      {crm?.archived && (
        <div style={{ background: '#f4f4f2', border: '1px solid #d6d3cc', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#444' }}>
          <strong>Archived</strong> - the CRM deal was lost{crm.lostTime ? ` on ${new Date(crm.lostTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}{crm.lostReason ? ` (${crm.lostReason})` : ''}. The estimate is read-only. Reopen the deal in the CRM to work on it again.
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e8e7e3', marginBottom: 14 }}>
        {[['takeoff', 'Take-off'], ['materials', 'Materials'], ['letter', 'Letter'], ['clar', 'Clarifications'], ['docs', 'Documents'], ['quote', 'Quote']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ border: 'none', borderBottom: `2px solid ${tab === k ? '#0f766e' : 'transparent'}`, background: 'none', padding: '8px 14px', fontSize: 13.5, fontWeight: tab === k ? 700 : 500, color: tab === k ? '#0f766e' : '#666', cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1 }}>{label}</button>
        ))}
      </div>
      {tab === 'materials' && <MaterialsTab est={est} lib={lib} change={change} money={money} readOnly={!!crm?.archived} />}
      {tab === 'quote' && <QuotePreview est={sentView ? { ...sentView.est, revision: sentView.revision } : est} values={values} priced={priced} totals={totals} templates={quoteDocs} money={money} companyName={companyName} lib={lib} draft={!sentView}
        actions={<>
          <button onClick={() => issue(true)} disabled={busy || dirty || s.profit == null || !!crm?.archived} title={dirty ? 'Save first' : s.profit == null ? 'Set the profit % first' : ''} style={{ fontSize: 12.5, padding: '6px 12px', border: 'none', borderRadius: 7, background: '#0f766e', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: busy || dirty || s.profit == null || crm?.archived ? 0.5 : 1 }}>Download and mark as sent (Rev {est.revision})</button>
          {dirty && <span style={{ fontSize: 12, color: '#b45309' }}>Save first</span>}
        </>} />}
      {(tab === 'letter' || tab === 'clar' || tab === 'docs') && (
        <fieldset disabled={!!crm?.archived} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
          {tab === 'letter' && <LetterTab est={est} change={change} templates={quoteDocs} values={values} />}
          {tab === 'clar' && <ClarificationsTab est={est} change={change} templates={quoteDocs} />}
          {tab === 'docs' && <DocumentsTab est={est} readOnly={!!crm?.archived} />}
        </fieldset>
      )}
      {/* An archived estimate is read-only: every control below is disabled (the server refuses changes too). */}
      <fieldset disabled={!!crm?.archived} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0, display: tab === 'takeoff' ? 'block' : 'none' }}>

      <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          <label>Quote ref <input value={est.quoteRef || ''} onChange={e => change(x => ({ ...x, quoteRef: e.target.value }))} style={{ ...cellInp, width: 120 }} /></label>
          <label>Profit % <NumBox pct value={s.profit ?? null} onChange={v => setSetting('profit', v)} placeholder="set" style={{ ...cellInp, width: 60, borderColor: s.profit == null ? '#f59e0b' : undefined }} /></label>
          <label>MCD % <NumBox pct value={s.mcd ?? null} onChange={v => setSetting('mcd', v)} placeholder="0" style={{ ...cellInp, width: 60 }} /></label>
          <label title="Raise or lower ALL the labour on this quote - each rate in proportion to its own labour">Labour factor <NumBox value={s.labourFactor ?? 1} emptyAs={1} onChange={v => setSetting('labourFactor', v)} style={{ ...cellInp, width: 60 }} /></label>
          <label title="Starts from the company day rate (Labour Rates); used for prelims">Day rate <NumBox dp={2} value={s.dayRate ?? null} onChange={v => setSetting('dayRate', v)} style={{ ...cellInp, width: 70 }} /></label>
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowAdj(v => !v)} style={{ ...smallBtn, borderColor: (est.adjustments || []).length ? '#2563eb' : undefined, color: (est.adjustments || []).length ? '#2563eb' : undefined }}>This quote's price adjustments{(est.adjustments || []).length ? ` (${est.adjustments.length})` : ''}</button>
          <button onClick={() => setShowHeader(v => !v)} style={smallBtn}>{showHeader ? 'Hide' : 'Show'} project and customer details</button>
        </div>
        {s.profit == null && <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>Set the profit % for this quote - every rate includes it.</div>}
        {(est.adjustments || []).length > 0 && !showAdj && <div style={{ fontSize: 12.5, color: '#2563eb', marginTop: 6 }}>This quote only: {est.adjustments.map(a => `${a.supplier} ${pctText(a.pct)}`).join(' · ')} - on top of the price list.</div>}
        {showAdj && <QuoteAdjustments est={est} change={change} suppliers={[...new Set(lib.products.map(p => p.supplier).filter(Boolean))].sort()} />}
        {showHeader && (
          <div style={{ marginTop: 10 }}>
            {est.dealId && crm && !crm.missing ? (
              <>
                <div style={{ fontSize: 12, color: '#0f766e', fontWeight: 600, marginBottom: 6 }}>
                  Project and customer details - LIVE from the CRM deal. <a href={`/crm?deal=${crm.dealId}`} style={{ color: '#0f766e' }}>Edit them in the CRM</a>; the estimate and the letter follow.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 16px' }}>
                  {CRM_DETAILS.map(([k, label]) => (
                    <div key={k} style={{ fontSize: 12.5 }}><div style={{ fontSize: 11, color: '#999' }}>{label}</div><div style={{ color: crm.details[k] ? '#1a1a19' : '#ccc' }}>{crm.details[k] || 'not set in the CRM'}</div></div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {est.dealId && <div style={{ fontSize: 12.5, color: '#b42318', marginBottom: 6 }}>The linked CRM deal no longer exists (deleted). Link the estimate to another deal, or type the details below.</div>}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, fontSize: 12.5, color: '#666' }}>
                  Not linked: these details are typed here. <button onClick={() => setLinking(true)} style={smallBtn}>Link a CRM deal</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {CRM_DETAILS.map(([k, label]) => (
                    <label key={k} style={{ fontSize: 12, color: '#666', display: 'flex', flexDirection: 'column', gap: 3 }}>{label}
                      <input value={(est.header || {})[k] || ''} onChange={e => change(x => ({ ...x, header: { ...(x.header || {}), [k]: e.target.value } }))} style={inp} />
                    </label>
                  ))}
                </div>
              </>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0efec' }}>
              {OWN_DETAILS.map(([k, label]) => (
                <label key={k} style={{ fontSize: 12, color: '#666', display: 'flex', flexDirection: 'column', gap: 3 }}>{label} <span style={{ fontSize: 10.5, color: '#aaa' }}>this estimate</span>
                  <input value={(est.header || {})[k] || ''} onChange={e => change(x => ({ ...x, header: { ...(x.header || {}), [k]: e.target.value } }))} style={inp} type={k === 'date' ? 'date' : 'text'} />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {(() => {
        // THE TAKE-OFF COLUMNS (1096). Always: description, qty, unit, rate, total.
        // The rest are chosen with the gear; suppliers are offered only where this
        // estimate has a budget with them. Rates and totals for materials, labour
        // and suppliers are COST (before profit and MCD) - the budgets.
        const optional = takeoffColumns(s, totals)
        const shown = optional.filter(c => cols.has(c.key))
        const cells = shown.reduce((n, c) => n + (c.cells || 1), 0)
        return (
          // The column menu sits OUTSIDE the table's scrolling box (1099) - inside it,
          // a browser clips it at the bottom of a short table and the suppliers are lost.
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 2px 6px' }}>
              <button onClick={(e) => {
                // Opens just below the button, pinned to the screen and sized to fit
                // the window - every entry reachable however long the list (1099).
                const r = e.currentTarget.getBoundingClientRect()
                setColMenu(v => v ? false : { top: Math.round(r.bottom + 4), right: Math.max(8, Math.round(window.innerWidth - r.right)), maxH: Math.max(220, Math.round(window.innerHeight - r.bottom - 16)) })
              }} title="Show or hide columns" style={{ ...smallBtn, padding: '3px 9px' }}>⚙ Columns</button>
            </div>
            {colMenu && (
              <div style={{ position: 'fixed', right: colMenu.right, top: colMenu.top, zIndex: 60, maxHeight: colMenu.maxH, overflowY: 'auto', background: '#fff', border: '1px solid #d4d4d0', borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', padding: 12, width: 260, fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Columns</div>
                {optional.filter(c => !c.supplier).map(c => <ColTick key={c.key} c={c} cols={cols} toggle={toggleCol} />)}
                {!optional.some(c => c.supplier) && <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>Suppliers appear here once items have quantities and products from the price list.</div>}
                {optional.some(c => c.supplier) && <>
                  <div style={{ fontWeight: 700, margin: '10px 0 4px' }}>Suppliers <span style={{ fontWeight: 400, fontSize: 11.5, color: '#999' }}>rate and total</span></div>
                  {optional.filter(c => c.supplier).map(c => <ColTick key={c.key} c={c} cols={cols} toggle={toggleCol} />)}
                </>}
                <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>Remembered in this browser.</div>
              </div>
            )}
            {(sel.size > 0 || clipN > 0) && (
              <div style={{ position: 'sticky', top: 6, zIndex: 30, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: sel.size ? '#0f766e' : '#f0fdfa', color: sel.size ? '#fff' : '#0f766e', border: '1px solid #0f766e', borderRadius: 10, padding: '7px 12px', marginBottom: 8, fontSize: 13 }}>
                {sel.size > 0 ? <>
                  <strong>{sel.size} selected</strong>
                  <button onClick={copySel} style={bannerBtn}>Copy</button>
                  {clipN > 0 && <button onClick={pasteRows} style={bannerBtn} title="Paste below the last ticked line">Paste {clipN}</button>}
                  <button onClick={deleteSel} style={bannerBtn}>Delete</button>
                  <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.4)' }} />
                  <button onClick={() => highlightSel('yellow')} style={bannerBtn}>Highlight</button>
                  {Object.entries(HL).map(([k, v]) => <button key={k} onClick={() => highlightSel(k)} title={k} style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #fff', background: v, cursor: 'pointer', padding: 0 }} />)}
                  <button onClick={() => highlightSel(null)} style={bannerBtn}>Clear highlight</button>
                  <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.4)' }} />
                  <button onClick={noteSel} style={bannerBtn}>Add note</button>
                  <button onClick={() => { setSel(new Set()); setSelMsg('') }} style={{ ...bannerBtn, marginLeft: 'auto' }}>Untick all</button>
                </> : <>
                  <span>{clipN} line{clipN === 1 ? '' : 's'} copied</span>
                  <button onClick={pasteRows} style={{ ...bannerBtn, color: '#0f766e', borderColor: '#0f766e' }}>Paste at the end</button>
                  <button onClick={() => { try { localStorage.removeItem(CLIP) } catch {} setClipN(0) }} style={{ ...bannerBtn, color: '#0f766e', borderColor: '#99f6e4' }}>Clear</button>
                </>}
                {selMsg && sel.size > 0 && <span style={{ flexBasis: '100%', fontSize: 11.5, opacity: 0.9 }}>{selMsg}</span>}
              </div>
            )}
            <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
              <thead><tr>
                {['', 'Description', 'Qty', 'Unit', 'Rate', 'Total'].map((h, i) => <th key={h || i} style={{ ...th, textAlign: [2, 4, 5].includes(i) ? 'right' : 'left', ...(i >= 4 ? { color: '#1a1a19', fontSize: 12.5, fontWeight: 700 } : {}) }}>{h}</th>)}
                {shown.flatMap(c => c.heads.map((h, k) => <th key={`${c.key}${k}`} style={{ ...th, textAlign: c.align || 'right', fontSize: 10.5, fontWeight: 500, color: c.supplier ? '#93a8d8' : '#aaa' }}>{h}</th>))}
                <th style={th} />
              </tr></thead>
              <tbody>
                {est.rows.map((r, i) => r.kind === 'line' ? (
                  // THE LINE (1140): the totals above it, then everything below - not in the total
                  <React.Fragment key={r.id}>
                    <tr style={{ background: '#faf9f7' }}>
                      <td style={td} /><td style={{ ...td, fontWeight: 700 }} colSpan={4}>Totals <span style={{ fontWeight: 400, color: '#999', fontSize: 11.5 }}>above the line</span></td>
                      <td style={{ ...tdR, fontWeight: 700, fontSize: 14, color: '#1a1a19' }}>{m2(totals.total)}</td>
                      {shown.flatMap(c => c.foot ? c.foot() : [<td key={c.key} style={td} />])}
                      <td style={td} />
                    </tr>
                    <tr style={{ ...rowLook(r, '#f5f3ff'), borderTop: '3px double #6d28d9' }} {...dropProps(r)}>
                      {lead(r, i)}
                      <td style={{ ...td, paddingTop: 10, paddingBottom: 10 }} colSpan={5 + cells}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <strong style={{ color: '#6d28d9', letterSpacing: 0.5 }}>BELOW THE LINE</strong>
                          <span style={{ fontSize: 12, color: '#6b6b80' }}>rate-only and optional items - priced and on the quote, not in the total</span>
                          <span style={{ flex: 1 }} />
                          <button onClick={() => setPicking('below')} style={smallBtn} disabled={!templates.length}>+ Item from build-ups</button>
                          <button onClick={() => addRow(uniqueItem('m2'), true, true)} style={smallBtn}>+ Unique item</button>
                          <button onClick={() => addRow(spacerRow(), false, true)} style={smallBtn}>+ Blank line</button>
                        </div>
                      </td>
                      <td style={td}><button onClick={() => { if (window.confirm('Remove the line? Items below it will count in the total.')) change(e => ({ ...e, rows: e.rows.filter(x => x.id !== r.id) })) }} style={iconBtn} title="Remove the line">✕</button></td>
                    </tr>
                  </React.Fragment>
                ) : r.kind === 'spacer' ? (
                  // A BLANK LINE (1139) - layout only
                  <tr key={r.id} style={rowLook(r)} {...dropProps(r)}>
                    {lead(r, i)}
                    <td style={{ ...td, height: 24 }} colSpan={5 + cells} />
                    <td style={td}><button onClick={() => change(e => ({ ...e, rows: e.rows.filter(x => x.id !== r.id) }))} style={iconBtn} title="Remove blank line">✕</button></td>
                  </tr>
                ) : r.kind === 'section' ? (
                  <tr key={r.id} style={rowLook(r, '#f4f4f2')} {...dropProps(r)}>
                    {lead(r, i)}
                    <td style={td} colSpan={4}><input value={r.title} onChange={e => setRow(r.id, { title: e.target.value })} style={{ ...cellInp, fontWeight: 700, textDecoration: 'underline', width: '100%', background: 'transparent', border: 'none' }} /></td>
                    <td style={td} />
                    {cells > 0 && <td style={td} colSpan={cells} />}
                    <td style={td}><button onClick={() => change(e => ({ ...e, rows: e.rows.filter(x => x.id !== r.id) }))} style={iconBtn} title="Remove section header">✕</button></td>
                  </tr>
                ) : (() => {
                  const p = priced[r.id] || {}
                  return (
                    <tr key={r.id} style={rowLook(r, r.rateOnly ? '#fafaf7' : undefined)} {...dropProps(r)}>
                      {lead(r, i)}
                      <td style={{ ...td, minWidth: 260 }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 260 }}>
                        <input value={r.description} onChange={e => setRow(r.id, { description: e.target.value })} style={{ ...cellInp, width: '100%' }} />
                        <div style={{ fontSize: 11, color: p.missing?.length ? '#b45309' : '#aaa', marginTop: 2 }}>
                          {r.templateRef ? 'from the build-ups' : 'unique item'}
                          {uncMap[r.id] ? <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 12.5 }} title={uncMap[r.id].lines.join(', ')}> · ⚠ {uncMap[r.id].lines.length ? `${uncMap[r.id].lines.length} line${uncMap[r.id].lines.length === 1 ? '' : 's'} without a cost` : ''}{uncMap[r.id].lines.length && uncMap[r.id].zeroRate ? ' - ' : ''}{uncMap[r.id].zeroRate ? 'rate £0' : ''}</span> : null}
                          {r.buildup && needsAmending(r.buildup) && <span style={{ color: '#b91c1c', fontWeight: 600 }}> · description needs amending</span>}
                          {r.buildup && missingSizes(r.buildup).length > 0 && <span style={{ color: '#b91c1c', fontWeight: 600 }}> · {missingSizes(r.buildup).join(', ')} required</span>}
                          {r.buildup && [...missingProducts(r.buildup, lib), ...missingVars(r.buildup)].length > 0 && <span style={{ color: '#b91c1c', fontWeight: 600 }}> · {[...missingProducts(r.buildup, lib), ...missingVars(r.buildup)].join(', ')} not chosen</span>}
                        </div>
                        {/* The item's description, as the quote will word it - parts marked for
                            amending shown RED here, never on the quote (1110). */}
                        {(() => { const parts = r.buildup ? descriptionParts(r.buildup, lib) : []; return parts.length ? (
                          <div style={{ fontSize: 11.5, color: '#666', marginTop: 3, lineHeight: 1.45, maxWidth: 560 }}>
                            {parts.map((x, k) => x.red === 'amend' ? <span key={k} style={{ color: '#b91c1c', background: '#fee2e2', fontWeight: 600, borderRadius: 3 }}>{x.text}</span>
                              : x.red === 'missing' ? <span key={k} style={{ color: '#b91c1c', fontWeight: 700 }} title="Not chosen yet - choose it in the item's Build-up">{x.text}</span>
                              : <span key={k}>{x.text}</span>)}
                          </div>) : null })()}
                        </div>
                        {/* THE NOTE (1139) - a yellow sticky beside the item; take-off only */}
                        {r.note != null && (
                          <div style={{ width: 210, flexShrink: 0, background: '#fde047', borderRadius: 4, padding: '6px 8px', boxShadow: '0 2px 6px rgba(0,0,0,0.12)', position: 'relative' }}>
                            <button onClick={() => setRow(r.id, { note: undefined })} title="Remove note" style={{ position: 'absolute', top: 2, right: 4, border: 'none', background: 'none', cursor: 'pointer', color: '#854d0e', fontSize: 13 }}>×</button>
                            <textarea value={r.note} onChange={e => setRow(r.id, { note: e.target.value })} placeholder="Note…" rows={4} autoFocus={!r.note}
                              style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', outline: 'none', resize: 'vertical', fontSize: 12, fontFamily: 'inherit', color: '#422006', marginTop: 8 }} />
                          </div>
                        )}
                        </div>
                      </td>
                      <td style={tdR}>{r.rateOnly ? <span style={{ color: '#888' }}>TBC</span> : <input value={r.qty ?? ''} onChange={e => setRow(r.id, { qty: e.target.value === '' ? null : e.target.value })} placeholder="qty" inputMode="decimal" style={{ ...cellInp, width: 80, textAlign: 'right' }} />}</td>
                      <td style={td}>{r.unit ? BU_UNIT_LABEL[r.unit] : '—'}</td>
                      <td style={{ ...tdR, fontWeight: 700, fontSize: 14, color: '#1a1a19' }}>{m2(p.rate)}</td>
                      <td style={{ ...tdR, fontWeight: 700, fontSize: 14, color: '#1a1a19' }}>{r.rateOnly ? <span style={{ color: '#888', fontWeight: 400, fontSize: 13 }}>Rate only</span>
                        : p.belowLine ? (p.total != null ? <span style={{ color: '#6d28d9', fontWeight: 600 }} title="Below the line - not in the total">{m2(p.total)}<div style={{ fontSize: 10.5, fontWeight: 500 }}>optional</div></span> : <span style={{ color: '#888', fontWeight: 400, fontSize: 13 }}>Rate only</span>)
                        : m2(p.total)}</td>
                      {shown.flatMap(c => c.render(r, p))}
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <button onClick={() => setPopout(r.id)} style={smallBtn}>Build-up</button>
                        {r.note == null && <button onClick={() => setRow(r.id, { note: '' })} style={{ ...smallBtn, marginLeft: 4 }} title="Add a note beside this item">Note</button>}
                        <button onClick={() => { if (window.confirm(`Remove "${r.description}"?`)) change(e => ({ ...e, rows: e.rows.filter(x => x.id !== r.id) })) }} style={iconBtn} title="Remove item">✕</button>
                      </td>
                    </tr>
                  )
                })())}
                {!est.rows.length && <tr><td colSpan={7 + cells} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 26 }}>Add a section header, then the items - from the build-ups, or unique.</td></tr>}
              </tbody>
              {hasLine && (
                <tfoot><tr style={{ background: '#f5f3ff' }}>
                  <td style={td} /><td style={{ ...td, fontWeight: 700, color: '#6d28d9' }} colSpan={4}>Below the line <span style={{ fontWeight: 400, color: '#6b6b80', fontSize: 11.5 }}>{totals.belowLine} item{totals.belowLine === 1 ? '' : 's'} - not in the total</span></td>
                  <td style={{ ...tdR, fontWeight: 600, color: '#6d28d9' }}>{totals.optional ? m2(totals.optional) : ''}<div style={{ fontSize: 10.5, fontWeight: 500 }}>{totals.optional ? 'optional' : ''}</div></td>
                  {cells > 0 && <td style={td} colSpan={cells} />}
                  <td style={td} />
                </tr></tfoot>
              )}
              {!hasLine && est.rows.some(r => r.kind === 'item') && (
                <tfoot><tr style={{ background: '#faf9f7' }}>
                  <td style={td} /><td style={{ ...td, fontWeight: 700 }} colSpan={4}>Totals <span style={{ fontWeight: 400, color: '#999', fontSize: 11.5 }}>above the line</span></td>
                  <td style={{ ...tdR, fontWeight: 700, fontSize: 14, color: '#1a1a19' }}>{m2(totals.total)}</td>
                  {shown.flatMap(c => c.foot ? c.foot() : [<td key={c.key} style={td} />])}
                  <td style={td} />
                </tr></tfoot>
              )}
            </table>
            </div>
          </div>
        )
      })()}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => addRow(sectionRow('New section'))} style={btn}>+ Section header</button>
        <button onClick={() => setPicking(true)} style={btn} disabled={!templates.length} title={templates.length ? '' : 'Upload build-ups first'}>+ Item from build-ups</button>
        <button onClick={() => addRow(uniqueItem('m2'), true)} style={btn}>+ Unique item</button>
        <button onClick={() => addRow(spacerRow())} style={btn} title="A blank line - layout only, not on the quote">+ Blank line</button>
        {!hasLine && <button onClick={() => change(e => ({ ...e, rows: [...e.rows, lineRow()] }))} style={{ ...btn, marginLeft: 'auto', color: '#6d28d9', borderColor: '#ddd6fe' }} title="Rate-only and optional items - shown and priced, not in the total">+ Below the line</button>}
        <button onClick={() => { const [sec, it] = prelimsRows(); change(e => ({ ...e, rows: placeRows(e.rows, [sec, it]) })); setPopout(it.id) }} style={btn} title="Lodge, management, attendances - lump sums for the job">+ Prelims</button>
      </div>

      {/* THE PRICING CHECKLIST (1142) - the company's reminders plus this estimate's own.
          Tick all; once everything is ticked it shrinks to a single line. */}
      {(() => {
        const ck = est.checklist || {}
        const ticked = ck.ticked || {}
        const items = [...checklistOf(quoteDocs).map(x => ({ ...x, company: true })), ...(ck.own || [])]
        const done = items.length > 0 && items.every(x => ticked[x.id])
        const setCk = (fn) => change(e => ({ ...e, checklist: fn(e.checklist || {}) }))
        if (!items.length) return null
        if (done && !showChecklist) return (
          <div style={{ marginTop: 14, fontSize: 12.5, color: '#15803d' }}>✓ Pricing checklist complete · <button onClick={() => setShowChecklist(true)} style={{ border: 'none', background: 'none', color: '#0f766e', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 12.5 }}>show</button></div>
        )
        return (
          <div style={{ marginTop: 14, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>Pricing checklist</strong>
              <span style={{ fontSize: 12, color: '#92400e' }}>{items.filter(x => ticked[x.id]).length} of {items.length} ticked</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => setCk(c => ({ ...c, ticked: Object.fromEntries(items.map(x => [x.id, true])) }))} disabled={!!est.archived} style={smallBtn}>Tick all</button>
              {done && <button onClick={() => setShowChecklist(false)} style={smallBtn}>Hide</button>}
            </div>
            <div style={{ columns: '2 360px', columnGap: 24 }}>
              {items.map(x => (
                <label key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, padding: '3px 0', breakInside: 'avoid', cursor: 'pointer', color: ticked[x.id] ? '#888' : '#1a1a19', textDecoration: ticked[x.id] ? 'line-through' : 'none' }}>
                  <input type="checkbox" checked={!!ticked[x.id]} disabled={!!est.archived} onChange={e => setCk(c => ({ ...c, ticked: { ...(c.ticked || {}), [x.id]: e.target.checked || undefined } }))} style={{ marginTop: 2 }} />
                  <span style={{ flex: 1 }}>{x.text}{!x.company && <span style={{ fontSize: 10.5, color: '#92400e', marginLeft: 6 }}>this estimate</span>}</span>
                  {!x.company && <button onClick={(ev) => { ev.preventDefault(); setCk(c => ({ ...c, own: (c.own || []).filter(y => y.id !== x.id) })) }} style={iconBtn} title="Remove this reminder">✕</button>}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={ckNew} onChange={e => setCkNew(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && ckNew.trim()) { setCk(c => ({ ...c, own: [...(c.own || []), { id: `o${Date.now().toString(36)}`, text: ckNew.trim() }] })); setCkNew('') } }} placeholder="Add a reminder for this estimate…" disabled={!!est.archived} style={{ ...inp, maxWidth: 420, padding: '6px 9px' }} />
              <button onClick={() => { if (!ckNew.trim()) return; setCk(c => ({ ...c, own: [...(c.own || []), { id: `o${Date.now().toString(36)}`, text: ckNew.trim() }] })); setCkNew('') }} disabled={!ckNew.trim()} style={smallBtn}>Add</button>
            </div>
          </div>
        )
      })()}
      <div style={{ display: 'flex', gap: 24, marginTop: 16, background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 12, padding: '12px 16px', flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13 }}>
        <strong style={{ fontSize: 17, color: '#0f766e' }}>Total {money(totals.total || 0, { dp: 2 })}</strong>
        <span>Materials {money(totals.materials || 0, { dp: 2 })}</span>
        <span>Labour {money(totals.labour || 0, { dp: 2 })}</span>
        <span>Profit &amp; MCD {money(totals.profitAndMcd || 0, { dp: 2 })}</span>
        {totals.belowLine > 0 && <span style={{ color: '#6d28d9' }}>{totals.belowLine} item{totals.belowLine === 1 ? '' : 's'} below the line{totals.optional ? ` (optional ${money(totals.optional, { dp: 2 })})` : ''} - not in the total</span>}
        {uncosted.length > 0 && <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 15, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '3px 10px' }} title={uncostedText(uncosted)}>⚠ {uncosted.length} item{uncosted.length === 1 ? '' : 's'} not fully costed - the quote cannot be issued</span>}
        {totals.noQty > 0 && <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 15, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '3px 10px' }}>⚠ {totals.noQty} item{totals.noQty === 1 ? '' : 's'} without a quantity - not in the total</span>}
      </div>

      {issueMsg && <div style={{ marginTop: 10, fontSize: 13, color: '#0f766e', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, padding: '8px 12px' }}>{issueMsg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14, alignItems: 'start' }}>
        <div style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>Revisions</strong>
            <button onClick={issue} disabled={busy || dirty || s.profit == null} title={dirty ? 'Save first' : s.profit == null ? 'Set the profit % first' : ''} style={{ ...btn, opacity: busy || dirty || s.profit == null ? 0.5 : 1 }}>Issue Rev {est.revision}</button>
          </div>
          {dirty && <div style={{ fontSize: 12, color: '#b45309', marginBottom: 6 }}>Save before issuing.</div>}
          {lastRev && <div style={{ fontSize: 12.5, marginBottom: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>Changes since Rev {lastRev.revision}{since.length ? '' : ' - none'}</div>
            {since.map((c, i) => <div key={i} style={{ color: c.kind === 'removed' ? '#b42318' : c.kind === 'added' ? '#15803d' : '#444', padding: '1px 0' }}>{c.text}</div>)}
          </div>}
          {(est.revisions || []).slice().reverse().map(r => (
            <details key={r.revision} style={{ fontSize: 12.5, borderTop: '1px solid #f0efec', padding: '6px 0' }}>
              <summary style={{ cursor: 'pointer' }}><strong>Rev {r.revision}</strong> · {money(r.total, { dp: 2 })} · {new Date(r.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {r.issuedBy}{r.note ? ` · ${r.note}` : ''}</summary>
              <div style={{ paddingLeft: 12, marginTop: 4, color: '#555' }}>{(r.changes || []).length ? r.changes.map((c, i) => <div key={i}>{c.text}</div>) : 'First issue.'}</div>
            </details>
          ))}
          {!(est.revisions || []).length && <div style={{ fontSize: 12.5, color: '#888' }}>Not issued yet. Issuing freezes the quote as Rev {est.revision}{est.dealId ? ' and sets the CRM deal value' : ''}.</div>}
        </div>
        {/* NOTES (1140) - general notes on this estimate; for the team, not on the quote */}
        <div style={panel}>
          <strong style={{ fontSize: 14 }}>Notes</strong> <span style={{ fontSize: 11.5, color: '#999' }}>general notes on this estimate - not on the quote</span>
          <textarea value={est.notes || ''} onChange={e => change(x => ({ ...x, notes: e.target.value }))} disabled={!!est.archived} placeholder="Anything worth knowing about this estimate…" rows={6}
            style={{ ...inp, marginTop: 8, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
        </div>
        <div style={panel}>
          <strong style={{ fontSize: 14 }}>Cost breakdown</strong> <span style={{ fontSize: 11.5, color: '#999' }}>before profit and MCD</span>
          <Breakdown rows={bud.byCategory} money={money} />
        </div>
        <div style={panel}>
          <strong style={{ fontSize: 14 }}>Budgets by supplier</strong> <span style={{ fontSize: 11.5, color: '#999' }}>products only</span>
          <Breakdown rows={bud.bySupplier} money={money} />
        </div>
      </div>

      </fieldset>

      {linking && <DealLinker onClose={() => setLinking(false)} onPick={async (dealId) => {
        if (dirty) { setErr('Save first, then link the deal'); setLinking(false); return }
        try { const d = await estApi(API, { action: 'link', id: est.id, dealId }); setEst(d.estimate); setBase(d.estimate.updatedAt); setCrm(d.crm); setLinking(false) } catch (e) { setErr(e.message) }
      }} />}
      {picking && <TemplatePicker templates={templates} onClose={() => setPicking(false)} onPick={(t) => { const below = picking === 'below'; setPicking(false); addRow(itemFromTemplate(t), true, below) }} />}
      {item && <Popout item={item} est={est} lib={lib} templates={templates} money={money} onChange={(fn) => setRow(item.id, (r) => ({ buildup: fn(r.buildup) }))} setRow={(patch) => setRow(item.id, patch)} onClose={() => setPopout(null)} />}
    </EstimatingShell>
  )
}

function Popout({ item, est, lib: libIn, templates = [], money, onChange, setRow, onClose }) {
  const s = est.settings || {}
  // This quote's own supplier adjustments, as the take-off prices them (1094).
  const lib = useMemo(() => adjustLib(libIn, est.adjustments), [libIn, est.adjustments])
  const p = priceItem(item, lib, s)
  const [saving, setSaving] = useState(null)   // { category, name } when adding as a new template
  const source = templates.find(t => t.ref === item.templateRef)   // the template this item came from, if any
  const [msg, setMsg] = useState('')
  const value = { ...item.buildup, unit: item.unit }
  // ADD AS A NEW TEMPLATE (1114) - from the take-off a build-up is only ever
  // ADDED to the library, never saved over an existing one (that is done on the
  // Build-ups page). The server's 'add' action cannot overwrite: a name already
  // in use in that category is refused.
  async function saveTemplate() {
    try {
      const d = await estApi('/api/estimating/build-ups', { action: 'add', template: { section: saving.category, description: saving.name, unit: item.unit, sizes: item.buildup.sizes, lines: item.buildup.lines, rules: item.buildup.rules, descText: item.buildup.descText, descVars: item.buildup.descVars, commentsCleared: true } })
      setMsg(`Added to the library as a new template: "${d.template.description}" in ${d.template.section || 'no category'}.`); setSaving(null)
    } catch (e) { setMsg(e.message) }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '30px 20px', overflowY: 'auto' }}>
      {/* As wide as the screen allows (1105) - a build-up line fits without sideways scrolling */}
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 'min(1500px, 96vw)', padding: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={lbl}>Item<input value={item.description} onChange={e => setRow({ description: e.target.value })} style={{ ...inp, minWidth: 340 }} /></label>
          <label style={lbl}>Unit<select value={item.unit || ''} onChange={e => setRow({ unit: e.target.value })} style={inp}><option value="">—</option>{BU_UNITS.map(u => <option key={u} value={u}>{BU_UNIT_LABEL[u]}</option>)}</select></label>
          <label style={lbl}>Quantity<input value={item.rateOnly ? '' : (item.qty ?? '')} disabled={item.rateOnly} placeholder={item.rateOnly ? 'TBC (rate only)' : ''} onChange={e => setRow({ qty: e.target.value === '' ? null : e.target.value })} style={{ ...inp, width: 110 }} /></label>
          <label style={lbl}>Profit % (this item)<NumBox pct value={item.profit ?? null} onChange={v => setRow({ profit: v })} placeholder={s.profit != null ? `${pct(s.profit)} (quote)` : 'quote'} style={{ ...inp, width: 120 }} /></label>
          <div style={{ flex: 1 }} />
          <button onClick={() => setSaving({ category: source?.section || '', name: '' })} style={btn} title="Add this build-up to the library as a NEW template - existing templates are never changed from here">Add as new template…</button>
          <button onClick={onClose} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}>Done</button>
        </div>
        {saving && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13, background: '#fafaf9', padding: 10, borderRadius: 8 }}>
            Add to the library as a NEW template, named
            <input value={saving.name} onChange={e => setSaving({ ...saving, name: e.target.value })} placeholder={`e.g. ${item.description} - variant`} autoFocus style={{ ...inp, width: 260 }} />
            in category <input value={saving.category} onChange={e => setSaving({ ...saving, category: e.target.value })} placeholder="category" style={{ ...inp, width: 180 }} />
            <button onClick={saveTemplate} disabled={!saving.name.trim()} style={{ ...btn, opacity: saving.name.trim() ? 1 : 0.5 }}>Add</button><button onClick={() => setSaving(null)} style={btn}>Cancel</button>
            <span style={{ fontSize: 11.5, color: '#888', flexBasis: '100%' }}>Existing templates are never changed from the take-off - edit them on the Build-ups page.</span>
          </div>
        )}
        {msg && <div style={{ fontSize: 12.5, color: '#0f766e', marginTop: 8 }}>{msg}</div>}
        <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>Changes here belong to this estimate only - the library is never changed from here (Add as new template adds a new one).</div>
        <div style={{ marginTop: 10 }}><DocumentsPanel ownerType="estimate" ownerId={est.id} itemId={item.id} title="Documents on this item" /></div>
        <BuildupEditor varLibrary={variableLibrary(templates)} value={value} onChange={(fn) => onChange((b) => { const n = fn({ ...b, unit: item.unit }); const { unit, ...rest } = n; return rest })}
          lib={lib} money={money} rateTitle="Rate on this quote"
          rateOpts={{ profit: item.profit != null ? item.profit : (s.profit || 0), mcd: s.mcd || 0, labourFactor: s.labourFactor ?? 1, jobQty: item.rateOnly || item.qty == null ? null : Number(item.qty) }}>
          <div style={{ fontSize: 12.5, color: '#555' }}>
            On this quote: profit {pct(item.profit != null ? item.profit : s.profit) || 0}%{item.profit != null ? ' (this item)' : ''} · MCD {pct(s.mcd) || 0}% · labour factor {s.labourFactor ?? 1}
            {p.total != null && <> · <strong>{money(p.total, { dp: 2 })}</strong> for {item.qty} {BU_UNIT_LABEL[item.unit] || ''}</>}
          </div>
        </BuildupEditor>
      </div>
    </div>
  )
}

function DealLinker({ onClose, onPick }) {
  const [deals, setDeals] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => { estApi(`${API}?deals=1`).then(d => setDeals(d.deals)).catch(() => setDeals([])) }, [])
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const list = (deals || []).filter(d => words.length && words.every(w => `${d.title} ${d.organisation}`.toLowerCase().includes(w))).slice(0, 30)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Link a CRM deal</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search deals by name or customer…" style={inp} autoFocus />
        <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 6 }}>
          {list.map(d => <button key={d.id} onClick={() => onPick(d.id)} style={{ display: 'block', width: '100%', textAlign: 'left', border: '1px solid #eee', borderRadius: 8, padding: '8px 10px', marginBottom: 4, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}><div style={{ fontSize: 13, fontWeight: 600 }}>{d.title}</div><div style={{ fontSize: 11.5, color: '#888' }}>{d.organisation}</div></button>)}
        </div>
      </div>
    </div>
  )
}

function TemplatePicker({ templates: allTemplates, onClose, onPick }) {
  const templates = allTemplates.filter(t => !t.hidden && !t.catHidden)   // build-ups / categories not in use are left out (1137/1138)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState(null)
  const cats = [...new Set(templates.map(t => t.section || 'No category'))].sort()
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const list = words.length ? templates.filter(t => words.every(w => `${t.section} ${t.description}`.toLowerCase().includes(w))) : templates.filter(t => (t.section || 'No category') === cat)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Add an item from the build-ups</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search build-ups…" style={inp} autoFocus />
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 10, marginTop: 10, minHeight: 0, flex: 1 }}>
          <div style={{ overflowY: 'auto' }}>
            {cats.map(c => <button key={c} onClick={() => { setCat(c); setQ('') }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 7, padding: '7px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, background: cat === c && !q ? '#1a1a19' : 'transparent', color: cat === c && !q ? '#fff' : '#333' }}>{c}</button>)}
          </div>
          <div style={{ overflowY: 'auto' }}>
            {list.map(t => (
              <button key={t.ref} onClick={() => onPick(t)} style={{ display: 'block', width: '100%', textAlign: 'left', border: '1px solid #eee', borderRadius: 8, padding: '8px 10px', marginBottom: 4, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.description}</div>
                <div style={{ fontSize: 11.5, color: '#888' }}>{words.length ? `${t.section || 'No category'} · ` : ''}{t.unit ? `per ${BU_UNIT_LABEL[t.unit]}` : 'no unit'}</div>
              </button>
            ))}
            {!list.length && <div style={{ fontSize: 12.5, color: '#aaa', padding: 8 }}>{q ? 'Nothing matches.' : 'Pick a category.'}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Breakdown({ rows, money }) {
  const list = Object.entries(rows || {}).sort((a, b) => b[1] - a[1])
  const total = list.reduce((s, [, v]) => s + v, 0)
  if (!list.length) return <div style={{ fontSize: 12.5, color: '#aaa', marginTop: 6 }}>Nothing priced yet.</div>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 6 }}>
      <tbody>
        {list.map(([k, v]) => <tr key={k}><td style={{ padding: '3px 0' }}>{k}</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{money(v, { dp: 2 })}</td></tr>)}
        <tr><td style={{ padding: '4px 0', fontWeight: 700, borderTop: '1px solid #eee' }}>Total</td><td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700, borderTop: '1px solid #eee' }}>{money(total, { dp: 2 })}</td></tr>
      </tbody>
    </table>
  )
}

const panel = { background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 12 }
const DEFAULT_COLS = ['matRate', 'matTotal', 'labRate', 'labTotal', 'profitRate', 'profitTotal', 'profitPct', 'rateOnly']
const ColTick = ({ c, cols, toggle }) => <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', cursor: 'pointer' }}><input type="checkbox" checked={cols.has(c.key)} onChange={() => toggle(c.key)} />{c.label}</label>
const Arrows = ({ i, move }) => <span style={{ whiteSpace: 'nowrap' }}><button onClick={() => move(i, -1)} style={iconBtn} title="Up">↑</button><button onClick={() => move(i, 1)} style={iconBtn} title="Down">↓</button></span>
const lbl = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#666' }
const cellInp = { fontSize: 13, padding: '5px 7px', border: '1px solid #d4d4d0', borderRadius: 6, fontFamily: 'inherit', boxSizing: 'border-box' }
const iconBtn = { border: 'none', background: 'none', cursor: 'pointer', color: '#888', fontSize: 13, padding: '2px 4px', fontFamily: 'inherit' }
const smallBtn = { fontSize: 12, padding: '5px 10px', border: '1px solid #d4d4d0', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }

// THIS QUOTE'S PRICE ADJUSTMENTS (1094): a supplier's increase or discount on
// this estimate only, on top of the price list. Revisions record them.
function QuoteAdjustments({ est, change, suppliers }) {
  const [f, setF] = useState({ supplier: '', pct: '', note: '' })
  const list = est.adjustments || []
  const add = () => {
    const pct = parseFloat(f.pct) / 100
    if (!f.supplier || !Number.isFinite(pct) || pct === 0 || pct <= -1) return
    change(e => ({ ...e, adjustments: [...(e.adjustments || []), { id: `qa${Date.now().toString(36)}`, supplier: f.supplier, pct, note: f.note.trim() }] }))
    setF({ supplier: '', pct: '', note: '' })
  }
  return (
    <div style={{ marginTop: 10, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 10, fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>This quote's price adjustments <span style={{ fontWeight: 400, color: '#666', fontSize: 12 }}>- e.g. a supplier's discount for this project. On top of the price list; the price list is not changed.</span></div>
      {list.map(a => (
        <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '2px 0' }}>
          <span><strong>{a.supplier}</strong> {pctText(a.pct)}{a.note ? ` - ${a.note}` : ''}</span>
          <button onClick={() => change(e => ({ ...e, adjustments: (e.adjustments || []).filter(x => x.id !== a.id) }))} style={{ border: 'none', background: 'none', color: '#b42318', cursor: 'pointer', fontSize: 12 }}>Remove</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={f.supplier} onChange={e => setF({ ...f, supplier: e.target.value })} style={{ ...cellInp, minWidth: 180 }}><option value="">Supplier…</option>{suppliers.map(x => <option key={x}>{x}</option>)}</select>
        <input value={f.pct} onChange={e => setF({ ...f, pct: e.target.value })} placeholder="% e.g. -10" style={{ ...cellInp, width: 90 }} />
        <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="note" style={{ ...cellInp, width: 200 }} />
        <button onClick={add} style={smallBtn}>Add</button>
      </div>
    </div>
  )
}

// THE SAVE STATUS (1100) beside the title.
function SaveStatus({ state, dirty, archived }) {
  if (archived) return <span style={{ fontSize: 12.5, color: '#888' }}>Archived - read-only</span>
  const t = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (state.kind === 'conflict') return <span style={{ fontSize: 12.5, color: '#b42318', fontWeight: 600, maxWidth: 380 }} title={state.msg}>Not saved - someone else saved this estimate since you opened it. Reload to see their changes; autosave has stopped so nothing of theirs is overwritten.</span>
  if (state.kind === 'retry') return <span style={{ fontSize: 12.5, color: '#b45309', fontWeight: 600 }} title={state.msg}>Not saved - retrying…</span>
  if (state.kind === 'saving') return <span style={{ fontSize: 12.5, color: '#888' }}>Saving…</span>
  if (dirty) return <span style={{ fontSize: 12.5, color: '#888' }}>Unsaved changes…</span>
  if (state.kind === 'saved') return <span style={{ fontSize: 12.5, color: '#15803d' }}>All changes saved {t(state.at)}</span>
  return <span style={{ fontSize: 12.5, color: '#aaa' }}>Saves automatically</span>
}

const bannerBtn = { fontSize: 12.5, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.7)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit' }
