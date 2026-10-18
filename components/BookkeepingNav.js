import Link from 'next/link'
import ReportImprovementLink from './ReportImprovementLink'
import BrandLogo from './BrandLogo'

const INK = '#1a1a2e'
// THE BOOKKEEPING TABS - one list (1244): the main Bookkeeping page draws its own header and
// used to keep its own copy of these, so a tab added here (Bills to Check) never showed there.
export const BOOKKEEPING_TABS = [
  { href: '/bookkeeping', label: 'Bookkeeping' },
  { href: '/bookkeeping-weekly-tasks', label: 'Weekly Tasks' },
  { href: '/bookkeeping-monthly-tasks', label: 'Monthly Tasks' },
  { href: '/bookkeeping-bills', label: 'Bills to Check' },   // supplier bills against the POs, and supplier queries (1243)
]

export default function BookkeepingNav({ active }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 20 }}>
      <div style={{ background: INK, padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 56, gap: 8 }}>
          <BrandLogo />
          <Link href="/" style={{ color: '#aaa', fontSize: 13, textDecoration: 'none', padding: '4px 10px' }}>&larr; Portal</Link>
          <span style={{ color: '#444' }}>|</span>
          <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>Bookkeeping</span>
          <div style={{ flex: 1 }} />
          <ReportImprovementLink />
        </div>
      </div>
      {/* Sub-nav (Ops style: white bar, gold underline) */}
      <div style={{ background: '#fff', borderBottom: '1px solid #ececec', padding: '0 24px', display: 'flex', gap: 4, height: 46, alignItems: 'center' }}>
        {BOOKKEEPING_TABS.map(s => {
          const on = active === s.href
          return (
            <Link key={s.href} href={s.href} style={{
              fontSize: 13, textDecoration: 'none', padding: '8px 14px', whiteSpace: 'nowrap',
              color: on ? '#1a1a19' : '#888', fontWeight: on ? 600 : 400,
              borderBottom: on ? '2px solid #ca8a04' : '2px solid transparent', marginBottom: -1,
            }}>{s.label}</Link>
          )
        })}
      </div>
    </div>
  )
}
