import { useEffect, useRef, useState } from 'react'
import { LINE_TYPES, LINE_TYPE_LABEL, COST_CATEGORIES, rateFor, evalQty, qtyProblem, normalizeTemplate, needsNormalizing } from '../lib/buildups'
import { th, td, tdR, inp } from './LibraryParts'

// THE BUILD-UP EDITOR (1088) - ONE component for the Build-ups page (a library
// template) and the take-off pop-out (an estimate item's own copy), so the two
// cannot drift: sizes, lines, product rules, and the rate worked out live.
//   value     { sizes, lines, rules, unit }
//   onChange  (next value)
//   rateOpts  { profit, mcd, labourFactor, jobQty } - from the page
//   lib       { product, labour, products, labourItems }
export const pct = (v) => v == null ? '' : +(v * 100).toFixed(4)
export const fromPct = (s) => { if (s === '' || s == null) return null; const n = parseFloat(s); return Number.isNaN(n) ? NaN : n / 100 }
const UNIT_LABEL = { m2: 'm²', m: 'm', nr: 'nr', item: 'item' }

export default function BuildupEditor({ value, onChange, lib, money, rateOpts, rateTitle = 'Rate', children }) {
  const t = value
  // Changes pass through as STEPS (functions), so two in one click apply in
  // order. onChange must be a state setter (or accept a function).
  const setT = (fn) => onChange(fn)
  // Older lines (fixed rate) become material lines with their rate, once, on
  // opening - priced exactly as before (1097).
  useEffect(() => { if (needsNormalizing(value)) onChange(x => normalizeTemplate(x)) }, [])
  const [showAll, setShowAll] = useState({})     // lineId -> true: pick from the whole price list / labour rates
  const set = (patch) => setT(x => ({ ...x, ...patch }))
  const setLine = (id, patch) => setT(x => ({ ...x, lines: x.lines.map(l => l.id === id ? { ...l, ...patch } : l) }))
  const move = (i, d) => setT(x => { const ls = [...x.lines]; const j = i + d; if (j < 0 || j >= ls.length) return x; [ls[i], ls[j]] = [ls[j], ls[i]]; return { ...x, lines: ls } })
  const nextId = () => `L${Math.max(0, ...t.lines.map(l => parseInt(String(l.id).replace(/\D/g, ''), 10) || 0)) + 1}`
  const addLine = (type) => setT(x => ({ ...x, lines: [...x.lines, { id: nextId(), type, label: '', offers: [], default: '', amount: null, qty: type === 'comment' ? '' : '1', waste: null, increase: null, cost: type === 'labour' ? 'Labour' : type === 'lump sum' ? 'Delivery' : type === 'comment' ? '' : 'Materials', comment: '' }] }))
  const sizeNames = (t.sizes || []).map(z => z.name)
  const r = rateFor(t, lib, rateOpts || {})
  const lineCost = Object.fromEntries(r.lines.map(x => [x.id, x]))
  const label = (ref, kind) => { const x = kind === 'labour' ? lib.labour[ref] : lib.product[ref]; return x ? `${x.description}${kind === 'labour' ? ` (${money(x.rate, { dp: 2 })}/${x.unit})` : ''}` : `${ref} (not in the ${kind === 'labour' ? 'labour rates' : 'price list'})` }
  // What the item search looks through: description, supplier code, supplier, Ref.
  const findText = (ref, kind) => { const x = kind === 'labour' ? lib.labour[ref] : lib.product[ref]; return x ? `${x.description} ${x.code || ''} ${x.supplier || ''} ${ref}`.toLowerCase() : String(ref).toLowerCase() }


  return (
    <>
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
            <thead><tr>{['', 'Type', 'Label', 'Item', 'Rate', 'Qty', 'Waste %', 'Incr %', 'Cost cat.', 'Line cost', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 9 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {t.lines.map((l, i) => {
                const lc = lineCost[l.id] || {}
                const isProd = l.type === 'material' || l.type === 'labour'
                const choices = showAll[l.id] ? (l.type === 'labour' ? lib.labourItems.map(x => x.ref) : lib.products.map(x => x.ref)) : [...new Set([...(l.offers || []), ...(l.default ? [l.default] : [])])]
                const qp = qtyProblem(l.qty, sizeNames)
                return (
                  <tr key={l.id} style={{ background: l.type === 'comment' ? '#fafaf9' : undefined }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><button onClick={() => move(i, -1)} style={iconBtn} title="Up">↑</button><button onClick={() => move(i, 1)} style={iconBtn} title="Down">↓</button></td>
                    <td style={td}><select value={LINE_TYPES.includes(l.type) ? l.type : 'material'} onChange={e => setLine(l.id, { type: e.target.value })} style={{ ...cellInp, width: 104 }}>{LINE_TYPES.map(x => <option key={x} value={x}>{LINE_TYPE_LABEL[x]}</option>)}</select></td>
                    <td style={td}><input value={l.label} onChange={e => setLine(l.id, { label: e.target.value })} style={{ ...cellInp, width: 140 }} /></td>
                    <td style={{ ...td, minWidth: 260 }}>
                      {isProd && <>
                        <ItemSearch kind={l.type} value={l.default || ''} choices={choices} label={label} findText={findText}
                          onPick={(v) => setLine(l.id, { default: v, override: v ? null : l.override, offers: v && !(l.offers || []).includes(v) ? [...(l.offers || []), v] : l.offers })} />
                        <label style={{ fontSize: 10.5, color: '#888', display: 'flex', gap: 4, marginTop: 2, alignItems: 'center' }}>
                          <input type="checkbox" checked={!!showAll[l.id]} onChange={e => setShowAll(s => ({ ...s, [l.id]: e.target.checked }))} />
                          any {l.type === 'labour' ? 'labour item' : 'product'} ({(l.offers || []).length} on this line's list)
                        </label>
                      </>}
                      {l.type === 'lump sum' && <input value={l.amount ?? ''} onChange={e => setLine(l.id, { amount: e.target.value === '' ? null : parseFloat(e.target.value) })} placeholder={l.type === 'lump sum' ? 'amount per job (on the estimate)' : 'amount per unit'} inputMode="decimal" style={{ ...cellInp, width: '100%' }} />}
                      {l.type === 'comment' && <input value={l.comment} onChange={e => setLine(l.id, { comment: e.target.value })} style={{ ...cellInp, width: '100%' }} />}
                      {l.type !== 'comment' && l.comment && <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>{l.comment}</div>}
                    </td>
                    <td style={td}>
                      {isProd && <>
                        {/* With a product: its rate, which can be typed over (CHANGED / Revert).
                            With none: an OWN item - this is its rate (1097). */}
                        <input value={l.override ?? ''} onChange={e => setLine(l.id, { override: e.target.value === '' ? null : parseFloat(e.target.value) })}
                          placeholder={l.default ? (lc.libRate != null ? (+lc.libRate.toFixed(4)).toString() : '') : 'rate'} inputMode="decimal"
                          style={{ ...cellInp, width: 70, borderColor: l.default && l.override != null ? '#f59e0b' : undefined }} title={l.default ? 'The price-list rate - type over it to change it on this build-up' : 'Your own item: type its rate'} />
                        {l.default && l.override != null && <div><span style={{ fontSize: 10, fontWeight: 700, color: '#b45309' }}>CHANGED</span> <button onClick={() => setLine(l.id, { override: null })} style={{ ...iconBtn, fontSize: 10.5, color: '#2563eb' }}>Revert to {l.type === 'labour' ? 'labour rate' : 'price list'}</button></div>}
                        {!l.default && <div style={{ fontSize: 10, color: '#888' }}>own item</div>}
                      </>}
                    </td>
                    <td style={td}>{l.type !== 'comment' && <input value={l.qty || ''} onChange={e => setLine(l.id, { qty: e.target.value })} placeholder="per job" style={{ ...cellInp, width: 80, borderColor: qp ? '#dc2626' : undefined }} title={qp || (l.qty && sizeNames.length ? `= ${evalQty(l.qty, Object.fromEntries((t.sizes || []).map(z => [z.name, z.value])))}` : '')} />}</td>
                    <td style={td}>{l.type === 'material' && <input value={pct(l.waste)} onChange={e => setLine(l.id, { waste: fromPct(e.target.value) })} style={{ ...cellInp, width: 52 }} />}{lc.ruleApplied && <div style={{ fontSize: 10, color: '#0f766e' }}>rule</div>}</td>
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
          {LINE_TYPES.map(x => <button key={x} onClick={() => addLine(x)} style={smallBtn}>+ {LINE_TYPE_LABEL[x]}</button>)}
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
        {children}
        <div style={{ display: 'flex', gap: 18, marginTop: children ? 10 : 0, fontSize: 13, flexWrap: 'wrap' }}>
          <span>Materials {money(r.materials + r.fixed + r.lump, { dp: 2 })}</span><span>Labour {money(r.labour, { dp: 2 })}</span>
          <span>Profit {money(r.profit, { dp: 2 })}</span><span>MCD {money(r.mcd, { dp: 2 })}</span>
          <strong style={{ fontSize: 15, color: '#0f766e' }}>{rateTitle} {money(r.rate, { dp: 2 })}{t.unit ? ` per ${UNIT_LABEL[t.unit]}` : ''}</strong>
        </div>
        {r.missing.length > 0 && <div style={{ fontSize: 12, color: '#92400e', marginTop: 6 }}>Not yet in the rate: {r.missing.slice(0, 8).join(' · ')}{r.missing.length > 8 ? ` … and ${r.missing.length - 8} more` : ''}</div>}
      </div>
    </>
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
const cellInp = { fontSize: 12.5, padding: '5px 6px', border: '1px solid #d4d4d0', borderRadius: 6, fontFamily: 'inherit', boxSizing: 'border-box' }
const iconBtn = { border: 'none', background: 'none', cursor: 'pointer', color: '#888', fontSize: 13, padding: '2px 4px', fontFamily: 'inherit' }
const smallBtn = { fontSize: 12, padding: '5px 10px', border: '1px solid #d4d4d0', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }

// THE ITEM SEARCH (1097): type any part of a product's description, code, Ref
// or supplier (or a labour item's description) and pick from what matches.
// "Own item" leaves the line without a product - its rate is typed instead.
function ItemSearch({ kind, value, choices, label, findText, onPick }) {
  const [q, setQ] = useState(null)        // null = not searching: show the chosen item
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) { setOpen(false); setQ(null) } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const words = (q || '').toLowerCase().split(/\s+/).filter(Boolean)
  const matches = choices.filter(ref => { const t = findText(ref, kind); return words.every(w => t.includes(w)) }).slice(0, 60)
  const pick = (v) => { onPick(v); setOpen(false); setQ(null) }
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <input value={q != null ? q : (value ? label(value, kind) : '')} placeholder={`Search ${kind === 'labour' ? 'labour' : 'products'}… or own item`}
        onFocus={() => { setOpen(true); setQ('') }} onChange={e => { setQ(e.target.value); setOpen(true) }}
        style={{ ...cellInp, width: '100%' }} />
      {open && (
        <div style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%', marginTop: 2, background: '#fff', border: '1px solid #d4d4d0', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto' }}>
          <div onMouseDown={(e) => { e.preventDefault(); pick('') }} style={{ padding: '6px 9px', fontSize: 12, color: '#555', cursor: 'pointer', borderBottom: '1px solid #f0efec', background: !value ? '#f0fdfa' : undefined }}>Own item (no product) - type its rate</div>
          {matches.map(ref => (
            <div key={ref} onMouseDown={(e) => { e.preventDefault(); pick(ref) }} style={{ padding: '6px 9px', fontSize: 12.5, cursor: 'pointer', background: ref === value ? '#f0fdfa' : undefined, borderBottom: '1px solid #f8f7f5' }}>
              {label(ref, kind)} <span style={{ color: '#aaa', fontSize: 11 }}>{ref}</span>
            </div>
          ))}
          {!matches.length && <div style={{ padding: '8px 9px', fontSize: 12, color: '#aaa' }}>Nothing matches{choices.length < 200 ? ' on this line\'s list - tick "any" to search everything' : ''}.</div>}
        </div>
      )}
    </div>
  )
}
