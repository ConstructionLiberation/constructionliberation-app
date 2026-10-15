import { useEffect, useMemo, useState } from 'react'
import { useFormat } from './TenantProvider'
import { buildLabourLines, subTotal, saving, sentIn } from '../lib/labourSchedule'

// LABOUR RATES (1073) - the second tab on Contracted Rates.
//
// The project's labour work (above-the-line contracted items + instructed
// variations, lib/labourSchedule.js) with a RATE column to fill in for a
// subcontract installer, beside OUR labour rate and total from the contract.
//   Match        copies our labour rate into the rate box
//   Total        rate x quantity
//   Saving       our labour total - their total (red when they cost more)
// Tick lines and "Create schedule" to save them, under a name, as a schedule
// for one subbie. It appears in the list on the left; its lines are greyed out
// here as sent. Each schedule downloads as Excel or PDF WITHOUT our budgets.
// ON AN ESTIMATE TOO (1167): pass estimateId and its lines (lib/estimateLabour.js)
// instead of a project - Estimating > Labour Schedule. Everything else is the same.
export default function LabourRates({ projectId, crItems, variations, estimateId, lines: linesIn, ownerLabel = 'project' }) {
  const ownerQ = estimateId ? `estimateId=${encodeURIComponent(estimateId)}` : `projectId=${encodeURIComponent(projectId || '')}`
  const ownerId = estimateId || projectId
  const { money } = useFormat()
  const m = (v) => v == null ? '' : money(v, { dp: 2 })
  const lines = useMemo(() => linesIn || buildLabourLines(crItems || [], variations || []), [linesIn, crItems, variations])
  const [sched, setSched] = useState(null)
  const [rates, setRates] = useState({})
  const [dirty, setDirty] = useState(false)
  const [view, setView] = useState('main')
  const [ticked, setTicked] = useState(new Set())
  const [naming, setNaming] = useState(null)   // string while the name box is open
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function api(method, body, qs = '') {
    const r = await fetch(`/api/labour-schedules?${ownerQ}${qs}`, method === 'GET' ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(estimateId ? { estimateId } : { projectId }), ...body }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`)
    return d
  }
  useEffect(() => {
    setSched(null); setView('main'); setTicked(new Set()); setDirty(false); setErr('')
    if (!ownerId) return
    api('GET').then(d => { setSched(d.schedules); setRates(d.schedules.rates || {}) }).catch(e => setErr(e.message))
  }, [ownerId])

  if (!sched) return <div style={box}>{err ? <span style={{ color: '#b42318' }}>{err}</span> : 'Loading…'}</div>
  const sent = sentIn(sched.packages)
  const pkgOf = (key) => sched.packages.find(p => (p.lines || []).some(l => l.key === key))
  // A sent line shows the rate it was SENT at; others the rate being typed.
  const rateOf = (l) => { const p = pkgOf(l.key); if (p) return p.lines.find(x => x.key === l.key)?.rate ?? null; return rates[l.key] ?? null }
  const items = lines.filter(l => l.kind === 'item')
  const sum = (arr, f) => arr.reduce((s, l) => s + (f(l) || 0), 0)
  const totalBudget = sum(items, l => l.budgetTotal)
  const totalSub = sum(items, l => subTotal(rateOf(l), l.qty))
  const totalSaving = sum(items, l => saving(l.budgetTotal, subTotal(rateOf(l), l.qty)))
  const unsent = items.filter(l => !sent.has(l.key))

  const setRate = (key, v) => { setRates(r => ({ ...r, [key]: v === '' ? null : v })); setDirty(true) }
  const match = (l) => setRate(l.key, l.budgetRate ?? '')
  const toggle = (key) => setTicked(t => { const n = new Set(t); n.has(key) ? n.delete(key) : n.add(key); return n })
  const allUnsentTicked = unsent.length > 0 && unsent.every(l => ticked.has(l.key))

  async function saveRates() {
    setBusy(true); setErr('')
    try { const d = await api('POST', { action: 'save-rates', rates }); setSched(d.schedules); setDirty(false) } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  async function create() {
    setBusy(true); setErr('')
    try {
      const d = await api('POST', { action: 'create', name: naming, keys: [...ticked], rates })
      setSched(d.schedules); setRates(d.schedules.rates || {}); setDirty(false); setTicked(new Set()); setNaming(null); setView(d.created)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  async function remove(p) {
    if (!window.confirm(`Delete the schedule "${p.name}"? Its ${p.lines.length} item(s) go back to the list as not sent.`)) return
    setBusy(true); setErr('')
    try { const d = await api('POST', { action: 'delete', id: p.id }); setSched(d.schedules); setView('main') } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const pkg = view !== 'main' ? sched.packages.find(p => p.id === view) : null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>
      {/* The schedules, on the left */}
      <div style={{ ...box, padding: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase', margin: '4px 6px 8px' }}>Schedules</div>
        <SideBtn on={view === 'main'} onClick={() => setView('main')} title="All labour items" sub={`${unsent.length} of ${items.length} left to send`} />
        {sched.packages.map(p => (
          <SideBtn key={p.id} on={view === p.id} onClick={() => setView(p.id)} title={p.name}
            sub={`${p.lines.length} item${p.lines.length === 1 ? '' : 's'} · ${m(sum(p.lines, l => l.total))}`} />
        ))}
        {!sched.packages.length && <div style={{ fontSize: 11.5, color: '#aaa', margin: '8px 6px' }}>None yet. Tick items and create one.</div>}
      </div>

      <div style={{ minWidth: 0 }}>
        {err && <div style={{ background: '#fdecec', border: '1px solid #f5c2c2', color: '#b42318', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        {!items.length ? (
          <div style={box}>No labour items yet. Upload the contracted rates (above-the-line items with labour rates), or instruct a variation.</div>
        ) : pkg ? (
          <PackageView p={pkg} m={m} busy={busy} ownerQ={ownerQ} onDelete={() => remove(pkg)} />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <Stat label="Labour budget" value={m(totalBudget)} />
              <Stat label="Subcontract rates entered" value={m(totalSub)} />
              <Stat label={totalSaving >= 0 ? 'Saving' : 'Overspend'} value={m(Math.abs(totalSaving))} tone={totalSaving >= 0 ? 'good' : 'bad'} sub="on items with a rate" />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <button onClick={saveRates} disabled={!dirty || busy} style={{ ...btn, ...(dirty ? dark : {}), opacity: dirty ? 1 : 0.5 }}>{dirty ? 'Save rates' : 'Rates saved'}</button>
              <button onClick={() => { ticked.forEach(k => { const l = items.find(x => x.key === k); if (l) match(l) }) }} disabled={!ticked.size || busy} style={{ ...btn, opacity: ticked.size ? 1 : 0.5 }}>Match ticked</button>
              {naming == null ? (
                <button onClick={() => setNaming('')} disabled={!ticked.size || busy} style={{ ...btn, ...(ticked.size ? dark : {}), opacity: ticked.size ? 1 : 0.5 }}>Create schedule from ticked ({ticked.size})</button>
              ) : (
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input autoFocus value={naming} onChange={e => setNaming(e.target.value)} placeholder="Name - e.g. the subcontractor" onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setNaming(null) }}
                    style={{ fontSize: 13, padding: '7px 10px', border: '1px solid #d0d0cc', borderRadius: 7, minWidth: 240, fontFamily: 'inherit' }} />
                  <button onClick={create} disabled={busy || !naming.trim()} style={{ ...btn, ...dark }}>Create</button>
                  <button onClick={() => setNaming(null)} style={btn}>Cancel</button>
                </span>
              )}
              <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Greyed items are already in a schedule.</span>
            </div>
            <div style={{ ...box, padding: 0, overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
                <thead><tr>
                  <th style={th}><input type="checkbox" checked={allUnsentTicked} onChange={() => setTicked(allUnsentTicked ? new Set() : new Set(unsent.map(l => l.key)))} title="Tick all not yet sent" /></th>
                  <th style={th}>Ref</th><th style={{ ...th, minWidth: 260 }}>Description</th><th style={thR}>Qty</th><th style={th}>Unit</th>
                  <th style={{ ...thR, background: '#fffbeb' }}>Rate</th><th style={{ ...thR, background: '#fffbeb' }}>Total</th><th style={th} />
                  <th style={{ ...thR, background: '#eff6ff', color: '#1e3a8a' }}>Labour rate</th><th style={{ ...thR, background: '#eff6ff', color: '#1e3a8a' }}>Labour total</th>
                  <th style={thR}>Saving / (overspend)</th>
                </tr></thead>
                <tbody>
                  {lines.map(l => {
                    if (l.kind === 'heading') return <tr key={l.key}><td colSpan={11} style={{ ...td, fontWeight: 700, background: '#f8fafc', color: '#334155' }}>{l.description}</td></tr>
                    const sentTo = sent.get(l.key)
                    const rate = rateOf(l), tot = subTotal(rate, l.qty), sv = saving(l.budgetTotal, tot)
                    return (
                      <tr key={l.key} style={{ opacity: sentTo ? 0.45 : 1, borderTop: '0.5px solid #f1f5f9' }} title={sentTo ? `In schedule: ${sentTo}` : undefined}>
                        <td style={td}><input type="checkbox" disabled={!!sentTo} checked={ticked.has(l.key)} onChange={() => toggle(l.key)} /></td>
                        <td style={{ ...td, whiteSpace: 'nowrap', color: '#64748b' }}>{l.ref}</td>
                        <td style={td}>{l.description}{sentTo && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#475569', border: '1px solid #cbd5e1', borderRadius: 999, padding: '1px 6px' }}>Sent: {sentTo}</span>}</td>
                        <td style={tdR}>{l.qty ?? ''}</td><td style={td}>{l.unit}</td>
                        <td style={{ ...tdR, background: '#fffdf5' }}>
                          <input type="number" step="0.01" disabled={!!sentTo} value={rate ?? ''} onChange={e => setRate(l.key, e.target.value)}
                            style={{ width: 90, textAlign: 'right', fontSize: 12.5, padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 5, fontFamily: 'inherit' }} />
                        </td>
                        <td style={{ ...tdR, background: '#fffdf5', fontWeight: 600 }}>{m(tot)}</td>
                        <td style={td}>{!sentTo && l.budgetRate != null && <button onClick={() => match(l)} style={{ ...btn, padding: '3px 9px', fontSize: 11.5 }} title="Use our labour rate">Match</button>}</td>
                        <td style={{ ...tdR, background: '#f5f9ff', color: '#1e3a8a' }}>{m(l.budgetRate)}</td>
                        <td style={{ ...tdR, background: '#f5f9ff', color: '#1e3a8a' }}>{m(l.budgetTotal)}</td>
                        <td style={{ ...tdR, fontWeight: 600, color: sv == null ? '#cbd5e1' : sv >= 0 ? '#15803d' : '#b91c1c' }}>{sv == null ? '—' : sv >= 0 ? m(sv) : `(${m(-sv)})`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PackageView({ p, m, busy, ownerQ, onDelete }) {
  const sum = (f) => p.lines.reduce((s, l) => s + (f(l) || 0), 0)
  const tot = sum(l => l.total), bud = sum(l => l.budgetTotal), sv = sum(l => saving(l.budgetTotal, l.total))
  const dl = (fmt) => `/api/labour-schedules?${ownerQ}&download=${encodeURIComponent(p.id)}&format=${fmt}`
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e' }}>{p.name}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Created {new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{p.createdBy ? ` by ${p.createdBy}` : ''} · the rates it was sent at</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={dl('xlsx')} style={{ ...btn, ...dark, textDecoration: 'none' }}>Download Excel</a>
          <a href={dl('pdf')} style={{ ...btn, ...dark, textDecoration: 'none' }}>Download PDF</a>
          <button onClick={onDelete} disabled={busy} style={{ ...btn, color: '#b42318', borderColor: '#f5c2c2' }}>Delete schedule</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Stat label="Schedule total" value={m(tot)} />
        <Stat label="Our labour budget" value={m(bud)} sub="not in the download" />
        <Stat label={sv >= 0 ? 'Saving' : 'Overspend'} value={m(Math.abs(sv))} tone={sv >= 0 ? 'good' : 'bad'} />
      </div>
      <div style={{ ...box, padding: 0, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
          <thead><tr>
            <th style={th}>Ref</th><th style={{ ...th, minWidth: 260 }}>Description</th><th style={thR}>Qty</th><th style={th}>Unit</th>
            <th style={{ ...thR, background: '#fffbeb' }}>Rate</th><th style={{ ...thR, background: '#fffbeb' }}>Total</th>
            <th style={{ ...thR, background: '#eff6ff', color: '#1e3a8a' }}>Labour rate</th><th style={{ ...thR, background: '#eff6ff', color: '#1e3a8a' }}>Labour total</th><th style={thR}>Saving / (overspend)</th>
          </tr></thead>
          <tbody>
            {p.lines.map(l => { const s = saving(l.budgetTotal, l.total); return (
              <tr key={l.key} style={{ borderTop: '0.5px solid #f1f5f9' }}>
                <td style={{ ...td, color: '#64748b' }}>{l.ref}</td><td style={td}>{l.description}</td><td style={tdR}>{l.qty ?? ''}</td><td style={td}>{l.unit}</td>
                <td style={{ ...tdR, background: '#fffdf5' }}>{m(l.rate)}</td><td style={{ ...tdR, background: '#fffdf5', fontWeight: 600 }}>{m(l.total)}</td>
                <td style={{ ...tdR, background: '#f5f9ff', color: '#1e3a8a' }}>{m(l.budgetRate)}</td><td style={{ ...tdR, background: '#f5f9ff', color: '#1e3a8a' }}>{m(l.budgetTotal)}</td>
                <td style={{ ...tdR, fontWeight: 600, color: s == null ? '#cbd5e1' : s >= 0 ? '#15803d' : '#b91c1c' }}>{s == null ? '—' : s >= 0 ? m(s) : `(${m(-s)})`}</td>
              </tr>) })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 8 }}>The download holds ref, description, qty, unit, rate and total only - never our labour rates or budget.</div>
    </>
  )
}

function SideBtn({ on, onClick, title, sub }) {
  return (
    <button onClick={onClick} style={{ display: 'block', width: '100%', textAlign: 'left', background: on ? '#1a1a2e' : 'transparent', color: on ? '#fff' : '#1a1a2e', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', marginBottom: 2, fontFamily: 'inherit' }}>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: on ? '#cbd5e1' : '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </button>
  )
}
function Stat({ label, value, sub, tone }) {
  const c = tone === 'good' ? '#15803d' : tone === 'bad' ? '#b91c1c' : '#1a1a2e'
  return (
    <div style={{ ...box, padding: '10px 14px', minWidth: 170 }}>
      <div style={{ fontSize: 11.5, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: c }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{sub}</div>}
    </div>
  )
}
const box = { background: '#fff', borderRadius: 12, border: '1px solid #e8eaee', padding: 16, fontSize: 13, color: '#555' }
const th = { textAlign: 'left', padding: '8px 8px', fontSize: 11.5, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', whiteSpace: 'nowrap' }
const thR = { ...th, textAlign: 'right' }
const td = { padding: '6px 8px', verticalAlign: 'middle' }
const tdR = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }
const btn = { fontSize: 12.5, padding: '6px 12px', border: '1px solid #d5d9e0', borderRadius: 7, background: '#fff', color: '#1a1a2e', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'inline-block' }
const dark = { background: '#1a1a2e', color: '#fff', borderColor: '#1a1a2e' }
