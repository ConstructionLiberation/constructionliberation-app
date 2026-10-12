import { useMemo } from 'react'
import { materialList } from '../lib/materials'

// THE ESTIMATE'S MATERIALS TAB (1095): what to order, worked out live from the
// take-off - by supplier, in packs, at the supplier's pack price. Order waste
// can differ from the estimate's (e.g. 10% priced, 5% ordered): blank uses the
// estimate's. Rules: lib/materials.js.
const UNIT = { m2: 'm²', m: 'm', nr: 'nr', l: 'l', kg: 'kg' }
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
  const th = { textAlign: 'left', padding: '7px 9px', fontSize: 11.5, color: '#666', fontWeight: 600, borderBottom: '1px solid #ecebe6', background: '#faf9f7', whiteSpace: 'nowrap' }
  const td = { padding: '6px 9px', fontSize: 12.5, borderBottom: '1px solid #f4f3f0', verticalAlign: 'top' }
  const r_ = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }
  if (!m.suppliers.length && !m.fixed.length) return <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 20, color: '#888', fontSize: 13.5 }}>Nothing to order yet - items need a quantity and products chosen in their build-ups.</div>
  return (
    <div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'baseline', marginBottom: 10, fontSize: 13 }}>
        <strong style={{ fontSize: 16 }}>Materials to order {money(m.total, { dp: 2 })}</strong>
        <span style={{ color: '#888' }}>{m.suppliers.length} supplier{m.suppliers.length === 1 ? '' : 's'} · packs rounded up · supplier prices incl. increases and this quote's adjustments</span>
      </div>
      {m.suppliers.map(s => (
        <div key={s.supplier} style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, marginBottom: 12, overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #ecebe6' }}>
            <strong>{s.supplier}</strong><strong>{money(s.cost, { dp: 2 })}{s.incomplete ? <span style={{ color: '#b45309', fontWeight: 400, fontSize: 12 }}> + {s.incomplete} without a price</span> : ''}</strong>
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
        </div>
      ))}
      {m.fixed.length > 0 && (
        <div style={{ background: '#fafaf9', border: '1px solid #e8e7e3', borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 12.5 }}>
          <strong>Not from the price list</strong> <span style={{ color: '#888' }}>- fixed-rate lines, to arrange separately</span>
          {m.fixed.map((f, i) => <div key={i} style={{ marginTop: 4 }}>{f.item} - {f.label}: {n(f.quantity)} {UNIT[f.unit] || f.unit} at {money(f.amount, { dp: 2 })} ≈ {money(f.cost, { dp: 2 })}</div>)}
        </div>
      )}
      {m.missing.length > 0 && <div style={{ fontSize: 12.5, color: '#b45309' }}>Not in the list yet: {m.missing.slice(0, 10).join(' · ')}{m.missing.length > 10 ? ` … and ${m.missing.length - 10} more` : ''}</div>}
    </div>
  )
}
