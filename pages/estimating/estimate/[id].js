import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import EstimatingShell, { ErrorBar, estApi } from '../../../components/EstimatingShell'
import { useFormat } from '../../../components/TenantProvider'
import { th, td, tdR, inp, btn } from '../../../components/LibraryParts'
import BuildupEditor, { pct, fromPct } from '../../../components/BuildupEditor'
import { BU_UNITS, BU_UNIT_LABEL } from '../../../lib/buildups'
import { HEADER_FIELDS, itemFromTemplate, uniqueItem, sectionRow, priceEstimate, sectionTotals, priceItem } from '../../../lib/estimate'

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
  const { money } = useFormat()
  const m2 = (v) => v == null ? '' : money(v, { dp: 2 })
  const [est, setEst] = useState(null)
  const [base, setBase] = useState(null)        // updatedAt when opened - a stale save is refused
  const [dirty, setDirty] = useState(false)
  const [lib, setLib] = useState({ product: {}, labour: {}, products: [], labourItems: [] })
  const [templates, setTemplates] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [popout, setPopout] = useState(null)    // item id
  const [picking, setPicking] = useState(false)
  const [showHeader, setShowHeader] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([estApi(`${API}?id=${id}`), estApi('/api/estimating/price-list'), estApi('/api/estimating/labour-rates'), estApi('/api/estimating/build-ups')])
      .then(([e, p, l, b]) => {
        setEst(e.estimate); setBase(e.estimate.updatedAt)
        setLib({ product: Object.fromEntries(p.products.map(x => [x.ref, x])), labour: Object.fromEntries(l.items.map(x => [x.ref, x])), products: p.products, labourItems: l.items })
        setTemplates(b.templates || [])
      }).catch(e => setErr(e.message))
  }, [id])
  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const change = (fn) => { setEst(e => fn(e)); setDirty(true) }
  const setRow = (rid, patch) => change(e => ({ ...e, rows: e.rows.map(r => r.id === rid ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r) }))
  const setSetting = (k, v) => change(e => ({ ...e, settings: { ...e.settings, [k]: v } }))
  const move = (i, d) => change(e => { const rs = [...e.rows]; const j = i + d; if (j < 0 || j >= rs.length) return e; [rs[i], rs[j]] = [rs[j], rs[i]]; return { ...e, rows: rs } })
  const addRow = (row, open) => { change(e => ({ ...e, rows: [...e.rows, row] })); if (open) setPopout(row.id) }

  const { priced, totals } = useMemo(() => est ? priceEstimate(est, lib) : { priced: {}, totals: {} }, [est, lib])
  const secTot = useMemo(() => est ? sectionTotals(est, priced) : {}, [est, priced])

  async function save() {
    setBusy(true); setErr('')
    try {
      const d = await estApi(API, { action: 'save', estimate: est, baseUpdatedAt: base })
      setEst(d.estimate); setBase(d.estimate.updatedAt); setDirty(false)
    } catch (e) { setErr(e.message) }
    setBusy(false)
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
            {est.dealId ? <>CRM deal: <a href={`/crm?deal=${est.dealId}`} style={{ color: '#0f766e' }}>{est.dealTitle}</a>{est.organisation ? ` · ${est.organisation}` : ''}</> : 'Not linked to a CRM deal'}
            {' · '}Rev {est.revision}{' · '}last saved {new Date(est.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{est.updatedBy ? ` by ${est.updatedBy}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: 12.5, color: '#b45309', fontWeight: 600 }}>Unsaved changes</span>}
          <button onClick={save} disabled={busy || !dirty} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', opacity: busy || !dirty ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      <ErrorBar error={err} onClose={() => setErr('')} />

      <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          <label>Quote ref <input value={est.quoteRef || ''} onChange={e => change(x => ({ ...x, quoteRef: e.target.value }))} style={{ ...cellInp, width: 120 }} /></label>
          <label>Profit % <input value={pct(s.profit)} onChange={e => setSetting('profit', fromPct(e.target.value))} placeholder="set" style={{ ...cellInp, width: 60, borderColor: s.profit == null ? '#f59e0b' : undefined }} /></label>
          <label>MCD % <input value={pct(s.mcd)} onChange={e => setSetting('mcd', fromPct(e.target.value))} placeholder="0" style={{ ...cellInp, width: 60 }} /></label>
          <label title="Raise or lower ALL the labour on this quote - each rate in proportion to its own labour">Labour factor <input value={s.labourFactor ?? 1} onChange={e => setSetting('labourFactor', e.target.value === '' ? 1 : parseFloat(e.target.value))} style={{ ...cellInp, width: 60 }} /></label>
          <label title="Starts from the company day rate (Labour Rates); used for prelims">Day rate <input value={s.dayRate ?? ''} onChange={e => setSetting('dayRate', e.target.value === '' ? null : parseFloat(e.target.value))} style={{ ...cellInp, width: 70 }} /></label>
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowHeader(v => !v)} style={smallBtn}>{showHeader ? 'Hide' : 'Show'} project details</button>
        </div>
        {s.profit == null && <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>Set the profit % for this quote - every rate includes it.</div>}
        {showHeader && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10 }}>
            {HEADER_FIELDS.map(([k, label]) => (
              <label key={k} style={{ fontSize: 12, color: '#666', display: 'flex', flexDirection: 'column', gap: 3 }}>{label}
                <input value={(est.header || {})[k] || ''} onChange={e => change(x => ({ ...x, header: { ...(x.header || {}), [k]: e.target.value } }))} style={inp} type={k === 'date' || k === 'startOnSite' ? 'date' : 'text'} />
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead><tr>{['', 'Description', 'Qty', 'Unit', 'Rate', 'Total', 'Materials', 'Labour', 'Profit %', 'Rate only', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: [2, 4, 5, 6, 7].includes(i) ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
          <tbody>
            {est.rows.map((r, i) => r.kind === 'section' ? (
              <tr key={r.id} style={{ background: '#f4f4f2' }}>
                <td style={td}><Arrows i={i} move={move} /></td>
                <td style={td} colSpan={4}><input value={r.title} onChange={e => setRow(r.id, { title: e.target.value })} style={{ ...cellInp, fontWeight: 700, width: '100%', background: 'transparent', border: 'none' }} /></td>
                <td style={{ ...tdR, fontWeight: 700 }}>{m2(secTot[r.id])}</td>
                <td style={td} colSpan={4} />
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
                  <td style={{ ...tdR, fontWeight: 600 }}>{m2(p.rate)}</td>
                  <td style={{ ...tdR, fontWeight: 600 }}>{r.rateOnly ? <span style={{ color: '#888', fontWeight: 400 }}>Rate only</span> : m2(p.total)}</td>
                  <td style={{ ...tdR, color: '#666' }}>{m2(p.materialsTotal)}</td>
                  <td style={{ ...tdR, color: '#666' }}>{m2(p.labourTotal)}</td>
                  <td style={td}><input value={pct(r.profit)} onChange={e => setRow(r.id, { profit: fromPct(e.target.value) })} placeholder={s.profit != null ? String(pct(s.profit)) : ''} style={{ ...cellInp, width: 56, borderColor: r.profit != null ? '#f59e0b' : undefined }} title="Leave blank to use the quote's profit %" /></td>
                  <td style={td}><input type="checkbox" checked={!!r.rateOnly} onChange={e => setRow(r.id, { rateOnly: e.target.checked })} title="No quantity: priced as a rate, below the line" /></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => setPopout(r.id)} style={smallBtn}>Build-up</button>
                    <button onClick={() => { if (window.confirm(`Remove "${r.description}"?`)) change(e => ({ ...e, rows: e.rows.filter(x => x.id !== r.id) })) }} style={iconBtn} title="Remove item">✕</button>
                  </td>
                </tr>
              )
            })())}
            {!est.rows.length && <tr><td colSpan={11} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 26 }}>Add a section header, then the items - from the build-ups, or unique.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => addRow(sectionRow('New section'))} style={btn}>+ Section header</button>
        <button onClick={() => setPicking(true)} style={btn} disabled={!templates.length} title={templates.length ? '' : 'Upload build-ups first'}>+ Item from build-ups</button>
        <button onClick={() => addRow(uniqueItem('m2'), true)} style={btn}>+ Unique item</button>
      </div>

      <div style={{ display: 'flex', gap: 24, marginTop: 16, background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 12, padding: '12px 16px', flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13 }}>
        <strong style={{ fontSize: 17, color: '#0f766e' }}>Total {money(totals.total || 0, { dp: 2 })}</strong>
        <span>Materials {money(totals.materials || 0, { dp: 2 })}</span>
        <span>Labour {money(totals.labour || 0, { dp: 2 })}</span>
        <span>Profit &amp; MCD {money(totals.profitAndMcd || 0, { dp: 2 })}</span>
        {totals.belowLine > 0 && <span style={{ color: '#666' }}>{totals.belowLine} rate-only item{totals.belowLine === 1 ? '' : 's'} below the line</span>}
        {totals.noQty > 0 && <span style={{ color: '#b45309' }}>{totals.noQty} item{totals.noQty === 1 ? '' : 's'} without a quantity - not in the total</span>}
      </div>

      {picking && <TemplatePicker templates={templates} onClose={() => setPicking(false)} onPick={(t) => { setPicking(false); addRow(itemFromTemplate(t), true) }} />}
      {item && <Popout item={item} est={est} lib={lib} money={money} onChange={(fn) => setRow(item.id, (r) => ({ buildup: fn(r.buildup) }))} setRow={(patch) => setRow(item.id, patch)} onClose={() => setPopout(null)} />}
    </EstimatingShell>
  )
}

function Popout({ item, est, lib, money, onChange, setRow, onClose }) {
  const s = est.settings || {}
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
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 1250, padding: 18 }}>
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

const Arrows = ({ i, move }) => <span style={{ whiteSpace: 'nowrap' }}><button onClick={() => move(i, -1)} style={iconBtn} title="Up">↑</button><button onClick={() => move(i, 1)} style={iconBtn} title="Down">↓</button></span>
const lbl = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#666' }
const cellInp = { fontSize: 13, padding: '5px 7px', border: '1px solid #d4d4d0', borderRadius: 6, fontFamily: 'inherit', boxSizing: 'border-box' }
const iconBtn = { border: 'none', background: 'none', cursor: 'pointer', color: '#888', fontSize: 13, padding: '2px 4px', fontFamily: 'inherit' }
const smallBtn = { fontSize: 12, padding: '5px 10px', border: '1px solid #d4d4d0', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }
