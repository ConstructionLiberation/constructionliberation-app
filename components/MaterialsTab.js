import { useEffect, useMemo, useRef, useState } from 'react'
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
  const setAlloc = (key, name) => setAllocMany([key], name)
  // SEVERAL AT ONCE (1158) - every ticked line to the same supplier / category
  const [ticked, setTicked] = useState(() => new Set())
  const setAllocMany = (keys, name) => change(e => {
    const al = { ...(e.allocations || {}) }
    for (const key of keys) { if (name) al[key] = name; else delete al[key] }
    const isSupplier = priceListSuppliers.includes(name) || m.suppliers.some(x => x.supplier === name)
    const groups = name && !isSupplier && !(e.allocationGroups || []).includes(name) ? [...(e.allocationGroups || []), name] : (e.allocationGroups || [])
    return { ...e, allocations: al, allocationGroups: groups }
  })
  const Alloc = ({ f }) => <AllocSelect value={f.allocation || ''} disabled={readOnly} onPick={(v) => setAlloc(f.key, v)}
    onEstimate={m.suppliers.map(x => x.supplier)} priceList={priceListSuppliers} categories={categories} />
  // SORT (1159) - click a heading; again to reverse
  const [sort, setSort] = useState(null)   // { k, dir }
  const SORT_KEYS = [['label', 'Line (not from the price list)'], ['item', 'Item'], ['quantity', 'Quantity'], ['amount', 'Rate'], ['cost', 'Cost'], ['allocation', 'Allocate to']]
  const sorted = (rows) => !sort ? rows : [...rows].sort((a, b) => {
    const x = a[sort.k], y = b[sort.k]
    const c = typeof x === 'number' || typeof y === 'number' ? (Number(x) || 0) - (Number(y) || 0) : String(x || '').localeCompare(String(y || ''), undefined, { numeric: true, sensitivity: 'base' })
    return sort.dir === 'desc' ? -c : c
  })
  const OtherRows = ({ rows: rowsIn }) => {
    const rows = sorted(rowsIn)
    const all = rows.length > 0 && rows.every(f => ticked.has(f.key))
    const mine = rows.filter(f => ticked.has(f.key)).map(f => f.key)
    return (<>
    {/* THE TICKED LINES' BAR (1159) - at the top of this table, for its ticked lines */}
    {mine.length > 0 && !readOnly && (
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#0f766e', color: '#fff', padding: '7px 12px', fontSize: 13 }}>
        <strong>{mine.length} line{mine.length === 1 ? '' : 's'} ticked</strong>
        <span>Allocate to:</span>
        <AllocSelect value="" onPick={(v) => { setAllocMany(mine, v); setTicked(x => { const n = new Set(x); mine.forEach(k => n.delete(k)); return n }) }} onEstimate={m.suppliers.map(x => x.supplier)} priceList={priceListSuppliers} categories={categories} wide />
        <button onClick={() => setTicked(x => { const n = new Set(x); mine.forEach(k => n.delete(k)); return n })} style={{ marginLeft: 'auto', fontSize: 12.5, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.7)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>Untick</button>
      </div>
    )}
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead><tr>
        <th style={{ ...th, width: 22 }}><input type="checkbox" checked={all} disabled={readOnly} title="Tick all in this list" onChange={() => setTicked(x => { const n = new Set(x); for (const f of rows) { if (all) n.delete(f.key); else n.add(f.key) } return n })} /></th>
        {SORT_KEYS.map(([k, h], i) => <th key={k} onClick={() => setSort(sv => sv && sv.k === k ? (sv.dir === 'asc' ? { k, dir: 'desc' } : null) : { k, dir: 'asc' })} title="Sort by this column" style={{ ...th, textAlign: i >= 2 && i <= 4 ? 'right' : 'left', cursor: 'pointer', userSelect: 'none', color: sort && sort.k === k ? '#0f766e' : th.color }}>{h}{sort && sort.k === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>)}</tr></thead>
      <tbody>{rows.map(f => (
        <tr key={f.key} style={{ background: ticked.has(f.key) ? '#f0fdfa' : undefined }}>
          <td style={td}><input type="checkbox" checked={ticked.has(f.key)} disabled={readOnly} onChange={() => setTicked(x => { const n = new Set(x); if (n.has(f.key)) n.delete(f.key); else n.add(f.key); return n })} /></td>
          <td style={{ ...td, minWidth: 200 }}>{f.label}</td>
          <td style={{ ...td, color: '#666' }}>{f.item}</td>
          <td style={r_}>{n(f.quantity)} {UNIT[f.unit] || f.unit}</td>
          <td style={r_}>{RateBox({ k: `o:${f.key}`, current: f.amount, per: UNIT[f.unit] || f.unit })}</td>
          <td style={{ ...r_, fontWeight: 600 }}>{money(f.cost, { dp: 2 })}</td>
          <td style={td}><Alloc f={f} /></td>
        </tr>))}</tbody>
    </table>
    </>)
  }
  // EDIT RATES, THEN APPLY (1181) - pack prices (this estimate's own, over the price
  // list) and the not-from-the-price-list rates (the line's rate in its build-up).
  // Nothing changes until "Update Materials Rates for Quote".
  const [pend, setPend] = useState({})   // { 'p:<ref>' | 'o:<item:line>': '12.50' | 'list' }
  const num2 = (v) => Math.round(Number(v) * 100) / 100
  const changed = Object.entries(pend).filter(([k, v]) => {
    if (v === 'list') return true
    if (v === '' || !(Number(v) >= 0)) return false
    const cur = k.startsWith('p:') ? (m.suppliers.flatMap(x => x.rows).find(r => r.ref === k.slice(2)) || {}).packPrice : ((m.allFixed || []).find(f => f.key === k.slice(2)) || {}).amount
    return cur == null || num2(v) !== num2(cur)
  })
  const applyRates = () => {
    const edits = Object.fromEntries(changed)
    change(e => {
      const rates = { ...(e.materialRates || {}) }
      for (const [k, v] of Object.entries(edits)) if (k.startsWith('p:')) { if (v === 'list') delete rates[k.slice(2)]; else rates[k.slice(2)] = num2(v) }
      const rows = (e.rows || []).map(r => {
        if (r.kind !== 'item' || !r.buildup) return r
        let touched = false
        const lines = (r.buildup.lines || []).map(l => {
          const v = edits[`o:${r.id}:${l.id}`]; if (v == null || v === 'list') return l
          touched = true
          return l.type === 'lump' || l.type === 'lump sum' ? { ...l, amount: num2(v) } : { ...l, override: num2(v) }
        })
        return touched ? { ...r, buildup: { ...r.buildup, lines } } : r
      })
      return { ...e, materialRates: rates, rows }
    })
    setPend({})
  }
  const RateBox = ({ k, current, list, per }) => {
    const v = pend[k]
    const isList = v === 'list'
    const shown = isList ? (list ?? '') : (v != null ? v : (current == null ? '' : num2(current).toFixed(2)))
    const dirty = isList || (v != null && v !== '' && Number(v) >= 0 && (current == null || num2(v) !== num2(current)))
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <input value={isList ? (list == null ? '' : num2(list).toFixed(2)) : shown} disabled={readOnly} inputMode="decimal"
          onChange={e => setPend(x => ({ ...x, [k]: e.target.value.replace(/[^0-9.]/g, '') }))}
          style={{ width: 78, fontSize: 12.5, textAlign: 'right', padding: '3px 6px', border: `1px solid ${dirty ? '#f59e0b' : '#d4d4d0'}`, borderRadius: 5, background: dirty ? '#fef3c7' : '#fff' }} />
        {per && <span style={{ fontSize: 10.5, color: '#999' }}>per {per}</span>}
        {dirty && <span style={{ fontSize: 10.5, color: '#92400e' }}>was {money(current, { dp: 2 })}</span>}
        {!dirty && list != null && <span style={{ fontSize: 10.5, color: '#0f766e' }} title="This estimate's own rate">own rate · list {money(list, { dp: 2 })} <button onClick={() => setPend(x => ({ ...x, [k]: 'list' }))} disabled={readOnly} title="Go back to the price-list rate" style={{ border: 'none', background: 'none', color: '#0f766e', cursor: 'pointer', padding: 0, fontSize: 11 }}>↺</button></span>}
      </div>
    )
  }
  const th = { textAlign: 'left', padding: '7px 9px', fontSize: 11.5, color: '#666', fontWeight: 600, borderBottom: '1px solid #ecebe6', background: '#faf9f7', whiteSpace: 'nowrap' }
  const td = { padding: '6px 9px', fontSize: 12.5, borderBottom: '1px solid #f4f3f0', verticalAlign: 'top' }
  const r_ = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }
  if (!m.suppliers.length && !m.fixed.length && !(m.groups || []).length) return <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 20, color: '#888', fontSize: 13.5 }}>Nothing to order yet - items need a quantity and products chosen in their build-ups.</div>
  return (
    <div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'baseline', marginBottom: 10, fontSize: 13 }}>
        <strong style={{ fontSize: 16 }}>Materials to order {money(m.total, { dp: 2 })}</strong>
        <span style={{ color: '#888' }}>{m.suppliers.length} supplier{m.suppliers.length === 1 ? '' : 's'} · packs rounded up · supplier prices incl. increases and this quote's adjustments</span>
        {/* UPDATE MATERIALS RATES FOR QUOTE (1181) - this estimate only, and its future revisions */}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {changed.length > 0 && <span style={{ fontSize: 12, color: '#92400e' }}>{changed.length} rate{changed.length === 1 ? '' : 's'} changed</span>}
          {changed.length > 0 && <button onClick={() => setPend({})} style={{ fontSize: 12.5, padding: '6px 12px', border: '1px solid #d4d4d0', borderRadius: 7, background: '#fff', cursor: 'pointer' }}>Discard changes</button>}
          {!readOnly && <button onClick={applyRates} disabled={!changed.length} title="Use these rates in this quote - and every later revision of it - until changed again. The Price List is not changed."
            style={{ fontSize: 13, padding: '7px 14px', border: 'none', borderRadius: 8, background: changed.length ? '#0f766e' : '#cbd5d1', color: '#fff', cursor: changed.length ? 'pointer' : 'default', fontWeight: 600 }}>Update Materials Rates for Quote{changed.length ? ` (${changed.length})` : ''}</button>}
        </span>
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
                  <td style={r_}>{r.packPrice != null ? RateBox({ k: `p:${r.ref}`, current: r.packPrice, list: r.ownRate ? r.listPackPrice : null }) : <span style={{ color: '#b45309' }}>none</span>}</td>
                  <td style={{ ...r_, fontWeight: 600 }}>{r.cost != null ? money(r.cost, { dp: 2 }) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.other && <div style={{ borderTop: '2px solid #ecebe6' }}><div style={{ padding: '6px 12px', fontSize: 12, color: '#0f766e', fontWeight: 600 }}>Lines allocated to {s.supplier}</div>{OtherRows({ rows: s.other.rows })}</div>}
        </div>
      ))}
      {(m.groups || []).map(g => (
        <div key={g.name} style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, marginBottom: 12, overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #ecebe6' }}>
            <strong>{g.name} <span style={{ fontWeight: 400, fontSize: 11.5, color: '#888' }}>category</span></strong><strong>{money(g.cost, { dp: 2 })}</strong>
          </div>
          {OtherRows({ rows: g.rows })}
        </div>
      ))}
      {m.fixed.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, marginBottom: 12, overflow: 'auto' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #fde68a', fontSize: 13 }}><strong>Not from the price list - not allocated</strong> <span style={{ color: '#92400e', fontSize: 12 }}>- choose a supplier or category for each; it moves to that card</span></div>
          {OtherRows({ rows: m.fixed })}
        </div>
      )}
      {m.missing.length > 0 && <div style={{ fontSize: 12.5, color: '#b45309' }}>Not in the list yet: {m.missing.slice(0, 10).join(' · ')}{m.missing.length > 10 ? ` … and ${m.missing.length - 10} more` : ''}</div>}
    </div>
  )
}

