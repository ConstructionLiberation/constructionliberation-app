import { useEffect, useState } from 'react'
import AdminShell from '../../components/AdminShell'
import { COMPANY_FIELDS } from '../../lib/companyFields'

// ADMIN > COMPANY DETAILS (1166) - the company's name, address, contact details
// and logo. Used across the portal: the header, documents, quotes and emails.
const inp = { width: '100%', boxSizing: 'border-box', fontSize: 13.5, padding: '8px 9px', border: '1px solid #d4d4d0', borderRadius: 7, fontFamily: 'inherit' }
const card = { background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 18, maxWidth: 760 }

// Shrink a picked image in the browser (max 800 x 400) so it stores and loads light.
function shrink(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); return }
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, 800 / img.width, 400 / img.height)
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url)
      resolve(c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9))
    }
    img.onerror = () => reject(new Error('That file is not an image the browser can read'))
    img.src = url
  })
}

export default function CompanyDetails() {
  const [c, setC] = useState(null)
  const [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false)
  useEffect(() => { fetch('/api/admin/company-details').then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || 'Could not load'); setC(d.company || {}) })).catch(e => setErr(e.message)) }, [])
  const edit = (patch) => { setC(x => ({ ...x, ...patch })); setDirty(true); setMsg('') }
  async function save() {
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/admin/company-details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not save')
      setC(d.company); setDirty(false); setMsg('Saved - the portal uses these from now on (pages already open pick them up within a minute).')
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return (
    <AdminShell active="/admin/company-details" title="Company details">
      {err && <div style={{ background: '#fdecec', color: '#b42318', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {!c ? <div style={{ color: '#aaa' }}>Loading…</div> : (
        <div style={card}>
          <div style={{ fontSize: 12.5, color: '#666', marginBottom: 14 }}>Your company's name, address and logo - shown across the portal: the header, quotes, documents and emails.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {COMPANY_FIELDS.map(([k, label]) => (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#666', gridColumn: k === 'address' || k === 'name' ? '1 / -1' : undefined }}>
                {label}
                {k === 'address'
                  ? <textarea value={c[k] || ''} onChange={e => edit({ [k]: e.target.value })} rows={4} placeholder={'Unit 1, Example Park\nTown\nPostcode'} style={{ ...inp, resize: 'vertical' }} />
                  : <input value={c[k] || ''} onChange={e => edit({ [k]: e.target.value })} style={inp} />}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Logo</div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 240, height: 110, border: '1px dashed #d4d4d0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafaf9' }}>
                {c.logo ? <img src={c.logo} alt="Logo" style={{ maxWidth: 220, maxHeight: 96 }} /> : <span style={{ fontSize: 12, color: '#bbb' }}>No logo</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12.5, padding: '6px 12px', border: '1px solid #0f766e', color: '#0f766e', borderRadius: 7, cursor: 'pointer', textAlign: 'center' }}>
                  {c.logo ? 'Change logo' : 'Upload logo'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: 'none' }} onChange={async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { edit({ logo: await shrink(f) }) } catch (x) { setErr(x.message) } }} />
                </label>
                {c.logo && <button onClick={() => edit({ logo: null })} style={{ fontSize: 12.5, padding: '6px 12px', border: '1px solid #d4d4d0', borderRadius: 7, background: '#fff', cursor: 'pointer' }}>Remove logo</button>}
                <span style={{ fontSize: 11, color: '#999' }}>PNG, JPG, WEBP or SVG</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18 }}>
            <button onClick={save} disabled={!dirty || busy} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', opacity: !dirty || busy ? 0.5 : 1 }}>Save company details</button>
            {msg && <span style={{ fontSize: 12.5, color: '#15803d' }}>{msg}</span>}
          </div>
        </div>
      )}
    </AdminShell>
  )
}
