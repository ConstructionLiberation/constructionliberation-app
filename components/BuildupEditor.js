import { useEffect, useRef, useState } from 'react'
import { BU_UNIT_LABEL, LINE_TYPES, LINE_TYPE_LABEL, COST_CATEGORIES, rateFor, evalQty, qtyProblem, normalizeTemplate, needsNormalizing, descriptionText, isVariable, SIZE_NAMES, SIZE_UNIT, APPLY_CHOICES, sizesUsed, sizeOf, isCombined, applyList, applyText, productList, lineWording, productItems, rateSummary } from '../lib/buildups'
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

export default function BuildupEditor({ varLibrary, value, onChange, lib, money, rateOpts, rateTitle = 'Rate', children, summary }) {
  const t = value
  // Changes pass through as STEPS (functions), so two in one click apply in
  // order. onChange must be a state setter (or accept a function).
  const setT = (fn) => onChange(fn)
  // Older lines (fixed rate) become material lines with their rate, once, on
  // opening - priced exactly as before (1097).
  useEffect(() => { if (needsNormalizing(value)) onChange(x => normalizeTemplate(x)) }, [])
  const [editList, setEditList] = useState(null)   // a line id: edit its list of products (1098)
  const [descMenu, setDescMenu] = useState(false)
  const descInsert = useRef(null)       // the description editor's insert-at-cursor (1106)
  const [varPop, setVarPop] = useState(null)   // the variable pop-out: { index } - null index = a new one (1109)
  const descFlag = useRef(null)                 // mark / clear red in the description (1110)
  const [flagMsg, setFlagMsg] = useState('')
  const [showAll, setShowAll] = useState({})     // lineId -> true: pick from the whole price list / labour rates
  const set = (patch) => setT(x => ({ ...x, ...patch }))
  const setLine = (id, patch) => setT(x => ({ ...x, lines: x.lines.map(l => l.id === id ? { ...l, ...patch } : l) }))
  const move = (i, d) => setT(x => { const ls = [...x.lines]; const j = i + d; if (j < 0 || j >= ls.length) return x; [ls[i], ls[j]] = [ls[j], ls[i]]; return { ...x, lines: ls } })
  const nextId = () => `L${Math.max(0, ...t.lines.map(l => parseInt(String(l.id).replace(/\D/g, ''), 10) || 0)) + 1}`
  // COPY A LINE (1120): an exact copy - everything but its id - directly underneath.
  const copyLine = (id) => setT(x => {
    const k = x.lines.findIndex(l => l.id === id)
    if (k < 0) return x
    const top = Math.max(0, ...x.lines.map(l => parseInt(String(l.id).replace(/\D/g, ''), 10) || 0))
    const copy = { ...JSON.parse(JSON.stringify(x.lines[k])), id: `L${top + 1}` }
    return { ...x, lines: [...x.lines.slice(0, k + 1), copy, ...x.lines.slice(k + 1)] }
  })
  const addLine = (type) => setT(x => ({ ...x, lines: [...x.lines, { id: nextId(), type, label: '', offers: [], default: '', amount: null, qty: type === 'comment' ? '' : '1', waste: null, increase: null, cost: type === 'labour' ? 'Labour' : type === 'lump sum' ? 'Delivery' : type === 'comment' ? '' : 'Materials', comment: '' }] }))
  const sizeNames = (t.sizes || []).map(z => z.name)
  const r = rateFor(t, lib, rateOpts || {})
  const lineCost = Object.fromEntries(r.lines.map(x => [x.id, x]))
  const label = (ref, kind) => { const x = kind === 'labour' ? lib.labour[ref] : lib.product[ref]; return x ? `${x.description}${kind === 'labour' ? ` (${money(x.rate, { dp: 2 })}/${x.unit})` : ''}` : `${ref} (not in the ${kind === 'labour' ? 'labour rates' : 'price list'})` }
  // What the item search looks through: description, supplier code, supplier, Ref.
  const findText = (ref, kind) => { const x = kind === 'labour' ? lib.labour[ref] : lib.product[ref]; return x ? `${x.description} ${x.code || ''} ${x.supplier || ''} ${ref}`.toLowerCase() : String(ref).toLowerCase() }


  return (
    <>
      <Block title="Sizes" hint="For this build-up - a line's Apply size multiplies its quantity by one of them. Width, Height, Girth and Length in metres (600mm = 0.6), Area in m², Volume in m³. Length suits single items - e.g. 4 lineal metres around a rooflight.">
        {/* Side by side (1135) - six sizes in one row, wrapping on a narrow screen. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {SIZE_NAMES.map(nm => {
          const z = (t.sizes || []).find(x => String(x.name).toLowerCase() === nm.toLowerCase())
          const setSize = (patch) => setT(x => {
            const list = [...(x.sizes || [])]; const k = list.findIndex(y => String(y.name).toLowerCase() === nm.toLowerCase())
            if (k >= 0) list[k] = { ...list[k], ...patch }; else list.push({ name: nm, value: null, comment: '', ...patch })
            return { ...x, sizes: list }
          })
          const setVal = (v) => setSize({ value: v === '' ? null : parseFloat(v) })
          // MANDATORY (1113): a number must be entered on every quote using this build-up.
          const needed = !!(z && z.required) && (z.value == null || z.value === '')
          const users = t.lines.filter(l => sizesUsed(l.applySize).includes(nm)).map(l => l.label)
          return (
            <div key={nm} style={{ border: '1px solid #ecebe6', borderRadius: 8, padding: '7px 9px', minWidth: 132, flex: '0 0 auto' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>{nm}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <NumBox value={z?.value ?? null} onChange={v => setVal(v == null ? '' : String(v))} placeholder={needed ? 'required' : ''} style={{ ...inp, width: 86, padding: '6px 8px', background: needed ? RED : undefined, borderColor: needed ? '#ef4444' : undefined }} title={needed ? `${nm} is mandatory - enter a number` : ''} />
                <span style={{ fontSize: 12.5, color: '#666' }}>{SIZE_UNIT[nm]}</span>
              </div>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11.5, color: z?.required ? '#b91c1c' : '#666', cursor: 'pointer', marginTop: 4 }} title="A number must be entered on every quote using this build-up - the quote cannot be issued until it is">
                <input type="checkbox" checked={!!z?.required} onChange={e => setSize({ required: e.target.checked || undefined })} /> Mandatory
              </label>
              <div style={{ fontSize: 10.5, color: users.length ? '#0f766e' : '#aaa', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={users.length ? `used by ${users.join(', ')}` : ''}>{users.length ? `used by ${users.join(', ')}` : 'not used yet'}</div>
            </div>
          )
        })}
        </div>
        {(t.sizes || []).filter(z => !SIZE_NAMES.some(n => n.toLowerCase() === String(z.name).toLowerCase())).map((z, i) => (
          <div key={`o${i}`} style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <span style={{ width: 70, fontSize: 12.5, color: '#666' }}>{z.name}</span>
            <NumBox value={z.value ?? null} onChange={v => setT(x => ({ ...x, sizes: x.sizes.map(s2 => s2 === z ? { ...s2, value: v } : s2) }))} style={{ ...inp, width: 110 }} />
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
                    <td style={td}><select value={LINE_TYPES.includes(l.type) ? l.type : 'material'} onChange={e => setLine(l.id, { type: e.target.value })} style={{ ...cellInp, width: 116 }}>{LINE_TYPES.map(x => <option key={x} value={x}>{LINE_TYPE_LABEL[x]}</option>)}</select></td>
                    <td style={td}><AutoText value={l.label} onChange={v => setLine(l.id, { label: v })} style={{ ...cellInp, width: 118 }} /></td>
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
                      {/* LUMP SUM / LUMP SPREAD (1117): the Item is its DESCRIPTION, like the
                          other lines; the amount is in the Rate column. */}
                      {(l.type === 'lump' || l.type === 'lump sum') && <>
                        <input value={l.ownName || ''} onChange={e => setLine(l.id, { ownName: e.target.value })} placeholder={l.type === 'lump' ? 'description - e.g. Scaffold hire' : 'description - e.g. Delivery to site'} style={{ ...cellInp, width: '100%', background: isVariable(l, 'item') ? RED : undefined }} />
                        <div style={{ fontSize: 10.5, color: '#888', display: 'flex', gap: 4, marginTop: 2, alignItems: 'center' }}><VarFlag l={l} cell="item" setLine={setLine} />{l.type === 'lump' ? 'lump sum - amount x the line qty, not divided by the item qty' : 'lump spread - an amount per rate build-up, spread over the item qty'}</div>
                      </>}
                      {l.type === 'comment' && <input value={l.comment} onChange={e => setLine(l.id, { comment: e.target.value })} style={{ ...cellInp, width: '100%' }} />}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>{(isProd || l.type === 'lump') && <SizePicker value={l.applySize} t={t}
                      onChange={(list) => setLine(l.id, { applySize: !list.length ? undefined : list.length === 1 ? list[0] : list, ...(list.length && (!String(l.qty ?? '').trim() || Number(l.qty) === 0) ? { qty: '1' } : {}) })} />}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{l.type !== 'comment' && l.type !== 'lump sum' && <VarFlag l={l} cell="qty" setLine={setLine} />}{l.type !== 'comment' && <input value={l.qty || ''} onChange={e => setLine(l.id, { qty: e.target.value })} placeholder="per rate" style={{ ...cellInp, background: isVariable(l, 'qty') ? RED : undefined, width: 58, borderColor: qp ? '#dc2626' : undefined }} title={qp || (l.qty && sizeNames.length ? `= ${evalQty(l.qty, Object.fromEntries((t.sizes || []).map(z => [z.name, z.value])))}` : '')} />}
                      {/* What the line uses (1126): qty x the size it applies - and a warning when qty is 0 */}
                      {l.applySize && l.type !== 'comment' && (() => {
                        // What the line uses (1126, 1136): qty x the size - or x the SUM of several
                        const names = l.applySize === true ? [(t.sizes || [])[0]?.name || 'size'] : applyList(l.applySize)
                        const q = evalQty(l.qty, Object.fromEntries((t.sizes || []).map(x => [x.name, x.value])))
                        const parts = names.map(nm => ({ nm, v: sizeOf(t, null, nm) }))
                        const sv = sizeOf(t, null, l.applySize)
                        if (q === 0) return <div style={{ fontSize: 10.5, color: '#b91c1c', fontWeight: 600, whiteSpace: 'normal', maxWidth: 120 }}>qty 0 - this line costs nothing</div>
                        const label = parts.length > 1 ? `(${parts.map(x => `${x.nm}${x.v != null ? ' ' + x.v : ''}`).join(' + ')})` : `${parts[0].nm}${parts[0].v != null ? ' ' + parts[0].v : ''}`
                        return <div style={{ fontSize: 10.5, color: '#0f766e', whiteSpace: 'normal', maxWidth: 170 }}>{sv == null ? `x ${label} (on the quote)` : `x ${label} = ${q == null ? '?' : +(q * sv).toFixed(4)}`}</div>
                      })()}</td>
                    <td style={td}>
                      {(l.type === 'lump' || l.type === 'lump sum') && <>
                        <NumBox dp={2} value={l.amount ?? null} onChange={v => setLine(l.id, { amount: v })} placeholder="amount" style={{ ...cellInp, width: 70, background: isVariable(l, 'rate') ? RED : undefined }} title={l.type === 'lump' ? 'The amount - x the line qty' : 'An amount per rate build-up - for each item using it on a quote, spread over that item qty'} />
                        <VarFlag l={l} cell="rate" setLine={setLine} />
                        {l.type === 'lump sum' && <div style={{ fontSize: 10, color: '#888', maxWidth: 92, lineHeight: 1.25 }}>per rate build-up</div>}
                      </>}
                      {isProd && <>
                        {/* With a product: its rate, which can be typed over (CHANGED / Revert).
                            With none: an OWN item - this is its rate (1097). */}
                        <NumBox dp={2} value={l.override ?? null} onChange={v => setLine(l.id, { override: v })}
                          placeholder={l.default ? (lc.libRate != null ? lc.libRate.toFixed(2) : '') : 'rate'}
                          style={{ ...cellInp, width: 70, borderColor: l.default && l.override != null ? '#f59e0b' : undefined, background: isVariable(l, 'rate') ? RED : undefined }} title={`${l.default ? 'The price-list rate - type over it to change it on this build-up' : 'Your own item: type its rate'}${(l.override ?? lc.libRate) != null ? ` - exact: ${+Number(l.override ?? lc.libRate).toFixed(6)}` : ''}`} />
                        <VarFlag l={l} cell="rate" setLine={setLine} />
                        {l.default && l.override != null && <div><span style={{ fontSize: 10, fontWeight: 700, color: '#b45309' }}>CHANGED</span> <button onClick={() => setLine(l.id, { override: null })} style={{ ...iconBtn, fontSize: 10.5, color: '#2563eb' }}>Revert to {l.type === 'labour' ? 'labour rate' : 'price list'}</button></div>}
                        {!l.default && <div style={{ fontSize: 10, color: '#888' }}>own item</div>}
                      </>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{l.type === 'material' && <><NumBox pct value={l.waste ?? null} onChange={v => setLine(l.id, { waste: v })} style={{ ...cellInp, width: 52, background: isVariable(l, 'waste') ? RED : undefined }} /><VarFlag l={l} cell="waste" setLine={setLine} /></>}</td>
                    <td style={td}>{l.type === 'material' && <NumBox pct value={l.increase ?? null} onChange={v => setLine(l.id, { increase: v })} style={{ ...cellInp, width: 52 }} />}</td>
                    <td style={{ ...tdR, fontWeight: 700, color: '#0f766e', whiteSpace: 'nowrap' }} title="Rate x Qty (x waste / increase)">{lc.cost != null ? `= ${money(lc.cost, { dp: 2 })}` : ''}</td>
                    <td style={td}>{l.type !== 'comment' && <select value={l.cost || ''} onChange={e => setLine(l.id, { cost: e.target.value })} style={{ ...cellInp, width: 92 }}><option value="">—</option>{COST_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><button onClick={() => copyLine(l.id)} style={{ ...iconBtn, marginRight: 2 }} title="Copy this line - an exact copy goes directly underneath">⧉</button><button onClick={() => setT(x => ({ ...x, lines: x.lines.filter(y => y.id !== l.id), rules: (x.rules || []).filter(rr => rr.line !== l.id) }))} style={iconBtn} title="Remove line">✕</button></td>
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

      <Block title="Description" hint="Blank to start. Insert products adds the products ticked under ⚙ (A, B and C); Insert variable adds a detail chosen from a list - e.g. Warranty or Girth - with its dropdown beside the products. Grey text is filled in for you.">
        {/* 1109: Insert products | Insert variable (a pop-out) | ⚙ Products - and each
            variable's DROPDOWN in the same row, to select its value. */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={() => descInsert.current && descInsert.current('products')} style={smallBtn} title="The ticked products, in grey - live until you edit them">Insert products</button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => setVarPop({ index: null })} style={smallBtn} title="A detail the description needs that is not a product - e.g. Warranty, Girth">Insert variable</button>
          <button onClick={() => setDescMenu(v => !v)} style={smallBtn} title="Which lines go into the description - any cost category">⚙ Products in the description ({t.lines.filter(l => l.type !== 'comment' && l.inDescription).length})</button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => { const ok = descFlag.current && descFlag.current.mark(); setFlagMsg(ok ? '' : 'Select the words to mark first') }} style={{ ...smallBtn, color: '#b91c1c', borderColor: '#fca5a5' }} title="Mark the selected words red - shows on the take-off, never on the quote">Mark for amending</button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => { const ok = descFlag.current && descFlag.current.clear(); setFlagMsg(ok ? '' : 'Click inside the red words first') }} style={smallBtn} title="Remove the red mark the cursor is in">Clear mark</button>
          {flagMsg && <span style={{ fontSize: 11.5, color: '#b45309' }}>{flagMsg}</span>}
          {(t.descVars || []).map((v, i) => {
            const opts = v.options || []
            const empty = !String(v.value ?? '').trim()
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #e8e7e3', borderRadius: 8, padding: '2px 4px 2px 8px', background: '#fafaf9' }}>
                <button onClick={() => setVarPop({ index: i })} title="Rename it or change its options" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#0f766e', fontWeight: 600, padding: 0, fontFamily: 'inherit' }}>{v.name}</button>
                {opts.length
                  ? <select value={opts.includes(v.value) ? v.value : ''} onChange={e => setT(x => ({ ...x, descVars: x.descVars.map((y, j) => j === i ? { ...y, value: e.target.value } : y) }))} style={{ ...cellInp, padding: '3px 4px', background: empty ? RED : undefined }} title={empty ? 'Choose a value' : ''}>
                      <option value="">— choose —</option>{opts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  : <input value={v.value ?? ''} onChange={e => setT(x => ({ ...x, descVars: x.descVars.map((y, j) => j === i ? { ...y, value: e.target.value } : y) }))} placeholder="value" style={{ ...cellInp, width: 110, background: empty ? RED : undefined }} />}
                <button onClick={() => setT(x => ({ ...x, descVars: x.descVars.filter((_, j) => j !== i), descText: String(x.descText || '').split(`{${v.name}}`).join('') }))} style={{ ...iconBtn, fontSize: 11 }} title="Remove this variable">✕</button>
              </span>
            )
          })}
          {varPop && <VariablePopout v={varPop.index != null ? t.descVars[varPop.index] : null} names={(t.descVars || []).map(v => v.name)} onClose={() => setVarPop(null)}
            library={varPop.index == null ? [...(t.descVars || []).map(v => ({ name: v.name, options: v.options || [] })), ...(varLibrary || [])].filter((v, i, a) => a.findIndex(y => y.name.toLowerCase() === v.name.toLowerCase()) === i) : []}
            onSave={({ name, options }) => {
              if (varPop.index == null) {
                setT(x => (x.descVars || []).some(v => v.name.toLowerCase() === name.toLowerCase())
                  ? x                                                    // already on this build-up: keep its value (1121)
                  : { ...x, descVars: [...(x.descVars || []), { name, options, value: options.length === 1 ? options[0] : '' }] })
                setTimeout(() => descInsert.current && descInsert.current(name), 0)
              } else {
                const old = t.descVars[varPop.index].name
                setT(x => ({ ...x, descText: old === name ? x.descText : String(x.descText || '').split(`{${old}}`).join(`{${name}}`),
                  descVars: x.descVars.map((y, j) => j === varPop.index ? { ...y, name, options, value: options.length && !options.includes(y.value) ? '' : y.value } : y) }))
              }
              setVarPop(null)
            }} />}
        </div>
        {descMenu && (
          <div style={{ border: '1px solid #e8e7e3', borderRadius: 8, padding: 8, marginBottom: 6, maxWidth: 520 }}>
            {/* ANY line - every cost category - can go in (1118); comments cannot. */}
            {t.lines.filter(l => l.type !== 'comment').map(l => (
              <label key={l.id} style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '2px 0', cursor: 'pointer', alignItems: 'baseline' }}>
                <input type="checkbox" checked={!!l.inDescription} onChange={e => setLine(l.id, { inDescription: e.target.checked })} />
                <span>{l.label}<span style={{ color: '#888' }}> - {lineWording(l, lib) && lineWording(l, lib) !== l.label ? lineWording(l, lib) : (l.type === 'material' || l.type === 'labour' ? 'own item' : 'no description yet')}</span>
                  <span style={{ marginLeft: 6, fontSize: 10.5, color: '#666', background: '#f4f4f2', borderRadius: 8, padding: '0 6px' }}>{l.cost || LINE_TYPE_LABEL[l.type] || l.type}</span></span>
              </label>
            ))}
            {!t.lines.some(l => l.type !== 'comment') && <div style={{ fontSize: 12, color: '#aaa' }}>No lines yet.</div>}
          </div>
        )}
        <DescriptionEditor value={t.descText || ''} onChange={(v) => setT(x => ({ ...x, descText: v }))} liveProducts={productList(t, lib)} liveProductItems={productItems(t, lib)} vars={t.descVars || []} insertRef={descInsert} flagRef={descFlag}
          placeholder="e.g. Single ply membrane roof system comprising: (Insert products)." />
      </Block>

      <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: 12, marginTop: 12 }}>
        {children}
        {summary ? <RateSummary t={t} lib={lib} money={money} rateOpts={rateOpts} unit={t.unit ? UNIT_LABEL[t.unit] : ''} /> :
        <div style={{ display: 'flex', gap: 18, marginTop: children ? 10 : 0, fontSize: 13, flexWrap: 'wrap' }}>
          <span>Materials {money(r.materials + r.fixed + r.lump, { dp: 2 })}</span><span>Labour {money(r.labour, { dp: 2 })}</span>
          <span>Profit {money(r.profit, { dp: 2 })}</span><span>MCD {money(r.mcd, { dp: 2 })}</span>
          <strong style={{ fontSize: 15, color: '#0f766e' }}>{rateTitle} {money(r.rate, { dp: 2 })}{t.unit ? ` per ${UNIT_LABEL[t.unit]}` : ''}</strong>
        </div>}
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
  // Tick several from the search, then add them together (1107). Ticks are
  // kept while the search changes; added in the order ticked.
  const [picked, setPicked] = useState([])
  const toggle = (ref) => setPicked(p => p.includes(ref) ? p.filter(x => x !== ref) : [...p, ref])
  const kind = ln.type
  const offers = ln.offers || []
  const all = kind === 'labour' ? lib.labourItems.map(x => x.ref) : lib.products.map(x => x.ref)
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = words.length ? all.filter(ref => !offers.includes(ref) && words.every(w => findText(ref, kind).includes(w))) : []
  const found = matches.slice(0, 40)      // shown; more than 40 -> say so (1107)
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <button onClick={() => { onChange([...offers, ...picked.filter(r => !offers.includes(r))]); setPicked([]) }} disabled={!picked.length}
              style={{ fontSize: 12.5, padding: '5px 12px', border: 'none', borderRadius: 7, background: '#0f766e', color: '#fff', fontWeight: 600, cursor: picked.length ? 'pointer' : 'default', opacity: picked.length ? 1 : 0.45 }}>Add {picked.length || ''} selected</button>
            {found.length > 0 && <button onClick={() => setPicked(p => [...p, ...found.filter(r => !p.includes(r))])} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #d4d4d0', borderRadius: 7, background: '#fff', cursor: 'pointer' }}>Tick all shown ({found.length})</button>}
            {picked.length > 0 && <button onClick={() => setPicked([])} style={{ fontSize: 12, border: 'none', background: 'none', color: '#888', cursor: 'pointer' }}>Clear ticks</button>}
            {picked.length > 0 && <span style={{ fontSize: 11.5, color: '#888' }}>ticks are kept while you search again</span>}
            {matches.length > found.length && <span style={{ fontSize: 11.5, color: '#b45309' }}>{found.length} of {matches.length} shown - narrow the search to see the rest</span>}
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Add from the whole ${kind === 'labour' ? 'labour rates' : 'price list'} - search…`} style={{ ...cellInp, width: '100%' }} />
          <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 4 }}>
            {found.map(ref => (
              <label key={ref} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '4px 6px', cursor: 'pointer', borderBottom: '1px solid #f8f7f5', background: picked.includes(ref) ? '#f0fdfa' : undefined }}>
                <input type="checkbox" checked={picked.includes(ref)} onChange={() => toggle(ref)} />
                <span>{label(ref, kind)} <span style={{ color: '#aaa', fontSize: 11 }}>{ref}</span></span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// THE DESCRIPTION EDITOR (1106). Shows the description as it will READ: the
// ticked products and the variables' values in LIGHT GREY - live, they follow
// the build-up - among your own words. Everything is editable: editing inside
// grey text makes it your own wording (black, no longer live). Stored as text
// with {products} / {Name} where the grey text is untouched - unchanged format.
function DescriptionEditor({ value, onChange, liveProducts, liveProductItems = [], vars, insertRef, flagRef, placeholder }) {
  const el = useRef(null), saved = useRef(null), focused = useRef(false)
  const [tick, setTick] = useState(0)
  const GREY = '#9a9a96'
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const varVal = (name) => { const v = (vars || []).find(x => String(x.name).toLowerCase() === String(name).toLowerCase()); return v ? (String(v.value ?? '').trim() || `[${v.name}]`) : null }
  const shown = (tok) => tok === 'products' ? (liveProducts || '[no products ticked yet]') : varVal(tok)
  // Inside the products: each item in turn - one reading as only its LABEL in RED,
  // the rest light grey (1122). Same words, so it still matches the live list.
  const productsInner = () => {
    const items = liveProductItems || []
    if (!items.length) return esc(shown('products'))
    return items.map((x, n) => (n ? (n === items.length - 1 ? ' and ' : ', ') : '') + (x.missing ? `<span style="color:#b91c1c">${esc(x.text)}</span>` : esc(x.text))).join('')
  }
  const innerOf = (tok) => tok === 'products' ? productsInner() : esc(shown(tok) ?? `[${tok}]`)
  // A variable with no value chosen is RED; chosen (and the products) light grey (1121).
  const colourOf = (tok) => { if (tok === 'products') return GREY; const v = (vars || []).find(x => String(x.name).toLowerCase() === String(tok).toLowerCase()); return v && !String(v.value ?? '').trim() ? '#b91c1c' : GREY }
  const RED_STYLE = 'color:#b91c1c;background:#fee2e2;border-radius:3px'
  // [! ... !] = marked for amending (1110): drawn red, its contents as usual.
  const toHtml = (text) => String(text || '').split(/(\[![\s\S]*?!\])/).map(chunk => {
    const f = chunk.match(/^\[!([\s\S]*?)!\]$/)
    return f ? `<span data-flag="1" style="${RED_STYLE}">${tokensHtml(f[1])}</span>` : tokensHtml(chunk)
  }).join('')
  const tokensHtml = (text) => String(text || '').split(/(\{[^{}]{1,60}\})/).map(part => {
    const m = part.match(/^\{([^{}]{1,60})\}$/)
    if (m) { const raw = m[1].trim(); const tok = raw.toLowerCase() === 'products' ? 'products' : raw; const sh = shown(tok); if (sh != null) return `<span data-token="${esc(tok)}" style="color:${colourOf(tok)}">${innerOf(tok)}</span>` }
    return esc(part).replace(/\n/g, '<br>')
  }).join('')
  function serialize() {
    const out = []
    const walk = (node) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) out.push(n.nodeValue)
        else if (n.nodeName === 'BR') out.push('\n')
        else if (n.dataset && n.dataset.token) { const tok = n.dataset.token; out.push(n.textContent === shown(tok) ? (tok === 'products' ? '{products}' : `{${tok}}`) : n.textContent) }
        else if (n.dataset && n.dataset.flag) { if (n.textContent) { out.push('[!'); walk(n); out.push('!]') } }
        else { if ((n.nodeName === 'DIV' || n.nodeName === 'P') && out.length && !String(out[out.length - 1]).endsWith('\n')) out.push('\n'); walk(n) }
      }
    }
    walk(el.current)
    return out.join('').replace(/\u00a0/g, ' ')
  }
  // Typing at the START or END of grey text adds your own words beside it -
  // the grey stays live. Changing anything INSIDE it makes it your own
  // wording (black, no longer live). The cursor stays where you are typing.
  function settleEdited() {
    for (const sp of [...el.current.querySelectorAll('span[data-token]')]) {
      const live = shown(sp.dataset.token), txt = sp.textContent
      if (txt === live) continue
      let node = null
      if (live && txt.startsWith(live)) { node = document.createTextNode(txt.slice(live.length)); sp.innerHTML = innerOf(sp.dataset.token); sp.after(node) }
      else if (live && txt.endsWith(live)) { node = document.createTextNode(txt.slice(0, txt.length - live.length)); sp.innerHTML = innerOf(sp.dataset.token); sp.before(node) }
      else { sp.style.color = ''; delete sp.dataset.token; for (const inner of sp.querySelectorAll('span')) inner.style.color = ''; continue }
      const r = document.createRange(); r.setStart(node, node.nodeValue.length); r.collapse(true)
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r)
    }
  }
  // Redraw from the stored text whenever it - or the live products / values - change,
  // except while typing (the caret stays put).
  useEffect(() => {
    if (!el.current || focused.current) return
    const html = toHtml(value)
    // Redrawn: a remembered cursor would now point at the START of the box -
    // forget it, so an insert without a fresh cursor goes at the END (1109).
    if (el.current.innerHTML !== html) { el.current.innerHTML = html; saved.current = null }
  }, [value, liveProducts, JSON.stringify(liveProductItems), JSON.stringify(vars), tick])
  useEffect(() => {
    const keep = () => { const sel = window.getSelection(); if (sel && sel.rangeCount && el.current && el.current.contains(sel.getRangeAt(0).startContainer)) saved.current = sel.getRangeAt(0).cloneRange() }
    document.addEventListener('selectionchange', keep)
    return () => document.removeEventListener('selectionchange', keep)
  }, [])
  // MARK FOR AMENDING / CLEAR MARK (1110) - the selected words, or the red part the cursor is in.
  if (flagRef) flagRef.current = {
    mark() {
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount || sel.isCollapsed || !el.current.contains(sel.getRangeAt(0).commonAncestorContainer)) return false
      const r = sel.getRangeAt(0)
      const sp = document.createElement('span'); sp.dataset.flag = '1'; sp.setAttribute('style', RED_STYLE)
      sp.appendChild(r.extractContents()); r.insertNode(sp)
      for (const inner of [...sp.querySelectorAll('span[data-flag]')]) inner.replaceWith(...inner.childNodes)   // no red inside red
      sel.removeAllRanges(); onChange(serialize()); return true
    },
    clear() {
      const sel = window.getSelection()
      let n = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null
      while (n && n !== el.current && !(n.dataset && n.dataset.flag)) n = n.parentNode
      if (!n || n === el.current) return false
      n.replaceWith(...n.childNodes); onChange(serialize()); return true
    },
  }
  // Insert grey (live) text where the cursor was - else at the end.
  insertRef.current = (tok) => {
    if (!el.current) return
    const sp = document.createElement('span')
    sp.dataset.token = tok; sp.style.color = colourOf(tok); sp.innerHTML = innerOf(tok)
    let r = saved.current && el.current.contains(saved.current.startContainer) ? saved.current : null
    if (!r) { r = document.createRange(); r.selectNodeContents(el.current); r.collapse(false) }
    r.deleteContents()
    // The text just before the insert point - a text position, or the end of the box (1109).
    const pre = document.createRange(); pre.selectNodeContents(el.current); pre.setEnd(r.startContainer, r.startOffset)
    const before = pre.toString()
    if (before && !/\s$/.test(before)) r.insertNode(document.createTextNode(' '))
    r.collapse(false); r.insertNode(sp); r.setStartAfter(sp); r.collapse(true); saved.current = r
    onChange(serialize())
  }
  return (
    <div style={{ position: 'relative' }}>
      <div ref={el} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true"
        onFocus={() => { focused.current = true }}
        onBlur={() => { focused.current = false; setTick(t => t + 1) }}
        onInput={() => { settleEdited(); onChange(serialize()) }}
        onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')) }}
        style={{ minHeight: 150, padding: '29px 12px 12px', border: '1px solid #d4d4d0', borderRadius: 8, fontSize: 13.5, lineHeight: 1.55, background: '#fff', outline: 'none', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }} />
      {!value && <div style={{ position: 'absolute', left: 13, top: 30, fontSize: 13.5, color: '#bbb', pointerEvents: 'none' }}>{placeholder}</div>}
      <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Grey = filled in for you and kept up to date; edit it and it becomes your own wording.</div>
    </div>
  )
}

// THE NUMBER BOX (1108). While you type it keeps EXACTLY what you typed - "0.",
// ".25", "2.5" - and saves the number as soon as it is a number; leaving the
// box tidies the display. (Before, each keystroke was turned into a number,
// so a decimal point vanished and no value under 1 could be typed.)
//   value: a number or null;  pct: shown x100 (0.025 -> 2.5);  dp: decimals shown
export function NumBox({ value, onChange, pct: isPct, dp, emptyAs = null, ...rest }) {
  const [text, setText] = useState(null)       // null = not typing in it
  const shown = value == null ? '' : isPct ? String(+(value * 100).toFixed(4)) : dp != null ? Number(value).toFixed(dp) : String(value)
  return <input {...rest} inputMode="decimal" value={text != null ? text : shown}
    onFocus={() => setText(value == null ? '' : isPct ? String(+(value * 100).toFixed(6)) : String(value))}
    onChange={e => {
      const t = e.target.value; setText(t)
      const c = t.replace(/[£,%\s]/g, '')
      if (c === '') return onChange(emptyAs)
      if (/^-?\d*\.?\d*$/.test(c) && Number.isFinite(parseFloat(c))) onChange(isPct ? parseFloat(c) / 100 : parseFloat(c))
    }}
    onBlur={e => { setText(null); rest.onBlur && rest.onBlur(e) }} />
}

// THE VARIABLE POP-OUT (1109): name a variable (Warranty, Girth...) and list
// the options to choose from, one per line. With no options it is a free-text
// value. Opens beside the description's buttons.
function VariablePopout({ v, names, onClose, onSave, library = [] }) {
  // CHOOSE AN EXISTING VARIABLE (1121) - any used in this or another build-up -
  // or make a new one.
  const [mode, setMode] = useState(!v && library.length ? 'choose' : 'new')
  const [find, setFind] = useState('')
  const [name, setName] = useState(v ? v.name : '')
  const [opts, setOpts] = useState(v ? (v.options || []).join('\n') : '')
  const clean = name.trim().replace(/[{}]/g, '')
  const taken = clean && names.some(n => n.toLowerCase() === clean.toLowerCase() && (!v || n !== v.name))
  const options = [...new Set(opts.split('\n').map(o => o.trim()).filter(Boolean))]
  return (
    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50, width: 340, background: '#fff', border: '1px solid #d4d4d0', borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.14)', padding: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>{v ? 'Edit variable' : 'Insert a variable'}</div>
      {!v && library.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {[['choose', 'Choose existing'], ['new', 'New variable']].map(([k, lab]) => <button key={k} onClick={() => setMode(k)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: `1px solid ${mode === k ? '#0f766e' : '#d4d4d0'}`, background: mode === k ? '#f0fdfa' : '#fff', color: mode === k ? '#0f766e' : '#555', cursor: 'pointer', fontWeight: mode === k ? 600 : 400 }}>{lab}</button>)}
        </div>
      )}
      {mode === 'choose' && !v ? (
        <div>
          <input autoFocus value={find} onChange={e => setFind(e.target.value)} placeholder="Find a variable…" style={{ ...cellInp, width: '100%', marginBottom: 6 }} />
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #f0efec', borderRadius: 6 }}>
            {library.filter(x => x.name.toLowerCase().includes(find.trim().toLowerCase())).map(x => (
              <button key={x.name} onMouseDown={e => e.preventDefault()} onClick={() => onSave({ name: x.name, options: x.options || [] })}
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid #f4f3f0', background: '#fff', padding: '7px 9px', cursor: 'pointer', fontFamily: 'inherit' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f766e' }}>{x.name}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{(x.options || []).length ? `${x.options.length} option${x.options.length === 1 ? '' : 's'}: ${x.options.slice(0, 4).join(', ')}${x.options.length > 4 ? '…' : ''}` : 'typed value'}</div>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}><button onClick={onClose} style={{ fontSize: 12.5, padding: '5px 12px', border: '1px solid #d4d4d0', borderRadius: 7, background: '#fff', cursor: 'pointer' }}>Cancel</button></div>
        </div>
      ) : <>
      <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 8 }}>Name
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Warranty, Girth" style={{ ...cellInp, width: '100%', marginTop: 3 }} />
      </label>
      <label style={{ display: 'block', fontSize: 12, color: '#666' }}>Options to choose from - one per line
        <textarea value={opts} onChange={e => setOpts(e.target.value)} rows={5} placeholder={'e.g.\n10 year\n15 year\n20 year'} style={{ ...cellInp, width: '100%', marginTop: 3, fontFamily: 'inherit', resize: 'vertical' }} />
      </label>
      <div style={{ fontSize: 11, color: '#999', margin: '4px 0 8px' }}>{options.length ? `${options.length} option${options.length === 1 ? '' : 's'} - a dropdown beside the products` : 'No options - a box to type the value'}</div>
      {taken && <div style={{ fontSize: 12, color: '#b42318', marginBottom: 6 }}>There is already a variable called {clean}.</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button onClick={onClose} style={{ fontSize: 12.5, padding: '5px 12px', border: '1px solid #d4d4d0', borderRadius: 7, background: '#fff', cursor: 'pointer' }}>Cancel</button>
        <button onMouseDown={e => e.preventDefault()} onClick={() => clean && !taken && onSave({ name: clean, options })} disabled={!clean || taken}
          style={{ fontSize: 12.5, padding: '5px 12px', border: 'none', borderRadius: 7, background: '#0f766e', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: !clean || taken ? 0.5 : 1 }}>{v ? 'Save' : 'Insert'}</button>
      </div>
      </>}
    </div>
  )
}

// A TEXT BOX THAT WRAPS (1117): grows a line taller instead of hiding text
// (the line labels). Enter does not add a line break - it is still one label.
function AutoText({ value, onChange, style, ...rest }) {
  const ref = useRef(null)
  useEffect(() => { const e = ref.current; if (e) { e.style.height = 'auto'; e.style.height = `${e.scrollHeight + 2}px` } }, [value])
  return <textarea ref={ref} rows={1} value={value || ''} onChange={e => onChange(e.target.value.replace(/\n/g, ' '))}
    onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
    style={{ ...style, resize: 'none', overflow: 'hidden', lineHeight: 1.3, display: 'block', fontFamily: 'inherit', boxSizing: 'border-box' }} {...rest} />
}

// THE RATE SUMMARY PANEL (1123) - on the Build-ups page, in place of "Try the
// rate": per unit, by supplier, by cost category, cost, profit, rate.
function RateSummary({ t, lib, money, rateOpts, unit }) {
  const s = rateSummary(t, lib, rateOpts || {})
  const m = (v) => money(v, { dp: 2 })
  const per = unit ? ` per ${unit}` : ''
  const col = { flex: '1 1 220px', minWidth: 200 }
  const head = { fontSize: 11.5, fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }
  const row = { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '2px 0' }
  const List = ({ items, empty }) => items.length ? items.map(x => <div key={x.name} style={row}><span>{x.name}</span><span>{m(x.amount)}</span></div>) : <div style={{ fontSize: 12.5, color: '#999' }}>{empty}</div>
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={col}><div style={head}>By supplier{per}</div><List items={s.bySupplier} empty="No priced materials yet" /></div>
      <div style={col}><div style={head}>By cost category{per}</div><List items={s.byCategory} empty="Nothing priced yet" /></div>
      <div style={col}>
        <div style={head}>Rate{per}</div>
        <div style={row}><span>Cost</span><span>{m(s.subtotal)}</span></div>
        <div style={row}><span>Profit{s.profitPct ? ` (${+(s.profitPct * 100).toFixed(2)}% - this build-up's)` : ' (set on the quote)'}</span><span>{m(s.profit)}</span></div>
        <div style={{ ...row, borderTop: '1px solid #99f6e4', marginTop: 4, paddingTop: 6, fontWeight: 700, fontSize: 15, color: '#0f766e' }}><span>Rate</span><span>{m(s.rate)}{per}</span></div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>The quote adds its MCD{s.profitPct ? '' : ' and profit %'}.</div>
      </div>
    </div>
  )
}

