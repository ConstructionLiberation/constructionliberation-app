import { useEffect, useMemo, useState } from 'react'
import OperationsShell from '../../../components/OperationsShell'

// BILLS TO CHECK (1240) - every supplier bill in Xero against the purchase orders. See
// lib/billsCheck.js for how each is sorted (the same matching rule as committed costs).
const INK = '#1a1a19'
const TABS = [
  ['queries', 'Queries', '#b45309'],   // (1242) bills with a query open or answered
  ['over', 'Over the PO', '#b42318'], ['noPo', 'No PO number', '#b45309'], ['cancelled', 'PO cancelled', '#b42318'],
  ['matched', 'Matched', '#166534'], ['noPoNeeded', 'No PO needed', '#555'], ['other', 'Other suppliers', '#555'],
]
const NOTE = {
  over: 'The PO\'s bills, all together ex VAT, are more than its value - check the price or quantities with the supplier.',
  noPo: 'From a supplier you raise POs with, but no PO number found on the bill. Link it to its PO, or mark it as not needing one.',
  cancelled: 'These bills quote a PO that was cancelled.',
  matched: 'The PO number is on the bill (or it was linked by hand) and the PO is not over-billed.',
  noPoNeeded: 'Marked as not needing a purchase order.',
  queries: 'Bills with a query to the supplier still open - waiting for them, or they have replied. Click the query button on a bill to see the conversation.',
  other: 'From suppliers you have never raised a purchase order with (utilities, rent, subcontractors...). Nothing to do - but if one belongs to a PO (a supplier billing under a different Xero contact, say), link it.',
}
const th = { textAlign: 'left', padding: '7px 8px', fontSize: 12, color: '#666', fontWeight: 600, borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }
const td = { padding: '7px 8px', fontSize: 13, borderBottom: '1px solid #f4f3f0', verticalAlign: 'top' }
const btn = { fontSize: 12.5, padding: '4px 10px', border: '1px solid #d4d4d0', background: '#fff', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }
const money = (n) => n == null ? '-' : `£${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dmy = (d) => d ? String(d).split('-').reverse().join('/') : '-'

export default function BillsToCheck() {
  const [d, setD] = useState(null), [tab, setTab] = useState(null), [busy, setBusy] = useState(''), [err, setErr] = useState('')
  const [open, setOpen] = useState(null), [linking, setLinking] = useState(null), [showSet, setShowSet] = useState(false)
  const [querying, setQuerying] = useState(null)   // the bill whose query window is open (1242)
  const call = async (body) => {
    setErr('')
    const r = await fetch('/api/bills-check', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
    const x = await r.json(); if (!r.ok) throw new Error(x.error || 'Something went wrong'); return x
  }
  const load = async () => { try { const x = await call(); setD(x); setTab(t => t || (TABS.find(([k]) => k !== 'matched' && k !== 'noPoNeeded' && k !== 'other' && (x.groups[k] || []).length) || ['matched'])[0]) } catch (e) { setErr(e.message) } }
  useEffect(() => { load() }, [])
  const act = async (body, label) => { setBusy(label); try { setD(await call(body)) } catch (e) { setErr(e.message) } setBusy('') }
  const rows = d && tab ? (d.groups[tab] || []) : []
  return (
    <OperationsShell active="purchasing:bills" section="purchasing" title="Bills to Check" wide>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, margin: 0, color: INK }}>Bills to Check</h1>
        <span style={{ fontSize: 12.5, color: '#888' }}>{d ? (d.at ? `Supplier bills from Xero since ${dmy(d.from)} - read ${new Date(d.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not read from Xero yet') : 'Loading...'}</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setShowSet(v => !v)} style={btn}>Settings</button>
        <button onClick={() => act({ action: 'refresh' }, 'refresh')} disabled={!!busy} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', fontWeight: 600 }}>{busy === 'refresh' ? 'Reading Xero...' : 'Refresh from Xero'}</button>
      </div>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>Every supplier bill against your purchase orders - the same matching as committed costs, so a bill linked here counts against its PO everywhere.</div>
      {err && <div style={{ background: '#fef2f2', color: '#b42318', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {showSet && d && <Settings settings={d.settings} onSave={(s) => { act({ action: 'settings', ...s }, 'settings'); setShowSet(false) }} />}
      {d && <>
        {/* WHAT WAS READ, AND WHERE IT WENT (1241) - so an empty tab is never mistaken for nothing read */}
        {d.at && <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 10, padding: '9px 12px', fontSize: 13, marginBottom: 10, color: '#333' }}>
          {d.total === 0
            ? <><strong>Xero returned no supplier bills dated from {dmy(d.from)}.</strong> If there should be some, set an earlier date in Settings and Refresh from Xero.</>
            : <>Read <strong>{d.total} bill{d.total === 1 ? '' : 's'}</strong> from Xero dated from {dmy(d.from)}: <strong>{(d.groups.matched.length + d.groups.over.length + d.groups.cancelled.length)}</strong> match a PO, <strong>{d.groups.noPo.length}</strong> from your PO suppliers have no PO number, <strong>{d.groups.noPoNeeded.length}</strong> marked no PO needed, and <strong>{d.groups.other.length}</strong> {d.groups.other.length === 1 ? 'is' : 'are'} from suppliers you have never raised a PO with ({d.poSuppliers} supplier{d.poSuppliers === 1 ? '' : 's'} on your POs so far).</>}
          {d.stats && d.stats.skipped > 0 && <span style={{ color: '#888' }}> {d.stats.skipped} deleted or voided in Xero left out.</span>}
        </div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {TABS.map(([k, label, colour]) => { const n = (d.groups[k] || []).length; const on = tab === k
            return <button key={k} onClick={() => { setTab(k); setOpen(null); setLinking(null) }} style={{ ...btn, padding: '6px 12px', fontSize: 13, background: on ? INK : '#fff', color: on ? '#fff' : INK, borderColor: on ? INK : '#d4d4d0' }}>
              {label} <span style={{ marginLeft: 4, fontWeight: 700, color: on ? '#fff' : (n && k !== 'matched' && k !== 'noPoNeeded' ? colour : '#999') }}>{n}</span></button> })}
        </div>
        <div style={{ fontSize: 12.5, color: '#666', marginBottom: 8 }}>{NOTE[tab]}</div>
        <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, overflowX: 'auto' }}>
          {!rows.length ? <div style={{ padding: 22, fontSize: 13, color: '#999', textAlign: 'center' }}>{d.at ? 'None.' : 'Press Refresh from Xero to read the bills.'}</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Date', 'Supplier', 'Bill / reference', 'Project', 'Net', 'Total', 'Xero', 'Purchase order', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 4 || i === 5 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>{rows.map(b => <BillRow key={b.id} b={b} tab={tab} pos={d.pos} open={open === b.id} onOpen={() => setOpen(o => o === b.id ? null : b.id)} linking={linking === b.id} setLinking={(v) => setLinking(v ? b.id : null)} busy={busy} act={act} onQuery={() => setQuerying(b.id)} />)}</tbody>
            </table>)}
        </div>
        {querying && <QueryWindow b={Object.values(d.groups).flat().find(x => x.id === querying)} onClose={() => setQuerying(null)} onChange={setD} />}
      </>}
    </OperationsShell>
  )
}

