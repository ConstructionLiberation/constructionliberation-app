import { useEffect, useMemo, useState } from 'react'
import { registerFor } from '../lib/emailRegister'

// Admin > Email Notifications: the REGISTER and SENT LOG tabs (1080).
// Data from /api/email-admin. Admin only, as the page.

const box = { background: '#fff', borderRadius: 12, border: '1px solid #e8eaee', overflow: 'hidden' }
const th = { textAlign: 'left', padding: '9px 12px', fontSize: 12, fontWeight: 600, color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', top: 0 }
const td = { padding: '9px 12px', fontSize: 12.5, verticalAlign: 'top', borderBottom: '1px solid #f1f5f9' }
const when = (t) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })

function useEmailAdmin(view) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    fetch(`/api/email-admin?view=${view}`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Could not load (${r.status})`)
      if (live) setData(d)
    }).catch(e => live && setErr(e.message))
    return () => { live = false }
  }, [view])
  return { data, err }
}

export function EmailRegisterTab() {
  const { data, err } = useEmailAdmin('register')
  const { data: logData } = useEmailAdmin('log')
  // When each email last went - only where its sender sends just that one kind.
  const lastSent = useMemo(() => {
    const m = {}
    for (const e of (logData?.log || [])) {
      const hits = registerFor(e.source)
      if (hits.length === 1 && !m[hits[0].id] && e.ok) m[hits[0].id] = e.at
    }
    return m
  }, [logData])
  if (err) return <div style={{ color: '#b42318', fontSize: 13 }}>{err}</div>
  if (!data) return <div style={{ color: '#888', fontSize: 13 }}>Loading…</div>
  const groups = [['schedule', 'Scheduled'], ['event', 'When something happens']]
  return (
    <div>
      <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>Every email the portal sends automatically. Scheduled times are UTC unless stated (UK summer time is an hour ahead). Where the recipients are set by role or job title, the people it reaches today are listed.</p>
      {groups.map(([kind, label]) => (
        <div key={kind} style={{ marginBottom: 22 }}>
          <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>{label} <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 13 }}>({data.register.filter(e => e.kind === kind).length})</span></h3>
          <div style={{ ...box, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Email</th><th style={th}>What it is for</th><th style={th}>When</th><th style={th}>Who receives it</th><th style={th}>Last sent</th></tr></thead>
              <tbody>
                {data.register.filter(e => e.kind === kind).map(e => (
                  <tr key={e.id}>
                    <td style={{ ...td, fontWeight: 600, minWidth: 170 }}>{e.name}<div style={{ fontWeight: 400, fontSize: 11, color: '#94a3b8' }}>{e.area}</div></td>
                    <td style={{ ...td, minWidth: 240, color: '#334155' }}>{e.purpose}</td>
                    <td style={{ ...td, minWidth: 170 }}>{e.when}</td>
                    <td style={{ ...td, minWidth: 210 }}>{e.to}
                      {e.recipientsNow && <div style={{ fontSize: 11.5, color: e.recipientsNow.length ? '#15803d' : '#b45309', marginTop: 3 }}>
                        {e.recipientsNow.length ? `Today: ${e.recipientsNow.map(p => p.name).join(', ')}` : 'Today: nobody matches - this email goes to no one'}
                      </div>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: lastSent[e.id] ? '#334155' : '#cbd5e1' }}>{lastSent[e.id] ? when(lastSent[e.id]) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p style={{ fontSize: 11.5, color: '#94a3b8' }}>"Last sent" comes from the sent log, which starts from when it was switched on. Emails that share a daily run (the 08:00 run sends several kinds) are told apart by subject on the Sent log tab.</p>
    </div>
  )
}

export function EmailSentLogTab() {
  const { data, err } = useEmailAdmin('log')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [days, setDays] = useState('30')
  if (err) return <div style={{ color: '#b42318', fontSize: 13 }}>{err}</div>
  if (!data) return <div style={{ color: '#888', fontSize: 13 }}>Loading…</div>
  const since = days === 'all' ? 0 : Date.now() - parseInt(days, 10) * 86400000
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const rows = data.log.filter(e => e.at >= since
    && (status === 'all' || (status === 'sent' ? e.ok : !e.ok))
    && words.every(w => `${e.to.join(' ')} ${e.cc.join(' ')} ${e.subject} ${e.source}`.toLowerCase().includes(w)))
  const failed = rows.filter(e => !e.ok).length
  const oldest = data.log.length ? data.log[data.log.length - 1].at : null
  const forWhat = (e) => {
    const hits = registerFor(e.source)
    if (hits.length === 1) return hits[0].name
    if (hits.length > 1) return hits.map(h => h.name).join(' / ')
    return e.source ? e.source.replace(/^cron /, 'Scheduled: ').replace(/^\/api\//, '') : '—'
  }
  const sel = { fontSize: 13, padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit' }
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search recipient or subject…" style={{ ...sel, minWidth: 240 }} />
        <select value={status} onChange={e => setStatus(e.target.value)} style={sel}>
          <option value="all">Sent and failed</option><option value="sent">Sent</option><option value="failed">Failed only</option>
        </select>
        <select value={days} onChange={e => setDays(e.target.value)} style={sel}>
          <option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">Everything kept</option>
        </select>
        <span style={{ fontSize: 12.5, color: '#64748b' }}>{rows.length} email{rows.length === 1 ? '' : 's'}{failed ? <span style={{ color: '#b42318', fontWeight: 600 }}> · {failed} failed</span> : ''}</span>
      </div>
      <div style={{ ...box, maxHeight: '68vh', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>When</th><th style={th}>To</th><th style={th}>Subject</th><th style={th}>What for</th><th style={th}>Result</th></tr></thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={`${e.at}-${i}`} style={{ background: e.ok ? undefined : '#fff7f7' }}>
                <td style={{ ...td, whiteSpace: 'nowrap', color: '#475569' }}>{when(e.at)}</td>
                <td style={{ ...td, minWidth: 180 }}>{e.to.join(', ') || '—'}
                  {(e.cc.length > 0 || e.bcc.length > 0) && <div style={{ fontSize: 11, color: '#94a3b8' }}>{e.cc.length ? `cc ${e.cc.join(', ')}` : ''}{e.bcc.length ? ` bcc ${e.bcc.length}` : ''}</div>}</td>
                <td style={{ ...td, minWidth: 240 }}>{e.subject || '—'}{e.attachments ? <span style={{ fontSize: 11, color: '#94a3b8' }}> · {e.attachments} attachment{e.attachments === 1 ? '' : 's'}</span> : null}</td>
                <td style={{ ...td, minWidth: 160, color: '#475569' }}>{forWhat(e)}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{e.ok ? <span style={{ color: '#15803d', fontWeight: 600 }}>✓ Sent</span> : <span style={{ color: '#b42318', fontWeight: 600 }} title={e.error || ''}>✗ Failed{e.error ? <div style={{ fontWeight: 400, fontSize: 11, maxWidth: 260, whiteSpace: 'normal' }}>{e.error}</div> : null}</span>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 28 }}>{data.log.length ? 'No emails match.' : 'Nothing logged yet - emails appear here as they are sent.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11.5, color: '#94a3b8' }}>The most recent 3,000 emails are kept{oldest ? ` - currently back to ${when(oldest)}` : ''}. "Sent" means the email service accepted it; it does not prove the recipient opened it.</p>
    </div>
  )
}
