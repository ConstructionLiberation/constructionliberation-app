import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Shell } from '../index'
import { siteApi } from '../../../lib/siteApi'
import { PoView, statusChip } from '../purchase-orders'

// PO APPROVALS (1212) - the purchase orders operatives raised on the CM's projects,
// waiting for them. Nothing goes to the supplier until approved.
const INK = '#1a1a19'
const money = (n) => `£${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const card = { background: '#fff', border: '1px solid #e8e4da', borderRadius: 14, padding: 14, marginBottom: 12 }
const back = { background: 'transparent', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }

export default function PoApprovals() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [data, setData] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState('')
  const [open, setOpen] = useState(null)
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
        <button onClick={() => open ? setOpen(null) : router.push('/forms')} style={back}>‹ {open ? 'PO approvals' : 'Home'}</button>
        <h2 style={{ fontSize: 18, color: INK, margin: '8px 0 4px' }}>PO Approvals</h2>
        {err && <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#b42318', fontSize: 14 }}>{err}</div>}
        {msg && <div style={{ ...card, borderColor: '#99f6e4', background: '#f0fdfa', color: '#0f766e', fontSize: 14 }}>{msg}</div>}
        {open ? <PoView id={open} data={data} onDecided={(po, action, r) => { setOpen(null); setMsg(action === 'reject' ? 'Rejected - the operative has been told.' : action === 'send' || (r && r.sent) ? `${po.number} approved and sent to ${po.sentTo || po.to}.` : r && r.sendError ? `Approved as ${po.number}, but it could not be sent: ${r.sendError}` : `Approved as ${po.number} - the office will send it to the supplier.`); load() }} />
          : !data ? (!err && <div style={{ textAlign: 'center', color: '#999', paddingTop: 30 }}>Loading...</div>)
          : <>
            <p style={{ color: '#777', fontSize: 14, margin: '0 0 14px' }}>Purchase orders raised on your projects, waiting for you. Nothing is sent to the supplier until you approve.</p>
            {!data.approvals.length ? <div style={{ color: '#999', fontSize: 14 }}>Nothing waiting.</div> : data.approvals.map(p => (
              <button key={p.id} onClick={() => { setMsg(''); setOpen(p.id) }} style={{ ...card, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'block', fontFamily: 'inherit' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong style={{ fontSize: 15, color: INK }}>{p.supplier}</strong>{statusChip(p.status)}</div>
                <div style={{ fontSize: 13, color: '#777', marginTop: 3 }}>{p.jobNo} {p.projectName} · {money(p.gross ?? p.total)} · {p.raisedBy}</div>
              </button>))}
            {/* approved, still editable until the office sends it (1213) */}
            {(data.approvedUnsent || []).length > 0 && <>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#ca8a04', margin: '22px 0 8px' }}>Approved - not yet sent</div>
              {data.approvedUnsent.map(p => (
                <button key={p.id} onClick={() => { setMsg(''); setOpen(p.id) }} style={{ ...card, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'block', fontFamily: 'inherit' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong style={{ fontSize: 15, color: INK }}>{p.supplier}</strong>{statusChip(p.status)}</div>
                  <div style={{ fontSize: 13, color: '#777', marginTop: 3 }}>{p.number} · {p.jobNo} {p.projectName} · {money(p.gross ?? p.total)}</div>
                </button>))}
            </>}
          </>}
      </div>
    </Shell>
  )
}
