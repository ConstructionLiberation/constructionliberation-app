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
  // The WHOLE layout (1060): positions, roles added by hand, comments and
  // dotted lines. Every save sends all four - saving positions alone would
  // wipe the rest.
  const [layout, setLayout] = useState({ placements: {}, extraNodes: [], notes: {}, dotted: [] })
  const placements = layout.placements
  const [form, setForm] = useState(null)   // { key?, kind: 'role' | 'comment', name, role, status, notes }
  const [base, setBase] = useState(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const [org, layout] = await Promise.all([mgmtApi('/api/management/org-chart'), mgmtApi('/api/management/org-layout')])
      setPeople(org.people || []); setExternal(org.external || [])
      const L = layout.data || {}
      setLayout({ placements: L.placements || {}, extraNodes: L.extraNodes || [], notes: L.notes || {}, dotted: L.dotted || [] }); setBase(layout.updatedAt)
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  const nodes = [
    ...(people || []).map(p => ({ key: `user:${p.id}`, title: p.name, subtitle: p.jobRole || 'No job role set', comment: layout.notes[`user:${p.id}`] || '' })),
    ...external.filter(r => r.service || r.provider).map(r => ({
      key: `ext:${r.id}`, title: r.provider || r.service, subtitle: r.provider ? r.service : '',
      accent: '#64748b', dashed: true, tag: 'Outsourced', comment: layout.notes[`ext:${r.id}`] || '',
    })),
    // Roles added by hand (1060) - a vacancy, a new role, someone without a
    // login. Styled as on the planned charts.
    ...layout.extraNodes.map(n => ({
      key: n.key, title: n.name || n.role || 'Unnamed', subtitle: n.name ? n.role : '',
      accent: ROLE_STATUS[n.status]?.accent, dashed: ROLE_STATUS[n.status]?.dashed, tag: ROLE_STATUS[n.status]?.tag,
      comment: n.notes || '',
    })),
  ]

  // patch: any of placements / extraNodes / notes / dotted. The rest of the
  // layout goes with it unchanged.
  async function saveLayout(patch) {
    setError('')
    try {
      const d = await mgmtApi('/api/management/org-layout', { data: { ...layout, ...patch }, baseUpdatedAt: base })
      const L = d.data
      setLayout({ placements: L.placements || {}, extraNodes: L.extraNodes || [], notes: L.notes || {}, dotted: L.dotted || [] }); setBase(d.updatedAt)
      return true
    } catch (e) {
      setError(e.message)
      if (/since you opened/i.test(e.message)) load()
      return false
    }
  }
  const save = (nextPlacements) => saveLayout({ placements: nextPlacements })

  // A card's details. People with a login and outsourced services: only the
  // comment - their name and role come from Admin and the services table.
  // Roles added by hand: everything.
  function editCard(key) {
    const x = layout.extraNodes.find(n => n.key === key)
    if (x) setForm({ kind: 'role', ...x })
    else setForm({ kind: 'comment', key, notes: layout.notes[key] || '', label: nodes.find(n => n.key === key)?.title || '' })
  }
  async function saveForm() {
    if (form.kind === 'comment') {
      const notes = { ...layout.notes }
      if (form.notes.trim()) notes[form.key] = form.notes.trim(); else delete notes[form.key]
      if (await saveLayout({ notes })) setForm(null)
      return
    }
    if (!String(form.name || '').trim() && !String(form.role || '').trim()) { setError('Give the role a name or a title.'); return }
    const card = { key: form.key || `role:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: String(form.name || '').trim(), role: String(form.role || '').trim(), status: form.status || 'new', notes: form.notes || '' }
    const extraNodes = form.key ? layout.extraNodes.map(n => n.key === form.key ? card : n) : [...layout.extraNodes, card]
    if (await saveLayout({ extraNodes })) { setForm(null); setEditing(true) }
  }
  async function deleteRole(key) {
    const n = layout.extraNodes.find(x => x.key === key)
    if (!window.confirm(`Delete "${n?.name || n?.role || 'this role'}" from the chart? Anyone under it moves up a level.`)) return
    const up = placements[key]?.parentKey || null
    const next = {}
    for (const [k, p] of Object.entries(placements)) { if (k !== key) next[k] = p.parentKey === key ? { ...p, parentKey: up } : p }
    if (await saveLayout({ placements: next, extraNodes: layout.extraNodes.filter(x => x.key !== key), dotted: layout.dotted.filter(l => l.from !== key && l.to !== key) })) setForm(null)
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
        roots, dotted: layout.dotted,
      })
      saveBlob(blob, `org-chart-${today.toISOString().slice(0, 10)}.png`)
    } catch (e) { setError(`Download failed: ${e.message}`) }
    setBusy(false)
  }

  return (
    <ManagementShell active="org" title="Org Chart" wide>
      <Heading title="Org Chart"
        sub="Everyone with an active portal login, plus outsourced services. New people appear in the tray; leavers drop off on their own."
        action={people && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setForm({ kind: 'role', name: '', role: '', status: 'new', notes: '' })} style={btnDark}>+ Add role</button>
          <button onClick={() => setEditing(v => !v)} style={{ ...btnDark, background: editing ? '#16a34a' : '#fff', color: editing ? '#fff' : '#1a1a19', border: '1px solid #d0d0cc' }}>
            {editing ? 'Done arranging' : 'Arrange chart'}
          </button>
          <button onClick={download} disabled={busy} style={{ ...btnDark, opacity: busy ? 0.5 : 1 }}>{busy ? 'Preparing…' : 'Download chart (PNG)'}</button>
        </div>} />
      <ErrorBar error={error} onClose={() => setError('')} />
      {!people ? (!error && <div style={{ color: '#aaa', padding: 30, textAlign: 'center' }}>Loading…</div>) : (
        <>
          {form && (
            <div style={{ background: '#fff', border: '1px solid #1a1a19', borderRadius: 10, padding: 14, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, alignItems: 'end' }}>
              {form.kind === 'role' ? (
                <>
                  <OField label="Name (blank if not yet known)"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={oInp} /></OField>
                  <OField label="Role"><input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={oInp} /></OField>
                  <OField label="Status">
                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={oInp}>
                      {Object.entries(ROLE_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                    </select>
                  </OField>
                </>
              ) : <div style={{ fontSize: 13, fontWeight: 600, alignSelf: 'center' }}>{form.label}</div>}
              <OField label="Comment under the role (e.g. Office)"><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={oInp} /></OField>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveForm} style={btnDark}>{form.kind === 'role' && !form.key ? 'Add' : 'Save'}</button>
                <button onClick={() => setForm(null)} style={{ ...btnDark, background: '#fff', color: '#1a1a19', border: '1px solid #d0d0cc' }}>Cancel</button>
                {form.kind === 'role' && form.key && <button onClick={() => deleteRole(form.key)} style={{ ...btnDark, background: '#fff', color: '#b42318', border: '1px solid #f5c2c2' }}>Delete</button>}
              </div>
            </div>
          )}
          <OrgTree nodes={nodes} placements={placements} editable={editing} onChange={save} onError={setError}
            onEditNode={editCard} dotted={layout.dotted} onDottedChange={next => saveLayout({ dotted: next })}
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

// Status styles for roles added by hand on the current chart (1060) - the same
// three as the planned charts, so a vacancy looks like a vacancy everywhere.
const ROLE_STATUS = {
  existing: { label: 'Existing', accent: '#be123c', dashed: false, tag: '' },
  new: { label: 'New role', accent: '#16a34a', dashed: true, tag: 'New role' },
  vacancy: { label: 'Vacancy', accent: '#d97706', dashed: true, tag: 'Vacancy' },
}
function OField({ label, children }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#666' }}>{label}{children}</label>
}
const oInp = { fontSize: 13, padding: '7px 8px', border: '1px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }
