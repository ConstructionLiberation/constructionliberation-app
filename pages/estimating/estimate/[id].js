import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import EstimatingShell, { ErrorBar, estApi } from '../../../components/EstimatingShell'
import { useFormat } from '../../../components/TenantProvider'
import { th, td, tdR, inp, btn } from '../../../components/LibraryParts'
import BuildupEditor, { pct, fromPct } from '../../../components/BuildupEditor'
import { LetterTab, ClarificationsTab, DocumentsTab, QuotePreview } from '../../../components/QuoteTabs'
import DocumentsPanel from '../../../components/DocumentsPanel'
import MaterialsTab from '../../../components/MaterialsTab'
import { placeholderValues } from '../../../lib/quoteDocs'
import { adjustLib, pctText } from '../../../lib/priceAdjust'
import { normalizeTemplate, needsNormalizing } from '../../../lib/buildups'
import { BU_UNITS, BU_UNIT_LABEL } from '../../../lib/buildups'
import { CRM_DETAILS, OWN_DETAILS, detailsFor, itemFromTemplate, uniqueItem, sectionRow, priceEstimate, sectionTotals, priceItem, budgets, diffEstimates, prelimsRows } from '../../../lib/estimate'

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
      { key: 'profitPct', label: 'Profit % (this item)', heads: ['Profit %'], align: 'left', render: (r) => [<td key="pp" style={td}><input value={pct(r.profit)} onChange={e => setRow(r.id, { profit: fromPct(e.target.value) })} placeholder={s.profit != null ? String(pct(s.profit)) : ''} style={{ ...cellInp, width: 56, borderColor: r.profit != null ? '#f59e0b' : undefined }} title="Leave blank to use the quote's profit %" /></td>] },
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
  const addRow = (row, open) => { change(e => ({ ...e, rows: [...e.rows, row] })); if (open) setPopout(row.id) }

  const { priced, totals } = useMemo(() => est ? priceEstimate(est, lib) : { priced: {}, totals: {} }, [est, lib])
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
          <label>Profit % <input value={pct(s.profit)} onChange={e => setSetting('profit', fromPct(e.target.value))} placeholder="set" style={{ ...cellInp, width: 60, borderColor: s.profit == null ? '#f59e0b' : undefined }} /></label>
          <label>MCD % <input value={pct(s.mcd)} onChange={e => setSetting('mcd', fromPct(e.target.value))} placeholder="0" style={{ ...cellInp, width: 60 }} /></label>
          <label title="Raise or lower ALL the labour on this quote - each rate in proportion to its own labour">Labour factor <input value={s.labourFactor ?? 1} onChange={e => setSetting('labourFactor', e.target.value === '' ? 1 : parseFloat(e.target.value))} style={{ ...cellInp, width: 60 }} /></label>
          <label title="Starts from the company day rate (Labour Rates); used for prelims">Day rate <input value={s.dayRate ?? ''} onChange={e => setSetting('dayRate', e.target.value === '' ? null : parseFloat(e.target.value))} style={{ ...cellInp, width: 70 }} /></label>
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
            <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
              <thead><tr>
                {['', 'Description', 'Qty', 'Unit', 'Rate', 'Total'].map((h, i) => <th key={h || i} style={{ ...th, textAlign: [2, 4, 5].includes(i) ? 'right' : 'left', ...(i >= 4 ? { color: '#1a1a19', fontSize: 12.5, fontWeight: 700 } : {}) }}>{h}</th>)}
                {shown.flatMap(c => c.heads.map((h, k) => <th key={`${c.key}${k}`} style={{ ...th, textAlign: c.align || 'right', fontSize: 10.5, fontWeight: 500, color: c.supplier ? '#93a8d8' : '#aaa' }}>{h}</th>))}
                <th style={th} />
              </tr></thead>
              <tbody>
                {est.rows.map((r, i) => r.kind === 'section' ? (
                  <tr key={r.id} style={{ background: '#f4f4f2' }}>
                    <td style={td}><Arrows i={i} move={move} /></td>
                    <td style={td} colSpan={4}><input value={r.title} onChange={e => setRow(r.id, { title: e.target.value })} style={{ ...cellInp, fontWeight: 700, textDecoration: 'underline', width: '100%', background: 'transparent', border: 'none' }} /></td>
                    <td style={td} />
                    {cells > 0 && <td style={td} colSpan={cells} />}
                    <td style={td}><button onClick={() => change(e => ({ ...e, rows: e.rows.filter(x => x.id !== r.id) }))} style={iconBtn} title="Remove section header">✕</button></td>
                  </tr>
                ) : (() => {
                  const p = priced[r.id] || {}
                  return (
                    <tr key={r.id} style={{ background: r.rateOnly ? '#fafaf7' : undefined }}>
                      <td style={td}><Arrows i={i} move={move} /></td>
                      <td style={{ ...td, minWidth: 260 }}>
                        <input value={r.description} onChange={e => setRow(r.id, { description: e.target.value })} style={{ ...cellInp, width: '100%' }} />
                        <div style={{ fontSize: 11, color: p.missing?.length ? '#b45309' : '#aaa', marginTop: 2 }}>
                          {r.templateRef ? 'from the build-ups' : 'unique item'}{p.missing?.length ? ` · ${p.missing.length} line${p.missing.length === 1 ? '' : 's'} not yet in the rate` : ''}
                        </div>
                      </td>
                      <td style={tdR}>{r.rateOnly ? <span style={{ color: '#888' }}>TBC</span> : <input value={r.qty ?? ''} onChange={e => setRow(r.id, { qty: e.target.value === '' ? null : e.target.value })} placeholder="qty" inputMode="decimal" style={{ ...cellInp, width: 80, textAlign: 'right' }} />}</td>
                      <td style={td}>{r.unit ? BU_UNIT_LABEL[r.unit] : '—'}</td>
                      <td style={{ ...tdR, fontWeight: 700, fontSize: 14, color: '#1a1a19' }}>{m2(p.rate)}</td>
                      <td style={{ ...tdR, fontWeight: 700, fontSize: 14, color: '#1a1a19' }}>{r.rateOnly ? <span style={{ color: '#888', fontWeight: 400, fontSize: 13 }}>Rate only</span> : m2(p.total)}</td>
                      {shown.flatMap(c => c.render(r, p))}
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <button onClick={() => setPopout(r.id)} style={smallBtn}>Build-up</button>
                        <button onClick={() => { if (window.confirm(`Remove "${r.description}"?`)) change(e => ({ ...e, rows: e.rows.filter(x => x.id !== r.id) })) }} style={iconBtn} title="Remove item">✕</button>
                      </td>
                    </tr>
                  )
                })())}
                {!est.rows.length && <tr><td colSpan={7 + cells} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 26 }}>Add a section header, then the items - from the build-ups, or unique.</td></tr>}
              </tbody>
              {est.rows.some(r => r.kind === 'item') && (
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
        <button onClick={() => { const [sec, it] = prelimsRows(); change(e => ({ ...e, rows: [...e.rows, sec, it] })); setPopout(it.id) }} style={btn} title="Lodge, management, attendances - lump sums for the job">+ Prelims</button>
      </div>

      <div style={{ display: 'flex', gap: 24, marginTop: 16, background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 12, padding: '12px 16px', flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13 }}>
        <strong style={{ fontSize: 17, color: '#0f766e' }}>Total {money(totals.total || 0, { dp: 2 })}</strong>
        <span>Materials {money(totals.materials || 0, { dp: 2 })}</span>
        <span>Labour {money(totals.labour || 0, { dp: 2 })}</span>
        <span>Profit &amp; MCD {money(totals.profitAndMcd || 0, { dp: 2 })}</span>
        {totals.belowLine > 0 && <span style={{ color: '#666' }}>{totals.belowLine} rate-only item{totals.belowLine === 1 ? '' : 's'} below the line</span>}
        {totals.noQty > 0 && <span style={{ color: '#b45309' }}>{totals.noQty} item{totals.noQty === 1 ? '' : 's'} without a quantity - not in the total</span>}
      </div>

      {issueMsg && <div style={{ marginTop: 10, fontSize: 13, color: '#0f766e', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, padding: '8px 12px' }}>{issueMsg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 12, marginTop: 14, alignItems: 'start' }}>
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
      {picking && <TemplatePicker templates={templates} onClose={() => setPicking(false)} onPick={(t) => { setPicking(false); addRow(itemFromTemplate(t), true) }} />}
      {item && <Popout item={item} est={est} lib={lib} money={money} onChange={(fn) => setRow(item.id, (r) => ({ buildup: fn(r.buildup) }))} setRow={(patch) => setRow(item.id, patch)} onClose={() => setPopout(null)} />}
    </EstimatingShell>
  )
}

