import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import OperationsShell, { PageHeading, SubTabs } from '../../components/OperationsShell'
import HiddenPeoplePicker from '../../components/HiddenPeoplePicker'
import { personKey } from '../../lib/scorecardPeople'

const pct = (n) => n == null ? '—' : (n * 100).toFixed(1) + '%'
const num = (n) => n == null ? '—' : String(n)
const gbp = (n) => n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)
const monthLabel = (s) => s ? new Date(s + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : ''

// Least-squares trend line over the series (nulls skipped), matching pre-contract.
function computeTrendline(data) {
  const pts = data.map((d, i) => ({ i, v: d.value })).filter(d => d.v != null && !isNaN(d.v))
  if (pts.length < 2) return data.map(() => null)
  const n = pts.length
  const sx = pts.reduce((s, p) => s + p.i, 0), sy = pts.reduce((s, p) => s + p.v, 0)
  const sxy = pts.reduce((s, p) => s + p.i * p.v, 0), sx2 = pts.reduce((s, p) => s + p.i * p.i, 0)
  const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx)
  const intercept = (sy - slope * sx) / n
  return data.map((_, i) => slope * i + intercept)
}

// higher-better % / count → normal; lower-better count → 'lower'/'zero'; binary Yes/No.
function rag(actual, target, mode = 'normal') {
  if (actual == null) return '#aaa'
  if (mode === 'binary') return actual > 0 ? '#16a34a' : '#e63946'
  if (mode === 'zero') return actual === 0 ? '#16a34a' : (actual <= (target || 0) ? '#f59e0b' : '#e63946')
  if (target == null) return '#aaa'
  const ratio = actual / target
  if (mode === 'lower') return actual <= target ? '#16a34a' : (ratio <= 1.25 ? '#f59e0b' : '#e63946')
  return ratio >= 1 ? '#16a34a' : (ratio >= 0.8 ? '#f59e0b' : '#e63946')
}

// WHO THE TABS ARE, TAKEN FROM THE DATA.
//
// This was Will, Mike and Dori - Rock's team, hardcoded. On any other tenant
// the page showed three tabs for people who do not exist and matched no
// projects to any of them.
//
// /api/ops-scorecards has ALWAYS returned cmNames, built from the Contracts
// Manager actually on each project, and this page ignored it. opsNames is new
// and comes from the tenant's own people by job role.
//
// Same approach as the pre-contract scorecard in pkg988: derive the list from
// the data rather than configure it, so it cannot drift from what the metrics
// filter on.
const buildTabs = (cmNames, opsNames) => [
  ...(cmNames || []).map(n => ({ key: `cm:${n}`, label: n, kind: 'cm', name: n, role: 'Contracts Manager' })),
  ...(opsNames || []).map(n => ({ key: `ops:${n}`, label: n, kind: 'ops', name: n, role: 'Operations Manager' })),
]

const CARD_H = 150

// Nobody to show. A new customer with no Contracts Manager set on any project
// and no Operations Manager in their people hits this, and it should say so
// rather than render an empty grid.
function EmptyState() {
  return (
    <div style={{ padding: 28, color: '#666', fontSize: 13.5, background: '#fff', border: '0.5px solid #e1e0d9', borderRadius: 10 }}>
      No Contracts Managers or Operations Managers found yet. Contracts Managers come
      from the Contracts Manager set on your projects; Operations Managers from the job
      role on your portal users.
    </div>
  )
}

