import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { lineTotal } from '../lib/poShared'

// THE SUPPLIER'S PURCHASE ORDER (1199) - opened from the link in the PO email.
// No portal login: the signed token in the address names this one PO and the
// company. A clean, printable page on the company's letterhead.
const money = (n) => `£${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const yes = (v) => v === 'yes' ? 'Yes' : v === 'no' ? 'No' : null
const long = (s) => s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

export default function SupplierPo() {
  const router = useRouter()
  const { token } = router.query
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!token) return
    fetch(`/api/po-view?token=${encodeURIComponent(token)}`).then(r => r.json()).then(x => { if (x.error) setErr(x.error); else setD(x) }).catch(e => setErr(e.message || 'Could not load'))
  }, [token])
  const page = { maxWidth: 820, margin: '0 auto', padding: '28px 22px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#222', fontSize: 14 }
  if (err) return <div style={page}><h2 style={{ fontSize: 18 }}>Purchase order</h2><p style={{ color: '#b42318' }}>{err}</p></div>
  if (!d) return <div style={page}><p style={{ color: '#888' }}>Loading…</p></div>
  const { po, company: c } = d
  const th = { textAlign: 'left', padding: '8px', fontSize: 12, color: '#555', borderBottom: '2px solid #222' }
  const td = { padding: '8px', borderBottom: '1px solid #e5e5e5', fontSize: 13, verticalAlign: 'top' }
  return (
    <div style={page}>
      <Head><title>{`Purchase order ${po.number}${c.name ? ` - ${c.name}` : ''}`}</title></Head>
      <style>{`@media print { .no-print { display: none !important } @page { size: A4; margin: 14mm } }`}</style>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={() => window.print()} style={{ fontSize: 13, padding: '7px 14px', border: '1px solid #0f766e', background: '#0f766e', color: '#fff', borderRadius: 7, cursor: 'pointer' }}>Print / Save as PDF</button>
      </div>
      {po.status === 'cancelled' && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b42318', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontWeight: 700 }}>This purchase order has been CANCELLED - please do not supply against it.</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', marginBottom: 22 }}>
        <div>{c.logo ? <img src={c.logo} alt={c.name || ''} style={{ maxHeight: 80, maxWidth: 260 }} /> : <div style={{ fontSize: 20, fontWeight: 700 }}>{c.name}</div>}</div>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#444', lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#222' }}>{c.name}</div>
          {c.address && <div style={{ whiteSpace: 'pre-line' }}>{c.address}</div>}
          {[c.phone, c.email].filter(Boolean).length > 0 && <div>{[c.phone, c.email].filter(Boolean).join(' · ')}</div>}
          {c.vatNumber && <div>VAT {c.vatNumber}</div>}
          {c.companyNumber && <div>Company no. {c.companyNumber}</div>}
        </div>
      </div>
      <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>Purchase order {po.number}</h1>
      <div style={{ color: '#555', marginBottom: 16 }}>Raised {long(po.raisedAt)} by {po.raisedBy}</div>
      <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap', marginBottom: 18, fontSize: 13 }}>
        <div><div style={{ color: '#777', fontSize: 11.5 }}>Supplier</div><strong>{po.supplier}</strong></div>
        <div><div style={{ color: '#777', fontSize: 11.5 }}>Project</div><strong>{[po.jobNo, po.projectName].filter(Boolean).join(' ')}</strong></div>
        {po.deliveryDate && <div><div style={{ color: '#777', fontSize: 11.5 }}>Delivery required</div><strong>{long(po.deliveryDate)}</strong></div>}
      </div>
      {/* DELIVERY DETAILS (1200) */}
      <table style={{ borderCollapse: 'collapse', fontSize: 13, marginBottom: 18 }}><tbody>
        {[['Deliver to', po.deliveryAddress && <span style={{ whiteSpace: 'pre-line' }}>{po.deliveryAddress}</span>],
          ['Moffett offload required', yes(po.moffett)], ['Artics permitted', yes(po.artics)],
          ['Special access routes', (po.accessRoutes || (po.documents || []).length) ? <span><span style={{ whiteSpace: 'pre-line' }}>{po.accessRoutes}</span>{(po.documents || []).map(d => <div key={d.id}><a href={`/api/po-view?token=${encodeURIComponent(token)}&doc=${encodeURIComponent(d.id)}`} target="_blank" rel="noreferrer" style={{ color: '#0f766e' }}>{d.name}</a></div>)}</span> : null],
          ['Site contact', po.siteContact && po.siteContact.name ? `${po.siteContact.name}${po.siteContact.phone ? ` - ${po.siteContact.phone}` : ''}` : null],
          ['Order confirmations to', po.confirmationsTo || null]].filter(([, v]) => v).map(([k, v]) =>
          <tr key={k}><td style={{ color: '#777', padding: '3px 16px 3px 0', verticalAlign: 'top', whiteSpace: 'nowrap', fontSize: 12 }}>{k}</td><td style={{ padding: '3px 0' }}>{v}</td></tr>)}
      </tbody></table>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 14 }}>
        <thead><tr><th style={th}>Item</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Price</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
        <tbody>
          {po.lines.map((l, i) => <tr key={i}><td style={td}>{l.description}{l.code ? <div style={{ color: '#888', fontSize: 11.5 }}>{l.code}</div> : null}</td><td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{l.qty} {l.unit}</td><td style={{ ...td, textAlign: 'right' }}>{money(l.price)}</td><td style={{ ...td, textAlign: 'right' }}>{money(lineTotal(l))}</td></tr>)}
          <tr><td colSpan={3} style={{ padding: 8, textAlign: 'right', fontWeight: 700 }}>Total (ex VAT)</td><td style={{ padding: 8, textAlign: 'right', fontWeight: 700 }}>{money(po.total)}</td></tr>
        </tbody>
      </table>
      {(po.attachments || []).length > 0 && <div style={{ marginBottom: 14, fontSize: 13 }}><div style={{ color: '#777', fontSize: 11.5 }}>Attachments</div>{po.attachments.map(d => <div key={d.id}><a href={`/api/po-view?token=${encodeURIComponent(token)}&doc=${encodeURIComponent(d.id)}`} target="_blank" rel="noreferrer" style={{ color: '#0f766e' }}>{d.name}</a></div>)}</div>}
      {po.notes && <div style={{ marginBottom: 14, fontSize: 13, whiteSpace: 'pre-wrap' }}><div style={{ color: '#777', fontSize: 11.5 }}>Additional notes</div>{po.notes}</div>}
      <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, fontSize: 13 }}><strong>Please quote {po.number} on your invoice.</strong>{po.confirmationsTo ? <> Please send the order confirmation to <strong>{po.confirmationsTo}</strong>.</> : null}</div>
    </div>
  )
}