function Popout({ item, est, lib: libIn, money, onChange, setRow, onClose }) {
  const s = est.settings || {}
  // This quote's own supplier adjustments, as the take-off prices them (1094).
  const lib = useMemo(() => adjustLib(libIn, est.adjustments), [libIn, est.adjustments])
  const p = priceItem(item, lib, s)
  const [saving, setSaving] = useState(null)   // { category, name } when saving as a template
  const [msg, setMsg] = useState('')
  const value = { ...item.buildup, unit: item.unit }
  async function saveTemplate() {
    try {
      const d = await estApi('/api/estimating/build-ups', { action: 'save', template: { section: saving.category, description: saving.name, unit: item.unit, sizes: item.buildup.sizes, lines: item.buildup.lines, rules: item.buildup.rules }, originalRef: null })
      setMsg(`Saved to the library as "${d.template.description}" in ${d.template.section || 'no category'}.`); setSaving(null)
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
          <label style={lbl}>Profit % (this item)<input value={pct(item.profit)} onChange={e => setRow({ profit: fromPct(e.target.value) })} placeholder={s.profit != null ? `${pct(s.profit)} (quote)` : 'quote'} style={{ ...inp, width: 120 }} /></label>
          <div style={{ flex: 1 }} />
          <button onClick={() => setSaving({ category: '', name: item.description })} style={btn}>Save as template…</button>
          <button onClick={onClose} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}>Done</button>
        </div>
        {saving && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13, background: '#fafaf9', padding: 10, borderRadius: 8 }}>
            Save this build-up to the library as
            <input value={saving.name} onChange={e => setSaving({ ...saving, name: e.target.value })} style={{ ...inp, width: 260 }} />
            in category <input value={saving.category} onChange={e => setSaving({ ...saving, category: e.target.value })} placeholder="category" style={{ ...inp, width: 180 }} />
            <button onClick={saveTemplate} style={btn}>Save</button><button onClick={() => setSaving(null)} style={btn}>Cancel</button>
          </div>
        )}
        {msg && <div style={{ fontSize: 12.5, color: '#0f766e', marginTop: 8 }}>{msg}</div>}
        <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>Changes here belong to this estimate only - the library build-up is untouched unless you save as a template.</div>
        <div style={{ marginTop: 10 }}><DocumentsPanel ownerType="estimate" ownerId={est.id} itemId={item.id} title="Documents on this item" /></div>
        <BuildupEditor value={value} onChange={(fn) => onChange((b) => { const n = fn({ ...b, unit: item.unit }); const { unit, ...rest } = n; return rest })}
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

function TemplatePicker({ templates, onClose, onPick }) {
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
