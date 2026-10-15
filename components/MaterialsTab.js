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
  const OtherRows = ({ rows }) => {
    const all = rows.length > 0 && rows.every(f => ticked.has(f.key))
    return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead><tr>
        <th style={{ ...th, width: 22 }}><input type="checkbox" checked={all} disabled={readOnly} title="Tick all in this list" onChange={() => setTicked(x => { const n = new Set(x); for (const f of rows) { if (all) n.delete(f.key); else n.add(f.key) } return n })} /></th>
        {['Line (not from the price list)', 'Item', 'Quantity', 'Rate', 'Cost', 'Allocate to'].map((h, i) => <th key={h} style={{ ...th, textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
      <tbody>{rows.map(f => (
        <tr key={f.key} style={{ background: ticked.has(f.key) ? '#f0fdfa' : undefined }}>
          <td style={td}><input type="checkbox" checked={ticked.has(f.key)} disabled={readOnly} onChange={() => setTicked(x => { const n = new Set(x); if (n.has(f.key)) n.delete(f.key); else n.add(f.key); return n })} /></td>
          <td style={{ ...td, minWidth: 200 }}>{f.label}</td>
          <td style={{ ...td, color: '#666' }}>{f.item}</td>
          <td style={r_}>{n(f.quantity)} {UNIT[f.unit] || f.unit}</td>
          <td style={r_}>{money(f.amount, { dp: 2 })}</td>
          <td style={{ ...r_, fontWeight: 600 }}>{money(f.cost, { dp: 2 })}</td>
          <td style={td}><Alloc f={f} /></td>
        </tr>))}</tbody>
    </table>
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
      </div>
      {ticked.size > 0 && !readOnly && (
        <div style={{ position: 'sticky', top: 6, zIndex: 30, display: 'flex', gap: 10, alignItems: 'center', background: '#0f766e', color: '#fff', borderRadius: 10, padding: '8px 12px', marginBottom: 10, fontSize: 13 }}>
          <strong>{ticked.size} line{ticked.size === 1 ? '' : 's'} ticked</strong>
          <span>Allocate to:</span>
          <AllocSelect value="" onPick={(v) => { setAllocMany([...ticked], v); setTicked(new Set()) }} onEstimate={m.suppliers.map(x => x.supplier)} priceList={priceListSuppliers} categories={categories} wide />
          <button onClick={() => setTicked(new Set())} style={{ marginLeft: 'auto', fontSize: 12.5, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.7)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>Untick all</button>
        </div>
      )}
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
function AllocSelect({ value, onPick, onEstimate, priceList, categories, disabled, wide }) {
  // TYPE TO SHORTEN THE LIST (1158) - a searchable box; "+ Add '...'" makes a new
  // category from what was typed. The list floats on the screen (not clipped).
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState(null)
  const btn = useRef(null), box = useRef(null)
  useEffect(() => {
    if (!open) return
    const place = () => { const r = btn.current && btn.current.getBoundingClientRect(); if (!r) return
      const below = window.innerHeight - r.bottom - 10, up = below < 220 && r.top > below
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 268)), ...(up ? { bottom: window.innerHeight - r.top + 2, maxH: Math.min(340, r.top - 12) } : { top: r.bottom + 2, maxH: Math.min(340, Math.max(160, below)) }) }) }
    place()
    const close = (e) => { if (box.current && !box.current.contains(e.target) && btn.current && !btn.current.contains(e.target)) { setOpen(false); setQ('') } }
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place); document.addEventListener('mousedown', close)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); document.removeEventListener('mousedown', close) }
  }, [open])
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const hit = (x) => words.every(w => x.toLowerCase().includes(w))
  const cats = categories.filter(c => !priceList.includes(c) && !onEstimate.includes(c))
  const groups = [['Suppliers on this estimate', onEstimate], ['Categories', cats], ['Price-list suppliers', priceList.filter(x => !onEstimate.includes(x))]]
    .map(([label, list]) => [label, list.filter(hit)]).filter(([, list]) => list.length)
  const exact = [...onEstimate, ...cats, ...priceList].some(x => x.toLowerCase() === q.trim().toLowerCase())
  const pick = (v) => { onPick(v); setOpen(false); setQ('') }
  return (
    <>
      <button ref={btn} type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        style={{ fontSize: 12, padding: '3px 8px', border: `1px solid ${value ? '#99f6e4' : '#fcd34d'}`, borderRadius: 5, background: value ? '#f0fdfa' : '#fff', color: '#1a1a19', cursor: 'pointer', minWidth: wide ? 220 : 150, maxWidth: 220, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || <span style={{ color: '#888' }}>{wide ? 'type or pick…' : '— not allocated —'}</span>} <span style={{ float: 'right', color: '#888', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div ref={box} style={{ position: 'fixed', zIndex: 1200, width: 260, left: pos?.left ?? 0, ...(pos?.bottom != null ? { bottom: pos.bottom } : { top: pos?.top ?? 0 }), visibility: pos ? 'visible' : 'hidden', background: '#fff', border: '1px solid #d4d4d0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.16)', display: 'flex', flexDirection: 'column', maxHeight: pos?.maxH ?? 340, color: '#1a1a19' }}>
          <div style={{ padding: 6, borderBottom: '1px solid #f0efec' }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && q.trim()) { const first = groups[0] && groups[0][1][0]; pick(exact ? [...onEstimate, ...cats, ...priceList].find(x => x.toLowerCase() === q.trim().toLowerCase()) : (first && words.length && !exact && groups.length ? first : q.trim())) } if (e.key === 'Escape') { setOpen(false); setQ('') } }}
              placeholder="Type to find, or a new name…" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '5px 8px', border: '1px solid #d4d4d0', borderRadius: 6 }} />
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
          </div>
        </div>
      )}
    </>
  )
}