function BillRow({ b, tab, pos, open, onOpen, linking, setLinking, busy, act, onQuery }) {
  const [poId, setPoId] = useState('')
  const options = useMemo(() => [...pos].sort((x, y) => (y.contactId === b.contactId) - (x.contactId === b.contactId) || String(y.number).localeCompare(String(x.number))), [pos, b.contactId])
  return <>
    <tr style={{ cursor: 'pointer', background: open ? '#fafaf8' : undefined }} onClick={onOpen}>
      <td style={{ ...td, whiteSpace: 'nowrap' }}>{dmy(b.date)}</td>
      <td style={td}>{b.contactName}</td>
      <td style={td}><strong>{b.number || '-'}</strong>{b.reference ? <div style={{ fontSize: 11.5, color: '#888' }}>{b.reference}</div> : null}</td>
      <td style={{ ...td, fontSize: 12.5, color: '#555' }}>{b.project || (b.po && [b.po.jobNo, b.po.projectName].filter(Boolean).join(' ')) || '-'}</td>
      <td style={{ ...td, textAlign: 'right' }}>{money(b.subTotal)}</td>
      <td style={{ ...td, textAlign: 'right' }}>{money(b.total)}</td>
      <td style={{ ...td, fontSize: 12 }}>{b.status === 'PAID' ? 'Paid' : b.status === 'AUTHORISED' ? (b.amountDue > 0 ? 'Awaiting payment' : 'Authorised') : b.status === 'DRAFT' ? 'Draft' : b.status === 'SUBMITTED' ? 'Awaiting approval' : b.status}</td>
      <td style={td}>{b.po ? <>
          <a href={`/operations/purchasing/po/${b.po.id}`} onClick={e => e.stopPropagation()} style={{ color: '#0f766e', fontWeight: 600 }}>{b.po.number}</a>
          <span style={{ fontSize: 11, color: '#999' }}> {b.how === 'linked' ? 'linked by hand' : 'quoted'}</span>
          {tab === 'over' && <div style={{ fontSize: 12, color: '#b42318', marginTop: 2 }}>PO {money(b.po.net)} - billed {money(b.po.billed)} - <strong>{money(b.po.over)} over</strong></div>}
        </> : tab === 'noPoNeeded' && b.noPo ? <span style={{ fontSize: 12, color: '#555' }}>{b.noPo.reason} <span style={{ color: '#999' }}>- {b.noPo.by}</span></span> : '-'}</td>
      <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
        {/* SUPPLIER QUERY (1242) - its state, or start one */}
        {b.query ? <button onClick={onQuery} style={{ ...btn, fontWeight: 600, color: b.query.status === 'answered' ? '#166534' : b.query.status === 'resolved' ? '#555' : '#b45309', borderColor: b.query.status === 'answered' ? '#86efac' : b.query.status === 'resolved' ? '#d4d4d0' : '#fcd34d', background: b.query.status === 'answered' ? '#f0fdf4' : b.query.status === 'resolved' ? '#fff' : '#fffbeb' }}>{b.query.status === 'answered' ? 'Supplier replied' : b.query.status === 'resolved' ? 'Query resolved' : 'Query open'}</button>
          : (tab !== 'other' && tab !== 'noPoNeeded' && <button onClick={onQuery} style={btn}>Query with supplier</button>)}{' '}
        {tab === 'other' && !linking && <button onClick={() => setLinking(true)} style={btn}>Link to PO</button>}
        {tab === 'noPo' && !linking && <>
          <button onClick={() => setLinking(true)} style={btn}>Link to PO</button>{' '}
          <button onClick={() => { const r = window.prompt('Why does this bill need no purchase order? (e.g. "Account payment", "Plant hire on account")'); if (r && r.trim()) act({ action: 'nopo', billId: b.id, reason: r }, b.id) }} style={btn}>No PO needed</button>
        </>}
        {b.how === 'linked' && <button onClick={() => act({ action: 'unlink', billId: b.id }, b.id)} disabled={busy === b.id} style={btn}>Unlink</button>}
        {tab === 'noPoNeeded' && <button onClick={() => act({ action: 'unnopo', billId: b.id }, b.id)} disabled={busy === b.id} style={btn}>Undo</button>}
      </td>
    </tr>
    {linking && <tr><td colSpan={9} style={{ ...td, background: '#f0fdfa' }} onClick={e => e.stopPropagation()}>
      <span style={{ fontSize: 13, marginRight: 8 }}>Link {b.number || 'this bill'} to</span>
      <select value={poId} onChange={e => setPoId(e.target.value)} style={{ fontSize: 13, padding: '5px 8px', border: '1px solid #d4d4d0', borderRadius: 7, minWidth: 380, fontFamily: 'inherit' }}>
        <option value="">- choose the purchase order -</option>
        {options.map(p => <option key={p.id} value={p.id}>{p.number} - {p.supplier}{p.contactId === b.contactId ? ' (this supplier)' : ''} - {[p.jobNo, p.projectName].filter(Boolean).join(' ')} - {money(p.net)} (billed {money(p.billed)})</option>)}
      </select>{' '}
      <button onClick={() => { if (poId) act({ action: 'link', billId: b.id, poId }, b.id).then(() => setLinking(false)) }} disabled={!poId || busy === b.id} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}>Link</button>{' '}
      <button onClick={() => setLinking(false)} style={btn}>Cancel</button>
    </td></tr>}
    {open && <tr><td colSpan={9} style={{ ...td, background: '#fafaf8' }}>
      {(b.lines || []).map((l, i) => <div key={i} style={{ display: 'flex', gap: 12, fontSize: 12.5, padding: '2px 0' }}><span style={{ flex: 1 }}>{l.description || '-'}</span><span style={{ color: '#888' }}>{l.tracking}</span><span style={{ minWidth: 90, textAlign: 'right' }}>{money(l.amount)}</span></div>)}
      {b.dueDate && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Due {dmy(b.dueDate)}{b.amountDue > 0 ? ` - ${money(b.amountDue)} still to pay` : ''}</div>}
    </td></tr>}
  </>
}

