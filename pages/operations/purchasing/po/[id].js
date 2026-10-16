import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import OperationsShell from '../../../../components/OperationsShell'
import { lineTotal, poTotal, PO_STATUS } from '../../../../lib/poShared'
import DocumentsPanel from '../../../../components/DocumentsPanel'

// A PURCHASE ORDER (1199) - new, or one already raised. Raised by the office:
// approved on raising. Editable until it is sent; then it stands as sent.
const API = '/api/purchase-orders'
const call = async (body, q = '') => { const r = await fetch(`${API}${q}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Something went wrong'); return d }
const money = (n) => `£${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const inp = { fontSize: 13, padding: '6px 9px', border: '1px solid #d4d4d0', borderRadius: 7, fontFamily: 'inherit', boxSizing: 'border-box' }
const btn = { fontSize: 12.5, padding: '6px 12px', border: '1px solid #d4d4d0', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }
const primary = { ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', fontWeight: 600 }
const th = { textAlign: 'left', padding: '7px 8px', fontSize: 11.5, color: '#666', fontWeight: 600, borderBottom: '1px solid #e8e7e3', background: '#faf9f7' }
const td = { padding: '6px 8px', borderBottom: '1px solid #f1f0ec', fontSize: 13, verticalAlign: 'top' }
const card = { background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 14, marginBottom: 12 }
const label = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#666' }
const blank = { projectId: '', jobNo: '', projectName: '', supplier: '', lines: [], deliveryAddress: '', deliveryDate: '', notes: '', moffett: '', artics: '', accessRoutes: '', siteContact: { name: '', phone: '' }, confirmationsTo: '' }

export default function PoPage() {
  const router = useRouter()
  const id = router.query.id
  const isNew = id === 'new'
  const [po, setPo] = useState(null)
  const [link, setLink] = useState('')
  const [list, setList] = useState(null)          // { suppliers }
  const [projects, setProjects] = useState(null)
  const [products, setProducts] = useState([])
  const [pq, setPq] = useState('')
  const [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [people, setPeople] = useState([])      // site contacts: operatives and portal users (1200)
  useEffect(() => {
    if (!id) return
    call().then(d => { setList(d); if (isNew) setPo(x => x && !x.confirmationsTo ? { ...x, confirmationsTo: (d.settings && d.settings.confirmationsTo) || '' } : x) }).catch(e => setErr(e.message))
    call(null, '?people=1').then(d => setPeople(d.people || [])).catch(() => {})
    Promise.all([fetch('/api/dashboard').then(r => r.json()).catch(() => ({})), fetch('/api/hidden-projects').then(r => r.json()).catch(() => ({}))]).then(([d, h]) => {
      const hidden = new Set((h.hidden || []).map(String))
      setProjects((d.projects || []).filter(p => p.xeroId && !hidden.has(String(p.xeroId))).map(p => ({ id: String(p.xeroId), jobNo: p.jobNo || '', name: p.name || p.projectName || '' })).sort((a, b) => String(b.jobNo).localeCompare(String(a.jobNo), undefined, { numeric: true })))
    })
    if (isNew) setPo({ ...blank })
    else call(null, `?id=${encodeURIComponent(id)}`).then(d => { setPo(d.po); setLink(d.link) }).catch(e => setErr(e.message))
  }, [id])
  useEffect(() => { if (po && po.supplier) call(null, `?products=${encodeURIComponent(po.supplier)}`).then(d => setProducts(d.products)).catch(() => setProducts([])); else setProducts([]) }, [po && po.supplier])
  const editable = po && (isNew || po.status === 'approved' || po.status === 'draft')
  const isDraft = po && (isNew || po.status === 'draft')
  // WHAT STOPS IT BEING RAISED (1201) - every line needs a quantity
  const missing = po ? [
    !po.projectId && 'the project', !po.supplier && 'the supplier', !po.lines.length && 'a line',
    po.lines.some(l => !(Number(l.qty) > 0)) && `quantities (${po.lines.filter(l => !(Number(l.qty) > 0)).length})`,
    po.lines.some(l => !String(l.description || '').trim()) && 'a description on every line',
    !po.moffett && 'the Moffett question', !po.artics && 'the artics question'].filter(Boolean) : []
  const set = (k, v) => setPo(x => ({ ...x, [k]: v }))
  const setLine = (i, k, v) => setPo(x => ({ ...x, lines: x.lines.map((l, j) => j === i ? { ...l, [k]: v } : l) }))
  // CLICK A PRODUCT TO ADD IT (1201) - the quantity blank (red) and ready to type
  const focusLastQty = () => setTimeout(() => { const q = document.querySelectorAll('input[data-qty]'); if (q.length) q[q.length - 1].focus() }, 30)
  const addProduct = (p) => { setPo(x => ({ ...x, lines: [...x.lines, { ref: p.ref, code: p.code, description: p.description, qty: '', unit: p.unit, price: p.price ?? 0 }] })); focusLastQty() }
  const words = pq.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const found = useMemo(() => products.filter(p => words.every(w => `${p.description} ${p.code} ${p.ref} ${p.section}`.toLowerCase().includes(w))).slice(0, 40), [products, pq])
  // the project's address from Project Details - filled in unless someone has typed their own
  async function fillAddress(p) {
    try { const d = await call(null, `?project=${encodeURIComponent(p.id)}&jobNo=${encodeURIComponent(p.jobNo)}`)
      setPo(x => (!x.deliveryAddress || x.deliveryAddress === x._autoAddress) ? { ...x, deliveryAddress: d.projectAddress || '', _autoAddress: d.projectAddress || '' } : x) } catch {}
  }
  // save as a DRAFT, RAISE (new or a draft), or save an approved PO's changes (1201)
  async function save(how) {
    setBusy(true); setErr(''); setMsg('')
    try {
      if (isNew) { const d = await call({ action: 'create', po, draft: how === 'draft' }); router.replace(`/operations/purchasing/po/${d.po.id}`); return }
      const d = await call({ action: how === 'raise' ? 'raise' : 'update', id: po.id, po })
      setPo(d.po); setMsg(how === 'raise' ? `Raised as ${d.po.number}.` : how === 'draft' ? 'Draft saved.' : 'Saved.')
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  // CHANGE THE COMPANY DEFAULT for order confirmations (admins, 1202) - and this PO's
  // box too, if it still shows the old default
  async function changeDefault() {
    const old = (list && list.settings && list.settings.confirmationsTo) || ''
    const next = window.prompt('The company\'s default address for order confirmations - used on every new purchase order:', old)
    if (next === null) return
    setErr(''); setMsg('')
    try {
      const d = await call({ action: 'settings', ...(list.settings || {}), confirmationsTo: next.trim() })
      setList(l => ({ ...l, settings: d.settings }))
      setPo(x => (!x.confirmationsTo || x.confirmationsTo === old) ? { ...x, confirmationsTo: d.settings.confirmationsTo } : x)
      setMsg(`The default for order confirmations is now ${d.settings.confirmationsTo || 'blank'}.`)
    } catch (e) { setErr(e.message) }
  }
  async function discard() {
    if (!window.confirm('Delete this draft purchase order?')) return
    setBusy(true); setErr(''); try { await call({ action: 'discard', id: po.id }); router.replace('/operations/purchasing/purchase-orders') } catch (e) { setErr(e.message); setBusy(false) }
  }
  async function cancel() {
    const reason = window.prompt(`Cancel ${po.number}? It comes off Deliveries. Reason (optional):`, '')
    if (reason === null) return
    setBusy(true); setErr(''); try { const d = await call({ action: 'cancel', id: po.id, reason }); setPo(d.po); setMsg(`${po.number} cancelled.`) } catch (e) { setErr(e.message) } setBusy(false)
  }
  if (!po) return <OperationsShell active="purchasing:pos" section="purchasing" title="Purchase order" wide><div style={{ padding: 14, color: err ? '#b42318' : '#aaa' }}>{err || 'Loading…'}</div></OperationsShell>
  const st = PO_STATUS[po.status] || null
  return (
    <OperationsShell active="purchasing:pos" section="purchasing" title={isNew ? 'New purchase order' : po.number || 'Draft purchase order'} wide>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <a href="/operations/purchasing/purchase-orders" style={{ fontSize: 12.5, color: '#0f766e' }}>‹ Purchase orders</a>
        <h1 style={{ fontSize: 20, margin: 0 }}>{isNew ? 'New purchase order' : po.number || 'Draft purchase order'}</h1>
        {st && <span style={{ fontSize: 12, fontWeight: 700, color: st[1] }}>{st[0]}</span>}
        <span style={{ flex: 1 }} />
        {!isNew && po.status !== 'cancelled' && po.status !== 'draft' && <button onClick={() => { navigator.clipboard && navigator.clipboard.writeText(link); setMsg('The supplier\'s link is copied.') }} style={btn}>Copy supplier link</button>}
        {!isNew && po.status !== 'cancelled' && po.status !== 'draft' && <button onClick={() => setSending(true)} disabled={busy} style={primary}>{po.status === 'sent' ? 'Send again' : 'Send to supplier'}</button>}
        {!isNew && po.status !== 'cancelled' && po.status !== 'draft' && <button onClick={cancel} disabled={busy} style={{ ...btn, color: '#b42318', borderColor: '#f5c2c2' }}>Cancel PO</button>}
      </div>
      {err && <div style={{ color: '#b42318', fontSize: 13, marginBottom: 8 }}>{err}</div>}
      {msg && <div style={{ color: '#0f766e', fontSize: 13, marginBottom: 8 }}>{msg}</div>}
      {po.status === 'sent' && <div style={{ ...card, background: '#f0fdfa', borderColor: '#99f6e4', fontSize: 13 }}>Sent to {po.sentTo} on {new Date(po.sentAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} - it stands as sent. Cancel it and raise a new one to change it.</div>}
      {po.status === 'cancelled' && <div style={{ ...card, background: '#f6f6f4', fontSize: 13 }}>Cancelled {po.cancelledBy ? `by ${po.cancelledBy}` : ''}{po.cancelReason ? ` - ${po.cancelReason}` : ''}.</div>}
      <fieldset disabled={!editable} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
        <div style={{ ...card, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ ...label, flex: '2 1 280px' }}>Project
            <select value={po.projectId} onChange={e => { const p = (projects || []).find(x => x.id === e.target.value); setPo(x => ({ ...x, projectId: p ? p.id : '', jobNo: p ? p.jobNo : '', projectName: p ? p.name : '' })); if (p) fillAddress(p) }} style={inp}>
              <option value="">{projects ? '— choose the project —' : 'Loading projects…'}</option>
              {po.projectId && !(projects || []).some(p => p.id === po.projectId) && <option value={po.projectId}>{po.jobNo} {po.projectName}</option>}
              {(projects || []).map(p => <option key={p.id} value={p.id}>{p.jobNo} {p.name}</option>)}
            </select></label>
          <label style={{ ...label, flex: '1 1 220px' }}>Supplier (linked to Xero)
            <select value={po.supplier} onChange={e => set('supplier', e.target.value)} style={inp}>
              <option value="">— choose the supplier —</option>
              {((list && list.suppliers) || []).map(s => <option key={s.name} value={s.name}>{s.name}{s.contactName && s.contactName !== s.name ? ` (${s.contactName})` : ''}</option>)}
            </select></label>
          <label style={{ ...label, flex: '0 1 170px' }}>Delivery required<input type="date" value={po.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} style={inp} /></label>
        </div>
        <div style={card}>
          <strong style={{ fontSize: 14 }}>Lines</strong>
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 8 }}>
            <thead><tr>{['Item', 'Code', 'Qty', 'Unit', 'Price (ex VAT)', 'Total', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 2 && i <= 5 && i !== 3 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {!po.lines.length && <tr><td colSpan={7} style={{ ...td, color: '#aaa' }}>No lines yet - add products below, or a free line.</td></tr>}
              {po.lines.map((l, i) => <tr key={i}>
                <td style={td}><input value={l.description} onChange={e => setLine(i, 'description', e.target.value)} style={{ ...inp, width: '100%' }} /></td>
                <td style={{ ...td, width: 120 }}><input value={l.code} onChange={e => setLine(i, 'code', e.target.value)} style={{ ...inp, width: '100%' }} /></td>
                <td style={{ ...td, width: 80 }}><input data-qty="1" type="number" min="0" step="any" value={l.qty} placeholder="Qty" onChange={e => setLine(i, 'qty', e.target.value)} title={Number(l.qty) > 0 ? '' : 'Type the quantity'} style={{ ...inp, width: '100%', textAlign: 'right', ...(Number(l.qty) > 0 ? {} : { borderColor: '#dc2626', background: '#fef2f2' }) }} /></td>
                <td style={{ ...td, width: 90 }}><input value={l.unit} onChange={e => setLine(i, 'unit', e.target.value)} style={{ ...inp, width: '100%' }} /></td>
                <td style={{ ...td, width: 110 }}><input type="number" min="0" step="any" value={l.price} onChange={e => setLine(i, 'price', e.target.value)} style={{ ...inp, width: '100%', textAlign: 'right' }} /></td>
                <td style={{ ...td, width: 100, textAlign: 'right', fontWeight: 600 }}>{money(lineTotal(l))}</td>
                <td style={{ ...td, width: 30 }}>{editable && <button onClick={() => setPo(x => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))} title="Remove" style={{ border: 'none', background: 'none', color: '#b42318', cursor: 'pointer', fontSize: 15 }}>×</button>}</td>
              </tr>)}
              <tr><td colSpan={5} style={{ ...td, textAlign: 'right', fontWeight: 700, borderBottom: 'none' }}>Total (ex VAT)</td><td style={{ ...td, textAlign: 'right', fontWeight: 700, borderBottom: 'none' }}>{money(poTotal(po))}</td><td style={{ ...td, borderBottom: 'none' }} /></tr>
            </tbody>
          </table>
          {editable && <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={pq} onChange={e => setPq(e.target.value)} disabled={!po.supplier} placeholder={po.supplier ? `Search ${po.supplier}'s products on the price list…` : 'Choose the supplier to add their products'} style={{ ...inp, flex: 1 }} />
              <button onClick={() => { setPo(x => ({ ...x, lines: [...x.lines, { ref: null, code: '', description: '', qty: '', unit: '', price: 0 }] })); focusLastQty() }} style={btn}>+ Free line</button>
            </div>
            {po.supplier && pq.trim() && <div style={{ border: '1px solid #f0efec', borderRadius: 8, marginTop: 6, maxHeight: 260, overflowY: 'auto' }}>
              {!found.length ? <div style={{ padding: 10, color: '#aaa', fontSize: 13 }}>No product matches.</div> : found.map(p => (
                <div key={p.ref} onClick={() => addProduct(p)} title="Add to the PO" onMouseEnter={e => { e.currentTarget.style.background = '#f0fdfa' }} onMouseLeave={e => { e.currentTarget.style.background = '' }}
                  style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid #f4f3f0', fontSize: 13, cursor: 'pointer' }}>
                  <span style={{ flex: 1, color: '#0f766e' }}>{p.description} <span style={{ color: '#999', fontSize: 11.5 }}>{[p.code, p.ref].filter(Boolean).join(' · ')}</span></span>
                  <span style={{ color: '#555' }}>{p.price != null ? `${money(p.price)}${p.unit ? ` / ${p.unit}` : ''}` : 'no price'}</span>
                </div>))}
            </div>}
          </div>}
        </div>
        {/* ATTACHMENTS (1202) - drawings, specifications, schedules: attached to the email and on the supplier's page */}
        <div style={card}>
          {isNew ? <><strong style={{ fontSize: 14 }}>Attachments</strong><div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Save it as a draft (or raise it) to attach drawings, specifications or schedules - they go with the email to the supplier.</div></>
            : <DocumentsPanel ownerType="po" ownerId={po.id} title="Attachments" hint="drawings, specifications, schedules - attached to the email to the supplier" readOnly={po.status !== 'approved' && po.status !== 'draft'} />}
        </div>
        {/* DELIVERY DETAILS (1200) */}
        <div style={card}>
          <strong style={{ fontSize: 14 }}>Delivery details</strong>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <label style={{ ...label, flex: '1 1 320px' }}>Deliver to <span style={{ color: '#999' }}>(from Project Details - can be changed)</span><textarea value={po.deliveryAddress} onChange={e => set('deliveryAddress', e.target.value)} rows={3} placeholder="Site address" style={{ ...inp, resize: 'vertical' }} /></label>
            <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <YesNo label="Is Moffett offload required?" value={po.moffett} onChange={v => set('moffett', v)} />
              <YesNo label="Are artics permitted?" value={po.artics} onChange={v => set('artics', v)} />
            </div>
          </div>
          <label style={{ ...label, marginTop: 10 }}>Any special access routes?<textarea value={po.accessRoutes} onChange={e => set('accessRoutes', e.target.value)} rows={2} placeholder="e.g. Access via the rear service road only - height barrier 3.2m" style={{ ...inp, resize: 'vertical' }} /></label>
          <div style={{ marginTop: 8 }}>{isNew ? <div style={{ fontSize: 12, color: '#888' }}>Raise the PO to attach documents (access plans, route maps) - the supplier opens them from their link.</div>
            : <DocumentsPanel ownerType="po-access" ownerId={po.id} title="Access route documents" hint="attached to the email to the supplier" readOnly={po.status !== 'approved' && po.status !== 'draft'} />}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
            <div style={{ ...label, flex: '1 1 300px' }}>Site contact
              <ContactSearch people={people} value={po.siteContact} onChange={v => set('siteContact', v)} /></div>
            <div style={{ ...label, flex: '1 1 260px' }}>
              <span style={{ display: 'flex', alignItems: 'center' }}>Order confirmations sent to{list && list.canSettings && <button type="button" onClick={changeDefault} title="Change the company's default address for order confirmations" style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#0f766e', textDecoration: 'underline', cursor: 'pointer', fontSize: 11.5, padding: 0 }}>Change default</button>}</span>
              <input value={po.confirmationsTo} onChange={e => set('confirmationsTo', e.target.value)} placeholder="orders@yourcompany.co.uk" style={inp} /></div>
          </div>
          <label style={{ ...label, marginTop: 10 }}>Additional notes<textarea value={po.notes} onChange={e => set('notes', e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} /></label>
        </div>
      </fieldset>
      {editable && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
        {missing.length > 0 && <span style={{ fontSize: 12, color: '#b45309', alignSelf: 'center' }}>To {isDraft ? 'raise it' : 'save'}: {missing.join(', ')}</span>}
        {!isNew && po.status === 'draft' && <button onClick={discard} disabled={busy} style={{ ...btn, color: '#b42318', borderColor: '#f5c2c2' }}>Delete draft</button>}
        {isDraft && <button onClick={() => save('draft')} disabled={busy} style={btn}>{isNew ? 'Save as draft' : 'Save draft'}</button>}
        <button onClick={() => save(isDraft ? 'raise' : 'update')} disabled={busy || missing.length > 0} style={{ ...primary, opacity: missing.length ? 0.5 : 1 }}>{isDraft ? 'Raise purchase order' : 'Save changes'}</button>
      </div>}
      {!isNew && (po.history || []).length > 0 && <div style={{ ...card, fontSize: 12.5, color: '#555' }}><strong style={{ fontSize: 13, color: '#333' }}>History</strong>
        {(po.history || []).slice().reverse().map((h, i) => <div key={i} style={{ marginTop: 4 }}>{new Date(h.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {h.by} · {h.what}</div>)}</div>}
      {sending && <SendBox po={po} onClose={() => setSending(false)} onSent={(p) => { setSending(false); setPo(p); setMsg(`${p.number} emailed to ${p.sentTo}.`) }} />}
    </OperationsShell>
  )
}

function SendBox({ po, onClose, onSent }) {
  const [to, setTo] = useState(po.to || '')
  const [message, setMessage] = useState('')
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  async function send() { setBusy(true); setErr(''); try { const d = await call({ action: 'send', id: po.id, to, message }); onSent(d.po) } catch (e) { setErr(e.message); setBusy(false) } }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 20px' }} onMouseDown={ev => { if (ev.target === ev.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 540, padding: 18 }}>
        <strong style={{ fontSize: 16 }}>Send {po.number} to {po.contactName || po.supplier}</strong>
        <div style={{ fontSize: 12.5, color: '#666', margin: '6px 0 12px' }}>The supplier gets the PO in the email and a link to view or print it - no login. Their replies come to you.</div>
        <label style={label}>Supplier's email<input value={to} onChange={e => setTo(e.target.value)} placeholder="orders@supplier.co.uk" style={inp} /></label>
        <label style={{ ...label, marginTop: 10 }}>Message (optional)<textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} /></label>
        {err && <div style={{ color: '#b42318', fontSize: 13, marginTop: 8 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}><button onClick={onClose} style={btn}>Cancel</button><button onClick={send} disabled={busy} style={primary}>{busy ? 'Sending…' : 'Send'}</button></div>
      </div>
    </div>
  )
}

function YesNo({ label, value, onChange }) {
  const opt = (v, t) => <button type="button" onClick={() => onChange(v)} style={{ fontSize: 12.5, padding: '5px 14px', border: `1px solid ${value === v ? '#0f766e' : '#d4d4d0'}`, background: value === v ? '#0f766e' : '#fff', color: value === v ? '#fff' : '#333', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}>{t}</button>
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: value ? '#333' : '#b45309' }}><span style={{ flex: 1 }}>{label}</span>{opt('yes', 'Yes')}{opt('no', 'No')}</div>
}

// SITE CONTACT - type to search operatives and portal users (1202)
function ContactSearch({ people, value, onChange }) {
  const [q, setQ] = useState(null)       // null = not searching (shows the chosen contact)
  const shown = value && value.name ? `${value.name}${value.phone ? ` - ${value.phone}` : ''}` : ''
  const words = String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const found = q === null ? [] : people.filter(p => words.every(w => `${p.name} ${p.phone} ${p.kind}`.toLowerCase().includes(w))).slice(0, 12)
  const pick = (p) => { onChange({ name: p.name, phone: p.phone || '' }); setQ(null) }
  return (
    <div style={{ position: 'relative' }}>
      <input value={q === null ? shown : q} placeholder="Type a name or number…" onFocus={() => setQ('')} onChange={e => setQ(e.target.value)}
        onBlur={() => setTimeout(() => setQ(null), 150)} onKeyDown={e => { if (e.key === 'Enter' && found[0]) { e.preventDefault(); pick(found[0]) } if (e.key === 'Escape') setQ(null) }}
        style={{ ...inp, width: '100%' }} />
      {q !== null && <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 2, background: '#fff', border: '1px solid #d4d4d0', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.08)', maxHeight: 260, overflowY: 'auto' }}>
        {!found.length ? <div style={{ padding: '8px 10px', fontSize: 12.5, color: '#aaa' }}>No one matches</div> : found.map((p, i) => (
          <div key={i} onMouseDown={e => { e.preventDefault(); pick(p) }} style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #f4f3f0', display: 'flex', gap: 8 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f0fdfa' }} onMouseLeave={e => { e.currentTarget.style.background = '' }}>
            <span style={{ flex: 1 }}>{p.name}</span><span style={{ color: p.phone ? '#555' : '#b45309' }}>{p.phone || 'no mobile on record'}</span><span style={{ color: '#999', fontSize: 11.5 }}>{p.kind}</span>
          </div>))}
      </div>}
    </div>
  )
}
