import Head from 'next/head'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import BrandLogo from './BrandLogo'
import ReportImprovementLink from './ReportImprovementLink'
import { useFormat } from './TenantProvider'
import { canAccessArea } from '../lib/roles'

// The Management portal's chrome: nav, title, and the area gate.
//
// The gate here is for the screen. The real one is on the server - every
// /api/management route asks requireArea('management') - so typing a URL
// gets a page with nothing in it, not the data.
export const MGMT_NAV = [
  { key: 'vmv', label: 'Vision, Mission & Values', href: '/management/vmv' },
  { key: 'swot', label: 'SWOT', href: '/management/swot' },
  { key: 'scorecard', label: 'Business Scorecard', href: '/management/scorecard' },
  { key: 'quarterly', label: 'Quarterly Goals', href: '/management/quarterly-goals' },
  { key: 'one-year', label: '1-Year Goals', href: '/management/one-year-goals' },
  { key: 'three-year', label: '3-Year Goals', href: '/management/three-year-goals' },
  { key: 'org', label: 'Org Chart', href: '/management/org-chart' },
  { key: 'org-1y', label: '1-Year Org Chart', href: '/management/org-chart-1-year' },
  { key: 'org-3y', label: '3-Year Org Chart', href: '/management/org-chart-3-year' },
  { key: 'actions', label: 'Meeting Actions', href: '/management/meeting-actions' },
]

export default function ManagementShell({ active, title, wide, children }) {
  const { companyName: brand } = useFormat()
  const router = useRouter()
  const [ok, setOk] = useState(false)
  useEffect(() => {
    fetch('/api/portal-auth?action=me').then(r => r.ok ? r.json() : null).then(d => {
      if (!d?.user) { router.replace('/login'); return }
      if (!canAccessArea(d.user.role, 'management')) { router.replace('/'); return }
      setOk(true)
    }).catch(() => router.replace('/'))
  }, [])
  const page = title || 'Management'
  return (
    <>
      <Head><title>{brand ? `${brand} - ${page}` : page}</title></Head>
      <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif', minHeight: '100vh', background: '#fafaf9' }}>
        <div style={{ background: '#1a1a19', padding: '0 20px', display: 'flex', alignItems: 'center', height: 58, overflowX: 'auto' }}>
          <BrandLogo style={{ marginRight: 8 }} />
          <a href="/" style={link}>← Portal</a>
          <span style={div}>|</span>
          {MGMT_NAV.map(n => (
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

// One fetch helper for every management page: refusals are thrown with the
// server's own message, never turned into empty data.
export async function mgmtApi(path, body) {
  const r = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`)
  return d
}

const link = { color: '#888', fontSize: 15, textDecoration: 'none', padding: '6px 10px', borderRadius: 6, whiteSpace: 'nowrap' }
const on = { color: '#fff', fontSize: 15, fontWeight: 500, padding: '6px 10px', borderRadius: 6, background: '#2a2a28', whiteSpace: 'nowrap' }
const div = { color: '#3a3a38', fontSize: 15, padding: '0 2px' }

// Active portal users, for the Leader / Team Member boxes. Read from the org
// chart route so leavers drop out of the suggestions the same way they drop
// off the chart. Suggestions only - a name typed by hand is kept.
export function usePeople() {
  const [people, setPeople] = useState([])
  useEffect(() => { mgmtApi('/api/management/org-chart').then(d => setPeople(d.people || [])).catch(() => {}) }, [])
  return people
}
