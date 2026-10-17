import { useEffect, useState } from 'react'
import Head from 'next/head'

// A SUPPLIER'S QUERY (1242) - opened from the link in their email, no account needed: their
// invoice, our purchase order, the conversation, and a reply with a document attached.
const money = (n) => `£${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dmy = (d) => d ? String(d).split('-').reverse().join('/') : ''
const when = (s) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function BillQuery() {
  const [t, setT] = useState(''), [q, setQ] = useState(null), [err, setErr] = useState('')
  const [text, setText] = useState(''), [file, setFile] = useState(null), [busy, setBusy] = useState(false), [sent, setSent] = useState(false)
  useEffect(() => {
    const tok = new URLSearchParams(window.location.search).get('t') || ''; setT(tok)
    fetch(`/api/bill-query?t=${encodeURIComponent(tok)}`).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'This link is not valid'); setQ(d) }).catch(e => setErr(e.message))
  }, [])
  async function send() {
    setBusy(true); setErr('')
    try {
      let f = null
      if (file) {
        if (file.size > 3 * 1024 * 1024) throw new Error('That document is over 3 MB - please attach a smaller copy.')
        const data = await new Promise((ok, bad) => { const rd = new FileReader(); rd.onload = () => ok(String(rd.result).split(',')[1] || ''); rd.onerror = bad; rd.readAsDataURL(file) })
        f = { name: file.name, type: file.type, data }
      }
      const r = await fetch('/api/bill-query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t, message: text, file: f }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not send')
      setQ(d); setText(''); setFile(null); setSent(true)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const card = { background: '#fff', border: '1px solid #e5e5e2', borderRadius: 12, padding: 16, marginBottom: 14 }
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f3', fontFamily: 'Arial, sans-serif', color: '#1a1a19', padding: '24px 14px' }}>
      <Head><title>{q ? `${q.company} - query on your invoice` : 'Query on your invoice'}</title><meta name="robots" content="noindex" /></Head>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {err && !q && <div style={{ ...card, color: '#b42318' }}>{err}</div>}
        {!q && !err && <div style={card}>Loading...</div>}
        {q && <>
          <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>{q.company}</h1>
          <div style={{ fontSize: 14, color: '#555', marginBottom: 14 }}>A query on your invoice{q.bill.number ? ` ${q.bill.number}` : ''}</div>
          <div style={{ ...card, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13.5 }}>
            <div><div style={{ color: '#888', fontSize: 12 }}>Your invoice</div><strong>{q.bill.number || q.bill.reference || '-'}</strong>{q.bill.date ? <div>{dmy(q.bill.date)}</div> : null}</div>
            <div><div style={{ color: '#888', fontSize: 12 }}>Amount</div><strong>{money(q.bill.subTotal)}</strong> ex VAT<div>{money(q.bill.total)} inc VAT</div></div>
            {q.po && <div><div style={{ color: '#888', fontSize: 12 }}>Our purchase order</div><strong>{q.po.number}</strong><div>{money(q.po.net)} ex VAT{q.po.billed ? ` - invoiced so far ${money(q.po.billed)}` : ''}</div></div>}
            <div style={{ marginLeft: 'auto' }}><div style={{ color: '#888', fontSize: 12 }}>Status</div><strong style={{ color: q.status === 'resolved' ? '#166534' : '#b45309' }}>{q.status === 'resolved' ? 'Closed' : q.status === 'answered' ? 'Your reply received' : 'Waiting for your reply'}</strong></div>
          </div>
          <div style={card}>
            {q.messages.map((m, i) => <div key={i} style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 8, background: m.from === 'us' ? '#f4f4f2' : '#ecfdf5', marginLeft: m.from === 'us' ? 0 : 40, marginRight: m.from === 'us' ? 40 : 0 }}>
              <div style={{ fontSize: 12, color: '#777', marginBottom: 4 }}><strong>{m.from === 'us' ? m.by : 'You'}</strong> - {when(m.at)}</div>
              <div style={{ fontSize: 14, whiteSpace: 'pre-line' }}>{m.text}</div>
              {m.files.length > 0 && <div style={{ marginTop: 6, fontSize: 13 }}>{m.files.map(f => <a key={f.j} href={`/api/bill-query?t=${encodeURIComponent(t)}&i=${f.i}&j=${f.j}`} target="_blank" rel="noreferrer" style={{ color: '#0f766e', marginRight: 10 }}>{f.name}</a>)}</div>}
            </div>)}
          </div>
          {q.status === 'resolved' ? <div style={{ ...card, color: '#166534' }}>This query has been closed. If anything is still outstanding, reply to the email you received.</div> : <div style={card}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Your reply</div>
            <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Type your reply - e.g. a credit note is attached, or why the invoice is correct." style={{ width: '100%', boxSizing: 'border-box', minHeight: 110, padding: 10, border: '1px solid #d4d4d0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, padding: '6px 12px', border: '1px solid #d4d4d0', borderRadius: 8, cursor: 'pointer', background: '#fff' }}>
                {file ? `Attached: ${file.name}` : 'Attach a document (credit note, PDF or photo)'}
                <input type="file" accept="application/pdf,image/*" onChange={e => setFile(e.target.files[0] || null)} style={{ display: 'none' }} />
              </label>
              {file && <button onClick={() => setFile(null)} style={{ fontSize: 12.5, border: 'none', background: 'none', color: '#b42318', cursor: 'pointer' }}>remove</button>}
              <span style={{ flex: 1 }} />
              <button onClick={send} disabled={busy || (!text.trim() && !file)} style={{ fontSize: 14, padding: '8px 18px', border: 'none', borderRadius: 8, background: '#0f766e', color: '#fff', cursor: 'pointer', opacity: (busy || (!text.trim() && !file)) ? 0.5 : 1 }}>{busy ? 'Sending...' : 'Send reply'}</button>
            </div>
            {sent && <div style={{ fontSize: 13, color: '#166534', marginTop: 8 }}>Sent - thank you. We have been told.</div>}
            {err && <div style={{ fontSize: 13, color: '#b42318', marginTop: 8 }}>{err}</div>}
          </div>}
        </>}
      </div>
    </div>
  )
}
