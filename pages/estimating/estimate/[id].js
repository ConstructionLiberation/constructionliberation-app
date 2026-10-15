import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import EstimatingShell, { ErrorBar, estApi } from '../../../components/EstimatingShell'
import { useFormat } from '../../../components/TenantProvider'
import { th, td, tdR, inp, btn } from '../../../components/LibraryParts'
import BuildupEditor, { pct, fromPct, NumBox } from '../../../components/BuildupEditor'
import { LetterTab, ClarificationsTab, DocumentsTab, QuotePreview } from '../../../components/QuoteTabs'
import DocumentsPanel from '../../../components/DocumentsPanel'
import MaterialsTab from '../../../components/MaterialsTab'
import LabourRates from '../../../components/LabourRates'
import { buildEstimateLabourLines } from '../../../lib/estimateLabour'
import { placeholderValues, checklistOf, letterOf, letterProblems, letterProblemText, clarOf, clarRedCount } from '../../../lib/quoteDocs'
import { adjustLib, pctText } from '../../../lib/priceAdjust'
import { normalizeTemplate, needsNormalizing, descriptionParts, descriptionText, needsAmending, missingSizes, itemsMissingSizes, missingVars, variableLibrary, missingProducts } from '../../../lib/buildups'
import { BU_UNITS, BU_UNIT_LABEL } from '../../../lib/buildups'
import { CRM_DETAILS, OWN_DETAILS, detailsFor, itemFromTemplate, uniqueItem, sectionRow, spacerRow, copyRows, lineRow, uncostedItems, uncostedText, labelBudget, NO_SUPPLIER, withLock, priceLibOf, priceEstimate, sectionTotals, priceItem, budgets, diffEstimates, prelimsRows } from '../../../lib/estimate'

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
  const [libRaw, setLib] = useState({ product: {}, labour: {}, products: [], labourItems: [] })
  // a revision being edited is priced AS AT ITS ISSUE (1154) - its own prices win
  const lib = useMemo(() => withLock(libRaw, est && est.priceLock), [libRaw, est && est.priceLock])
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
  // EXPORT THE TAKE-OFF TO EXCEL (1170) - as it is on screen: Description (and
  // its build-up description), Qty, Unit, Rate, Total, then the optional columns
  // SHOWING, in the same order; sections, blank lines, the Totals row and the
  // items below the line. The Excel library loads only when it is used.
  async function exportTakeoff(shownCols) {
    try {
      const XLSX = await import('xlsx')
      const VAL = {
        matRate: (r, p) => [p.materialsRate], matTotal: (r, p) => [p.materialsTotal],
        labRate: (r, p) => [p.labourRate], labTotal: (r, p) => [p.labourTotal],
        profitRate: (r, p) => [p.profitRate], profitTotal: (r, p) => [p.profitTotal],
        profitPct: (r) => [r.profit == null ? null : r.profit], rateOnly: (r) => [r.rateOnly ? 'Yes' : ''],
      }
      const FOOT = { matTotal: [totals.materials], labTotal: [totals.labour], profitTotal: [totals.profit] }
      const valOf = (c, r, p) => c.supplier ? (() => { const sup = c.key.slice(4), v = (p.bySupplier || {})[sup]; return [v ?? null, v != null && p.qty != null && !p.belowLine ? v * p.qty : null] })() : (VAL[c.key] ? VAL[c.key](r, p) : (c.heads || []).map(() => null))
      const footOf = (c) => c.supplier ? [null, (totals.bySupplier || {})[c.key.slice(4)] ?? null] : (FOOT[c.key] || (c.heads || []).map(() => null))
      const head = ['Description', 'Build-up description', 'Qty', 'Unit', 'Rate', 'Total', ...shownCols.flatMap(c => c.heads)]
      const money = new Set([4, 5]); let col = 6
      for (const c of shownCols) for (const h of c.heads) { if (c.key !== 'profitPct' && c.key !== 'rateOnly') money.add(col); col++ }
      const pctCol = head.indexOf('Profit %')
      const out = [[`${est.quoteRef ? `${est.quoteRef} - ` : ''}${est.title || 'Estimate'} - take-off, Rev ${(est.reopened && est.reopened.revision) || est.revision}`], [`Exported ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`], [], head]
      const rows = est.rows || []
      const totalsRow = () => ['Totals', '', '', '', '', totals.total, ...shownCols.flatMap(footOf)]
      let past = false
      for (const r of rows) {
        if (r.kind === 'line') { out.push(totalsRow(), [], ['BELOW THE LINE - rate-only and optional items, not in the total']); past = true; continue }
        if (r.kind === 'spacer') { out.push([]); continue }
        if (r.kind === 'section') { out.push([r.title || '']); continue }
        if (r.kind !== 'item') continue
        const p = priced[r.id] || {}
        let spec = ''
        try { spec = r.buildup ? descriptionText(r.buildup, lib).replace(/\n?————————\n?/g, ' / ').replace(/\s+/g, ' ').trim() : '' } catch {}
        out.push([r.description || '', spec, r.rateOnly ? 'TBC' : (r.qty == null || r.qty === '' ? null : Number(r.qty)), BU_UNIT_LABEL[r.unit] || r.unit || '', p.rate ?? null, past || r.rateOnly ? (p.optional && p.total != null ? p.total : null) : (p.total ?? null), ...shownCols.flatMap(c => valOf(c, r, p))])
      }
      if (!past) out.push(totalsRow())
      const ws = XLSX.utils.aoa_to_sheet(out)
      const range = XLSX.utils.decode_range(ws['!ref'])
      for (let R = 4; R <= range.e.r; R++) for (let C = 0; C <= range.e.c; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
        if (!cell || cell.t !== 'n') continue
        if (money.has(C)) cell.z = '#,##0.00'; else if (C === pctCol) cell.z = '0.00%'
      }
      ws['!cols'] = head.map((h, i) => ({ wch: i === 0 ? 38 : i === 1 ? 60 : Math.max(10, String(h).length + 2) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Take-off')
      const safe = (x) => String(x || '').replace(/[^A-Za-z0-9 _.-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60)
      XLSX.writeFile(wb, `${safe(est.quoteRef || est.title || 'estimate')}-Rev-${(est.reopened && est.reopened.revision) || est.revision}-take-off.xlsx`)
    } catch (e) { setErr(`Could not export: ${e.message}`) }
  }
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
  // A REVISION'S TAKE-OFF, as issued (1151)
  const [revView, setRevView] = useState(null)      // { loading } | { snap } | { error }
  async function openRevision(rev) {
    setRevView({ loading: true, revision: rev })
    try { const r = await fetch(`${API}?id=${encodeURIComponent(est.id)}&rev=${encodeURIComponent(rev)}`); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load it'); setRevView({ snap: d.revision }) }
    catch (e) { setRevView({ error: e.message, revision: rev }) }
  }
  async function reopenRevision(rev) {
    if (!window.confirm(`Edit Rev ${rev}? It opens as issued, at its own prices. Your draft is KEPT - switch between them at the top. Issuing then replaces Rev ${rev} (no new letter).`)) return
    if (dirty && !(await flushSave())) { setErr('The estimate could not be saved'); return }
    setBusy(true); setErr('')
    try { const d = await estApi(API, { action: 'reopen', id: est.id, revision: rev, baseUpdatedAt: base }); setEst(d.estimate); setBase(d.estimate.updatedAt); setRevView(null); setTab('takeoff'); setIssueMsg(`Rev ${rev} is open for editing - issue it again when ready.`) }
    catch (e) { setErr(e.message) }
    setBusy(false)
  }
  // SWITCH between the draft and a revision being edited (1154) - each keeps its changes
  async function switchTo(key) {
    if (dirty && !(await flushSave())) { setErr('The estimate could not be saved'); return }
    setBusy(true); setErr('')
    try { const d = await estApi(API, { action: 'switch', id: est.id, to: key, baseUpdatedAt: base }); setEst(d.estimate); setBase(d.estimate.updatedAt); setSel(new Set()) }
    catch (e) { setErr(e.message) }
    setBusy(false)
  }
  async function markSent(rev, sent) {
    setBusy(true); setErr('')
    try { const d = await estApi(API, { action: 'mark-sent', id: est.id, revision: rev, sent }); setEst(d.estimate); setBase(d.estimate.updatedAt) }
    catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const labourLines = useMemo(() => est ? buildEstimateLabourLines(est, lib) : [], [est, lib])   // (1167)
  // THE QUOTE TAB'S REVISIONS (1168) - the draft, or an issued revision as issued
  const [quoteRev, setQuoteRev] = useState('draft')
  const [revSnaps, setRevSnaps] = useState({})
  const [revSnapErr, setRevSnapErr] = useState('')
  const showRev = (r) => {
    setQuoteRev(r); setRevSnapErr('')
    if (r !== 'draft' && !revSnaps[r]) estApi(`${API}?id=${encodeURIComponent(est.id)}&rev=${encodeURIComponent(r)}`).then(d => setRevSnaps(m => ({ ...m, [r]: d.revision }))).catch(e => setRevSnapErr(e.message))
  }
  const revBar = est ? (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', background: '#fff', border: '1px solid #e8e7e3', borderRadius: 10, padding: '8px 10px' }}>
      <span style={{ fontSize: 12.5, color: '#666', marginRight: 4 }}>Revision:</span>
      {[{ key: 'draft', label: est.reopened ? `Rev ${est.reopened.revision} - editing` : `Draft Rev ${est.revision}`, sent: false },
        ...(est.revisions || []).slice().reverse().filter(r => !(est.reopened && r.revision === est.reopened.revision)).map(r => ({ key: r.revision, label: `Rev ${r.revision}`, sent: !!r.sent, at: r.issuedAt }))]
        .map(b => (
          <button key={b.key} onClick={() => showRev(b.key)} title={b.at ? `Issued ${new Date(b.at).toLocaleDateString('en-GB')}` : 'The working draft'}
            style={{ fontSize: 12.5, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', border: `1px solid ${quoteRev === b.key ? '#0f766e' : '#d4d4d0'}`, background: quoteRev === b.key ? '#0f766e' : '#fff', color: quoteRev === b.key ? '#fff' : '#333', fontWeight: quoteRev === b.key ? 600 : 400 }}>
            {b.label}{b.sent && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: quoteRev === b.key ? '#dcfce7' : '#15803d' }}>SENT</span>}
          </button>
        ))}
    </div>
  ) : null
  // the documents listed on the quote's Documents page
  const [quoteDocsList, setQuoteDocsList] = useState([])
  useEffect(() => {
    if (tab !== 'quote' || !est) return
    fetch(`/api/estimating/documents?ownerType=estimate&ownerId=${encodeURIComponent(est.id)}`).then(r => r.ok ? r.json() : { documents: [] }).then(d => setQuoteDocsList((d.documents || []).filter(x => !x.itemId).map(x => ({ id: x.id, name: x.name, revision: x.revision || null, href: `/api/estimating/documents?ownerType=estimate&ownerId=${encodeURIComponent(est.id)}&download=${x.id}` })))).catch(() => {})
  }, [tab, est && est.id])
  const [warnList, setWarnList] = useState(null)   // 'cost' | 'qty' - the list behind a red warning (1146)
  const [showChecklist, setShowChecklist] = useState(false)   // re-open a completed checklist (1142)
  const [ckNew, setCkNew] = useState('')
  const [canEditDocs, setCanEditDocs] = useState(false)   // an admin - may edit the company checklist here (1146)
  const [ckEdit, setCkEdit] = useState(null)               // the company list being edited
  const [ckErr, setCkErr] = useState('')
  async function saveCompanyChecklist() {
    setCkErr('')
    try {
      const d = await estApi('/api/estimating/quote-templates', { action: 'save', checklist: ckEdit.filter(x => x.text.trim()) })
      setQuoteDocs(d.templates); setCkEdit(null)
    } catch (e) { setCkErr(e.message) }
  }
  const [quoteDocs, setQuoteDocs] = useState(null)   // the company letter, clarifications library, T&Cs
  const [lastRev, setLastRev] = useState(null)    // the last ISSUED revision's estimate - for 'changes since'
  const [issueMsg, setIssueMsg] = useState('')
  const [sentView, setSentView] = useState(null)    // the quote just marked as sent: { revision, at, est } - printed as issued

  useEffect(() => {
    if (!id) return
    Promise.all([estApi(`${API}?id=${id}`), estApi('/api/estimating/price-list'), estApi('/api/estimating/labour-rates'), estApi('/api/estimating/build-ups'), estApi('/api/estimating/quote-templates').catch(() => ({ templates: null }))])
      .then(([e, p, l, b, q]) => {
        setQuoteDocs(q.templates); setCanEditDocs(!!q.canEdit)
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
  // A SECTION HEADER takes everything under it - to the next header or the line (1150).
  const toggleSel = (id) => setSel(x => {
    const n = new Set(x), on = !n.has(id)
    const rows = est?.rows || [], k = rows.findIndex(r => r.id === id)
    const ids = [id]
    if (k >= 0 && rows[k].kind === 'section') for (let j = k + 1; j < rows.length && rows[j].kind !== 'section' && rows[j].kind !== 'line'; j++) ids.push(rows[j].id)
    for (const i of ids) { if (on) n.add(i); else n.delete(i) }
    return n
  })
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
  // MOVE ACROSS THE LINE (1147) - the ticked lines, in their order: below goes to
  // the end of the below-the-line items (adding the line if there is none);
  // above goes just above the line.
  const moveAcross = (below) => change(e => {
    const moving = e.rows.filter(r => sel.has(r.id) && r.kind !== 'line')
    if (!moving.length) return e
    let rest = e.rows.filter(r => !sel.has(r.id) || r.kind === 'line')
    if (!rest.some(r => r.kind === 'line')) { if (!below) return e; rest = [...rest, lineRow()] }
    const k = rest.findIndex(r => r.kind === 'line')
    return { ...e, rows: below ? [...rest, ...moving] : [...rest.slice(0, k), ...moving, ...rest.slice(k)] }
  })
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
  const since = useMemo(() => est && lastRev ? diffEstimates({ ...lastRev.estimate, priceLock: lastRev.priceLib || lastRev.estimate.priceLock || null }, est, libRaw) : [], [est, lastRev, libRaw])

  async function issue(andPrint) {
    // SENT TO THE CUSTOMER (1164) - not with a gap in the letter or red text to edit
    if (andPrint) { const p = letterProblems(letterOf(est, quoteDocs), values); if (p.missing.length || p.red) { setErr(`The letter cannot go to the customer yet: ${letterProblemText(p)}. Fix it on the Letter tab, then send.`); setTab('letter'); return }
      const cr = clarRedCount(clarOf(est, quoteDocs)); if (cr) { setErr(`The clarifications have ${cr} red part${cr === 1 ? '' : 's'} to check - keep (Clear red) or delete each, then send.`); setTab('clar'); return } }
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
      const d = await estApi(API, { action: 'issue', id: est.id, note, baseUpdatedAt: base, sent: !!andPrint })
      setLastRev({ revision: d.issued, total: d.total, estimate: JSON.parse(JSON.stringify(est)), priceLib: priceLibOf(est, lib) })
      setEst(d.estimate); setBase(d.estimate.updatedAt)
      if (andPrint) {
        // Print the quote AS ISSUED (that revision, today's date) - then back to the draft.
        setSentView({ revision: d.issued, at: new Date().toISOString(), est: asSent })
        setTimeout(() => { window.print(); setTimeout(() => setSentView(null), 500) }, 300)
      }
      setIssueMsg(`Rev ${d.issued} issued at ${money(d.total, { dp: 2 })}.${d.crm ? (d.crm.updated ? ` CRM deal value ${money(d.crm.from, { dp: 2 })} → ${money(d.crm.to, { dp: 2 })}.` : d.crm.error ? ` ${d.crm.error}` : ` ${d.crm.note}`) : ''} Now working on Rev ${d.estimate.revision}.`)
      if (d.replaced) setIssueMsg(m => `${m} Rev ${d.issued} replaced - back on the draft.`)
      if (d.setAside) setIssueMsg(m => `${m} The edit of the previous revision was set aside - it is no longer the latest.`)
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
      {/* WORKING ON (1154) - the draft, or a revision being edited; each keeps its changes */}
      {(est.parked || []).length > 0 && (() => {
        const copies = [{ key: est.reopened ? est.reopened.revision : 'draft', active: true, label: est.reopened ? `Rev ${est.reopened.revision} - editing` : `Draft Rev ${est.revision}` },
          ...(est.parked || []).map(p => ({ key: p.content.reopened ? p.content.reopened.revision : 'draft', active: false, label: p.content.reopened ? `Rev ${p.content.reopened.revision} - editing` : `Draft Rev ${p.content.revision}` }))]
          .sort((a, b) => (a.key === 'draft') - (b.key === 'draft'))
        return (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0', fontSize: 13 }}>
            <span style={{ color: '#666' }}>Working on:</span>
            {copies.map(c => <button key={c.key} onClick={() => !c.active && switchTo(c.key)} disabled={busy || c.active} style={{ fontSize: 12.5, padding: '5px 12px', borderRadius: 7, cursor: c.active ? 'default' : 'pointer', border: `1px solid ${c.active ? '#0f766e' : '#d4d4d0'}`, background: c.active ? '#0f766e' : '#fff', color: c.active ? '#fff' : '#333', fontWeight: c.active ? 600 : 400 }}>{c.label}</button>)}
            <span style={{ fontSize: 11.5, color: '#999' }}>each keeps its own changes</span>
          </div>
        )
      })()}
      {est.priceLock && (
        <div style={{ margin: '6px 0', fontSize: 12.5, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', borderRadius: 8, padding: '6px 10px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>Priced as at <strong>Rev {est.reopened ? est.reopened.revision : est.revision}</strong> - price-list changes since it was issued do not apply.</span>
          {!est.archived && <button onClick={() => { if (window.confirm('Price this revision at today\'s price list instead?')) change(e => ({ ...e, priceLock: null })) }} style={{ ...smallBtn, marginLeft: 'auto' }}>Use today's prices</button>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e8e7e3', marginBottom: 14 }}>
        {[['takeoff', 'Take-off'], ['budgets', 'Summary'], ['materials', 'Materials'], ['labour', 'Labour Schedule'], ['letter', 'Letter'], ['clar', 'Clarifications'], ['docs', 'Documents'], ['quote', 'Quote']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ border: 'none', borderBottom: `2px solid ${tab === k ? '#0f766e' : 'transparent'}`, background: 'none', padding: '8px 14px', fontSize: 13.5, fontWeight: tab === k ? 700 : 500, color: tab === k ? '#0f766e' : '#666', cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1 }}>{label}</button>
        ))}
      </div>
      {/* BUDGETS (1146) - the cost breakdown and material budgets, on their own tab */}
      {tab === 'budgets' && (() => {
        // THE SUMMARY CARDS (1151) - above the cost breakdown and material budgets
        const rateOnlyN = (est.rows || []).filter(r => r.kind === 'item' && priced[r.id]?.belowLine && !priced[r.id]?.optional).length
        const margin = totals.total > 0 ? totals.profit / totals.total : null
        const card = (title, value, sub, accent) => (
          <div style={{ background: '#fff', border: `1px solid ${accent || '#e8e7e3'}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11.5, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>{title}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: accent ? '#0f766e' : '#1a1a19', marginTop: 4 }}>{value}</div>
            {sub && <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>{sub}</div>}
          </div>
        )
        return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: 12, marginTop: 14 }}>
          {card('Margin', margin == null ? '—' : `${(margin * 100).toFixed(1)}%`, margin == null ? 'nothing priced above the line yet' : `profit ${money(totals.profit, { dp: 2 })} on ${money(totals.total, { dp: 2 })} - MCD ${money(totals.profitAndMcd - totals.profit, { dp: 2 })} on top`, '#99f6e4')}
          {(() => { const n = (est.rows || []).filter(r => r.kind === 'item' && priced[r.id] && !priced[r.id].belowLine).length
            return card('Above the line', money(totals.total, { dp: 2 }), `${n} item${n === 1 ? '' : 's'} - the quote total`) })()}
          {card('Below the line', money(totals.optional || 0, { dp: 2 }), `optional items${rateOnlyN ? ` + ${rateOnlyN} rate-only (no total)` : ''} - not in the quote total`)}
          {card('Above + below', money((totals.total || 0) + (totals.optional || 0), { dp: 2 }), 'if every optional item is taken')}
        </div>
        )
      })()}
      {tab === 'budgets' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 12, marginTop: 14, alignItems: 'start' }}>
        <div style={panel}>
          <strong style={{ fontSize: 14 }}>Cost breakdown</strong> <span style={{ fontSize: 11.5, color: '#999' }}>before profit and MCD</span>
          <Breakdown rows={bud.byCategory} money={money} />
        </div>
        <div style={panel}>
          <BudgetPanel bud={bud} est={est} change={change} money={money} />
        </div>
        </div>
      )}
      {/* LABOUR SCHEDULE (1167) - the take-off's labour, priced by subcontractors:
          the same screen as Contracted Rates > Labour Rates, off this estimate */}
      {tab === 'labour' && (
        <div style={{ marginTop: 14 }}>
          {dirty && <div style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 12px', marginBottom: 10 }}>Unsaved changes on the take-off - schedules are made from the saved take-off, so save first.</div>}
          <LabourRates estimateId={est.id} lines={labourLines} />
        </div>
      )}
      {tab === 'materials' && <MaterialsTab est={est} lib={lib} change={change} money={money} readOnly={!!crm?.archived} />}
      {tab === 'quote' && quoteRev === 'draft' && <QuotePreview revBar={revBar} documents={quoteDocsList.filter(d => d.revision === ((est.reopened && est.reopened.revision) || est.revision))} est={sentView ? { ...sentView.est, revision: sentView.revision } : est} values={values} priced={priced} totals={totals} templates={quoteDocs} money={money} companyName={companyName} lib={lib} draft={!sentView}
        actions={<>
          <button onClick={() => issue(true)} disabled={busy || dirty || s.profit == null || !!crm?.archived} title={dirty ? 'Save first' : s.profit == null ? 'Set the profit % first' : ''} style={{ fontSize: 12.5, padding: '6px 12px', border: 'none', borderRadius: 7, background: '#0f766e', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: busy || dirty || s.profit == null || crm?.archived ? 0.5 : 1 }}>Download and mark as sent (Rev {est.revision})</button>
          {dirty && <span style={{ fontSize: 12, color: '#b45309' }}>Save first</span>}
          {(() => { const last = (est.revisions || []).slice(-1)[0]; if (!last) return null
            return last.sent
              ? <span style={{ fontSize: 12, color: '#15803d' }}>Rev {last.revision} sent {new Date(last.sent.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · <button onClick={() => { if (window.confirm(`Unmark Rev ${last.revision} as sent? It can then be edited (Revisions > View > Edit) and issued again as Rev ${last.revision}.`)) markSent(last.revision, false) }} disabled={busy} style={{ border: 'none', background: 'none', color: '#0f766e', textDecoration: 'underline', cursor: 'pointer', fontSize: 12, padding: 0 }}>Unmark sent</button></span>
              : <span style={{ fontSize: 12, color: '#666' }}>Rev {last.revision} issued, not sent · <button onClick={() => markSent(last.revision, true)} disabled={busy} style={{ border: 'none', background: 'none', color: '#0f766e', textDecoration: 'underline', cursor: 'pointer', fontSize: 12, padding: 0 }}>Mark as sent</button></span> })()}
        </>} />}
      {/* AN ISSUED REVISION, AS ISSUED (1168) - its own letter, clarifications,
          prices, date and terms, from its snapshot */}
      {tab === 'quote' && quoteRev !== 'draft' && (() => {
        const snap = revSnaps[quoteRev]
        if (!snap) return <div>{revBar}<div style={{ color: '#888', fontSize: 13, marginTop: 10 }}>{revSnapErr || `Loading Rev ${quoteRev}…`}</div></div>
        const entry = (est.revisions || []).find(r => r.revision === quoteRev) || {}
        const estS = { ...snap.estimate, revision: snap.revision }
        const libS = withLock(libRaw, snap.priceLib)
        const live = (!snap.priced || !snap.totals) ? priceEstimate({ ...snap.estimate, priceLock: snap.priceLib || snap.estimate.priceLock || null }, libRaw) : null
        const pricedS = snap.priced || live.priced, totalsS = snap.totals || live.totals
        const at = entry.sent ? entry.sent.at : snap.issuedAt
        const valuesS = placeholderValues({ est: estS, details: detailsFor(estS, snap.crm), total: totalsS.total, companyName, money, dateText: new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) })
        return <QuotePreview revBar={revBar} documents={quoteDocsList.filter(d => d.revision === quoteRev)} est={estS} values={valuesS} priced={pricedS} totals={totalsS} templates={quoteDocs} money={money} companyName={companyName} termsOverride={snap.terms || null} lib={libS} draft={false}
          actions={entry.sent
            ? <span style={{ fontSize: 12.5, color: '#15803d' }}>Rev {quoteRev} sent {new Date(entry.sent.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · <button onClick={() => { if (window.confirm(`Unmark Rev ${quoteRev} as sent?`)) markSent(quoteRev, false) }} disabled={busy} style={{ border: 'none', background: 'none', color: '#0f766e', textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5, padding: 0 }}>Unmark sent</button></span>
            : <span style={{ fontSize: 12.5, color: '#666' }}>Rev {quoteRev} issued {new Date(snap.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, not sent · <button onClick={() => markSent(quoteRev, true)} disabled={busy} style={{ border: 'none', background: 'none', color: '#0f766e', textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5, padding: 0 }}>Mark as sent</button></span>} />
      })()}
      {revView && <RevisionViewer view={revView} est={est} lib={lib} money={money} onClose={() => setRevView(null)} onEdit={reopenRevision} busy={busy} />}
      {(tab === 'letter' || tab === 'clar' || tab === 'docs') && (
        <fieldset disabled={!!crm?.archived} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
          {tab === 'letter' && <LetterTab est={est} change={change} templates={quoteDocs} values={values} canEditTemplate={canEditDocs}
            onSaveTemplate={async (body) => { const d = await estApi('/api/estimating/quote-templates', { action: 'save', letter: { body } }); setQuoteDocs(d.templates) }} />}
          {tab === 'clar' && <ClarificationsTab est={est} change={change} templates={quoteDocs} canEditTemplate={canEditDocs}
            onSaveTemplate={async (list) => { const d = await estApi('/api/estimating/quote-templates', { action: 'save', clarTemplate: list }); setQuoteDocs(d.templates) }} />}
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
              <button onClick={() => exportTakeoff(optional.filter(c => cols.has(c.key)))} title="Download the take-off as an Excel file - with the columns showing" style={{ ...smallBtn, padding: '3px 9px', marginLeft: 6 }}>⬇ Export to Excel</button>
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
                  <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.4)' }} />
                  <button onClick={() => moveAcross(true)} style={bannerBtn} title="Rate-only / optional - not in the total">Move below the line</button>
                  {hasLine && <button onClick={() => moveAcross(false)} style={bannerBtn} title="Into the total">Move above the line</button>}
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
                          <button onClick={() => addRow(uniqueItem(''), true, true)} style={smallBtn}>+ Unique item</button>
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
                    <tr key={r.id} data-row={r.id} style={rowLook(r, r.rateOnly ? '#fafaf7' : undefined)} {...dropProps(r)}>
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
                          <div style={{ fontSize: 11.5, color: '#666', marginTop: 3, lineHeight: 1.45, maxWidth: 560, whiteSpace: 'pre-line' }}>
                            {parts.map((x, k) => x.red === 'amend' ? <span key={k} style={{ color: '#b91c1c', background: '#fee2e2', fontWeight: 600, borderRadius: 3 }}>{x.text}</span>
                              : x.red === 'missing' ? <span key={k} style={{ color: '#b91c1c', fontWeight: 700 }} title="Not chosen yet - choose it in the item's Build-up">{x.text}</span>
                              : <span key={k}>{ruled(x.text, k)}</span>)}
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
                      <td style={tdR}>{r.rateOnly ? <span style={{ color: '#888' }}>TBC</span> : <input data-qty="1" value={r.qty ?? ''} onChange={e => setRow(r.id, { qty: e.target.value === '' ? null : e.target.value })} placeholder="qty" inputMode="decimal" style={{ ...cellInp, width: 80, textAlign: 'right' }} />}</td>
                      <td style={td}>{r.unit ? BU_UNIT_LABEL[r.unit] : <span style={{ color: '#dc2626', fontWeight: 700 }} title="No unit yet - choose it in the item's Build-up">unit?</span>}</td>
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
        <button onClick={() => addRow(uniqueItem(''), true)} style={btn}>+ Unique item</button>
        <button onClick={() => addRow(spacerRow())} style={btn} title="A blank line - layout only, not on the quote">+ Blank line</button>
        {!hasLine && <button onClick={() => change(e => ({ ...e, rows: [...e.rows, lineRow()] }))} style={{ ...btn, marginLeft: 'auto', color: '#6d28d9', borderColor: '#ddd6fe' }} title="Rate-only and optional items - shown and priced, not in the total">+ Below the line</button>}
        {/* + Prelims removed (1147) - prelims come from the rate build-ups like anything else */}
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
              {canEditDocs && !ckEdit && <button onClick={() => setCkEdit(checklistOf(quoteDocs).map(x => ({ ...x })))} style={smallBtn} title="Change the reminders every estimate shows (admins)">Edit company list</button>}
              <button onClick={() => setCk(c => ({ ...c, ticked: Object.fromEntries(items.map(x => [x.id, true])) }))} disabled={!!est.archived} style={smallBtn}>Tick all</button>
              {done && <button onClick={() => setShowChecklist(false)} style={smallBtn}>Hide</button>}
            </div>
            {/* EDITING THE COMPANY LIST (1146) - admins; the same list as Admin > Quote Documents */}
            {ckEdit && (
              <div style={{ background: '#fff', border: '1px solid #fcd34d', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: '#92400e', marginBottom: 6 }}>The company list - every estimate shows these. (Reminders for this estimate only are added below.)</div>
                {ckEdit.map((x, k) => (
                  <div key={x.id} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    <input value={x.text} onChange={e => setCkEdit(l => l.map(y => y.id === x.id ? { ...y, text: e.target.value } : y))} style={{ ...inp, padding: '5px 8px', fontSize: 13 }} />
                    <button onClick={() => setCkEdit(l => { const n = [...l]; if (k > 0) [n[k - 1], n[k]] = [n[k], n[k - 1]]; return n })} style={iconBtn} title="Move up">↑</button>
                    <button onClick={() => setCkEdit(l => l.filter(y => y.id !== x.id))} style={iconBtn} title="Remove">✕</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <button onClick={() => setCkEdit(l => [...l, { id: `c${Date.now().toString(36)}`, text: '' }])} style={smallBtn}>+ Reminder</button>
                  <span style={{ flex: 1 }} />
                  {ckErr && <span style={{ fontSize: 12, color: '#b42318' }}>{ckErr}</span>}
                  <button onClick={() => { setCkEdit(null); setCkErr('') }} style={smallBtn}>Cancel</button>
                  <button onClick={saveCompanyChecklist} style={{ ...smallBtn, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}>Save company list</button>
                </div>
              </div>
            )}
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
        {uncosted.length > 0 && <button onClick={() => setWarnList(w => w === 'cost' ? null : 'cost')} style={{ ...warnBtn }} title="Click to see which items and lines">⚠ {uncosted.length} item{uncosted.length === 1 ? '' : 's'} not fully costed - the quote cannot be issued ▾</button>}
        {totals.noQty > 0 && <button onClick={() => setWarnList(w => w === 'qty' ? null : 'qty')} style={{ ...warnBtn }} title="Click to see which items">⚠ {totals.noQty} item{totals.noQty === 1 ? '' : 's'} without a quantity - not in the total ▾</button>}
      </div>
      {/* WHICH ITEMS (1146) - opened from the red warnings above */}
      {warnList && (() => {
        const noQtyItems = (est.rows || []).filter(r => r.kind === 'item' && !r.rateOnly && priced[r.id] && !priced[r.id].belowLine && priced[r.id].qty == null)
        const list = warnList === 'cost' ? uncosted.map(x => ({ id: x.id, name: x.description, detail: [x.lines.length ? `${x.lines.length} line${x.lines.length === 1 ? '' : 's'} without a cost: ${x.lines.join(', ')}` : '', x.zeroRate ? 'rate £0' : ''].filter(Boolean).join(' - ') }))
          : noQtyItems.map(r => ({ id: r.id, name: r.description, detail: 'no quantity - type one in its Qty box' }))
        const go = (id) => {
          const tr = document.querySelector(`tr[data-row="${id}"]`); if (tr) tr.scrollIntoView({ behavior: 'smooth', block: 'center' })
          if (warnList === 'cost') setPopout(id)
          else setTimeout(() => { const q = document.querySelector(`tr[data-row="${id}"] input[data-qty]`); if (q) q.focus() }, 350)
        }
        return (
          <div style={{ marginTop: 8, background: '#fff', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <strong style={{ fontSize: 13, color: '#b91c1c' }}>{warnList === 'cost' ? 'Not fully costed' : 'Without a quantity'}</strong>
              <span style={{ fontSize: 11.5, color: '#888', marginLeft: 8 }}>{warnList === 'cost' ? 'click an item to open its build-up' : 'click an item to go to its quantity'}</span>
              <button onClick={() => setWarnList(null)} style={{ ...iconBtn, marginLeft: 'auto' }} title="Close">✕</button>
            </div>
            {!list.length ? <div style={{ fontSize: 12.5, color: '#15803d' }}>✓ None now.</div> : list.map(x => (
              <button key={x.id} onClick={() => go(x.id)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderTop: '1px solid #fdecec', background: 'none', padding: '6px 2px', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a19' }}>{x.name}</span>
                <span style={{ fontSize: 12, color: '#b91c1c', marginLeft: 8 }}>{x.detail}</span>
              </button>
            ))}
          </div>
        )
      })()}

      {issueMsg && <div style={{ marginTop: 10, fontSize: 13, color: '#0f766e', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, padding: '8px 12px' }}>{issueMsg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14, alignItems: 'start' }}>
        <div style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>Revisions</strong>
            <button onClick={issue} disabled={busy || dirty || s.profit == null} title={dirty ? 'Save first' : s.profit == null ? 'Set the profit % first' : ''} style={{ ...btn, opacity: busy || dirty || s.profit == null ? 0.5 : 1 }}>Issue Rev {est.revision}</button>
          </div>
          {dirty && <div style={{ fontSize: 12, color: '#b45309', marginBottom: 6 }}>Save before issuing.</div>}
          {lastRev && (since.length
            ? <details style={{ fontSize: 12.5, marginBottom: 8 }}>
                <summary style={{ fontWeight: 600, cursor: 'pointer', marginBottom: 3 }}>Changes since Rev {lastRev.revision} <span style={{ fontWeight: 400, color: '#888' }}>- {since.length} change{since.length === 1 ? '' : 's'}</span></summary>
                <ChangeList changes={since} />
              </details>
            : <div style={{ fontSize: 12.5, marginBottom: 8, fontWeight: 600 }}>Changes since Rev {lastRev.revision} - none</div>)}
          {est.reopened && <div style={{ fontSize: 12.5, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '6px 10px', marginBottom: 8, color: '#92400e' }}>Editing <strong>Rev {est.reopened.revision}</strong> - issuing replaces it (no new revision letter). Your draft is kept - switch to it at the top.</div>}
          {(est.revisions || []).slice().reverse().map(r => (
            <details key={r.revision} style={{ fontSize: 12.5, borderTop: '1px solid #f0efec', padding: '6px 0' }}>
              <summary style={{ cursor: 'pointer' }}><button onClick={(e) => { e.preventDefault(); openRevision(r.revision) }} style={{ ...smallBtn, marginRight: 8, padding: '2px 8px', fontSize: 11.5 }}>View</button>{r.sent ? <span style={{ fontSize: 10.5, fontWeight: 700, color: '#15803d', background: '#dcfce7', borderRadius: 8, padding: '1px 7px', marginRight: 6 }} title={`Sent ${new Date(r.sent.at).toLocaleString('en-GB')} by ${r.sent.by || ''}`}>SENT</span> : null}<strong>Rev {r.revision}</strong> · {money(r.total, { dp: 2 })} · {new Date(r.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {r.issuedBy}{r.note ? ` · ${r.note}` : ''}</summary>
              <div style={{ paddingLeft: 12, marginTop: 4, color: '#555' }}>{(r.changes || []).length ? <ChangeList changes={r.changes} /> : 'First issue.'}</div>
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
      </div>
      <RateAttachments est={est} />

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
          <label style={lbl}>Unit<select value={item.unit || ''} onChange={e => setRow({ unit: e.target.value })} title={item.unit ? '' : 'Choose the unit'} style={{ ...inp, ...(item.unit ? {} : { background: '#fee2e2', borderColor: '#dc2626', borderWidth: 2, color: '#b91c1c', fontWeight: 600 }) }}><option value="">— choose —</option>{BU_UNITS.map(u => <option key={u} value={u}>{BU_UNIT_LABEL[u]}</option>)}</select></label>
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
        <BuildupEditor varLibrary={variableLibrary(templates)} addSources={{ library: templates.filter(t => !t.hidden && !t.catHidden), estimate: (est.rows || []).filter(r => r.kind === 'item' && r.id !== item.id && r.buildup && (r.buildup.lines || []).length).map(r => ({ id: r.id, description: r.description, unit: r.unit, buildup: r.buildup })) }} value={value} onChange={(fn) => onChange((b) => { const n = fn({ ...b, unit: item.unit }); const { unit, ...rest } = n; return rest })}
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

// MATERIAL BUDGETS (1143) - every material line, BY SUPPLIER (own items and
// products without a supplier as the balance) or BY LABEL. In the label view
// labels can be ticked and COMBINED into a named group (est.budgetGroups),
// renamed, or split again.
function BudgetPanel({ bud, est, change, money }) {
  const [view, setView] = useState('supplier')
  const [tick, setTick] = useState(() => new Set())
  const [naming, setNaming] = useState(null)       // { name } while combining
  const [renaming, setRenaming] = useState(null)   // { id, name }
  const groups = est.budgetGroups || []
  const rows = view === 'label' ? labelBudget(bud.byLabel || {}, groups)
    : Object.entries(bud.bySupplier || {}).filter(([k, v]) => !(k === NO_SUPPLIER && Math.abs(v) < 0.005)).map(([k, v]) => ({ key: k, name: k, amount: v, labels: [], group: null })).sort((a, b) => (a.name === NO_SUPPLIER) - (b.name === NO_SUPPLIER) || b.amount - a.amount)
  const total = rows.reduce((t, r) => t + r.amount, 0)
  const keysOf = (r) => r.group ? (groups.find(g => g.id === r.group)?.labels || []) : [r.key]
  const combine = (name) => {
    const picked = rows.filter(r => tick.has(r.key))
    const labels = [...new Set(picked.flatMap(keysOf))]
    const drop = new Set(picked.filter(r => r.group).map(r => r.group))
    change(e => ({ ...e, budgetGroups: [...(e.budgetGroups || []).filter(g => !drop.has(g.id)), { id: `g${Date.now().toString(36)}`, name, labels }] }))
    setTick(new Set()); setNaming(null)
  }
  const tab = (k, label) => <button onClick={() => { setView(k); setTick(new Set()); setNaming(null) }} style={{ fontSize: 12, padding: '3px 10px', border: `1px solid ${view === k ? '#0f766e' : '#d4d4d0'}`, background: view === k ? '#f0fdfa' : '#fff', color: view === k ? '#0f766e' : '#555', borderRadius: 6, cursor: 'pointer', fontWeight: view === k ? 600 : 400 }}>{label}</button>
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>Material budgets</strong>
        <span style={{ flex: 1 }} />
        {tab('supplier', 'By supplier')}{tab('label', 'By label')}
      </div>
      {!rows.length ? <div style={{ fontSize: 12.5, color: '#aaa', marginTop: 6 }}>Nothing priced yet.</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 6 }}>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} style={{ background: tick.has(r.key) ? '#f0fdfa' : undefined }}>
                {view === 'label' && <td style={{ width: 20, verticalAlign: 'top', padding: '3px 0' }}><input type="checkbox" checked={tick.has(r.key)} disabled={!!est.archived} onChange={() => setTick(x => { const n = new Set(x); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n })} /></td>}
                <td style={{ padding: '3px 0', color: r.name === NO_SUPPLIER ? '#888' : undefined, fontStyle: r.name === NO_SUPPLIER ? 'italic' : undefined }}>
                  {renaming?.id === r.group && r.group
                    ? <input autoFocus value={renaming.name} onChange={e => setRenaming({ ...renaming, name: e.target.value })} onBlur={() => { if (renaming.name.trim()) change(e => ({ ...e, budgetGroups: (e.budgetGroups || []).map(g => g.id === r.group ? { ...g, name: renaming.name.trim() } : g) })); setRenaming(null) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }} style={{ ...inp, padding: '3px 6px', fontSize: 12.5 }} />
                    : <span style={{ fontWeight: r.group ? 700 : 400 }}>{r.name}</span>}
                  {r.group && renaming?.id !== r.group && <>
                    <div style={{ fontSize: 11, color: '#888' }}>{r.labels.join(' + ') || 'no priced lines'}</div>
                    {!est.archived && <span style={{ fontSize: 11 }}><button onClick={() => setRenaming({ id: r.group, name: r.name })} style={linkBtn}>rename</button> · <button onClick={() => change(e => ({ ...e, budgetGroups: (e.budgetGroups || []).filter(g => g.id !== r.group) }))} style={linkBtn}>split</button></span>}
                  </>}
                </td>
                <td style={{ padding: '3px 0', textAlign: 'right', verticalAlign: 'top' }}>{money(r.amount, { dp: 2 })}</td>
              </tr>
            ))}
            <tr><td colSpan={view === 'label' ? 2 : 1} style={{ padding: '4px 0', fontWeight: 700, borderTop: '1px solid #eee' }}>Total <span style={{ fontWeight: 400, fontSize: 11, color: '#999' }}>material lines</span></td><td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700, borderTop: '1px solid #eee' }}>{money(total, { dp: 2 })}</td></tr>
          </tbody>
        </table>
      )}
      {view === 'label' && tick.size > 0 && !est.archived && (
        naming
          ? <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input autoFocus value={naming.name} onChange={e => setNaming({ name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && naming.name.trim()) combine(naming.name.trim()); if (e.key === 'Escape') setNaming(null) }} placeholder="Name the group - e.g. a supplier" style={{ ...inp, padding: '5px 8px', fontSize: 12.5 }} />
              <button onClick={() => naming.name.trim() && combine(naming.name.trim())} disabled={!naming.name.trim()} style={{ ...btn, padding: '4px 10px', fontSize: 12.5 }}>Combine</button>
            </div>
          : <button onClick={() => setNaming({ name: '' })} style={{ ...btn, marginTop: 8, padding: '4px 10px', fontSize: 12.5 }}>Combine {tick.size} ticked…</button>
      )}
      {view === 'label' && !tick.size && <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>Tick labels to combine them into a named group - e.g. Insulation + VCL as one supplier.</div>}
    </div>
  )
}
const linkBtn = { border: 'none', background: 'none', color: '#0f766e', cursor: 'pointer', padding: 0, fontSize: 11, textDecoration: 'underline' }

// ATTACHMENTS ON THE RATES (1145) - at the foot of the take-off, item by item:
// documents on the rate build-up an item came from (data sheets, specs - added
// on the Build-ups page) and documents on the item itself (its pop-out). Each
// opens through the same access-checked link as everywhere else.
const DOCS_API = '/api/estimating/documents'
function RateAttachments({ est }) {
  const items = (est.rows || []).filter(r => r.kind === 'item')
  const refs = [...new Set(items.map(r => r.templateRef).filter(Boolean))]
  const [byRef, setByRef] = useState({})
  const [estDocs, setEstDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const refKey = refs.join('|')
  useEffect(() => {
    let live = true
    const get = (type, id) => fetch(`${DOCS_API}?ownerType=${type}&ownerId=${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : { documents: [] }).catch(() => ({ documents: [] }))
    setLoading(true)
    Promise.all([get('estimate', est.id), ...refs.map(ref => get('buildup', ref).then(d => [ref, d.documents || []]))]).then(([e, ...pairs]) => {
      if (!live) return
      setEstDocs(e.documents || []); setByRef(Object.fromEntries(pairs)); setLoading(false)
    })
    return () => { live = false }
  }, [est.id, refKey, (est.rows || []).length])
  const link = (type, id, d) => `${DOCS_API}?ownerType=${type}&ownerId=${encodeURIComponent(id)}&download=${d.id}`
  const groups = items.map(r => ({ r, fromBuildup: (r.templateRef && byRef[r.templateRef]) || [], own: estDocs.filter(d => d.itemId === r.id) })).filter(g => g.fromBuildup.length || g.own.length)
  const fileRow = (href, d, tag) => (
    <div key={`${tag}${d.id}`} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, padding: '3px 0' }}>
      <a href={href} target="_blank" rel="noreferrer" style={{ color: '#0f766e', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 }}>{d.name}</a>
      <span style={{ fontSize: 10.5, color: '#666', background: '#f4f4f2', borderRadius: 10, padding: '1px 8px', whiteSpace: 'nowrap' }}>{tag}</span>
      <a href={href} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: '#0f766e', marginLeft: 'auto' }}>View</a>
    </div>
  )
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: '12px 16px', marginTop: 12 }}>
      <strong style={{ fontSize: 14 }}>Attachments on the rates</strong> <span style={{ fontSize: 11.5, color: '#999' }}>documents on each item's build-up and on the item - private, opened through the portal</span>
      {loading ? <div style={{ fontSize: 12.5, color: '#aaa', marginTop: 6 }}>Loading…</div>
        : !groups.length ? <div style={{ fontSize: 12.5, color: '#aaa', marginTop: 6 }}>No attachments on these rates.</div>
        : groups.map(({ r, fromBuildup, own }) => (
          <div key={r.id} style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f4f3f0' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{r.description}</div>
            {fromBuildup.map(d => fileRow(link('buildup', r.templateRef, d), d, 'on the build-up'))}
            {own.map(d => fileRow(link('estimate', est.id, d), d, 'this item'))}
          </div>
        ))}
    </div>
  )
}

const warnBtn = { color: '#dc2626', fontWeight: 700, fontSize: 15, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit' }

// A REVISION'S TAKE-OFF AS ISSUED (1151) - read-only: sections, items with their
// descriptions, highlights and notes, blank lines, below the line, totals and the
// estimate's notes. Figures stored at issue are used; a revision issued before
// they were stored is priced at today's prices, and says so. EDIT only for the
// latest revision, and only if it has not been sent.
function RevisionViewer({ view, est, lib, money, onClose, onEdit, busy }) {
  const snap = view.snap
  const m2 = (v) => v == null ? '' : money(v, { dp: 2 })
  const HLC = { yellow: '#fef9c3', orange: '#ffedd5', red: '#fee2e2', green: '#dcfce7' }
  let body = null
  if (view.loading) body = <div style={{ color: '#888', fontSize: 13 }}>Loading Rev {view.revision}…</div>
  else if (view.error) body = <div style={{ color: '#b42318', fontSize: 13 }}>{view.error}</div>
  else {
    const e = snap.estimate || {}
    const libR = withLock(lib, snap.priceLib)   // its own prices (1154)
    const live = priceEstimate({ ...e, priceLock: snap.priceLib || e.priceLock || null }, lib)
    const priced = snap.priced || live.priced, totals = snap.totals || live.totals
    const latest = (est.revisions || []).slice(-1)[0]
    const entry = (est.revisions || []).find(r => r.revision === snap.revision) || {}
    const canEdit = latest && latest.revision === snap.revision && !entry.sent
    const why = entry.sent ? `Sent ${new Date(entry.sent.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} - unmark it as sent on the Quote tab to edit it, or issue a new revision.` : 'Only the latest revision can be edited - issue a new revision instead.'
    let past = false
    body = <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: '#666' }}>Issued {new Date(snap.issuedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} by {snap.issuedBy}{snap.note ? ` - "${snap.note}"` : ''}</span>
        {entry.sent ? <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', background: '#dcfce7', borderRadius: 8, padding: '2px 8px' }}>SENT</span> : <span style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '2px 8px' }}>not sent</span>}
        <span style={{ flex: 1 }} />
        {canEdit ? <button onClick={() => onEdit(snap.revision)} disabled={busy} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}>Edit Rev {snap.revision}</button> : <span style={{ fontSize: 12, color: '#888', maxWidth: 380 }}>{why}</span>}
      </div>
      {!snap.priced && <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>This revision was issued before figures were stored with it, so rates and totals are worked out at today's prices. Issued total: {m2(snap.total)}.</div>}
      <div style={{ overflow: 'auto', border: '1px solid #e8e7e3', borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead><tr>{['Description', 'Qty', 'Unit', 'Rate', 'Total'].map((h, i) => <th key={h} style={{ ...th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
          <tbody>
            {(e.rows || []).map(r => {
              if (r.kind === 'line') { past = true; return <tr key={r.id} style={{ background: '#f5f3ff', borderTop: '3px double #6d28d9' }}><td colSpan={5} style={{ ...td, fontWeight: 700, color: '#6d28d9' }}>BELOW THE LINE <span style={{ fontWeight: 400, fontSize: 12, color: '#6b6b80' }}>- not in the total</span></td></tr> }
              if (r.kind === 'spacer') return <tr key={r.id}><td colSpan={5} style={{ ...td, height: 18 }} /></tr>
              const bg = r.highlight ? HLC[r.highlight] : undefined
              if (r.kind === 'section') return <tr key={r.id} style={{ background: bg || '#f4f4f2' }}><td colSpan={5} style={{ ...td, fontWeight: 700, textDecoration: 'underline' }}>{r.title}</td></tr>
              const p = priced[r.id] || {}
              const text = r.buildup ? descriptionText(r.buildup, libR) : ''
              return (
                <tr key={r.id} style={{ background: bg }}>
                  <td style={{ ...td, minWidth: 280 }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{r.description}</div>{text && <div style={{ fontSize: 11.5, color: '#666', whiteSpace: 'pre-line', marginTop: 2 }}>{ruled(text)}</div>}</div>
                      {r.note ? <div style={{ width: 190, flexShrink: 0, background: '#fde047', borderRadius: 4, padding: '5px 7px', fontSize: 11.5, color: '#422006', whiteSpace: 'pre-wrap' }}>{r.note}</div> : null}
                    </div>
                  </td>
                  <td style={tdR}>{r.rateOnly ? 'TBC' : (r.qty ?? '')}</td>
                  <td style={td}>{r.unit ? BU_UNIT_LABEL[r.unit] : ''}</td>
                  <td style={tdR}>{m2(p.rate)}</td>
                  <td style={{ ...tdR, fontWeight: 600, color: (past || r.rateOnly) ? '#6d28d9' : undefined }}>{r.rateOnly || (past && p.total == null) ? 'Rate only' : past ? <>{m2(p.total)} <span style={{ fontSize: 10.5 }}>optional</span></> : m2(p.total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 13, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15, color: '#0f766e' }}>Total {m2(totals.total)}</strong>
        <span>Materials {m2(totals.materials)}</span><span>Labour {m2(totals.labour)}</span><span>Profit & MCD {m2(totals.profitAndMcd)}</span>
        {totals.optional ? <span style={{ color: '#6d28d9' }}>Below the line (optional) {m2(totals.optional)}</span> : null}
      </div>
      {e.notes ? <div style={{ marginTop: 10, fontSize: 12.5 }}><strong>Notes</strong><div style={{ whiteSpace: 'pre-wrap', color: '#444', marginTop: 2 }}>{e.notes}</div></div> : null}
    </>
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '30px 20px', overflowY: 'auto' }} onMouseDown={ev => { if (ev.target === ev.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 1150, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ fontSize: 17 }}>Rev {view.revision || snap?.revision} - take-off as issued</strong>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        {body}
      </div>
    </div>
  )
}

// CHANGES (1152) - each summary line; one with exact changes behind it opens with
// its own triangle (quantities, descriptions, lines and their costs, sizes...).
function ChangeList({ changes }) {
  const colour = (k) => k === 'removed' ? '#b42318' : k === 'added' ? '#15803d' : k === 'total' ? '#0f766e' : '#444'
  return <div style={{ paddingLeft: 4 }}>{changes.map((c, i) => (c.detail && c.detail.length)
    ? <details key={i} style={{ padding: '1px 0' }}>
        <summary style={{ cursor: 'pointer', color: colour(c.kind) }}>{c.text}</summary>
        <div style={{ paddingLeft: 18, margin: '2px 0 4px', borderLeft: '2px solid #e8e7e3' }}>
          {c.detail.map((x, k) => <div key={k} style={{ fontSize: 12, color: /^Line removed/.test(x) ? '#b42318' : /^Line added/.test(x) ? '#15803d' : '#555', padding: '1px 0' }}>{x}</div>)}
        </div>
      </details>
    : <div key={i} style={{ color: colour(c.kind), padding: '1px 0 1px 15px', fontWeight: c.kind === 'total' ? 600 : 400 }}>{c.text}</div>)}</div>
}

// The separator between stacked descriptions (1147) drawn as a rule rather than a
// row of dashes - on the take-off THIN AND LIGHT GREY (1161); the quote keeps its
// thick charcoal rule (QuoteTabs).
const ruled = (text, key = '') => String(text ?? '').split(/\n?————————\n?/).flatMap((t, i) => i ? [<span key={`${key}r${i}`} style={{ display: 'block', borderTop: '1px solid #d4d4d0', margin: '5px 0' }} />, t] : [t])
