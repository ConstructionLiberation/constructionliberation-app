import ManagementShell, { Heading, MGMT_NAV } from '../components/ManagementShell'

// The Management portal's landing page. Management and admin only - see
// ManagementShell for the screen gate and /api/management for the real one.
export default function ManagementHome() {
  return (
    <ManagementShell title="Management">
      <Heading title="Management" sub="Strategy, goals and the business scorecard. Management only." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {MGMT_NAV.map(n => (
          <a key={n.key} href={n.href} style={{ display: 'block', background: '#fff', border: '1px solid #e1e0d9', borderRadius: 10, padding: '18px 16px', textDecoration: 'none', color: '#1a1a19', fontSize: 15, fontWeight: 500 }}>
            {n.label}
          </a>
        ))}
      </div>
    </ManagementShell>
  )
}
