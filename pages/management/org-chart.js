import { useEffect, useState } from 'react'
import ManagementShell, { Heading, ErrorBar, mgmtApi } from '../../components/ManagementShell'
import MgmtRowsTable from '../../components/MgmtRowsTable'

// ORG CHART, BUILT FROM THE PORTAL LOGINS.
//
// Everyone with an ACTIVE portal login, laid out by the job role set on their
// user (Admin > Users). Nothing is stored: deactivate someone and they are off
// the chart on the next load; add someone and they appear.
//
// The portal records a job role but not who reports to whom, so the chart is
// in TIERS by job role rather than lines between people. Anyone with a job
// role outside the list below, or none, is shown under "Other" - set their
// job role and they move to the right tier.
//
// Outsourced services are the one part entered by hand, underneath.
const TIERS = [
  { label: 'Directors', roles: ['Director'] },
  { label: 'Managers', roles: ['Operations Manager', 'Sales Manager', 'Design Manager'] },
  { label: 'Commercial, Contracts & Estimating', roles: ['Quantity Surveyor', 'Contracts Manager', 'Estimator'] },
  { label: 'Site', roles: ['Site Supervisor', 'Operative'] },
]

export default function OrgChart() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { mgmtApi('/api/management/org-chart').then(setData).catch(e => setError(e.message)) }, [])

  const known = new Set(TIERS.flatMap(t => t.roles))
  const tiers = !data ? [] : [
    ...TIERS.map(t => ({ ...t, people: data.people.filter(p => t.roles.includes(p.jobRole)) })),
    { label: 'Other', roles: [], people: data.people.filter(p => !known.has(p.jobRole)) },
  ].filter(t => t.people.length)

  return (
    <ManagementShell active="org" title="Org Chart" wide>
      <Heading title="Org Chart" sub="Everyone with an active portal login, by job role. Updates itself as people join and leave." />
      <ErrorBar error={error} onClose={() => setError('')} />
      {!data ? (!error && <div style={{ color: '#aaa', padding: 30, textAlign: 'center' }}>Loading…</div>) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, marginBottom: 36 }}>
            {tiers.length === 0 && <div style={{ color: '#aaa', padding: 20 }}>No active portal users.</div>}
            {tiers.map((t, i) => (
              <div key={t.label} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {i > 0 && <div style={{ width: 2, height: 22, background: '#d6d3cc' }} />}
                <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: '#999', marginBottom: 8 }}>{t.label}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, padding: '0 12px' }}>
                  {t.people.map(p => (
                    <div key={p.id} style={{ background: '#fff', border: '1px solid #e1e0d9', borderTop: `3px solid ${t.label === 'Other' ? '#bbb' : '#be123c'}`, borderRadius: 8, padding: '10px 14px', minWidth: 150, textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a19' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{p.jobRole || 'No job role set'}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Heading title="Outsourced services" sub="Entered by hand - accountants, payroll, IT, H&S consultants and the like." />
          <MgmtRowsTable doc="org-external" columns={[
            { key: 'service', label: 'Service', type: 'text', width: 180 },
            { key: 'provider', label: 'Provider', type: 'text', width: 180 },
            { key: 'contactName', label: 'Contact', type: 'text', width: 150 },
            { key: 'contactDetails', label: 'Phone / Email', type: 'text', width: 200 },
            { key: 'reportsTo', label: 'Managed By', type: 'person', width: 160 },
            { key: 'notes', label: 'Notes', type: 'textarea', width: 240 },
          ]} people={data.people} />
        </>
      )}
    </ManagementShell>
  )
}