// APPLY SIZE - several at once (1136): tick the sizes; they are ADDED TOGETHER
// and the line's quantity is multiplied by the sum.
function SizePicker({ value, t, onChange }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close)
  }, [])
  const chosen = value === true ? [(t.sizes || [])[0]?.name].filter(Boolean) : applyList(value)
  const others = (t.sizes || []).map(z => z.name).filter(n => n && !SIZE_NAMES.some(x => x.toLowerCase() === String(n).toLowerCase()))
  const all = [...SIZE_NAMES, ...others]
  const has = (n) => chosen.some(c => c.toLowerCase() === n.toLowerCase())
  const toggle = (n) => onChange(has(n) ? chosen.filter(c => c.toLowerCase() !== n.toLowerCase()) : all.filter(x => has(x) || x === n))
  const text = chosen.length ? chosen.join(' + ') : '—'
  return (
    <div ref={box} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOpen(o => !o)} title={chosen.length > 1 ? `${text} - added together, then x the qty` : 'Multiply this line by a size - tick several to add them together'}
        style={{ ...cellInp, width: 84, textAlign: 'left', background: '#fff', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: chosen.length ? '#1a1a19' : '#999' }}>{text} <span style={{ float: 'right', color: '#888', fontSize: 10 }}>▾</span></button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 40, top: '100%', left: 0, marginTop: 3, background: '#fff', border: '1px solid #d4d4d0', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', padding: 8, minWidth: 170, textAlign: 'left' }}>
          {all.map(n => {
            const v = sizeOf(t, null, n)
            return <label key={n} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5, padding: '3px 2px', cursor: 'pointer' }}>
              <input type="checkbox" checked={has(n)} onChange={() => toggle(n)} /> {n} <span style={{ color: '#aaa', fontSize: 11 }}>{v != null ? `${v} ${SIZE_UNIT[n] || ''}` : ''}</span></label>
          })}
          <div style={{ fontSize: 10.5, color: '#888', marginTop: 4, borderTop: '1px solid #f0efec', paddingTop: 4 }}>Ticked sizes are added together, then x the qty.</div>
        </div>
      )}
    </div>
  )
}
