import { useEffect, useRef, useState } from 'react'
import { BU_UNIT_LABEL, LINE_TYPES, LINE_TYPE_LABEL, COST_CATEGORIES, rateFor, evalQty, qtyProblem, normalizeTemplate, needsNormalizing, descriptionText, isVariable, SIZE_NAMES } from '../lib/buildups'
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
// The shared unit names (1103) - so m³, weeks and days show here too.
const UNIT_LABEL = BU_UNIT_LABEL

export default function BuildupEditor({ value, onChange, lib, money, rateOpts, rateTitle = 'Rate', children }) {
  const t = value
  // Changes pass through as STEPS (functions), so two in one click apply in
  // order. onChange must be a state setter (or accept a function).
  const setT = (fn) => onChange(fn)
  // Older lines (fixed rate) become material lines with their rate, once, on
  // opening - priced exactly as before (1097).
  useEffect(() => { if (needsNormalizing(value)) onChange(x => normalizeTemplate(x)) }, [])
  const [editList, setEditList] = useState(null)   // a line id: edit its list of products (1098)
  const [descMenu, setDescMenu] = useState(false)
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
      <Block title="Sizes" hint="Width and Height for this build-up. A line's Apply size multiplies it by one of them. (Girth belongs in the line rates.)">
        {SIZE_NAMES.map(nm => {
          const z = (t.sizes || []).find(x => String(x.name).toLowerCase() === nm.toLowerCase())
          const setVal = (v) => setT(x => {
            const list = [...(x.sizes || [])]; const k = list.findIndex(y => String(y.name).toLowerCase() === nm.toLowerCase())
            const val = v === '' ? null : parseFloat(v)
            if (k >= 0) list[k] = { ...list[k], value: val }; else list.push({ name: nm, value: val, comment: '' })
            return { ...x, sizes: list }
          })
          return (
            <div key={nm} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <span style={{ width: 70, fontSize: 13, fontWeight: 600 }}>{nm}</span>
              <input value={z?.value ?? ''} onChange={e => setVal(e.target.value)} placeholder="m" inputMode="decimal" style={{ ...inp, width: 110 }} />
              <span style={{ fontSize: 11.5, color: '#999' }}>{t.lines.filter(l => l.applySize === nm).length ? `used by ${t.lines.filter(l => l.applySize === nm).map(l => l.label).join(', ')}` : 'not used yet'}</span>
            </div>
          )
        })}
        {(t.sizes || []).filter(z => !SIZE_NAMES.some(n => n.toLowerCase() === String(z.name).toLowerCase())).map((z, i) => (
          <div key={`o${i}`} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <span style={{ width: 70, fontSize: 12.5, color: '#666' }}>{z.name}</span>
            <input value={z.value ?? ''} onChange={e => setT(x => ({ ...x, sizes: x.sizes.map(s2 => s2 === z ? { ...s2, value: e.target.value === '' ? null : parseFloat(e.target.value) } : s2) }))} inputMode="decimal" style={{ ...inp, width: 110 }} />
            <span style={{ fontSize: 11.5, color: '#999' }}>from the spreadsheet - quantities written as sums use it{z.comment ? ` (${z.comment})` : ''}</span>
          </div>
        ))}
      </Block>

      <Block title="Lines">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
            <thead><tr>{['', 'Type', 'Label', 'Item', 'Apply size', 'Qty', 'Rate', 'Waste %', 'Incr %', '= Line rate', 'Cost cat.', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 9 ? 'right' : 'left', ...(i === 9 ? { color: '#1a1a19' } : {}) }} title={i === 9 ? "Rate x Qty (x waste / increase): this line's part of the build-up's rate" : ''}>{h}</th>)}</tr></thead>
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
                    <td style={td}><input value={l.label} onChange={e => setLine(l.id, { label: e.target.value })} style={{ ...cellInp, width: 118 }} /></td>
                    <td style={{ ...td, minWidth: 210 }}>
                      {isProd && <>
                        <ItemSearch red={isVariable(l, 'item')} kind={l.type} value={l.default || ''} choices={choices} label={label} findText={findText}
                          onPick={(v) => setLine(l.id, { default: v, ownName: v ? undefined : l.ownName, override: v ? null : l.override, offers: v && !(l.offers || []).includes(v) ? [...(l.offers || []), v] : l.offers })}
                          ownName={l.ownName} onOwn={(name) => setLine(l.id, { default: '', ownName: name })} />
                        <label style={{ fontSize: 10.5, color: '#888', display: 'flex', gap: 4, marginTop: 2, alignItems: 'center' }}>
                          <VarFlag l={l} cell="item" setLine={setLine} />
                          <button onClick={() => setEditList(l.id)} title="Edit this line's list of products" style={{ ...iconBtn, fontSize: 11, padding: '0 3px' }}>⚙ list</button>
                          <input type="checkbox" checked={!!showAll[l.id]} onChange={e => setShowAll(s => ({ ...s, [l.id]: e.target.checked }))} />
                          any ({(l.offers || []).length} on list)
                        </label>
                      </>}
                      {l.type === 'lump' && <><input value={l.amount ?? ''} onChange={e => setLine(l.id, { amount: e.target.value === '' ? null : parseFloat(e.target.value) })} placeholder="amount (x the line's qty)" inputMode="decimal" style={{ ...cellInp, width: '100%' }} /><div style={{ fontSize: 10, color: '#888' }}>lump sum - not divided by the item's quantity; set its cost category</div></>}
                      {l.type === 'lump sum' && <input value={l.amount ?? ''} onChange={e => setLine(l.id, { amount: e.target.value === '' ? null : parseFloat(e.target.value) })} placeholder={l.type === 'lump sum' ? 'amount per job (on the estimate)' : 'amount per unit'} inputMode="decimal" style={{ ...cellInp, width: '100%' }} />}
                      {l.type === 'comment' && <input value={l.comment} onChange={e => setLine(l.id, { comment: e.target.value })} style={{ ...cellInp, width: '100%' }} />}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>{(isProd || l.type === 'lump') && <select value={l.applySize === true ? ((t.sizes || [])[0]?.name || '') : (l.applySize || '')} onChange={e => setLine(l.id, { applySize: e.target.value || undefined })} style={{ ...cellInp, width: 78 }} title="Multiply this line by the Width or Height"><option value="">—</option>{[...SIZE_NAMES, ...(t.sizes || []).map(z => z.name).filter(n => n && !SIZE_NAMES.some(x => x.toLowerCase() === String(n).toLowerCase()))].map(n => <option key={n} value={n}>{n}</option>)}</select>}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{l.type !== 'comment' && l.type !== 'lump sum' && <VarFlag l={l} cell="qty" setLine={setLine} />}{l.type !== 'comment' && <input value={l.qty || ''} onChange={e => setLine(l.id, { qty: e.target.value })} placeholder="per job" style={{ ...cellInp, background: isVariable(l, 'qty') ? RED : undefined, width: 58, borderColor: qp ? '#dc2626' : undefined }} title={qp || (l.qty && sizeNames.length ? `= ${evalQty(l.qty, Object.fromEntries((t.sizes || []).map(z => [z.name, z.value])))}` : '')} />}</td>
                    <td style={td}>
                      {isProd && <>
                        {/* With a product: its rate, which can be typed over (CHANGED / Revert).
                            With none: an OWN item - this is its rate (1097). */}
                        <input value={l.override ?? ''} onChange={e => setLine(l.id, { override: e.target.value === '' ? null : parseFloat(e.target.value) })}
                          placeholder={l.default ? (lc.libRate != null ? (+lc.libRate.toFixed(4)).toString() : '') : 'rate'} inputMode="decimal"
                          style={{ ...cellInp, width: 70, borderColor: l.default && l.override != null ? '#f59e0b' : undefined, background: isVariable(l, 'rate') ? RED : undefined }} title={l.default ? 'The price-list rate - type over it to change it on this build-up' : 'Your own item: type its rate'} />
                        <VarFlag l={l} cell="rate" setLine={setLine} />
                        {l.default && l.override != null && <div><span style={{ fontSize: 10, fontWeight: 700, color: '#b45309' }}>CHANGED</span> <button onClick={() => setLine(l.id, { override: null })} style={{ ...iconBtn, fontSize: 10.5, color: '#2563eb' }}>Revert to {l.type === 'labour' ? 'labour rate' : 'price list'}</button></div>}
                        {!l.default && <div style={{ fontSize: 10, color: '#888' }}>own item</div>}
                      </>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{l.type === 'material' && <><input value={pct(l.waste)} onChange={e => setLine(l.id, { waste: fromPct(e.target.value) })} style={{ ...cellInp, width: 52, background: isVariable(l, 'waste') ? RED : undefined }} /><VarFlag l={l} cell="waste" setLine={setLine} /></>}</td>
                    <td style={td}>{l.type === 'material' && <input value={pct(l.increase)} onChange={e => setLine(l.id, { increase: fromPct(e.target.value) })} style={{ ...cellInp, width: 52 }} />}</td>
                    <td style={{ ...tdR, fontWeight: 700, color: '#0f766e', whiteSpace: 'nowrap' }} title="Rate x Qty (x waste / increase)">{lc.cost != null ? `= ${money(lc.cost, { dp: 2 })}` : ''}</td>
                    <td style={td}>{l.type !== 'comment' && <select value={l.cost || ''} onChange={e => setLine(l.id, { cost: e.target.value })} style={{ ...cellInp, width: 92 }}><option value="">—</option>{COST_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>}</td>
                    <td style={td}><button onClick={() => setT(x => ({ ...x, lines: x.lines.filter(y => y.id !== l.id), rules: (x.rules || []).filter(rr => rr.line !== l.id) }))} style={iconBtn} title="Remove line">✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {LINE_TYPES.map(x => <button key={x} onClick={() => addLine(x)} style={smallBtn}>+ {LINE_TYPE_LABEL[x]}</button>)}
        </div>
      </Block>

      <Block title="Description" hint="Blank to start. {products} becomes the products ticked under ⚙ (A, B and C). Insert variable adds a detail that is not a product - e.g. {Warranty period} - with its value below.">
        <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <button onClick={() => setT(x => ({ ...x, descText: `${x.descText || ''}${x.descText && !/\s$/.test(x.descText) ? ' ' : ''}{products}` }))} style={smallBtn}>Insert {'{products}'}</button>
          <button onClick={() => {
            const nm = (window.prompt('Name of the variable - e.g. Warranty period, Colour, Membrane thickness:') || '').trim().replace(/[{}]/g, '')
            if (!nm) return
            setT(x => ({ ...x, descVars: (x.descVars || []).some(v => v.name.toLowerCase() === nm.toLowerCase()) ? x.descVars : [...(x.descVars || []), { name: nm, value: '' }],
              descText: `${x.descText || ''}${x.descText && !/\s$/.test(x.descText) ? ' ' : ''}{${nm}}` }))
          }} style={smallBtn} title="A detail the description needs that is not a product - e.g. warranty period">Insert variable</button>
          <button onClick={() => setDescMenu(v => !v)} style={smallBtn} title="Which products go into the description">⚙ Products in the description ({t.lines.filter(l => l.type === 'material' && l.inDescription).length})</button>
        </div>
        {descMenu && (
          <div style={{ border: '1px solid #e8e7e3', borderRadius: 8, padding: 8, marginBottom: 6, maxWidth: 520 }}>
            {t.lines.filter(l => l.type === 'material').map(l => (
              <label key={l.id} style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '2px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!l.inDescription} onChange={e => setLine(l.id, { inDescription: e.target.checked })} />
                <span>{l.label}{l.default ? <span style={{ color: '#888' }}> - {label(l.default, 'material')}</span> : <span style={{ color: '#888' }}> - own item</span>}</span>
              </label>
            ))}
            {!t.lines.some(l => l.type === 'material') && <div style={{ fontSize: 12, color: '#aaa' }}>No material lines yet.</div>}
          </div>
        )}
        {(t.descVars || []).length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6, marginBottom: 6 }}>
            {t.descVars.map((v, i) => (
              <label key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
                <span style={{ minWidth: 110, color: '#555' }}>{v.name}</span>
                <input value={v.value ?? ''} onChange={e => setT(x => ({ ...x, descVars: x.descVars.map((y, j) => j === i ? { ...y, value: e.target.value } : y) }))} placeholder="value" style={{ ...cellInp, flex: 1, background: String(v.value ?? '').trim() ? undefined : RED }} title="Empty values show light red - fill them in for this quote" />
                <button onClick={() => setT(x => ({ ...x, descVars: x.descVars.filter((_, j) => j !== i), descText: String(x.descText || '').split(`{${v.name}}`).join('') }))} style={iconBtn} title="Remove this variable">✕</button>
              </label>
            ))}
          </div>
        )}
        <textarea value={t.descText || ''} onChange={e => setT(x => ({ ...x, descText: e.target.value }))} rows={3} placeholder="e.g. Single ply membrane roof system comprising: {products}." style={{ ...inp, fontFamily: 'inherit' }} />
        {(t.descText || '').trim() && <div style={{ fontSize: 12.5, color: '#444', marginTop: 6, background: '#fafaf9', borderRadius: 6, padding: '6px 8px' }}><span style={{ color: '#999', fontSize: 11 }}>Reads: </span>{descriptionText(t, lib)}</div>}
      </Block>

      <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: 12, marginTop: 12 }}>
        {children}
        <div style={{ display: 'flex', gap: 18, marginTop: children ? 10 : 0, fontSize: 13, flexWrap: 'wrap' }}>
          <span>Materials {money(r.materials + r.fixed + r.lump, { dp: 2 })}</span><span>Labour {money(r.labour, { dp: 2 })}</span>
          <span>Profit {money(r.profit, { dp: 2 })}</span><span>MCD {money(r.mcd, { dp: 2 })}</span>
          <strong style={{ fontSize: 15, color: '#0f766e' }}>{rateTitle} {money(r.rate, { dp: 2 })}{t.unit ? ` per ${UNIT_LABEL[t.unit]}` : ''}</strong>
        </div>
        {editList && (() => { const ln = t.lines.find(x => x.id === editList); return ln ? <ListEditor ln={ln} lib={lib} label={label} findText={findText} onClose={() => setEditList(null)} onChange={(offers) => setLine(ln.id, { offers })} /> : null })()}
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
function ItemSearch({ kind, value, choices, label, findText, onPick, red, ownName, onOwn }) {
  const [q, setQ] = useState(null)        // null = not searching: show the chosen item
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  // Typed a name and did not pick a product? That name is the OWN ITEM (1102).
  const qRef = useRef(null); qRef.current = q
  const keepTyped = () => { const t = (qRef.current || '').trim(); if (t && onOwn) onOwn(t) }
  // An OWN ITEM's box is its text (1104): shown as written, edited in place -
  // e.g. "XXXmm girth powder coated aluminium" -> change XXX to 600. Every
  // keystroke saves. With a PRODUCT chosen, clicking in starts a fresh search.
  const isOwn = !value
  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) { if (qRef.current != null) keepTyped(); setOpen(false); setQ(null) } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const words = (q || '').toLowerCase().split(/\s+/).filter(Boolean)
  const matches = choices.filter(ref => { const t = findText(ref, kind); return words.every(w => t.includes(w)) }).slice(0, 60)
  // Leave the box after picking (1104), so the next click starts a fresh search.
  const inputRef = useRef(null)
  const pick = (v) => { qRef.current = null; onPick(v); setOpen(false); setQ(null); setTimeout(() => inputRef.current && inputRef.current.blur(), 0) }
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <input ref={inputRef} value={q != null ? q : (value ? label(value, kind) : (ownName || ''))}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); keepTyped(); setOpen(false); setQ(null); e.currentTarget.blur() } if (e.key === 'Escape') { setOpen(false); setQ(null) } }} placeholder={`Search ${kind === 'labour' ? 'labour' : 'products'}… or own item`}
        onFocus={() => { setOpen(true); setQ(isOwn ? (ownName || '') : '') }} onChange={e => { const v = e.target.value; setQ(v); setOpen(true); if (isOwn && onOwn) onOwn(v) }}
        style={{ ...cellInp, width: '100%', background: red ? RED : undefined }} />
      {open && (
        <div style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%', marginTop: 2, background: '#fff', border: '1px solid #d4d4d0', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto' }}>
          <div onMouseDown={(e) => { e.preventDefault(); const t = (q || '').trim(); onPick(''); if (t && onOwn) onOwn(t); setOpen(false); setQ(null) }} style={{ padding: '6px 9px', fontSize: 12, color: '#555', cursor: 'pointer', borderBottom: '1px solid #f0efec', background: !value ? '#f0fdfa' : undefined }}>{(q || '').trim() ? <>Own item: <strong>{q.trim()}</strong> (Enter) - then type its rate</> : 'Own item (no product) - type its name here, then its rate'}</div>
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

// VARIABLE (1098): a cell the estimator must review on every quote - the item,
// its rate or its waste. Toggled here; the cell shows light red.
const RED = '#fde2e2'
function VarFlag({ l, cell, setLine }) {
  const on = isVariable(l, cell)
  return <button onClick={() => setLine(l.id, { variable: { ...(l.variable || {}), [cell]: !on } })} title={on ? `${cell} is VARIABLE - review it on every quote (click to clear)` : `Mark the ${cell} as variable - to review on every quote`}
    style={{ border: `1px solid ${on ? '#ef4444' : '#d4d4d0'}`, background: on ? '#fde2e2' : '#fff', color: on ? '#b91c1c' : '#999', borderRadius: 4, fontSize: 10, fontWeight: 700, padding: '0 4px', marginLeft: 3, cursor: 'pointer', lineHeight: '16px' }}>V</button>
}

// THIS LINE'S LIST OF PRODUCTS (1098): the products its search offers. Remove
// those that do not apply to this build-up; add any from the whole price list.
function ListEditor({ ln, lib, label, findText, onClose, onChange }) {
  const [q, setQ] = useState('')
  const kind = ln.type
  const offers = ln.offers || []
  const all = kind === 'labour' ? lib.labourItems.map(x => x.ref) : lib.products.map(x => x.ref)
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const found = words.length ? all.filter(ref => !offers.includes(ref) && words.every(w => findText(ref, kind).includes(w))).slice(0, 40) : []
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong>{ln.label || 'Line'} - its list of {kind === 'labour' ? 'labour items' : 'products'} ({offers.length})</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, borderTop: '1px solid #f0efec', paddingTop: 6 }}>
          {offers.map(ref => (
            <div key={ref} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid #f8f7f5' }}>
              <span>{label(ref, kind)} <span style={{ color: '#aaa', fontSize: 11 }}>{ref}</span>{ref === ln.default && <span style={{ color: '#0f766e', fontSize: 11 }}> · chosen</span>}</span>
              <button onClick={() => onChange(offers.filter(x => x !== ref))} disabled={ref === ln.default} title={ref === ln.default ? 'The chosen product - choose another first' : 'Remove from this list'} style={{ border: 'none', background: 'none', color: ref === ln.default ? '#ccc' : '#b42318', cursor: 'pointer', fontSize: 12 }}>Remove</button>
            </div>
          ))}
          {!offers.length && <div style={{ fontSize: 12.5, color: '#aaa' }}>Empty - add from the price list below.</div>}
        </div>
        <div style={{ borderTop: '1px solid #f0efec', marginTop: 8, paddingTop: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Add from the whole ${kind === 'labour' ? 'labour rates' : 'price list'} - search…`} style={{ ...cellInp, width: '100%' }} />
          <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 4 }}>
            {found.map(ref => <div key={ref} onClick={() => onChange([...offers, ref])} style={{ fontSize: 12.5, padding: '4px 6px', cursor: 'pointer', borderBottom: '1px solid #f8f7f5' }}>+ {label(ref, kind)} <span style={{ color: '#aaa', fontSize: 11 }}>{ref}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  )
}