export default function OpsScorecardsPage() {
  const [sub, setSub] = useState('')
  const [data, setData] = useState(null)
  const [targets, setTargets] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingTarget, setEditingTarget] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [toolboxMonth, setToolboxMonth] = useState('')
  const [saveError, setSaveError] = useState('')
  // Hidden tabs (1025) - people who have left. Keys are personKey(tab.key),
  // so 'cm:' and 'ops:' stay distinct for someone who was both.
  const [hiddenPeople, setHiddenPeople] = useState([])
  const [showHidden, setShowHidden] = useState(false)
  const [myRole, setMyRole] = useState('')
  useEffect(() => {
    fetch('/api/portal-auth?action=me').then(r => r.ok ? r.json() : null).then(d => setMyRole(d?.user?.role || '')).catch(() => {})
  }, [])

  const _now = new Date()
  const _yearAgo = new Date(_now.getFullYear() - 1, _now.getMonth(), 1)
  const [dateFrom, setDateFrom] = useState(_yearAgo.toISOString().split('T')[0])
  const [dateTo, setDateTo] = useState(_now.toISOString().split('T')[0])

  const ALL_TABS = buildTabs(data?.cmNames, data?.opsNames)
  const SUB_TABS = showHidden ? ALL_TABS : ALL_TABS.filter(t => !hiddenPeople.includes(personKey(t.key)))
  // Whichever tab is selected, else the first that exists. NULL when the
  // tenant has neither a Contracts Manager on any project nor an Operations
  // Manager in its people - guarded everywhere below rather than assumed,
  // because an empty team is a real state for a new customer on day one.
  const current = SUB_TABS.find(t => t.key === sub) || SUB_TABS[0] || null

  async function load() {
    setLoading(true)
    try {
      const [d, t] = await Promise.all([
        fetch(`/api/ops-scorecards?from=${dateFrom}&to=${dateTo}`).then(r => r.json()),
        fetch('/api/targets').then(r => r.json()),
      ])
      setData(d); setTargets(t.targets || {})
      setHiddenPeople(t.hiddenPeople?.operations || [])
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [dateFrom, dateTo])

  // PERCENTAGES ARE TYPED AS PERCENTAGES.
  //
  // Targets are stored as fractions (1 = 100%) because that is what the
  // metrics are. The box used to save exactly what was typed, so 30 was stored
  // as 30 and shown as 3000%. Now a % target is shown in the box as 30 and
  // saved as 0.3. "30%" is accepted too. Anything that is not a number is
  // refused and the box stays open, rather than storing the text.
  const isPct = (m) => m.format === pct
  const targetToInput = (m, t) => t == null ? '' : (isPct(m) ? String(Math.round(t * 1000) / 10) : String(t))

  async function saveTarget(m, raw) {
    const v = parseFloat(String(raw).replace('%', '').trim())
    if (isNaN(v)) { setSaveError('Enter a number.'); return }
    const value = isPct(m) ? v / 100 : v
    const prev = targets
    const next = { ...targets, [m.targetType]: { ...(targets?.[m.targetType] || {}), [m.targetKey]: value } }
    setTargets(next); setEditingTarget(null); setSaveError('')
    try {
      const r = await fetch('/api/targets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targets: next }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Save failed (${r.status})`)
    } catch (e) { setTargets(prev); setSaveError(`Target not saved: ${e.message}`) }
  }

  // Toolbox Talk for a given month: true, false, or null to clear. A refusal
  // is shown, not swallowed - the page reloads only after a real save.
  async function setToolbox(month, value) {
    setSaveError('')
    try {
      const r = await fetch('/api/ops-scorecards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, toolbox: value }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Save failed (${r.status})`)
      load()
    } catch (e) { setSaveError(`Toolbox Talk not saved: ${e.message}`) }
  }
  async function togglePerson(key, hide) {
    setSaveError('')
    try {
      const r = await fetch('/api/targets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidePerson: { scorecard: 'operations', key, hidden: hide } }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Save failed (${r.status})`)
      setHiddenPeople(d.hiddenPeople?.operations || [])
    } catch (e) { setSaveError(`Not saved: ${e.message}`) }
  }

  // Table cell click: not set -> Yes -> No -> not set.
  const nextToolbox = (v) => v == null ? true : (v === 1 ? false : null)

  const cmEntry = () => {
    if (!data?.cms) return null
    if (!current) return null
    const want = current.name.toLowerCase()
    const key = Object.keys(data.cms).find(k => k.toLowerCase().includes(want))
    return key ? data.cms[key] : null
  }

  // Metric definitions. seriesKey pulls the value from each month's object.
  const CM_METRICS = [
    { key: 'gpMargin', label: 'Gross margin — their projects', sub: 'Live & defects projects', format: pct, targetType: 'contractsManager', targetKey: 'gpMargin', mode: 'normal', latestOnly: true },
    { key: 'psnPct', label: 'Pre-Start Notifications', sub: 'Completed vs required', format: pct, targetType: 'contractsManager', targetKey: 'psnPct', mode: 'normal' },
  ]
  const OPS_METRICS = [
    { key: 'sosPct', label: 'Start On Site Checklists', sub: 'Completed vs required', format: pct, targetType: 'operationsManager', targetKey: 'sosPct', mode: 'normal' },
    { key: 'diaryPct', label: 'Daily Site Diaries', sub: 'Completed vs required', format: pct, targetType: 'operationsManager', targetKey: 'diaryPct', mode: 'normal' },
    { key: 'wahPct', label: 'Work Area Handovers', sub: 'Completed vs required', format: pct, targetType: 'operationsManager', targetKey: 'wahPct', mode: 'normal' },
    { key: 'toolbox', label: 'Toolbox Talk', sub: '1 required per month - pick a month to tick it off', format: (v) => v == null ? 'Not set' : (v ? 'Yes' : 'No'), targetType: 'operationsManager', targetKey: 'toolbox', mode: 'binary', isToolbox: true },
  ]

  const entry = !current ? null : (current.kind === 'cm' ? cmEntry() : (data?.ops || null))
  const series = entry?.series || []
  const latest = entry?.latest || {}
  const metrics = current && current.kind === 'ops' ? OPS_METRICS : CM_METRICS
  const latestMonth = data?.months?.[data.months.length - 1]
  const months = data?.months || []

  function renderCard(m) {
    const actual = latest[m.key]
    const target = targets?.[m.targetType]?.[m.targetKey]
    const color = rag(actual, target, m.mode)
    const isEditing = editingTarget === m.key

    const trendData = series.map(s => ({ month: monthLabel(s.month), value: s[m.key] }))
    const trend = computeTrendline(trendData)
    const chartData = trendData.map((d, i) => ({ ...d, trend: trend[i] }))
    const showChart = !m.latestOnly

    return (
      <div key={m.key} style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #e1e0d9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'grid', gridTemplateColumns: showChart ? '220px 1fr' : '1fr', gap: 20, alignItems: 'center', minHeight: CARD_H, boxSizing: 'border-box' }}>
        <div style={!showChart ? { textAlign: 'center' } : undefined}>
          <div style={{ fontSize: 13.5, color: '#888', marginBottom: 6, lineHeight: 1.3 }}>
            {m.label}
            {m.sub && <div style={{ color: '#bbb', fontSize: 12 }}>({m.sub})</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: showChart ? 'flex-start' : 'center' }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <div style={{ fontSize: 27, fontWeight: 600, color: '#1a1a19' }}>{m.format(actual)}</div>
          </div>
          {m.key === 'gpMargin' && latest._gpTotals && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>Profit {gbp(latest._gpTotals.totalProfit)} · {latest._gpTotals.count} project{latest._gpTotals.count !== 1 ? 's' : ''}</div>
          )}
          <div style={{ marginTop: 8 }}>
            {m.isToolbox ? (() => {
              // Any month in the range, defaulting to the latest. Clicking the
              // button that is already on clears the month back to 'not set'.
              const tm = (toolboxMonth && months.includes(toolboxMonth)) ? toolboxMonth : latestMonth
              const tv = (series.find(s => s.month === tm) || {}).toolbox
              return (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={tm || ''} onChange={e => setToolboxMonth(e.target.value)} style={{ ...dateInp, padding: '6px 8px' }}>
                    {[...months].reverse().map(mo => <option key={mo} value={mo}>{monthLabel(mo)}</option>)}
                  </select>
                  <button onClick={() => setToolbox(tm, tv === 1 ? null : true)} style={{ ...toggleBtn, ...(tv === 1 ? toggleOn : {}) }}>Yes</button>
                  <button onClick={() => setToolbox(tm, tv === 0 ? null : false)} style={{ ...toggleBtn, ...(tv === 0 ? toggleOff : {}) }}>No</button>
                </div>
              )
            })() : isEditing ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: showChart ? 'flex-start' : 'center' }}>
                <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') saveTarget(m, editValue); if (e.key === 'Escape') setEditingTarget(null) }}
                  style={{ width: 80, fontSize: 15, padding: '3px 6px', border: '1px solid #d0d0cc', borderRadius: 4, fontFamily: 'inherit' }} />
                {isPct(m) && <span style={{ fontSize: 14, color: '#888' }}>%</span>}
                <button onClick={() => saveTarget(m, editValue)} style={{ fontSize: 13, padding: '3px 8px', border: 'none', borderRadius: 4, background: '#1a1a19', color: '#fff', cursor: 'pointer' }}>✓</button>
              </div>
            ) : (
              <div style={{ fontSize: 13.5, color: '#999', cursor: 'pointer' }} onClick={() => { setEditingTarget(m.key); setEditValue(targetToInput(m, target)) }}>
                Target: {target == null ? '—' : (m.format === pct ? pct(target) : (m.format === gbp ? gbp(target) : target))} <span>✎</span>
              </div>
            )}
          </div>
        </div>
        {showChart && (
          <div style={{ height: CARD_H - 24 }}>
            {series.some(s => s[m.key] != null) && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#bbb' }} interval="preserveStartEnd" />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip formatter={(v) => m.format(v)} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="value" stroke="#2a78d6" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  <Line type="linear" dataKey="trend" stroke="#bbb" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <OperationsShell active="scorecards" title="Scorecards">
      <PageHeading title="Operations Scorecards" sub="Contracts Managers and Operations Managers, taken from your own team." />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SubTabs
          tabs={SUB_TABS.map(t => ({ ...t, sub: t.role }))}
          active={current ? current.key : ''}
          onChange={setSub}
        />
        <HiddenPeoplePicker
          people={ALL_TABS.map(t => ({ key: t.key, label: t.label, sub: t.role }))}
          hidden={hiddenPeople}
          canEdit={myRole === 'management' || myRole === 'admin'}
          showHidden={showHidden} setShowHidden={setShowHidden}
          onToggle={togglePerson}
        />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#888' }}>From</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={dateInp} />
            <span style={{ fontSize: 12, color: '#888' }}>To</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={dateInp} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#888' }}>
            <span style={{ fontWeight: 600 }}>Key:</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a' }} /> On target</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} /> Close (≥80%)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e63946' }} /> Below target</span>
          </div>
        </div>
      </div>

      {saveError && (
        <div style={{ background: '#fdecec', border: '1px solid #f5c2c2', color: '#b42318', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>{saveError}</div>
      )}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>Loading…</div>
      ) : !current && ALL_TABS.length ? (
        <div style={{ padding: 28, color: '#666', fontSize: 13.5, background: '#fff', border: '0.5px solid #e1e0d9', borderRadius: 10 }}>
          Every scorecard is hidden. Use People to show one again.
        </div>
      ) : !current ? (
        <EmptyState />
      ) : current.kind === 'cm' && !entry ? (
        <div style={{ background: '#fff', border: '1px dashed #ddd', borderRadius: 12, padding: 30, textAlign: 'center', color: '#999' }}>
          No projects found for {current.label}. Check the Contracts Manager name on their projects matches "{current.name}".
        </div>
      ) : (
        <>
          {/* Full-width graph cards (no current-month column) */}
          <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
            {current ? current.label : ''}{latestMonth && <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>— Latest: {monthLabel(latestMonth)}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
            {metrics.map(renderCard)}
          </div>

          {/* Bottom trend table — same as pre-contract */}
          {months.length > 0 && (
            <>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 12 }}>Trend — {monthLabel(months[0])} to {monthLabel(months[months.length - 1])}</div>
              <div style={{ overflowX: 'auto', maxHeight: 460, border: '0.5px solid #e1e0d9', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e1e0d9', position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
                      <th style={{ ...thS, minWidth: 220, position: 'sticky', left: 0, background: '#fff', zIndex: 3 }}>Metric</th>
                      <th style={{ ...thS, minWidth: 110, position: 'sticky', left: 220, background: '#fff', zIndex: 3 }}>Target</th>
                      {months.map(m => <th key={m} style={{ ...thS, textAlign: 'right', minWidth: 72 }}>{monthLabel(m)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map(md => {
                      const target = targets?.[md.targetType]?.[md.targetKey]
                      return (
                        <tr key={md.key} style={{ borderBottom: '0.5px solid #f0efec' }}>
                          <td style={{ ...tdS, position: 'sticky', left: 0, background: '#fff' }}>{md.label}{md.sub && <span style={{ fontSize: 10, color: '#bbb' }}> ({md.sub})</span>}</td>
                          <td style={{ ...tdS, color: '#888', position: 'sticky', left: 220, background: '#fff' }}>
                            {editingTarget === `table-${md.key}` ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') saveTarget(md, editValue); if (e.key === 'Escape') setEditingTarget(null) }} style={{ width: 64, fontSize: 12, padding: '2px 6px', border: '1px solid #d0d0cc', borderRadius: 4, fontFamily: 'inherit' }} />
                                {isPct(md) && <span style={{ fontSize: 11, color: '#888' }}>%</span>}
                                <button onClick={() => saveTarget(md, editValue)} style={{ fontSize: 11, padding: '2px 6px', border: 'none', borderRadius: 4, background: '#1a1a19', color: '#fff', cursor: 'pointer' }}>✓</button>
                              </div>
                            ) : md.isToolbox ? (
                              <span style={{ color: '#bbb' }}>—</span>
                            ) : (
                              <span style={{ cursor: 'pointer' }} onClick={() => { setEditingTarget(`table-${md.key}`); setEditValue(targetToInput(md, target)) }}>
                                {target == null ? '—' : (md.format === pct ? pct(target) : (md.format === gbp ? gbp(target) : target))} <span style={{ fontSize: 10 }}>✎</span>
                              </span>
                            )}
                          </td>
                          {series.map(s => {
                            const val = s[md.key]
                            const color = rag(val, target, md.mode)
                            return (
                              <td key={s.month}
                                onClick={md.isToolbox ? () => setToolbox(s.month, nextToolbox(val)) : undefined}
                                title={md.isToolbox ? 'Click: not set → Yes → No' : undefined}
                                style={{ ...tdS, textAlign: 'right', color: val != null ? color : '#ddd', fontWeight: val != null ? 500 : 400, cursor: md.isToolbox ? 'pointer' : 'default' }}>
                                {val != null ? md.format(val) : '—'}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </OperationsShell>
  )
}

const thS = { padding: '8px 10px', fontWeight: 500, color: '#555', textAlign: 'left', fontSize: 12, borderBottom: '1px solid #e1e0d9', whiteSpace: 'nowrap' }
const tdS = { padding: '7px 10px', borderBottom: '0.5px solid #f0efec', fontSize: 12, verticalAlign: 'middle' }
const dateInp = { fontSize: 12, padding: '5px 8px', border: '1px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }
const toggleBtn = { flex: 1, maxWidth: 90, padding: '8px 0', borderRadius: 8, border: '1px solid #e1e0d9', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#888' }
const toggleOn = { background: '#16a34a', color: '#fff', borderColor: '#16a34a' }
const toggleOff = { background: '#e63946', color: '#fff', borderColor: '#e63946' }
