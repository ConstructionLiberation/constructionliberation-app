import Head from 'next/head'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useFormat } from './TenantProvider'

const MGMT = ['management', 'admin']

// THE ADMIN NAVIGATION, ONCE.
//
// pages/admin.js carried its own inline copy of this list with NINE tabs while this one
// had seven, so the bar changed shape the moment you left Portal Users - Email
// Notifications and Xero Connection simply vanished and there was no way to reach them
// except by going back. Exported so there is one list and it cannot happen again.
//
// The two that were missing are admin-only, which reproduces exactly who could see them
// before: they only ever appeared on Portal Users, and that page is admin-only. Widening
// them to management is a decision, not a side effect of fixing the nav.
export const ADMIN_TABS = [
  ['Portal Users', '/admin', ['admin']],
  ['Templates', '/admin/templates', MGMT],
  ['Email Notifications', '/admin/notifications', ['admin']],
  ['Form Builder', '/operations/forms-builder', MGMT],
  ['Site App Users', '/operations/users', MGMT],
  ['Documents', '/admin/documents', MGMT],
  ['RAMS Director', '/admin/rams-director', MGMT],
  ['App Improvements', '/admin/problem-reports', MGMT],
  ['Xero Connection', '/connect', ['admin']],
]

// The Bookkeeping Tools bar. No role entries, so every tab shows - same as before.
const BK_TABS = [
  ['Account Categorisation', '/admin/account-categorisation'],
  ['Xero Upload', '/admin/xero-upload'],
  ['Data Management', '/admin/data-management'],
]

// The bar itself, so the markup lives in one place too. Both callers rendered an
// identical div and identical anchors; that is how the two lists drifted unnoticed.
export function AdminTabs({ active, role, tabs }) {
  const list = (tabs || ADMIN_TABS).filter(([, , roles]) => !roles || roles.includes(role))
  return (
    <div style={{ background: '#232321', padding: '0 24px', display: 'flex', gap: 4, height: 44, alignItems: 'center', overflowX: 'auto' }}>
      {list.map(([label, href]) => (
        <a key={href} href={href} style={{ fontSize: 13, textDecoration: 'none', padding: '8px 14px', whiteSpace: 'nowrap', color: active === href ? '#fff' : '#bbb', fontWeight: active === href ? 600 : 400, borderBottom: active === href ? '2px solid #ca8a04' : '2px solid transparent' }}>{label}</a>
      ))}
    </div>
  )
}

// Chrome for Admin-area pages: dark bar + admin sub-nav, admin-gated.
export default function AdminShell({ active, title, children, wide, allow }) {
  const router = useRouter()
  // ABOVE the `if (!ok) return null` below. useFormat() is useContext().
  const { companyName: brand } = useFormat()
  const [ok, setOk] = useState(false)
  const [role, setRole] = useState(null)
  // Roles permitted on this page. Defaults to admin-only; pages can widen it
  // (e.g. Bookkeeping upload/categorisation allow the Accounts role too).
  const allowed = allow || ['admin']
  useEffect(() => {
    fetch('/api/portal-auth?action=me').then(r => r.json()).then(d => {
      if (!d.user) { router.replace('/login'); return }
      if (!allowed.includes(d.user.role)) { router.replace('/'); return }
      setRole(d.user.role)
      setOk(true)
    }).catch(() => router.replace('/login'))
  }, [])
  if (!ok) return null
  const isBk = ['/admin/account-categorisation', '/admin/xero-upload', '/admin/data-management'].includes(active)
  const page = title || (isBk ? 'Bookkeeping' : 'Admin')
  return (
    <>
      <Head><title>{brand ? `${brand} - ${page}` : page}</title></Head>
      <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif', minHeight: '100vh', background: '#fafaf9' }}>
        <div style={{ background: '#1a1a19', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href={isBk ? '/bookkeeping' : '/'} style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>{isBk ? '← Bookkeeping' : '← Portal'}</a>
          <span style={{ color: '#3a3a38' }}>|</span>
          <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{isBk ? 'Bookkeeping Tools' : 'Admin'}</span>
        </div>
        <AdminTabs active={active} role={role} tabs={isBk ? BK_TABS : undefined} />
        <div style={{ maxWidth: wide ? 1600 : 1100, margin: '0 auto', padding: 24 }}>{children}</div>
      </div>
    </>
  )
}
