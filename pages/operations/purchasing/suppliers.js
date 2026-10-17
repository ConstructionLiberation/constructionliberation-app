import { useEffect, useMemo, useState } from 'react'
import OperationsShell from '../../../components/OperationsShell'

// SUPPLIERS (1198) - each price-list supplier linked to its Xero contact(s), so a
// purchase order, the supplier's bill and the supplier always line up; and, for
// the bookkeeper, how Dext should publish each supplier's invoices.
const API = '/api/suppliers'
const call = async (body) => { const r = await fetch(API, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Something went wrong'); return d }
const th = { textAlign: 'left', padding: '8px 10px', fontSize: 11.5, color: '#666', fontWeight: 600, borderBottom: '1px solid #e8e7e3', background: '#faf9f7', whiteSpace: 'nowrap' }
const td = { padding: '9px 10px', borderBottom: '1px solid #f1f0ec', fontSize: 13, verticalAlign: 'top' }
const btn = { fontSize: 12.5, padding: '5px 11px', border: '1px solid #d4d4d0', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }
const chip = { display: 'inline-block', fontSize: 12, padding: '3px 9px', borderRadius: 12, border: '1px solid #d4d4d0', background: '#fff', marginRight: 6, marginBottom: 4 }

export default function SuppliersPage() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(''), [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [show, setShow] = useState('all')       // all | unlinked | dext
  const [picking, setPicking] = useState(null)  // a supplier being linked by hand
  const load = () => call().then(setData).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])
  const act = async (key, body, note) => { setBusy(key); setErr(''); setMsg(''); try { const d = await call(body); if (d.notConnected) setMsg(d.message); else if (note) setMsg(typeof note === 'function' ? note(d) : note); await load() } catch (e) { setErr(e.message) } setBusy('') }
  const list = data ? data.suppliers : []
  const unlinked = list.filter(s => !(s.link && s.link.contacts && s.link.contacts.length))
  const others = data ? (data.others || []) : []
  const toDext = list.filter(s => !(s.link && s.link.dextSet))
  const othersToDext = others.filter(o => !o.dextSet)
  const shown = show === 'unlinked' ? unlinked : show === 'dext' ? toDext : list
  return (
    <OperationsShell active="purchasing:suppliers" section="purchasing" title="Suppliers" wide>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Suppliers</h1>
        <span style={{ fontSize: 13, color: '#666' }}>Each price-list supplier linked to its supplier contact in Xero - so a PO, the supplier's bill and the supplier always line up.</span>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0 12px' }}>
        {[['all', `All (${list.length})`], ['unlinked', `Not linked to Xero (${unlinked.length})`], ['dext', `To change in Dext (${toDext.length + othersToDext.length})`]].map(([k, l]) =>
          <button key={k} onClick={() => setShow(k)} style={{ ...btn, background: show === k ? '#0f766e' : '#fff', color: show === k ? '#fff' : '#333', borderColor: show === k ? '#0f766e' : '#d4d4d0' }}>{l}</button>)}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#888' }}>{data && (data.contactsAt ? `Xero contacts read ${new Date(data.contactsAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${data.contacts.length}` : 'Xero contacts not read yet')}</span>
        <button onClick={() => act('refresh', { action: 'refresh' }, d => `Read ${d.count} contacts from Xero.`)} disabled={busy === 'refresh'} style={btn}>{busy === 'refresh' ? 'Reading Xero…' : 'Refresh from Xero'}</button>
      </div>
      {err && <div style={{ color: '#b42318', fontSize: 13, marginBottom: 8 }}>{err}</div>}
      {msg && <div style={{ color: '#0f766e', fontSize: 13, marginBottom: 8 }}>{msg}</div>}
      {data && !data.contactsAt && <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>Read your contacts from Xero first ("Refresh from Xero") - then each supplier shows its closest Xero contacts to link.</div>}
      <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, overflow: 'auto' }}>
        {!data ? <div style={{ padding: 14, color: '#aaa' }}>Loading…</div> : !shown.length ? <div style={{ padding: 14, color: '#aaa', fontSize: 13 }}>{list.length ? 'Nothing here.' : 'No suppliers on the price list yet.'}</div> : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>{['Supplier (price list)', 'Xero contact', 'We raise POs with them', 'Dext should publish as', 'Set in Dext'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{shown.map(s => { const linked = s.link && s.link.contacts && s.link.contacts.length; const k = s.name
              return <tr key={k}>
                <td style={td}><div style={{ fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 11.5, color: '#888' }}>{s.products} product{s.products === 1 ? '' : 's'}</div></td>
                <td style={td}>
                  {linked ? <div>{s.link.contacts.map(c => <span key={c.id} style={{ ...chip, borderColor: c.id === s.link.main ? '#0f766e' : '#d4d4d0' }}>{c.name}{c.id === s.link.main && s.link.contacts.length > 1 ? <span style={{ color: '#0f766e', fontWeight: 600 }}> · main</span> : ''}</span>)}
                      <button onClick={() => setPicking(s)} style={{ ...btn, fontSize: 12, padding: '3px 9px' }}>Change</button></div>
                    : <div>{s.suggestions.length ? s.suggestions.map(c => <button key={c.id} onClick={() => act(k, { action: 'link', supplier: k, contactIds: [c.id], main: c.id }, `${k} linked to ${c.name}.`)} disabled={busy === k} title="Link to this Xero contact" style={{ ...chip, cursor: 'pointer', borderColor: '#99f6e4', color: '#0f766e' }}>Link to {c.name}</button>)
                      : <span style={{ fontSize: 12, color: '#b45309', marginRight: 8 }}>No close match in Xero</span>}
                      <button onClick={() => setPicking(s)} disabled={!data.contacts.length} style={{ ...btn, fontSize: 12, padding: '3px 9px' }}>Choose…</button></div>}
                </td>
                <td style={td}><label style={{ fontSize: 12.5, display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!s.link || s.link.po !== false} disabled={busy === k} onChange={e => act(k, { action: 'po', supplier: k, po: e.target.checked })} /> Yes</label></td>
                <td style={{ ...td, fontWeight: 600, color: s.dextShould === 'Awaiting Approval' ? '#0f766e' : '#444' }}>{s.dextShould}</td>
                <td style={td}>{s.link && s.link.dextSet
                  ? <label style={{ fontSize: 12.5, display: 'inline-flex', gap: 6, alignItems: 'center', color: '#0f766e' }}><input type="checkbox" checked disabled={!data.canDext || busy === k} onChange={() => act(k, { action: 'dext', supplier: k, set: false })} /> Set{s.link.dextSetBy ? <span style={{ color: '#888' }}> · {s.link.dextSetBy}</span> : ''}</label>
                  : <label style={{ fontSize: 12.5, display: 'inline-flex', gap: 6, alignItems: 'center', color: '#b45309', fontWeight: 600 }}><input type="checkbox" checked={false} disabled={!data.canDext || busy === k} onChange={() => act(k, { action: 'dext', supplier: k, set: true })} title={data.canDext ? 'Tick once its Dext rule publishes as shown' : 'The bookkeeper ticks this'} /> To change in Dext</label>}</td>
              </tr> })}</tbody>
          </table>)}
      </div>
      {/* OTHER SUPPLIERS WE RAISE POs WITH - not on the price list (1207) */}
      {data && (show === 'dext' ? othersToDext : others).length > 0 && (show !== 'unlinked') && <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Other suppliers we raise POs with</div>
        <div style={{ fontSize: 12.5, color: '#666', marginBottom: 8 }}>Xero contacts on purchase orders that are not on the price list. Their invoices need the same Dext rule, so they come to the app to be matched.</div>
        <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>{['Xero contact', 'Purchase orders', 'Dext should publish as', 'Set in Dext'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{(show === 'dext' ? othersToDext : others).map(o => <tr key={o.contactId}>
              <td style={{ ...td, fontWeight: 600 }}>{o.name}</td>
              <td style={td}>{o.pos}</td>
              <td style={{ ...td, fontWeight: 600, color: '#0f766e' }}>{o.dextShould}</td>
              <td style={td}>{o.dextSet
                ? <label style={{ fontSize: 12.5, display: 'inline-flex', gap: 6, alignItems: 'center', color: '#0f766e' }}><input type="checkbox" checked disabled={!data.canDext || busy === o.contactId} onChange={() => act(o.contactId, { action: 'dext-contact', contactId: o.contactId, set: false })} /> Set{o.dextSetBy ? <span style={{ color: '#888' }}> · {o.dextSetBy}</span> : ''}</label>
                : <label style={{ fontSize: 12.5, display: 'inline-flex', gap: 6, alignItems: 'center', color: '#b45309', fontWeight: 600 }}><input type="checkbox" checked={false} disabled={!data.canDext || busy === o.contactId} onChange={() => act(o.contactId, { action: 'dext-contact', contactId: o.contactId, set: true })} /> To change in Dext</label>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>}
      {picking && <Picker supplier={picking} contacts={data.contacts} onClose={() => setPicking(null)}
        onSave={(ids, main) => { setPicking(null); act(picking.name, { action: 'link', supplier: picking.name, contactIds: ids, main }, `${picking.name} linked.`) }}
        onUnlink={() => { setPicking(null); act(picking.name, { action: 'unlink', supplier: picking.name }, `${picking.name} unlinked.`) }} />}
    </OperationsShell>
  )
}

// CHOOSE XERO CONTACTS - one or several (duplicates in Xero); one is the main contact for POs
function Picker({ supplier, contacts, onClose, onSave, onUnlink }) {
  const start = (supplier.link && supplier.link.contacts) || []
  const [ids, setIds] = useState(start.map(c => c.id))
  const [main, setMain] = useState((supplier.link && supplier.link.main) || (start[0] && start[0].id) || null)
  const [q, setQ] = useState(supplier.name)
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const found = useMemo(() => contacts.filter(c => ids.includes(c.id) || words.every(w => c.name.toLowerCase().includes(w))).sort((a, b) => (ids.includes(b.id) - ids.includes(a.id)) || (b.supplier - a.supplier) || a.name.localeCompare(b.name)).slice(0, 80), [contacts, q, ids])
  const toggle = (id) => setIds(cur => { const n = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]; if (!n.includes(main)) setMain(n[0] || null); return n })
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '50px 20px' }} onMouseDown={ev => { if (ev.target === ev.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 620, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}><strong style={{ fontSize: 16 }}>Xero contact for {supplier.name}</strong><span style={{ flex: 1 }} /><button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button></div>
        <div style={{ fontSize: 12.5, color: '#666', marginBottom: 8 }}>Tick every Xero contact that is this supplier (duplicates too). The <strong>main</strong> one is used for purchase orders; a bill on any of them counts as this supplier's.</div>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search Xero contacts…" style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '7px 10px', border: '1px solid #d4d4d0', borderRadius: 8, marginBottom: 8 }} />
        <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid #f0efec', borderRadius: 8 }}>
          {!found.length ? <div style={{ padding: 12, color: '#aaa', fontSize: 13 }}>No contact matches - add the supplier in Xero first, then "Refresh from Xero".</div> : found.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderBottom: '1px solid #f4f3f0', fontSize: 13 }}>
              <input type="checkbox" checked={ids.includes(c.id)} onChange={() => toggle(c.id)} />
              <span style={{ flex: 1 }}>{c.name}{!c.supplier ? <span style={{ fontSize: 11, color: '#999' }}> · not yet a supplier in Xero</span> : ''}</span>
              {ids.includes(c.id) && <label style={{ fontSize: 12, color: '#0f766e', display: 'inline-flex', gap: 4, alignItems: 'center' }}><input type="radio" checked={main === c.id} onChange={() => setMain(c.id)} /> main</label>}
            </div>))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          {supplier.link && <button onClick={onUnlink} style={{ ...btn, color: '#b42318', borderColor: '#f5c2c2' }}>Unlink</button>}
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={btn}>Cancel</button>
          <button onClick={() => onSave(ids, main)} disabled={!ids.length} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', fontWeight: 600, opacity: ids.length ? 1 : 0.5 }}>Save</button>
        </div>
      </div>
    </div>
  )
}
