import { useEffect, useState } from 'react'
import ManagementShell, { Heading, ErrorBar, mgmtApi } from '../../components/ManagementShell'
import MgmtRowsTable, { btnDark } from '../../components/MgmtRowsTable'
import OrgTree from '../../components/OrgTree'
import { useFormat } from '../../components/TenantProvider'
import { drawOrgChart, saveBlob } from '../../components/orgChartImage'
import { buildForest } from '../../lib/orgTree'

// CURRENT ORG CHART (1031 - arranged by hand).
//
// WHO is on it is automatic: every active portal login, plus the outsourced
// services entered underneath. Nothing about a person is copied or stored.
//
// WHERE they sit is set by you - who is under whom, and in what order - and
// that layout is the only thing saved (mgmt:org:layout). So:
//   - someone new gets a login     -> they appear in the tray, ready to place
//   - someone leaves               -> they drop off; their team moves up to
//                                     whoever they reported to
//   - a job role changes in Admin  -> the card updates; position is kept
//
// Saves carry the version they started from. If someone else rearranged the
// chart in between, the move is refused and the chart reloads, rather than
// one layout silently replacing the other.
export default function OrgChart() {
  const { companyName } = useFormat()
  const [people, setPeople] = useState(null)
  const [external, setExternal] = useState([])
  const [placements, setPlacements] = useState({})
  const [base, setBase] = useState(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const [org, layout] = await Promise.all([mgmtApi('/api/management/org-chart'), mgmtApi('/api/management/org-layout')])
      setPeople(org.people || []); setExternal(org.external || [])
      setPlacements(layout.data?.placements || {}); setBase(layout.updatedAt)
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  const nodes = [
    ...(people || []).map(p => ({ key: `user:${p.id}`, title: p.name, subtitle: p.jobRole || 'No job role set' })),
    ...external.filter(r => r.service || r.provider).map(r => ({
      key: `ext:${r.id}`, title: r.provider || r.service, subtitle: r.provider ? r.service : '',
      accent: '#64748b', dashed: true, tag: 'Outsourced',
    })),
  ]

  async function save(next) {
    setError('')
    try {
      const d = await mgmtApi('/api/management/org-layout', { data: { placements: next }, baseUpdatedAt: base })
      setPlacements(d.data.placements); setBase(d.updatedAt)
    } catch (e) {
      setError(e.message)
      if (/since you opened/i.test(e.message)) load()
    }
  }

  async function download() {
    setBusy(true); setError('')
    try {
      const { roots } = buildForest(nodes, placements)
      if (!roots.length) throw new Error('Place someone on the chart first.')
      const today = new Date()
      const blob = await drawOrgChart({
        title: `${companyName ? companyName + ' - ' : ''}Organisation Chart`,
        subtitle: `As at ${today.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`,
        roots,
      })
      saveBlob(blob, `org-chart-${today.toISOString().slice(0, 10)}.png`)
    } catch (e) { setError(`Download failed: ${e.message}`) }
    setBusy(false)
  }

  return (
    <ManagementShell active="org" title="Org Chart" wide>
      <Heading title="Org Chart"
        sub="Everyone with an active portal login, plus outsourced services. New people appear in the tray; leavers drop off on their own."
        action={people && <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setEditing(v => !v)} style={{ ...btnDark, background: editing ? '#16a34a' : '#fff', color: editing ? '#fff' : '#1a1a19', border: '1px solid #d0d0cc' }}>
            {editing ? 'Done arranging' : 'Arrange chart'}
          </button>
          <button onClick={download} disabled={busy} style={{ ...btnDark, opacity: busy ? 0.5 : 1 }}>{busy ? 'Preparing…' : 'Download chart (PNG)'}</button>
        </div>} />
      <ErrorBar error={error} onClose={() => setError('')} />
      {!people ? (!error && <div style={{ color: '#aaa', padding: 30, textAlign: 'center' }}>Loading…</div>) : (
        <>
          <OrgTree nodes={nodes} placements={placements} editable={editing} onChange={save} onError={setError}
            trayTitle="Not placed yet - new logins and outsourced services land here" />

          <div style={{ marginTop: 32 }}>
            <Heading title="Outsourced services" sub="Entered by hand - accountants, payroll, IT, H&S consultants and the like. Each one also appears on the chart to place." />
            <MgmtRowsTable doc="org-external" columns={[
              { key: 'service', label: 'Service', type: 'text', width: 180 },
              { key: 'provider', label: 'Provider', type: 'text', width: 180 },
              { key: 'contactName', label: 'Contact', type: 'text', width: 150 },
              { key: 'contactDetails', label: 'Phone / Email', type: 'text', width: 200 },
              { key: 'notes', label: 'Notes', type: 'textarea', width: 240 },
            ]} people={people} onRowsChange={setExternal} />
          </div>
        </>
      )}
    </ManagementShell>
  )
}
