import { useEffect, useState } from 'react'
import ManagementShell, { Heading, ErrorBar, mgmtApi } from '../../components/ManagementShell'
import { btnDark } from '../../components/MgmtRowsTable'
import OrgTree from '../../components/OrgTree'
import { useFormat } from '../../components/TenantProvider'
import { drawOrgChart, saveBlob } from '../../components/orgChartImage'
import { buildForest } from '../../lib/orgTree'

// 1-YEAR ORG CHART (1031) - the structure the business is planning for.
//
// Unlike the current chart, nobody here comes from the logins: it is a plan,
// so it holds people in new positions, roles that do not exist yet and
// vacancies. Every card is added by hand - or copied once from the current
// chart as a starting point, then reshaped.
//
// Stored whole at mgmt:org:future ({ nodes, placements }), with the same
// "someone saved since you opened it" protection as the other documents.
const STATUS = {
  existing: { label: 'Existing', accent: '#be123c', dashed: false, tag: '' },
  new: { label: 'New role', accent: '#16a34a', dashed: true, tag: 'New role' },
  vacancy: { label: 'Vacancy', accent: '#d97706', dashed: true, tag: 'Vacancy' },
}
const newKey = () => `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
const EMPTY = { name: '', role: '', status: 'new', notes: '' }

export default function OrgChartOneYear() {
  const { companyName } = useFormat()
  const [doc, setDoc] = useState(null)          // { nodes, placements }
  const [base, setBase] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)        // { key?, name, role, status, notes }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try { const d = await mgmtApi('/api/management/org-future'); setDoc({ nodes: d.data.nodes || [], placements: d.data.placements || {} }); setBase(d.updatedAt) }
    catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  async function save(next) {
    setError('')
    try {
      const d = await mgmtApi('/api/management/org-future', { data: next, baseUpdatedAt: base })
      setDoc({ nodes: d.data.nodes, placements: d.data.placements }); setBase(d.updatedAt)
      return true
    } catch (e) {
      setError(e.message)
      if (/since you opened/i.test(e.message)) load()
      return false
    }
  }

  async function saveForm() {
    if (!form.name.trim() && !form.role.trim()) { setError('Give the card a name or a role.'); return }
    const card = { key: form.key || newKey(), name: form.name.trim(), role: form.role.trim(), status: form.status, notes: form.notes }
    const nodes = form.key ? doc.nodes.map(n => n.key === form.key ? card : n) : [...doc.nodes, card]
    if (await save({ nodes, placements: doc.placements })) { setForm(null); setEditing(true) }
  }

  async function deleteCard(key) {
    const n = doc.nodes.find(x => x.key === key)
    if (!window.confirm(`Delete "${n?.name || n?.role || 'this card'}" from the 1-year chart? Anyone under it moves up a level.`)) return
    // Re-parent its reports to its own parent before removing it.
    const up = doc.placements[key]?.parentKey || null
    const placements = {}
    for (const [k, p] of Object.entries(doc.placements)) {
      if (k === key) continue
      placements[k] = p.parentKey === key ? { ...p, parentKey: up } : p
    }
    if (await save({ nodes: doc.nodes.filter(x => x.key !== key), placements })) setForm(null)
  }

  // A one-off copy of the current chart as the starting point - the people
  // and roles as they are today, in the positions set on the current chart.
  async function copyCurrent() {
    if (doc.nodes.length && !window.confirm('Replace the whole 1-year chart with a copy of the current one?')) return
    setBusy(true); setError('')
    try {
      const [org, layout] = await Promise.all([mgmtApi('/api/management/org-chart'), mgmtApi('/api/management/org-layout')])
      const cur = layout.data?.placements || {}
      const map = {}, nodes = []
      for (const p of org.people || []) { const k = newKey(); map[`user:${p.id}`] = k; nodes.push({ key: k, name: p.name, role: p.jobRole || '', status: 'existing', notes: '' }) }
      for (const r of org.external || []) {
        if (!r.service && !r.provider) continue
        const k = newKey(); map[`ext:${r.id}`] = k
        nodes.push({ key: k, name: r.provider || r.service, role: r.provider ? `${r.service} (outsourced)` : 'Outsourced', status: 'existing', notes: '' })
      }
      // Keep positions only for people who are still here, through
      // buildForest so a leaver's team moves up exactly as on the current chart.
      const curNodes = Object.keys(map).map(key => ({ key }))
      const { parentOf } = buildForest(curNodes, cur)
      const placements = {}
      for (const [oldKey, newK] of Object.entries(map)) {
        if (!cur[oldKey]) continue
        const parent = parentOf.get(oldKey)
        placements[newK] = { parentKey: parent ? map[parent] : null, order: cur[oldKey].order ?? 0 }
      }
      if (await save({ nodes, placements })) setEditing(true)
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  async function download() {
    setBusy(true); setError('')
    try {
      const { roots } = buildForest(treeNodes, doc.placements)
      if (!roots.length) throw new Error('Place someone on the chart first.')
      const today = new Date()
      const blob = await drawOrgChart({
        title: `${companyName ? companyName + ' - ' : ''}1-Year Organisation Chart`,
        subtitle: `Plan as at ${today.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`,
        roots,
      })
      saveBlob(blob, `org-chart-1-year-${today.toISOString().slice(0, 10)}.png`)
    } catch (e) { setError(`Download failed: ${e.message}`) }
    setBusy(false)
  }

  const treeNodes = (doc?.nodes || []).map(n => ({
    key: n.key,
    title: n.name || n.role || 'Unnamed',
    subtitle: n.name ? n.role : '',
    accent: STATUS[n.status]?.accent, dashed: STATUS[n.status]?.dashed, tag: STATUS[n.status]?.tag,
  }))

  return (
    <ManagementShell active="org-1y" title="1-Year Org Chart" wide>
      <Heading title="1-Year Org Chart" sub="The structure you are planning for. Add new roles and vacancies, then arrange them."
        action={doc && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setForm({ ...EMPTY })} style={btnDark}>+ Add person or role</button>
          <button onClick={() => setEditing(v => !v)} style={{ ...btnDark, background: editing ? '#16a34a' : '#fff', color: editing ? '#fff' : '#1a1a19', border: '1px solid #d0d0cc' }}>
            {editing ? 'Done arranging' : 'Arrange chart'}
          </button>
          <button onClick={copyCurrent} disabled={busy} style={{ ...btnDark, background: '#fff', color: '#1a1a19', border: '1px solid #d0d0cc' }}>Copy current chart</button>
          <button onClick={download} disabled={busy} style={{ ...btnDark, opacity: busy ? 0.5 : 1 }}>Download chart (PNG)</button>
        </div>} />
      <ErrorBar error={error} onClose={() => setError('')} />

      {form && (
        <div style={{ background: '#fff', border: '1px solid #1a1a19', borderRadius: 10, padding: 14, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Name (blank if not yet known)"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inp} /></Field>
          <Field label="Role"><input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={inp} /></Field>
          <Field label="Status">
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inp}>
              {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Notes"><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inp} /></Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveForm} style={btnDark}>{form.key ? 'Save' : 'Add'}</button>
            <button onClick={() => setForm(null)} style={{ ...btnDark, background: '#fff', color: '#1a1a19', border: '1px solid #d0d0cc' }}>Cancel</button>
            {form.key && <button onClick={() => deleteCard(form.key)} style={{ ...btnDark, background: '#fff', color: '#b42318', border: '1px solid #f5c2c2' }}>Delete</button>}
          </div>
        </div>
      )}

      {!doc ? (!error && <div style={{ color: '#aaa', padding: 30, textAlign: 'center' }}>Loading…</div>) : (
        <>
          <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#888', marginBottom: 10 }}>
            {Object.entries(STATUS).map(([k, s]) => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 14, height: 10, borderTop: `3px solid ${s.accent}`, border: `1px ${s.dashed ? 'dashed' : 'solid'} #ccc`, borderTopColor: s.accent, borderTopWidth: 3 }} />{s.label}
              </span>
            ))}
          </div>
          <OrgTree nodes={treeNodes} placements={doc.placements} editable={editing}
            onChange={next => save({ nodes: doc.nodes, placements: next })}
            onEditNode={key => { const n = doc.nodes.find(x => x.key === key); if (n) setForm({ ...EMPTY, ...n }) }}
            onError={setError}
            trayTitle="Not placed yet" />
          {doc.nodes.length === 0 && (
            <div style={{ color: '#999', fontSize: 13, textAlign: 'center', marginTop: 8 }}>
              Start with <strong>Copy current chart</strong> to reshape today's structure, or <strong>+ Add person or role</strong> to build it from scratch.
            </div>
          )}
        </>
      )}
    </ManagementShell>
  )
}

function Field({ label, children }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#666' }}>{label}{children}</label>
}
const inp = { fontSize: 13, padding: '7px 8px', border: '1px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }
