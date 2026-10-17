import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Shell, bigBtn } from './index'
import { siteApi } from '../../lib/siteApi'
import { lineTotal, poTotal, poVat, poGross, PO_STATUS } from '../../lib/poShared'

// SITE APP PURCHASE ORDERS (1212) - an operative raises a PO for one of their
// projects; it goes to the project's Contracts Manager to approve before anything
// is sent to the supplier. Same checks as the office's PO.
const INK = '#1a1a19', BRAND = '#ca8a04'
const money = (n) => `£${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const inp = { width: '100%', boxSizing: 'border-box', fontSize: 15, padding: '11px 12px', border: '1px solid #d9d5cc', borderRadius: 10, fontFamily: 'inherit', background: '#fff' }
const lbl = { display: 'block', fontSize: 13, color: '#666', margin: '14px 0 5px' }
const card = { background: '#fff', border: '1px solid #e8e4da', borderRadius: 14, padding: 14, marginBottom: 12 }
const back = { background: 'transparent', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const statusChip = (s) => { const [t, c] = PO_STATUS[s] || [s, '#888']; return <span style={{ fontSize: 12, fontWeight: 700, color: c }}>{t}</span> }

export default function SitePurchaseOrders() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [data, setData] = useState(null)
  const [err, setErr] = useState(''), [msg, setMsg] = useState('')
  const [view, setView] = useState('list')     // list | new | <po id>
  const load = () => siteApi('/api/site-po').then(setData).catch(e => setErr(e.message))
  useEffect(() => {
    const s = sessionStorage.getItem('ops_operative')
    if (!s) { router.replace('/forms'); return }
    try { setUser(JSON.parse(s)) } catch {}
    load()
  }, [])
  const logout = () => { sessionStorage.removeItem('ops_operative'); sessionStorage.removeItem('ops_token'); router.push('/forms') }
  return (
    <Shell user={user} onLogout={logout}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <button onClick={() => view === 'list' ? router.push('/forms') : (setView('list'), setMsg(''))} style={back}>‹ {view === 'list' ? 'Home' : 'Purchase orders'}</button>
        <h2 style={{ fontSize: 18, color: INK, margin: '8px 0 4px' }}>{view === 'new' ? 'New purchase order' : 'Purchase Orders'}</h2>
        {err && <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#b42318', fontSize: 14 }}>{err}{/sign in again/i.test(err) && <div><button onClick={logout} style={{ ...bigBtn(false), marginTop: 10 }}>Sign out</button></div>}</div>}
        {msg && <div style={{ ...card, borderColor: '#99f6e4', background: '#f0fdfa', color: '#0f766e', fontSize: 14 }}>{msg}</div>}
        {!data ? (!err && <div style={{ textAlign: 'center', color: '#999', paddingTop: 30 }}>Loading...</div>)
          : view === 'new' ? <NewPo data={data} onDone={(d) => { setMsg(d.cmNotified ? `Sent to ${d.cmName || 'the CM'} for approval.` : 'Raised - waiting for the CM\'s approval.'); setView('list'); load() }} />
          : view !== 'list' ? <PoView id={view} />
          : <>
            <p style={{ color: '#777', fontSize: 14, margin: '0 0 14px' }}>Order materials for your projects. Each one goes to the project's Contracts Manager to approve before it is sent to the supplier.</p>
            <button onClick={() => { setMsg(''); setView('new') }} disabled={!data.projects.length} style={bigBtn(!data.projects.length)}>+ New purchase order</button>
            {!data.projects.length && <div style={{ fontSize: 13, color: '#999', marginTop: 8 }}>You are not on any live projects yet.</div>}
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: BRAND, margin: '22px 0 8px' }}>My purchase orders</div>
            {!data.mine.length ? <div style={{ color: '#999', fontSize: 14 }}>None yet.</div> : data.mine.map(p => (
              <button key={p.id} onClick={() => setView(p.id)} style={{ ...card, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'block', fontFamily: 'inherit' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong style={{ fontSize: 15, color: INK }}>{p.supplier}</strong>{statusChip(p.status)}</div>
                <div style={{ fontSize: 13, color: '#777', marginTop: 3 }}>{p.jobNo} {p.projectName} · {money(p.gross ?? p.total)}{p.number ? ` · ${p.number}` : ''}</div>
              </button>))}
          </>}
      </div>
    </Shell>
  )
}

// ONE PO, read-only (mine, or one I decide)
export function PoView({ id, onDecided, data }) {
  const [d, setD] = useState(null), [err, setErr] = useState('')
  const [editing, setEditing] = useState(false)   // the CM changes it before it is sent (1213)
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [rejecting, setRejecting] = useState(false)
  useEffect(() => { siteApi(`/api/site-po?id=${encodeURIComponent(id)}`).then(setD).catch(e => setErr(e.message)) }, [id])
  async function decide(action, send = false) {
    setBusy(true); setErr('')
    try { const r = await siteApi('/api/site-po', { action, id, reason, send }); onDecided && onDecided(r.po, action, r) } catch (e) { setErr(e.message); setBusy(false) }
  }
  if (err && !d) return <div style={{ color: '#b42318', fontSize: 14 }}>{err}</div>
  if (!d) return <div style={{ textAlign: 'center', color: '#999', paddingTop: 30 }}>Loading...</div>
  if (editing && data) return <NewPo data={data} initial={d.po} onCancel={() => setEditing(false)} onDone={(r) => { setD(x => ({ ...x, po: r.po })); setEditing(false) }} />
  const po = d.po, row = (k, v) => v ? <div style={{ display: 'flex', gap: 10, fontSize: 14, padding: '4px 0' }}><span style={{ color: '#888', minWidth: 120 }}>{k}</span><span style={{ flex: 1, whiteSpace: 'pre-line' }}>{v}</span></div> : null
  return (
    <div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong style={{ fontSize: 16 }}>{po.supplier || po.contactName}</strong>{statusChip(po.status)}</div>
        {(po.contactName && po.contactName !== po.supplier) && <div style={{ fontSize: 12, color: '#999' }}>Xero contact: {po.contactName}</div>}
        <div style={{ fontSize: 13, color: po.to ? '#555' : '#b45309', marginTop: 2 }}>{po.to ? `Sent to: ${po.to}` : 'No supplier email - add one with Edit'}</div>
        <div style={{ fontSize: 13, color: '#777', margin: '4px 0 8px' }}>{po.jobNo} {po.projectName}{po.number ? ` · ${po.number}` : ''} · raised by {po.raisedBy}</div>
        {po.status === 'rejected' && <div style={{ background: '#fef2f2', color: '#b42318', borderRadius: 10, padding: 10, fontSize: 14, marginBottom: 8 }}>Rejected by {po.rejectedBy}: {po.rejectReason}</div>}
        {po.lines.map((l, i) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 14, padding: '6px 0', borderTop: i ? '1px solid #f1eee6' : 'none' }}><span style={{ flex: 1 }}>{l.description}<div style={{ fontSize: 12, color: '#999' }}>{l.qty} {l.unit} × {money(l.price)}</div></span><strong>{money(lineTotal(l))}</strong></div>)}
        <div style={{ borderTop: '1px solid #e8e4da', marginTop: 6, paddingTop: 6, fontSize: 14 }}>
          {row('Subtotal', money(poTotal(po)))}{row(po.vat === 'none' ? 'No VAT' : `VAT ${po.vatRate ?? 20}%`, money(poVat(po)))}<div style={{ display: 'flex', fontWeight: 700, fontSize: 15, paddingTop: 4 }}><span style={{ flex: 1 }}>Total</span>{money(poGross(po))}</div>
        </div>
      </div>
      <div style={card}>
        {row('Delivery required', po.deliveryDate ? new Date(po.deliveryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '')}
        {row('Deliver to', po.deliveryAddress)}{row('Moffett offload', po.moffett === 'yes' ? 'Yes' : 'No')}{row('Artics permitted', po.artics === 'yes' ? 'Yes' : 'No')}
        {row('Access routes', po.accessRoutes)}{row('Site contact', po.siteContact && po.siteContact.name ? `${po.siteContact.name}${po.siteContact.phone ? ` - ${po.siteContact.phone}` : ''}` : '')}
        {row('Confirmations to', po.confirmationsTo)}{row('Notes', po.notes)}
      </div>
      {err && <div style={{ color: '#b42318', fontSize: 14, marginBottom: 8 }}>{err}</div>}
      {d.canEdit && data && !rejecting && <button onClick={() => setEditing(true)} style={{ ...bigBtn(false), background: '#fff', color: INK, border: '1px solid #d9d5cc', marginBottom: 10 }}>Edit</button>}
      {d.canSend && <button onClick={() => { if (window.confirm(`Send ${po.number} to ${po.to || 'the supplier'}?`)) decide('send') }} disabled={busy || !po.to} style={{ ...bigBtn(busy || !po.to), background: (busy || !po.to) ? '#c9c4ba' : '#0f766e', marginBottom: 10 }}>{busy ? 'Sending…' : 'Send to supplier'}</button>}
      {d.canDecide && (!rejecting ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => decide('approve', true)} disabled={busy || !po.to} title={po.to ? '' : 'Add the supplier email with Edit'} style={{ ...bigBtn(busy || !po.to), background: (busy || !po.to) ? '#c9c4ba' : '#0f766e' }}>{busy ? 'Working…' : 'Approve and send'}</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => decide('approve', false)} disabled={busy} style={{ ...bigBtn(busy), background: '#fff', color: INK, border: '1px solid #d9d5cc' }}>Approve only</button>
            <button onClick={() => setRejecting(true)} disabled={busy} style={{ ...bigBtn(busy), background: '#fff', color: '#b42318', border: '1px solid #f5c2c2' }}>Reject</button></div>
          <div style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>"Approve only" leaves it for the office to send.</div></div>
        : <div style={card}><label style={{ ...lbl, marginTop: 0 }}>Why is it rejected?</label><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} style={inp} />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}><button onClick={() => setRejecting(false)} style={{ ...bigBtn(false), background: '#fff', color: '#555', border: '1px solid #d9d5cc' }}>Back</button>
            <button onClick={() => decide('reject')} disabled={busy || !reason.trim()} style={{ ...bigBtn(busy || !reason.trim()), background: (busy || !reason.trim()) ? '#c9c4ba' : '#b42318' }}>Reject</button></div></div>)}
    </div>
  )
}

// A NEW PO from the phone
function NewPo({ data, onDone, initial = null, onCancel }) {
  // NEW, or an existing PO being EDITED by the CM (1213) - its project stays as raised
  const [po, setPo] = useState(() => initial ? { projectNo: initial.jobNo || '', contactId: initial.contactId || '', contactName: initial.contactName || initial.supplier || '', priceList: initial.priceList || '',
      lines: (initial.lines || []).map(l => ({ ...l })), deliveryDate: initial.deliveryDate || '', deliveryAddress: initial.deliveryAddress || '', moffett: initial.moffett || '', artics: initial.artics || '', accessRoutes: initial.accessRoutes || '',
      siteContact: { name: (initial.siteContact && initial.siteContact.name) || '', phone: (initial.siteContact && initial.siteContact.phone) || '' }, confirmationsTo: initial.confirmationsTo || '', notes: initial.notes || '', vat: initial.vat || 'standard', to: initial.to || '', _toTyped: !!initial.to }
    : { projectNo: '', contactId: '', contactName: '', priceList: '', lines: [], deliveryDate: '', deliveryAddress: '', moffett: '', artics: '', accessRoutes: '', siteContact: { name: '', phone: '' }, confirmationsTo: data.settings.confirmationsTo || '', notes: '' })
  const [products, setProducts] = useState([]), [pq, setPq] = useState(''), [sq, setSq] = useState(''), [cq, setCq] = useState(null)
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const set = (k, v) => setPo(x => ({ ...x, [k]: v }))
  useEffect(() => { if (po.priceList) siteApi(`/api/site-po?products=${encodeURIComponent(po.priceList)}`).then(d => setProducts(d.products || [])).catch(() => setProducts([])); else setProducts([]) }, [po.priceList])
  const sWords = sq.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const supplierHits = sq.trim() ? data.contacts.filter(c => sWords.every(w => `${c.name} ${c.priceList}`.toLowerCase().includes(w))).slice(0, 8) : []
  const pWords = pq.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const productHits = pq.trim() ? products.filter(p => pWords.every(w => `${p.description} ${p.code}`.toLowerCase().includes(w))).slice(0, 15) : []
  const cWords = String(cq || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const peopleHits = cq ? data.people.filter(p => cWords.every(w => `${p.name} ${p.phone}`.toLowerCase().includes(w))).slice(0, 8) : []
  const missing = [!po.projectNo && 'the project', !po.contactId && 'the supplier', !po.lines.length && 'a line', po.lines.some(l => !(Number(l.qty) > 0)) && 'quantities',
    po.lines.some(l => !String(l.description || '').trim()) && 'a description on every line', !po.deliveryAddress.trim() && 'the delivery address', !po.moffett && 'Moffett', !po.artics && 'artics',
    !po.siteContact.name && 'the site contact', !EMAIL.test(po.confirmationsTo.trim()) && 'the confirmations email'].filter(Boolean)
  const setLine = (i, k, v) => setPo(x => ({ ...x, lines: x.lines.map((l, j) => j === i ? { ...l, [k]: v } : l) }))
  async function submit() {
    setBusy(true); setErr('')
    try { const d = await siteApi('/api/site-po', initial ? { action: 'update', id: initial.id, po } : { action: 'create', po }); onDone(d) } catch (e) { setErr(e.message); setBusy(false) }
  }
  const yn = (k, label) => <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}><span style={{ flex: 1, fontSize: 14, color: po[k] ? INK : '#b45309' }}>{label}</span>
    {[['yes', 'Yes'], ['no', 'No']].map(([v, t]) => <button key={v} onClick={() => set(k, v)} style={{ fontSize: 14, padding: '9px 18px', borderRadius: 10, border: `1px solid ${po[k] === v ? '#0f766e' : '#d9d5cc'}`, background: po[k] === v ? '#0f766e' : '#fff', color: po[k] === v ? '#fff' : INK, fontFamily: 'inherit' }}>{t}</button>)}</div>
  const pick = { width: '100%', textAlign: 'left', padding: '11px 12px', fontSize: 14, border: 'none', borderBottom: '1px solid #f1eee6', background: '#fff', fontFamily: 'inherit', cursor: 'pointer' }
  return (
    <div>
      <div style={card}>
        <label style={{ ...lbl, marginTop: 0 }}>Project</label>
        {initial ? <div style={{ fontSize: 15, fontWeight: 600 }}>{initial.jobNo} {initial.projectName}</div> : <select value={po.projectNo} onChange={e => { const p = data.projects.find(x => x.projectNo === e.target.value); setPo(x => ({ ...x, projectNo: e.target.value, deliveryAddress: (!x.deliveryAddress || x.deliveryAddress === x._auto) ? ((p && p.address) || '') : x.deliveryAddress, _auto: (p && p.address) || '' })) }} style={inp}>
          <option value="">Choose your project</option>{data.projects.map(p => <option key={p.projectNo} value={p.projectNo}>{p.projectNo} {p.name}</option>)}
        </select>}
        <label style={lbl}>Supplier</label>
        {po.contactId ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><strong style={{ flex: 1, fontSize: 15 }}>{po.contactName}</strong><button onClick={() => setPo(x => ({ ...x, contactId: '', contactName: '', priceList: '' }))} style={{ ...back, color: '#0f766e' }}>Change</button></div>
          : <><input value={sq} onChange={e => setSq(e.target.value)} placeholder="Search suppliers…" style={inp} />
            {supplierHits.length > 0 && <div style={{ border: '1px solid #e8e4da', borderRadius: 10, marginTop: 4, overflow: 'hidden' }}>{supplierHits.map(c => <button key={c.id} onClick={() => { setPo(x => ({ ...x, contactId: c.id, contactName: c.name, priceList: c.priceList || '', to: x._toTyped ? x.to : (c.email || '') })); setSq('') }} style={pick}>{c.name}{c.priceList ? <span style={{ color: '#0f766e', fontSize: 12 }}> · price list</span> : ''}</button>)}</div>}</>}
        {po.contactId && <><label style={lbl}>Supplier email</label><input value={po.to || ''} onChange={e => setPo(x => ({ ...x, to: e.target.value, _toTyped: !!e.target.value }))} inputMode="email" placeholder="From Xero - can be changed" style={{ ...inp, marginBottom: 0 }} /></>}
      </div>
      <div style={card}>
        <strong style={{ fontSize: 15 }}>What to order</strong>
        {po.lines.map((l, i) => <div key={i} style={{ borderTop: '1px solid #f1eee6', marginTop: 10, paddingTop: 10 }}>
          <input value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Item" style={inp} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <input data-qty="1" type="number" inputMode="decimal" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)} placeholder="Qty" style={{ ...inp, width: 90, ...(Number(l.qty) > 0 ? {} : { borderColor: '#dc2626', background: '#fef2f2' }) }} />
            <input value={l.unit} onChange={e => setLine(i, 'unit', e.target.value)} placeholder="Unit" style={{ ...inp, width: 90 }} />
            <input type="number" inputMode="decimal" value={l.price} onChange={e => setLine(i, 'price', e.target.value)} placeholder="Price" style={{ ...inp, width: 100 }} />
            <button onClick={() => setPo(x => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))} style={{ ...back, color: '#b42318', fontSize: 20 }}>×</button>
          </div></div>)}
        {po.priceList && <><label style={lbl}>Add from {po.priceList}'s price list</label><input value={pq} onChange={e => setPq(e.target.value)} placeholder="Search products…" style={inp} />
          {productHits.length > 0 && <div style={{ border: '1px solid #e8e4da', borderRadius: 10, marginTop: 4, overflow: 'hidden' }}>{productHits.map(p => <button key={p.ref} onClick={() => { setPo(x => ({ ...x, lines: [...x.lines, { ref: p.ref, code: p.code, description: p.description, qty: '', unit: p.unit, price: p.price ?? 0 }] })); setPq(''); setTimeout(() => { const q = document.querySelectorAll('input[data-qty]'); if (q.length) q[q.length - 1].focus() }, 30) }} style={pick}>{p.description}<div style={{ fontSize: 12, color: '#999' }}>{p.price != null ? `${money(p.price)}${p.unit ? ` / ${p.unit}` : ''}` : ''}</div></button>)}</div>}</>}
        <button onClick={() => setPo(x => ({ ...x, lines: [...x.lines, { ref: null, code: '', description: '', qty: '', unit: '', price: '' }] }))} style={{ ...bigBtn(false), background: '#fff', color: INK, border: '1px solid #d9d5cc', marginTop: 12, padding: '12px 0', fontSize: 15 }}>+ Add an item</button>
        {po.lines.length > 0 && <div style={{ textAlign: 'right', fontSize: 14, marginTop: 10 }}>{money(poTotal(po))} ex VAT</div>}
      </div>
      <div style={card}>
        <strong style={{ fontSize: 15 }}>Delivery</strong>
        <label style={lbl}>Delivery required</label><input type="date" value={po.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} style={inp} />
        <label style={lbl}>Deliver to</label><textarea value={po.deliveryAddress} onChange={e => set('deliveryAddress', e.target.value)} rows={3} style={inp} />
        {yn('moffett', 'Is Moffett offload required?')}{yn('artics', 'Are artics permitted?')}
        <label style={lbl}>Any special access routes?</label><textarea value={po.accessRoutes} onChange={e => set('accessRoutes', e.target.value)} rows={2} style={inp} />
        <label style={lbl}>Site contact</label>
        <input value={cq === null ? po.siteContact.name : cq} onFocus={() => setCq('')} onChange={e => setCq(e.target.value)} onBlur={() => setTimeout(() => setCq(null), 150)} placeholder="Type a name…" style={inp} />
        {cq !== null && (peopleHits.length > 0 || cq.trim()) && <div style={{ border: '1px solid #e8e4da', borderRadius: 10, marginTop: 4, overflow: 'hidden' }}>
          {cq.trim() && !peopleHits.some(p => p.name.toLowerCase() === cq.trim().toLowerCase()) && <button onMouseDown={e => { e.preventDefault(); set('siteContact', { name: cq.trim(), phone: '' }); setCq(null) }} style={{ ...pick, color: '#0f766e' }}>Use "{cq.trim()}"</button>}
          {peopleHits.map((p, i) => <button key={i} onMouseDown={e => { e.preventDefault(); set('siteContact', { name: p.name, phone: p.phone || '' }); setCq(null) }} style={pick}>{p.name} <span style={{ color: '#999', fontSize: 12 }}>{p.phone || 'no mobile'} · {p.kind}</span></button>)}</div>}
        <input value={po.siteContact.phone} onChange={e => set('siteContact', { ...po.siteContact, phone: e.target.value })} placeholder="Their mobile" inputMode="tel" style={{ ...inp, marginTop: 8 }} />
        <label style={lbl}>Order confirmations sent to</label><input value={po.confirmationsTo} onChange={e => set('confirmationsTo', e.target.value)} inputMode="email" style={inp} />
        <label style={lbl}>Additional notes</label><textarea value={po.notes} onChange={e => set('notes', e.target.value)} rows={3} style={inp} />
      </div>
      {err && <div style={{ color: '#b42318', fontSize: 14, marginBottom: 8 }}>{err}</div>}
      {missing.length > 0 && <div style={{ fontSize: 13, color: '#b45309', marginBottom: 8 }}>Still needed: {missing.join(', ')}</div>}
      <button onClick={submit} disabled={busy || missing.length > 0} style={bigBtn(busy || missing.length > 0)}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Send for approval'}</button>
      {initial ? <button onClick={onCancel} style={{ ...bigBtn(false), background: '#fff', color: '#555', border: '1px solid #d9d5cc', marginTop: 10 }}>Cancel</button>
        : <div style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 8 }}>Goes to the project's Contracts Manager - nothing is sent to the supplier until they approve.</div>}
    </div>
  )
}
