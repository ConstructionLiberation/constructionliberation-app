import { useMemo, useState } from 'react'
import { materialList } from '../lib/materials'
import { UNIT_LABEL } from '../lib/priceList'
import { BU_UNIT_LABEL } from '../lib/buildups'

// THE ESTIMATE'S MATERIALS TAB (1095): what to order, worked out live from the
// take-off - by supplier, in packs, at the supplier's pack price. Order waste
// can differ from the estimate's (e.g. 10% priced, 5% ordered): blank uses the
// estimate's. Rules: lib/materials.js.
// The shared unit names (1103): products' base units and items' units.
const UNIT = { ...BU_UNIT_LABEL, ...UNIT_LABEL }
const n = (v, dp = 2) => v == null ? '' : (+v.toFixed(dp)).toLocaleString('en-GB')
const pct = (v) => v == null ? '' : +(v * 100).toFixed(2)

export default function MaterialsTab({ est, lib, change, money, readOnly }) {
  const m = useMemo(() => materialList(est, lib), [est, lib])
  const setOW = (ref, text) => change(e => {
    const ow = { ...(e.orderWaste || {}) }
    const v = parseFloat(text)
    if (text === '' || Number.isNaN(v)) delete ow[ref]; else ow[ref] = v / 100
    return { ...e, orderWaste: ow }
  })
  // ALLOCATE (1153) - a line not from the price list, to a supplier or a category
  const priceListSuppliers = useMemo(() => [...new Set(Object.values((lib && lib.product) || {}).map(p => p.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [lib])
  const categories = [...new Set([...(est.allocationGroups || []), ...Object.values(est.allocations || {})].filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const setAlloc = (key, name) => change(e => {
    const al = { ...(e.allocations || {}) }
    if (name) al[key] = name; else delete al[key]
    const isSupplier = priceListSuppliers.includes(name) || m.suppliers.some(x => x.supplier === name)
    const groups = name && !isSupplier && !(e.allocationGroups || []).includes(name) ? [...(e.allocationGroups || []), name] : (e.allocationGroups || [])
    return { ...e, allocations: al, allocationGroups: groups }
  })
  const Alloc = ({ f }) => <AllocSelect value={f.allocation || ''} disabled={readOnly} onPick={(v) => setAlloc(f.key, v)}
    onEstimate={m.suppliers.map(x => x.supplier)} priceList={priceListSuppliers} categories={categories} />
  const OtherRows = ({ rows }) => (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead><tr>{['Line (not from the price list)', 'Item', 'Quantity', 'Rate', 'Cost', 'Allocate to'].map((h, i) => <th key={h} style={{ ...th, textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
      <tbody>{rows.map(f => (
        <tr key={f.key}>
          <td style={{ ...td, minWidth: 200 }}>{f.label}</td>
          <td style={{ ...td, color: '#666' }}>{f.item}</td>
          <td style={r_}>{n(f.quantity)} {UNIT[f.unit] || f.unit}</td>
          <td style={r_}>{money(f.amount, { dp: 2 })}</td>
          <td style={{ ...r_, fontWeight: 600 }}>{money(f.cost, { dp: 2 })}</td>
          <td style={td}><Alloc f={f} /></td>
        </tr>))}</tbody>
    </table>
  )
  const th = { textAlign: 'left', padding: '7px 9px', fontSize: 11.5, color: '#666', fontWeight: 600, borderBottom: '1px solid #ecebe6', background: '#faf9f7', whiteSpace: 'nowrap' }
  const td = { padding: '6px 9px', fontSize: 12.5, borderBottom: '1px solid #f4f3f0', verticalAlign: 'top' }
  const r_ = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }
  if (!m.suppliers.length && !m.fixed.length && !(m.groups || []).length) return <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 20, color: '#888', fontSize: 13.5 }}>Nothing to order yet - items need a quantity and products chosen in their build-ups.</div>
  return (
    <div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'baseline', marginBottom: 10, fontSize: 13 }}>
        <strong style={{ fontSize: 16 }}>Materials to order {money(m.total, { dp: 2 })}</strong>
        <span style={{ color: '#888' }}>{m.suppliers.length} supplier{m.suppliers.length === 1 ? '' : 's'} · packs rounded up · supplier prices incl. increases and this quote's adjustments</span>
      </div>
      {m.suppliers.map(s => (
        <div key={s.supplier} style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, marginBottom: 12, overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #ecebe6' }}>
            <strong>{s.supplier}</strong><strong>{money(s.cost + (s.other ? s.other.cost : 0), { dp: 2 })}{s.incomplete ? <span style={{ color: '#b45309', fontWeight: 400, fontSize: 12 }}> + {s.incomplete} without a price</span> : ''}</strong>
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>{['Product', 'Code', 'Needed', 'Estimate waste', 'Order waste %', 'To order', 'Packs', 'Pack price', 'Cost'].map((h, i) => <th key={h} style={{ ...th, textAlign: i >= 2 && i !== 4 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {s.rows.map(r => (
                <tr key={r.ref}>
                  <td style={{ ...td, minWidth: 240 }}>{r.description}<div style={{ fontSize: 11, color: '#999' }} title={r.uses.map(u => `${u.item} - ${u.line}: ${n(u.needed, 3)}`).join('\n')}>{r.ref} · used on {[...new Set(r.uses.map(u => u.item))].join(', ')}{r.coverage ? ` · covers ${r.coverage} m²/${UNIT[r.baseUnit]}` : ''}</div></td>
                  <td style={{ ...td, color: '#666' }}>{r.code}</td>
                  <td style={r_}>{n(r.needed)} {UNIT[r.baseUnit] || ''}</td>
                  <td style={r_}>{pct(r.estWaste)}%</td>
                  <td style={td}><input disabled={readOnly} value={r.orderWaste == null ? '' : pct(r.orderWaste)} onChange={e => setOW(r.ref, e.target.value)} placeholder={String(pct(r.estWaste))} style={{ width: 60, fontSize: 12.5, padding: '4px 6px', border: `1px solid ${r.orderWaste != null ? '#f59e0b' : '#d4d4d0'}`, borderRadius: 6 }} title="Blank = the estimate's waste" /></td>
                  <td style={r_}>{n(r.toOrder)} {UNIT[r.baseUnit] || ''}</td>
                  <td style={{ ...r_, fontWeight: 600 }}>{r.packs ?? '—'} <span style={{ fontWeight: 400, color: '#888', fontSize: 11 }}>× {r.sellingUnit || `${r.packQty} ${UNIT[r.baseUnit] || ''}`}</span></td>
                  <td style={r_}>{r.packPrice != null ? money(r.packPrice, { dp: 2 }) : <span style={{ color: '#b45309' }}>none</span>}</td>
                  <td style={{ ...r_, fontWeight: 600 }}>{r.cost != null ? money(r.cost, { dp: 2 }) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.other && <div style={{ borderTop: '2px solid #ecebe6' }}><div style={{ padding: '6px 12px', fontSize: 12, color: '#0f766e', fontWeight: 600 }}>Lines allocated to {s.supplier}</div><OtherRows rows={s.other.rows} /></div>}
        </div>
      ))}
      {(m.groups || []).map(g => (
        <div key={g.name} style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, marginBottom: 12, overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #ecebe6' }}>
            <strong>{g.name} <span style={{ fontWeight: 400, fontSize: 11.5, color: '#888' }}>category</span></strong><strong>{money(g.cost, { dp: 2 })}</strong>
          </div>
          <OtherRows rows={g.rows} />
        </div>
      ))}
      {m.fixed.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, marginBottom: 12, overflow: 'auto' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #fde68a', fontSize: 13 }}><strong>Not from the price list - not allocated</strong> <span style={{ color: '#92400e', fontSize: 12 }}>- choose a supplier or category for each; it moves to that card</span></div>
          <OtherRows rows={m.fixed} />
        </div>
      )}
      {m.missing.length > 0 && <div style={{ fontSize: 12.5, color: '#b45309' }}>Not in the list yet: {m.missing.slice(0, 10).join(' · ')}{m.missing.length > 10 ? ` … and ${m.missing.length - 10} more` : ''}</div>}
    </div>
  )
}

// The ALLOCATE TO box (1153): suppliers on this estimate, suppliers in the price
// list, categories already made - or "+ Add new…" to name one (Insulation,
// Mansafe, Sub-Contractor...).
function AllocSelect({ value, onPick, onEstimate, priceList, categories, disabled }) {
  const [adding, setAdding] = useState(null)
  if (adding != null) return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <input autoFocus value={adding} onChange={e => setAdding(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && adding.trim()) { onPick(adding.trim()); setAdding(null) } if (e.key === 'Escape') setAdding(null) }} placeholder="e.g. Insulation" style={{ width: 130, fontSize: 12, padding: '3px 6px', border: '1px solid #d4d4d0', borderRadius: 5 }} />
      <button onClick={() => { if (adding.trim()) { onPick(adding.trim()); setAdding(null) } }} style={{ fontSize: 11.5, padding: '2px 8px', border: '1px solid #0f766e', borderRadius: 5, background: '#0f766e', color: '#fff', cursor: 'pointer' }}>Add</button>
    </span>
  )
  const others = priceList.filter(x => !onEstimate.includes(x))
  return (
    <select value={value} disabled={disabled} onChange={e => { if (e.target.value === '__new') setAdding(''); else onPick(e.target.value) }}
      style={{ fontSize: 12, padding: '3px 6px', border: `1px solid ${value ? '#99f6e4' : '#fcd34d'}`, borderRadius: 5, maxWidth: 190, background: value ? '#f0fdfa' : '#fff' }}>
      <option value="">— not allocated —</option>
      {onEstimate.length > 0 && <optgroup label="Suppliers on this estimate">{onEstimate.map(x => <option key={x} value={x}>{x}</option>)}</optgroup>}
      {categories.length > 0 && <optgroup label="Categories">{categories.filter(c => !priceList.includes(c) && !onEstimate.includes(c)).map(x => <option key={x} value={x}>{x}</option>)}</optgroup>}
      {others.length > 0 && <optgroup label="Price-list suppliers">{others.map(x => <option key={x} value={x}>{x}</option>)}</optgroup>}
      <option value="__new">+ Add new…</option>
    </select>
  )
}
