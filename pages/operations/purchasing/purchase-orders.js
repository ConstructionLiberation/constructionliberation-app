import { useEffect, useMemo, useState } from 'react'
import OperationsShell from '../../../components/OperationsShell'
import { PO_STATUS as STATUS } from '../../../lib/poShared'

// PURCHASE ORDERS (1199) - stage 2a: raised by the office from the price list,
// emailed to the supplier, added to Deliveries. (Written to Xero in stage 3.)
const API = '/api/purchase-orders'
const call = async (body) => { const r = await fetch(API, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Something went wrong'); return d }
const money = (n) => `£${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (s) => s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const th = { textAlign: 'left', padding: '8px 10px', fontSize: 11.5, color: '#666', fontWeight: 600, borderBottom: '1px solid #e8e7e3', background: '#faf9f7', whiteSpace: 'nowrap' }
const td = { padding: '9px 10px', borderBottom: '1px solid #f1f0ec', fontSize: 13 }
const btn = { fontSize: 12.5, padding: '6px 12px', border: '1px solid #d4d4d0', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }

export default function PurchaseOrdersPage() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [show, setShow] = useState('open')    // open | draft | sent | cancelled | all
  const [numbering, setNumbering] = useState(false)
  const load = () => call().then(setData).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shown = useMemo(() => (data ? data.pos : []).filter(p => show === 'all' || (show === 'open' ? p.status === 'approved' : p.status === show))
    .filter(p => words.every(w => `${p.number || 'draft'} ${p.jobNo} ${p.projectName} ${p.supplier} ${p.raisedBy}`.toLowerCase().includes(w))), [data, q, show])
  const count = (st) => (data ? data.pos : []).filter(p => st === 'all' || (st === 'open' ? p.status === 'approved' : p.status === st)).length
  return (
    <OperationsShell active="purchasing:pos" section="purchasing" title="Purchase Orders" wide>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 10 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Purchase Orders</h1>
        <span style={{ fontSize: 13, color: '#666' }}>Raised from the price list and emailed to the supplier. A PO is a commitment - costs still come from the bills in Xero.</span>
      </div>
      {err && <div style={{ color: '#b42318', fontSize: 13, marginBottom: 8 }}>{err}</div>}
      {data && !(data.contacts || []).length && <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>Read your contacts from Xero first - <a href="/operations/purchasing/suppliers" style={{ color: '#0f766e' }}>Purchasing &gt; Suppliers</a> &gt; Refresh from Xero. Any Xero contact can then be a PO's supplier.</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        {[['open', 'Not sent'], ['draft', 'Drafts'], ['sent', 'Sent'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([k, l]) =>
          <button key={k} onClick={() => setShow(k)} style={{ ...btn, background: show === k ? '#0f766e' : '#fff', color: show === k ? '#fff' : '#333', borderColor: show === k ? '#0f766e' : '#d4d4d0' }}>{l} ({count(k)})</button>)}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search number, project, supplier…" style={{ fontSize: 13, padding: '6px 10px', border: '1px solid #d4d4d0', borderRadius: 7, minWidth: 260 }} />
        <span style={{ flex: 1 }} />
        {data && data.canSettings && <button onClick={() => setNumbering(true)} style={btn}>PO settings…</button>}
        <a href="/operations/purchasing/po/new" style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', fontWeight: 600, textDecoration: 'none' }}>+ New purchase order</a>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, overflow: 'auto' }}>
        {!data ? <div style={{ padding: 14, color: '#aaa' }}>Loading…</div> : !shown.length ? <div style={{ padding: 14, color: '#aaa', fontSize: 13 }}>{data.pos.length ? 'Nothing here.' : 'No purchase orders yet.'}</div> : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>{['PO', 'Project', 'Supplier', 'Total (ex VAT)', 'Delivery required', 'Status', 'Raised'].map((h, i) => <th key={h} style={{ ...th, textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>{shown.map(p => (
              <tr key={p.id} onClick={() => { window.location.href = `/operations/purchasing/po/${p.id}` }} style={{ cursor: 'pointer' }}>
                <td style={{ ...td, fontWeight: 700 }}>{p.number || <span style={{ color: '#64748b', fontWeight: 600 }}>Draft</span>}</td>
                <td style={td}><strong>{p.jobNo}</strong> {p.projectName}</td>
                <td style={td}>{p.supplier}</td>
                <td style={{ ...td, textAlign: 'right' }}>{money(p.total)}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{day(p.deliveryDate)}</td>
                <td style={{ ...td, color: (STATUS[p.status] || [])[1], fontWeight: 600, whiteSpace: 'nowrap' }}>{(STATUS[p.status] || [p.status])[0]}</td>
                <td style={{ ...td, color: '#888', fontSize: 12, whiteSpace: 'nowrap' }}>{day(p.raisedAt)} · {p.raisedBy}</td>
              </tr>))}</tbody>
          </table>)}
      </div>
      {numbering && <Numbering settings={data.settings} onClose={() => setNumbering(false)} onSaved={() => { setNumbering(false); load() }} />}
    </OperationsShell>
  )
}

// PO NUMBERING (admins) - the prefix and the next number. Starts as APP-PO-0001 so
// app POs cannot clash with POs still raised in Xero; to carry on Xero's sequence,
// set the prefix to Xero's and the next number after the last Xero PO.
function Numbering({ settings, onClose, onSaved }) {
  const [s, setS] = useState({ ...settings })
  const [err, setErr] = useState('')
  const preview = `${s.prefix || ''}${String(Math.max(1, Number(s.next) || 1)).padStart(Math.min(8, Math.max(1, Number(s.width) || 4)), '0')}`
  async function save() { try { await call({ action: 'settings', ...s }); onSaved() } catch (e) { setErr(e.message) } }
  const f = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#666' }, inp = { fontSize: 13, padding: '6px 9px', border: '1px solid #d4d4d0', borderRadius: 7 }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 20px' }} onMouseDown={ev => { if (ev.target === ev.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, padding: 18 }}>
        <strong style={{ fontSize: 16 }}>PO settings</strong>
        <div style={{ fontSize: 12.5, color: '#666', margin: '6px 0 12px' }}>App POs start as APP-PO-0001, so they cannot clash with POs still raised in Xero. Once you stop raising POs in Xero, you can carry on Xero's sequence: set Xero's prefix and the number after your last Xero PO.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ ...f, flex: 2 }}>Prefix<input value={s.prefix} onChange={e => setS({ ...s, prefix: e.target.value })} style={inp} /></label>
          <label style={{ ...f, flex: 1 }}>Next number<input type="number" min="1" value={s.next} onChange={e => setS({ ...s, next: e.target.value })} style={inp} /></label>
          <label style={{ ...f, flex: 1 }}>Digits<input type="number" min="1" max="8" value={s.width} onChange={e => setS({ ...s, width: e.target.value })} style={inp} /></label>
        </div>
        <div style={{ fontSize: 13, marginTop: 10 }}>The next PO will be <strong>{preview}</strong></div>
        <label style={{ ...f, marginTop: 14 }}>Order confirmations sent to - the default on every new PO (can be changed on each)<input value={s.confirmationsTo || ''} onChange={e => setS({ ...s, confirmationsTo: e.target.value })} placeholder="orders@yourcompany.co.uk" style={inp} /></label>
        {err && <div style={{ color: '#b42318', fontSize: 13, marginTop: 8 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}><button onClick={onClose} style={btn}>Cancel</button><button onClick={save} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', fontWeight: 600 }}>Save</button></div>
      </div>
    </div>
  )
}
