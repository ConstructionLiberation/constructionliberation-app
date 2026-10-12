import Head from 'next/head'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import BrandLogo from './BrandLogo'
import ReportImprovementLink from './ReportImprovementLink'
import { useFormat } from './TenantProvider'
import { canAccessArea } from '../lib/roles'

// The Estimating area's chrome (1083): nav, title, and the area gate.
//
// The gate here is for the screen. The real one is on the server - every
// /api/estimating route asks requireArea('estimating') - so typing a URL
// gets a page with nothing in it, not the data.
export const EST_NAV = [
  { key: 'estimates', label: 'Estimates', href: '/estimating/estimates' },
  { key: 'price-list', label: 'Price List', href: '/estimating/price-list' },
  { key: 'labour-rates', label: 'Labour Rates', href: '/estimating/labour-rates' },
  { key: 'build-ups', label: 'Rate Build-ups', href: '/estimating/build-ups' },
]

export default function EstimatingShell({ active, title, wide, children }) {
  const { companyName: brand } = useFormat()
  const router = useRouter()
  const [ok, setOk] = useState(false)
  useEffect(() => {
    fetch('/api/portal-auth?action=me').then(r => r.ok ? r.json() : null).then(d => {
      if (!d?.user) { router.replace('/login'); return }
      if (!canAccessArea(d.user.role, 'estimating')) { router.replace('/'); return }
      setOk(true)
    }).catch(() => router.replace('/'))
  }, [])
  const page = title || 'Estimating'
  return (
    <>
      <Head><title>{brand ? `${brand} - ${page}` : page}</title></Head>
      <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif', minHeight: '100vh', background: '#fafaf9' }}>
        <div style={{ background: '#1a1a19', padding: '0 20px', display: 'flex', alignItems: 'center', height: 58, overflowX: 'auto' }}>
          <BrandLogo style={{ marginRight: 8 }} />
          <a href="/" style={link}>← Portal</a>
          <span style={div}>|</span>
          {EST_NAV.map(n => (
            <span key={n.key} style={{ display: 'flex', alignItems: 'center' }}>
              {active === n.key ? <span style={on}>{n.label}</span> : <a href={n.href} style={link}>{n.label}</a>}
              <span style={div}>|</span>
            </span>
          ))}
          {/* Same link, same place as every other portal nav - the shared
              component, so it cannot drift from the others. */}
          <div style={{ flex: 1, minWidth: 16 }} />
          <ReportImprovementLink />
        </div>
        <div style={{ maxWidth: wide ? 'none' : 1100, margin: '0 auto', padding: 24 }}>
          {ok ? children : <div style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>Loading…</div>}
        </div>
      </div>
    </>
  )
}

export function Heading({ title, sub, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, color: '#1a1a19' }}>{title}</h1>
        {sub && <div style={{ color: '#999', fontSize: 13, marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  )
}

export function ErrorBar({ error, onClose }) {
  if (!error) return null
  return (
    <div style={{ background: '#fdecec', border: '1px solid #f5c2c2', color: '#b42318', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span>{error}</span>
      {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#b42318', cursor: 'pointer', fontSize: 14 }}>×</button>}
    </div>
  )
}

// Fetch helper: refusals are thrown with the server's own message, never
// turned into empty data.
export async function estApi(path, body) {
  const r = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(d.error || `Request failed (${r.status})`); e.data = d; e.status = r.status; throw e }   // status: 1100
  return d
}

const link = { color: '#888', fontSize: 15, textDecoration: 'none', padding: '6px 10px', borderRadius: 6, whiteSpace: 'nowrap' }
const on = { color: '#fff', fontSize: 15, fontWeight: 500, padding: '6px 10px', borderRadius: 6, background: '#2a2a28', whiteSpace: 'nowrap' }
const div = { color: '#3a3a38', fontSize: 15, padding: '0 2px' }
