import { useEffect, useState } from 'react'
import ManagementShell, { Heading, ErrorBar, mgmtApi } from '../../components/ManagementShell'
import MgmtRowsTable, { btnDark } from '../../components/MgmtRowsTable'
import { useFormat } from '../../components/TenantProvider'
import { drawOrgChart } from '../../components/orgChartImage'

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
  const { companyName } = useFormat()
  const [data, setData] = useState(null)
  const [external, setExternal] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { mgmtApi('/api/management/org-chart').then(d => { setData(d); setExternal(d.external || []) }).catch(e => setError(e.message)) }, [])

  const known = new Set(TIERS.flatMap(t => t.roles))
  const tiers = !data ? [] : [
    ...TIERS.map(t => ({ ...t, people: data.people.filter(p => t.roles.includes(p.jobRole)) })),
    { label: 'Other', roles: [], people: data.people.filter(p => !known.has(p.jobRole)) },
  ].filter(t => t.people.length)

  // DOWNLOAD - the chart as it stands now, outsourced services included, as
  // a PNG named with today's date so successive copies do not overwrite.
  async function download() {
    setBusy(true); setError('')
    try {
      const today = new Date()
      const blob = await drawOrgChart({
        title: `${companyName ? companyName + ' - ' : ''}Organisation Chart`,
        subtitle: `As at ${today.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`,
        tiers, external,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `org-chart-${today.toISOString().slice(0, 10)}.png`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError(`Download failed: ${e.message}`) }
    setBusy(false)
  }

  return (
    <ManagementShell active="org" title="Org Chart" wide>
      <Heading title="Org Chart" sub="Everyone with an active portal login, by job role. Updates itself as people join and leave."
        action={data && <button onClick={download} disabled={busy} style={{ ...btnDark, opacity: busy ? 0.5 : 1 }}>{busy ? 'Preparing…' : 'Download chart (PNG)'}</button>} />
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
            {/* Outsourced services on the chart too, so the screen matches the
                download. Dashed, because they are not staff. */}
            {external.some(r => r.service || r.provider) && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 2, height: 22, background: '#d6d3cc' }} />
                <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: '#999', marginBottom: 8 }}>Outsourced services</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, padding: '0 12px' }}>
                  {external.filter(r => r.service || r.provider).map(r => (
                    <div key={r.id} style={{ background: '#fff', border: '1px dashed #cfd4dc', borderTop: '3px solid #64748b', borderRadius: 8, padding: '10px 14px', minWidth: 150, textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a19' }}>{r.provider || r.service}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{r.provider ? r.service : ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Heading title="Outsourced services" sub="Entered by hand - accountants, payroll, IT, H&S consultants and the like." />
          <MgmtRowsTable doc="org-external" columns={[
            { key: 'service', label: 'Service', type: 'text', width: 180 },
            { key: 'provider', label: 'Provider', type: 'text', width: 180 },
            { key: 'contactName', label: 'Contact', type: 'text', width: 150 },
            { key: 'contactDetails', label: 'Phone / Email', type: 'text', width: 200 },
            { key: 'reportsTo', label: 'Managed By', type: 'person', width: 160 },
            { key: 'notes', label: 'Notes', type: 'textarea', width: 240 },
          ]} people={data.people} onRowsChange={setExternal} />
        </>
      )}
    </ManagementShell>
  )
}