function Settings({ settings, onSave }) {
  const [s, setS] = useState({ fromDate: settings.fromDate || '', tolerancePct: settings.tolerancePct, toleranceAbs: settings.toleranceAbs, dextEmail: settings.dextEmail || '' })
  const box = { fontSize: 13, padding: '5px 8px', border: '1px solid #d4d4d0', borderRadius: 7, fontFamily: 'inherit' }
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
      <label>Bills from <input type="date" value={s.fromDate} onChange={e => setS({ ...s, fromDate: e.target.value })} style={box} /> <span style={{ color: '#999', fontSize: 12 }}>(blank = a fortnight before your first PO)</span></label>
      <label>Over the PO by more than <input type="number" min="0" step="0.5" value={s.tolerancePct} onChange={e => setS({ ...s, tolerancePct: e.target.value })} style={{ ...box, width: 60 }} /> % or £<input type="number" min="0" step="1" value={s.toleranceAbs} onChange={e => setS({ ...s, toleranceAbs: e.target.value })} style={{ ...box, width: 70 }} /> <span style={{ color: '#999', fontSize: 12 }}>whichever is larger</span></label>
      <label>Send suppliers' documents to Dext <input type="email" value={s.dextEmail} onChange={e => setS({ ...s, dextEmail: e.target.value })} placeholder="Dext forwarding email" style={{ ...box, width: 240 }} /> <span style={{ color: '#999', fontSize: 12 }}>(blank = off)</span></label>
      <button onClick={() => onSave(s)} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}>Save</button>
    </div>
  )
}