// The ALLOCATE TO box (1153): suppliers on this estimate, suppliers in the price
// list, categories already made - or "+ Add new…" to name one (Insulation,
// Mansafe, Sub-Contractor...).
function AllocSelect({ value, onPick, onEstimate, priceList, categories, disabled, wide }) {
  // TYPE TO SHORTEN THE LIST (1158) - a searchable box; "+ Add '...'" makes a new
  // category from what was typed. The list floats on the screen (not clipped).
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)   // "+ Add new name…" - what is typed is added as it is (1159)
  const [pos, setPos] = useState(null)
  const btn = useRef(null), box = useRef(null)
  useEffect(() => {
    if (!open) return
    const place = () => { const r = btn.current && btn.current.getBoundingClientRect(); if (!r) return
      const below = window.innerHeight - r.bottom - 10, up = below < 220 && r.top > below
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 268)), ...(up ? { bottom: window.innerHeight - r.top + 2, maxH: Math.min(340, r.top - 12) } : { top: r.bottom + 2, maxH: Math.min(340, Math.max(160, below)) }) }) }
    place()
    const close = (e) => { if (box.current && !box.current.contains(e.target) && btn.current && !btn.current.contains(e.target)) { setOpen(false); setQ(''); setAdding(false) } }
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place); document.addEventListener('mousedown', close)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); document.removeEventListener('mousedown', close) }
  }, [open])
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const hit = (x) => words.every(w => x.toLowerCase().includes(w))
  const cats = categories.filter(c => !priceList.includes(c) && !onEstimate.includes(c))
  const groups = [['Suppliers on this estimate', onEstimate], ['Categories', cats], ['Price-list suppliers', priceList.filter(x => !onEstimate.includes(x))]]
    .map(([label, list]) => [label, list.filter(hit)]).filter(([, list]) => list.length)
  const exact = [...onEstimate, ...cats, ...priceList].some(x => x.toLowerCase() === q.trim().toLowerCase())
  const pick = (v) => { onPick(v); setOpen(false); setQ(''); setAdding(false) }
  return (
    <>
      <button ref={btn} type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        style={{ fontSize: 12, padding: '3px 8px', border: `1px solid ${value ? '#99f6e4' : '#fcd34d'}`, borderRadius: 5, background: value ? '#f0fdfa' : '#fff', color: '#1a1a19', cursor: 'pointer', minWidth: wide ? 220 : 150, maxWidth: 220, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || <span style={{ color: '#888' }}>{wide ? 'type or pick…' : '— not allocated —'}</span>} <span style={{ float: 'right', color: '#888', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div ref={box} style={{ position: 'fixed', zIndex: 1200, width: 260, left: pos?.left ?? 0, ...(pos?.bottom != null ? { bottom: pos.bottom } : { top: pos?.top ?? 0 }), visibility: pos ? 'visible' : 'hidden', background: '#fff', border: '1px solid #d4d4d0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.16)', display: 'flex', flexDirection: 'column', maxHeight: pos?.maxH ?? 340, color: '#1a1a19' }}>
          <div style={{ padding: 6, borderBottom: '1px solid #f0efec' }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && q.trim() && adding) { pick(q.trim()); return } if (e.key === 'Enter' && q.trim()) { const first = groups[0] && groups[0][1][0]; pick(exact ? [...onEstimate, ...cats, ...priceList].find(x => x.toLowerCase() === q.trim().toLowerCase()) : (first && words.length && !exact && groups.length ? first : q.trim())) } if (e.key === 'Escape') { setOpen(false); setQ(''); setAdding(false) } }}
              placeholder={adding ? 'Type the new name, then Enter' : 'Type to find, or a new name…'} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '5px 8px', border: '1px solid #d4d4d0', borderRadius: 6 }} />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {!wide && <div onMouseDown={e => e.preventDefault()} onClick={() => pick('')} style={{ padding: '6px 10px', fontSize: 12, color: '#888', cursor: 'pointer', borderBottom: '1px solid #f4f3f0' }}>— not allocated —</div>}
            {groups.map(([label, list]) => (
              <div key={label}>
                <div style={{ padding: '5px 10px 2px', fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
                {list.map(x => <div key={x} onMouseDown={e => e.preventDefault()} onClick={() => pick(x)} style={{ padding: '5px 12px', fontSize: 12.5, cursor: 'pointer', background: x === value ? '#f0fdfa' : undefined }} onMouseEnter={e => { e.currentTarget.style.background = '#f4f4f2' }} onMouseLeave={e => { e.currentTarget.style.background = x === value ? '#f0fdfa' : '' }}>{x}</div>)}
              </div>
            ))}
            {!groups.length && !q.trim() && <div style={{ padding: 10, fontSize: 12, color: '#aaa' }}>Nothing yet - type a name to add one.</div>}
            {q.trim() && !exact && <div onMouseDown={e => e.preventDefault()} onClick={() => pick(q.trim())} style={{ padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', color: '#0f766e', fontWeight: 600, borderTop: '1px solid #f0efec' }}>+ Add "{q.trim()}"</div>}
            {!q.trim() && <div onMouseDown={e => e.preventDefault()} onClick={() => { setAdding(true); setTimeout(() => box.current && box.current.querySelector('input') && box.current.querySelector('input').focus(), 0) }} style={{ padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', color: '#0f766e', fontWeight: 600, borderTop: '1px solid #f0efec' }}>+ Add new name…</div>}
          </div>
        </div>
      )}
    </>
  )
}