// THE QUERY WINDOW (1242): start a query with the supplier, or follow one - the conversation,
// documents, a reply, and Resolve / Reopen
function QueryWindow({ b, onClose, onChange }) {
  const q = b && b.query
  const suggested = () => {
    if (!b) return ''
    const what = b.po && b.po.over > 0 ? `Our purchase order ${b.po.number} is for ${money(b.po.net)} ex VAT, and invoices against it now total ${money(b.po.billed)} - ${money(b.po.over)} more than ordered. Please could you check this and send a credit note for the difference, or let us know what the extra is for.`
      : b.po && b.po.status === 'cancelled' ? `This invoice quotes purchase order ${b.po.number}, which was cancelled. Please could you check which order it is for.`
      : !b.po ? `This invoice does not quote one of our purchase order numbers. Please could you tell us which purchase order it is for - and quote it on future invoices.`
      : `We have a query on this invoice against purchase order ${b.po.number}.`
    return `Hello,\n\nRe your invoice ${b.number || b.reference || ''} dated ${dmy(b.date)} for ${money(b.total)} inc VAT.\n\n${what}`
  }
  const [to, setTo] = useState(q ? q.to : (b && b.supplierEmail) || ''), [text, setText] = useState(q ? '' : suggested())
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const post = async (body) => { setBusy(true); setErr(''); try { const r = await fetch('/api/bill-queries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ billId: b.id, ...body }) }); const x = await r.json(); if (!r.ok) throw new Error(x.error || 'Something went wrong'); onChange(x); setText('') } catch (e) { setErr(e.message) } setBusy(false) }
  if (!b) return null
  const box = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #d4d4d0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 2vw', overflowY: 'auto' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 760, padding: '16px 22px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 17, margin: 0, flex: 1 }}>{q ? 'Query' : 'Query with supplier'} - {b.contactName} {b.number}</h2>
          <button onClick={onClose} style={{ fontSize: 22, border: 'none', background: 'none', cursor: 'pointer', color: '#999' }}>×</button>
        </div>
        <div style={{ fontSize: 12.5, color: '#666', marginBottom: 10 }}>{dmy(b.date)} - {money(b.subTotal)} ex VAT, {money(b.total)} inc VAT{b.po ? ` - PO ${b.po.number} (${money(b.po.net)}, billed ${money(b.po.billed)})` : ' - no PO'}</div>
        {q && <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 10, marginBottom: 10, maxHeight: 360, overflowY: 'auto' }}>
          {(q.messages || []).map((m, i) => <div key={i} style={{ padding: '8px 10px', borderRadius: 8, marginBottom: 6, background: m.from === 'us' ? '#f4f4f2' : '#ecfdf5', marginLeft: m.from === 'us' ? 0 : 40, marginRight: m.from === 'us' ? 40 : 0 }}>
            <div style={{ fontSize: 11.5, color: '#777', marginBottom: 3 }}><strong>{m.from === 'us' ? (m.by || 'Us') : (m.by || b.contactName)}</strong> - {new Date(m.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{m.text}</div>
            {(m.files || []).map((f, j) => <a key={j} href={`/api/bill-queries?billId=${encodeURIComponent(b.id)}&i=${i}&j=${j}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', fontSize: 12.5, color: '#0f766e', marginTop: 4, marginRight: 10 }}>{f.name}</a>)}
          </div>)}
          <div style={{ fontSize: 12, color: '#888' }}>Sent to {q.to} - raised by {q.raisedBy}{q.status === 'resolved' ? ` - resolved by ${q.resolvedBy}` : ''}</div>
        </div>}
        {!q && <><div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>To</div>
          <input value={to} onChange={e => setTo(e.target.value)} placeholder="the supplier's email" style={{ ...box, marginBottom: 10 }} /></>}
        {(!q || q.status !== 'resolved') && <>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>{q ? 'Reply' : 'Message'}</div>
          <textarea value={text} onChange={e => setText(e.target.value)} style={{ ...box, minHeight: q ? 90 : 170, resize: 'vertical' }} />
          <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>{q ? 'Emailed to the supplier with their link.' : 'Sent from the notifications address with a link where the supplier can reply and attach a credit note - no account needed. Signed off with your name, email and phone; replies to the email come to you.'}</div>
        </>}
        {err && <div style={{ color: '#b42318', fontSize: 13, marginTop: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          {!q && <button onClick={() => post({ action: 'start', to, message: text })} disabled={busy || !to.trim() || !text.trim()} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', fontWeight: 600, opacity: (busy || !to.trim() || !text.trim()) ? 0.5 : 1 }}>{busy ? 'Sending...' : 'Send query'}</button>}
          {q && q.status !== 'resolved' && <button onClick={() => post({ action: 'reply', message: text })} disabled={busy || !text.trim()} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', fontWeight: 600, opacity: (busy || !text.trim()) ? 0.5 : 1 }}>{busy ? 'Sending...' : 'Send reply'}</button>}
          {q && q.status !== 'resolved' && <button onClick={() => post({ action: 'resolve' })} disabled={busy} style={{ ...btn, color: '#166534', borderColor: '#86efac' }}>Mark resolved</button>}
          {q && q.status === 'resolved' && <button onClick={() => post({ action: 'reopen' })} disabled={busy} style={btn}>Reopen</button>}
          <span style={{ flex: 1 }} /><button onClick={onClose} style={btn}>Close</button>
        </div>
      </div>
    </div>
  )
}
