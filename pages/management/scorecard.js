import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import ManagementShell, { Heading, ErrorBar, mgmtApi } from '../../components/ManagementShell'
import { useFormat } from '../../components/TenantProvider'
import { BUSINESS_METRICS } from '../../lib/businessScorecard'
import { applyLayout, colourOf } from '../../lib/scorecardLayout'
import ScorecardGear from '../../components/ScorecardGear'
import ScorecardDrillModal from '../../components/ScorecardDrillModal'

// BUSINESS SCORECARD - the whole business, on the same pattern as the other
// scorecards: a card per metric with its trend line, then the month-by-month
// table. Twelve months by default; move From back to look further.
//
// Targets are stored with the others in /api/targets, under 'business'.

const pct = (n) => n == null ? '—' : (n * 100).toFixed(1) + '%'
const count = (n) => n == null ? '—' : String(n)

function trendline(values) {
  const pts = values.map((v, i) => ({ i, v })).filter(p => p.v != null && !isNaN(p.v))
  if (pts.length < 2) return values.map(() => null)
  const n = pts.length
  const sx = pts.reduce((s, p) => s + p.i, 0), sy = pts.reduce((s, p) => s + p.v, 0)
  const sxy = pts.reduce((s, p) => s + p.i * p.v, 0), sx2 = pts.reduce((s, p) => s + p.i * p.i, 0)
  const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx)
  const intercept = (sy - slope * sx) / n
  return values.map((_, i) => slope * i + intercept)
}

function rag(actual, target, mode) {
  if (actual == null || target == null) return '#aaa'
  if (mode === 'lower') return actual <= target ? '#16a34a' : (actual <= target * 1.25 || actual - target <= 1 ? '#f59e0b' : '#e63946')
  const ratio = target === 0 ? 1 : actual / target
  return ratio >= 1 ? '#16a34a' : (ratio >= 0.9 ? '#f59e0b' : '#e63946')
}

export default function BusinessScorecard() {
  const { money } = useFormat()
  const fmt = (m) => m.unit === 'pct' ? pct : (m.unit === 'money' ? (n => n == null ? '—' : money(n, { dp: 0 })) : count)

  // THE PERIOD (1034): From and To months. Empty means "let the server
  // decide", which is the current financial year - so the page opens on it.
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState(null)
  const [targets, setTargets] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')
  // Metric order and hidden metrics, from the gear (1042). Everyone who can
  // open the Management portal is management or admin, so all may edit.
  const [layouts, setLayouts] = useState({})
  const METRICS = applyLayout(BUSINESS_METRICS, layouts.business).visible
  // The month clicked on a drill-down metric (1039): { key, month }.
  const [drill, setDrill] = useState(null)
  // A month is clickable when the route sent the rows behind it (1053).
  const drillRows = (m, month) => (data?.details?.[m.key] || {})[month] || null
  const canDrill = (m, month) => !!DRILL[m.key] && !!drillRows(m, month)
  const openDrill = (m, month) => { if (month && canDrill(m, month)) setDrill({ key: m.key, month }) }

  async function load() {
    setError('')
    try {
      const [d, t] = await Promise.all([
        mgmtApi(`/api/management/scorecard?from=${from}&to=${to}`),
        mgmtApi('/api/targets'),
      ])
      setData(d); setTargets(t.targets || {}); setLayouts(t.layouts || {})
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [from, to])

  const targetOf = (m) => targets?.business?.[m.key]
  const toInput = (m, t) => t == null ? '' : (m.unit === 'pct' ? String(Math.round(t * 1000) / 10) : String(t))
  const showTarget = (m) => { const t = targetOf(m); return t == null ? '—' : fmt(m)(t) }

  async function saveTarget(m) {
    const v = parseFloat(String(editValue).replace(/[%,\s]/g, '').replace(/^[^\d.-]+/, ''))
    if (isNaN(v)) { setError('Enter a number for the target.'); return }
    const value = m.unit === 'pct' ? v / 100 : v
    const prev = targets
    const next = { ...targets, business: { ...(targets?.business || {}), [m.key]: value } }
    setTargets(next); setEditing(null)
    try { await mgmtApi('/api/targets', { targets: next }) }
    catch (e) { setTargets(prev); setError(`Target not saved: ${e.message}`) }
  }

  const months = data?.months || []
  const series = data?.series || []
  const connected = new Set(data?.connected || [])
  // Built from the 'YYYY-MM' text itself (1035). new Date('2025-12-01') is
  // midnight UTC, which in any timezone behind UTC is still 30 November - so a
  // December column could be labelled Nov. Text in, text out: no timezone.
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthLabel = (s) => { const [y, m] = String(s).split('-').map(Number); return `${MON[m - 1]} ${String(y).slice(2)}` }

  const targetBox = (m, small) => editing === m.key + (small ? ':t' : '') ? (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') saveTarget(m); if (e.key === 'Escape') setEditing(null) }}
        style={{ width: small ? 70 : 90, fontSize: small ? 12 : 14, padding: '2px 6px', border: '1px solid #d0d0cc', borderRadius: 4, fontFamily: 'inherit' }} />
      {m.unit === 'pct' && <span style={{ color: '#888', fontSize: 12 }}>%</span>}
      <button onClick={() => saveTarget(m)} style={{ fontSize: 12, padding: '2px 7px', border: 'none', borderRadius: 4, background: '#1a1a19', color: '#fff', cursor: 'pointer' }}>✓</button>
    </span>
  ) : (
    <span style={{ cursor: 'pointer' }} onClick={() => { setEditing(m.key + (small ? ':t' : '')); setEditValue(toInput(m, targetOf(m))) }}>
      {small ? '' : 'Target: '}{showTarget(m)} <span style={{ fontSize: small ? 10 : 12 }}>✎</span>
    </span>
  )

  return (
    <ManagementShell active="scorecard" title="Business Scorecard">
      <Heading title="Business Scorecard" sub="Opens on this financial year. Change From and To to look at any other period - every card follows."
        action={data && (() => {
          // Month pickers rather than <input type="month">, which Firefox
          // does not support. The range shown is whatever the server used.
          const opts = data.choices || []
          const pick = (value, set) => (
            <select value={value} onChange={e => set(e.target.value)} style={{ ...dateInp, fontSize: 13, padding: '7px 10px' }}>
              {opts.map(mo => <option key={mo} value={mo}>{monthLabel(mo)}</option>)}
            </select>
          )
          const isDefault = data.from === data.defaultFrom && data.to === data.defaultTo
          return (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#666' }}>
              <ScorecardGear scorecard="business" defs={BUSINESS_METRICS} layout={layouts.business} canEdit withColours
                onSaved={l => setLayouts(prev => ({ ...prev, business: l }))} />
              From {pick(data.from, v => { setFrom(v); setTo(data.to) })}
              to {pick(data.to, v => { setFrom(data.from); setTo(v) })}
              {!isDefault && <button onClick={() => { setFrom(''); setTo('') }} style={{ ...dateInp, fontSize: 12, cursor: 'pointer', background: '#fff' }}>This financial year</button>}
            </div>
          )
        })()} />
      <ErrorBar error={error} onClose={() => setError('')} />
      {data && !data.fyStartMonth && <YearStartSetup onSaved={() => { setFrom(''); setTo(''); load() }} onError={setError} />}
      {drill && data && (() => {
        const m = BUSINESS_METRICS.find(x => x.key === drill.key)
        const spec = DRILL[drill.key]
        const rows = drillRows(m, drill.month) || []
        return <ScorecardDrillModal title={`${m.label} - ${monthLabel(drill.month)}`} countLabel={spec.countLabel}
          columns={spec.columns({ money: (n) => n == null ? '—' : money(n, { dp: 0 }) })} rows={spec.sort ? [...rows].sort(spec.sort) : rows}
          footer={spec.footer && spec.footer(rows, (n) => money(n, { dp: 0 }))} note={spec.note && spec.note(rows)}
          onClose={() => setDrill(null)} />
      })()}
      {(data?.notices || []).map((n, i) => (
        <div key={i} style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>{n}</div>
      ))}
      {!data ? (!error && <div style={{ color: '#aaa', padding: 40, textAlign: 'center' }}>Loading…</div>) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
            {METRICS.map(m => {
              // A metric with a forecast part (1037): <key> is actual (blue),
              // <key>__f forecast (orange). The trend runs through both.
              const fKey = `${m.key}__f`
              const values = series.map(s => s[m.key] ?? (m.hasForecast ? s[fKey] : null) ?? null)
              // The big figure: the metric's own headline where it has one
              // (gross margin: year to date), otherwise the latest month.
              const head = data.headlines?.[m.key]
              const latest = head ? head.value : [...values].reverse().find(v => v != null) ?? null
              const trend = trendline(values)
              // The orange line starts ON the last actual point, so the two
              // lines join rather than leaving a gap at the handover month.
              const firstF = m.hasForecast ? series.findIndex(s => s[fKey] != null) : -1
              const bridge = firstF > 0 && series[firstF - 1][m.key] != null ? firstF - 1 : -1
              const chartData = series.map((s, i) => ({
                mo: s.month, month: monthLabel(s.month), value: s[m.key], trend: trend[i],
                forecast: m.hasForecast ? (s[fKey] ?? (i === bridge ? s[m.key] : null)) : null,
              }))
              const isOn = connected.has(m.key)
              return (
                // Card colour from the gear (1047): a light tint, a matching
                // border and a stronger left bar. Plain white when none is set.
                <div key={m.key} style={{ background: colourOf(layouts.business, m.key)?.bg || '#fff', borderRadius: 10, padding: '14px 16px',
                  border: `1px solid ${colourOf(layouts.business, m.key)?.edge || '#e1e0d9'}`,
                  borderLeft: colourOf(layouts.business, m.key) ? `5px solid ${colourOf(layouts.business, m.key).edge}` : '1px solid #e1e0d9', display: 'grid', gridTemplateColumns: m.noChart ? '1fr' : '240px 1fr', gap: 20, alignItems: 'center', minHeight: m.noChart ? 0 : 140 }}>
                  <div>
                    <div style={{ fontSize: 13.5, color: '#888', lineHeight: 1.3 }}>{m.label}<div style={{ color: '#bbb', fontSize: 12 }}>({m.basis})</div></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
                      <span style={{ width: 11, height: 11, borderRadius: '50%', background: rag(latest, targetOf(m), m.mode) }} />
                      <div style={{ fontSize: 26, fontWeight: 600, color: '#1a1a19' }}>{fmt(m)(latest)}</div>
                    </div>
                    {head && <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>{head.label}
                      {head.parts && <div style={{ fontSize: 11.5, marginTop: 1 }}>
                        <span style={{ color: '#2a78d6' }}>{fmt(m)(head.parts[0].value)} actual</span>
                        <span style={{ color: '#aaa' }}> + </span>
                        <span style={{ color: '#d97706' }}>{fmt(m)(head.parts[1].value)} forecast</span>
                      </div>}
                      {/* A count's average is a fraction - one decimal place (1044). */}
                      {/* A month headline with the period's total underneath (1063). */}
                      {head.periodTotal != null && <div style={{ fontSize: 12, color: '#555', marginTop: 1 }}>{fmt(m)(head.periodTotal)} total, {head.periodLabel}</div>}
                      {head.avgPerMonth != null && <div style={{ fontSize: 12, color: '#555', marginTop: 1 }}>{m.unit === 'count' ? head.avgPerMonth.toFixed(1) : fmt(m)(head.avgPerMonth)} average per month</div>}
                      <div style={{ color: '#aaa', fontSize: 11 }}>{head.sub}</div>
                      {/* A recorded-at-month-end metric (1045): today's figure for
                          reference - it counts once the month has ended. */}
                      {head.today != null && <div style={{ color: '#888', fontSize: 11 }}>{fmt(m)(head.today)} today - counts once the month ends</div>}</div>}
                    <div style={{ fontSize: 13, color: '#999' }}>{targetBox(m, false)}</div>
                  </div>
                  {/* noChart (1035): the figure only - e.g. the forecast margin,
                      which is one number for the year, not a monthly series. */}
                  {!m.noChart && <div style={{ height: 116 }}>
                    {!isOn ? (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #e1e0d9', borderRadius: 8, color: '#aaa', fontSize: 13 }}>
                        Not connected yet - data source to be agreed
                      </div>
                    ) : values.some(v => v != null) && (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}
                          onClick={DRILL[m.key] ? (e => openDrill(m, e?.activePayload?.[0]?.payload?.mo)) : undefined}
                          style={DRILL[m.key] ? { cursor: 'pointer' } : undefined}>
                          <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#bbb' }} interval="preserveStartEnd" />
                          <YAxis hide domain={['auto', 'auto']} />
                          <Tooltip formatter={(v) => fmt(m)(v)} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="value" stroke="#2a78d6" strokeWidth={2} dot={{ r: 2 }} connectNulls name="Actual" />
                          {m.hasForecast && <Line type="monotone" dataKey="forecast" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} connectNulls name="Forecast" />}
                          <Line type="linear" dataKey="trend" stroke="#bbb" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>}
                  {DRILL[m.key] && <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#aaa', marginTop: -10 }}>Click a month on the graph to see what is behind it.</div>}
                </div>
              )
            })}
          </div>

          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 12 }}>Trend — {months.length ? `${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}` : ''}</div>
          <div style={{ overflowX: 'auto', border: '0.5px solid #e1e0d9', borderRadius: 8, background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...th, minWidth: 230, position: 'sticky', left: 0, background: '#fff', zIndex: 2 }}>Metric</th>
                  <th style={{ ...th, minWidth: 110 }}>Target</th>
                  {months.map(mo => <th key={mo} style={{ ...th, textAlign: 'right', minWidth: 76 }}>{monthLabel(mo)}</th>)}
                </tr>
              </thead>
              <tbody>
                {METRICS.filter(m => !m.noChart).map(m => (
                  <tr key={m.key}>
                    <td style={{ ...td, position: 'sticky', left: 0, background: colourOf(layouts.business, m.key)?.bg || '#fff', borderLeft: `4px solid ${colourOf(layouts.business, m.key)?.edge || 'transparent'}` }}>{m.label}<span style={{ fontSize: 10, color: '#bbb' }}> ({m.basis})</span></td>
                    <td style={{ ...td, color: '#888' }}>{targetBox(m, true)}</td>
                    {series.map(s => {
                      const isF = m.hasForecast && s[m.key] == null && s[`${m.key}__f`] != null
                      const v = isF ? s[`${m.key}__f`] : s[m.key]
                      const dr = canDrill(m, s.month)
                      return <td key={s.month} title={isF ? 'Forecast' : (dr ? 'Click to see what is behind this' : undefined)}
                        onClick={dr ? () => openDrill(m, s.month) : undefined}
                        style={{ ...td, cursor: dr ? 'pointer' : 'default', textDecoration: dr ? 'underline dotted' : 'none', textAlign: 'right', color: v == null ? '#ddd' : (isF ? '#d97706' : rag(v, targetOf(m), m.mode)), fontWeight: v == null ? 400 : 500, fontStyle: isF ? 'italic' : 'normal' }}>{fmt(m)(v)}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ManagementShell>
  )
}

const th = { padding: '8px 10px', fontWeight: 500, color: '#555', textAlign: 'left', fontSize: 12, borderBottom: '1px solid #e1e0d9', whiteSpace: 'nowrap' }
const td = { padding: '7px 10px', borderBottom: '0.5px solid #f0efec', fontSize: 12, whiteSpace: 'nowrap' }
const dateInp = { fontSize: 12, padding: '5px 8px', border: '1px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }

// Shown until the financial year start is set (1036). Once saved, the page
// opens on the current financial year, first month to last.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function YearStartSetup({ onSaved, onError }) {
  const [m, setM] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try { await mgmtApi('/api/management/scorecard', { fyStartMonth: Number(m) }); onSaved() }
    catch (e) { onError(`Not saved: ${e.message}`) }
    setBusy(false)
  }
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5, color: '#92400e' }}>
      <strong>Set your financial year once.</strong> It starts on the 1st of
      <select value={m} onChange={e => setM(e.target.value)} style={{ ...dateInp, fontSize: 13, padding: '6px 8px' }}>
        <option value="">Choose a month…</option>
        {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
      </select>
      <button onClick={save} disabled={!m || busy} style={{ fontSize: 13, padding: '7px 14px', border: 'none', borderRadius: 7, background: '#1a1a19', color: '#fff', cursor: m ? 'pointer' : 'default', opacity: m && !busy ? 1 : 0.4 }}>Save</button>
      <span style={{ fontSize: 12, color: '#a16207' }}>Until then the page shows the last 12 months.</span>
    </div>
  )
}


// WHAT EACH POP-OUT SHOWS (1053). Columns follow the pre-contract scorecard's
// pop-outs; every footer is worked from the rows shown, so it can be checked
// against the figure that was clicked.
const day = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—'
const sum = (rows, k) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0)
const CHANGE_COLS = ({ money }) => [
  { label: 'Project', cell: r => r.title || '—' },
  { label: 'Organisation', cell: r => r.organizationName || '—' },
  { label: 'Estimator', cell: r => r.estimator || '—' },
  { label: 'Previous value', align: 'right', cell: r => r.oldValue ? money(r.oldValue) : 'blank' },
  { label: 'New value', align: 'right', cell: r => money(r.newValue) },
  { label: 'Change', align: 'right', cell: r => <span style={{ color: r.change < 0 ? '#b42318' : '#1a1a19', fontWeight: 600 }}>{money(r.change)}</span> },
  { label: 'Date', cell: r => day(r.date) },
]
const DEAL_COLS = ({ money }) => [
  { label: 'Project', cell: r => r.title || '—' },
  { label: 'Organisation', cell: r => r.organizationName || '—' },
  { label: 'Value', align: 'right', cell: r => money(r.value) },
  { label: 'Estimator', cell: r => r.estimator || '—' },
  { label: 'Sales person', cell: r => r.salesPerson || '—' },
  { label: 'Stage', cell: r => r.stage || '—' },
  { label: 'Lead source', cell: r => r.leadSource || '—' },
  { label: 'Decision date', cell: r => day(r.date) },
]
const DECIDED_COLS = (f) => [...DEAL_COLS(f), { label: 'Result', cell: r => <span style={{ fontWeight: 600, color: r.status === 'won' ? '#16a34a' : '#b42318' }}>{r.status === 'won' ? 'Won' : 'Lost'}</span> }]
const byDateDesc = (a, b) => String(b.date).localeCompare(String(a.date))
const strikeFooter = (rows, money) => {
  const won = sum(rows.filter(r => r.status === 'won'), 'value'), all = sum(rows, 'value')
  return `Won ${money(won)} of ${money(all)} decided = ${all ? (won / all * 100).toFixed(1) : '—'}%  (rolling 6 months to this month end)`
}
const DRILL = {
  valuePriced: { countLabel: 'value change', columns: CHANGE_COLS, sort: byDateDesc, footer: (rows, money) => `Total change ${money(sum(rows, 'change'))}` },
  valuePricedExisting: { countLabel: 'value change', columns: CHANGE_COLS, sort: byDateDesc, footer: (rows, money) => `Total change ${money(sum(rows, 'change'))} - existing customers only` },
  valueSecured: { countLabel: 'project', columns: DEAL_COLS, sort: byDateDesc, footer: (rows, money) => `Total secured ${money(sum(rows, 'value'))}` },
  valueSecuredExisting: { countLabel: 'project', columns: DEAL_COLS, sort: byDateDesc, footer: (rows, money) => `Total secured ${money(sum(rows, 'value'))} - existing customers only` },
  strikeRateValue: { countLabel: 'decided project', columns: DECIDED_COLS, sort: byDateDesc, footer: strikeFooter },
  strikeRateExisting: { countLabel: 'decided project', columns: DECIDED_COLS, sort: byDateDesc, footer: strikeFooter },
  negotiatingPipeline: {
    countLabel: 'project', sort: (a, b) => b.value - a.value,
    columns: ({ money }) => [
      { label: 'Project', cell: r => r.title || '—' },
      { label: 'Organisation', cell: r => r.organizationName || '—' },
      { label: 'Estimator', cell: r => r.estimator || '—' },
      { label: 'Value at month end', align: 'right', cell: r => money(r.value) },
    ],
    footer: (rows, money) => rows.length ? `Total in Negotiating at ${day(rows[0].date)}: ${money(sum(rows, 'value'))}` : null,
  },
  paylessNotices: {
    countLabel: 'credit note', sort: byDateDesc,
    columns: ({ money }) => [
      { label: 'Job no', cell: r => r.jobNo || '—' },
      { label: 'Project', cell: r => r.projectName || '—' },
      { label: 'Credit note', cell: r => r.creditNoteNumber || '—' },
      { label: 'Against invoice', cell: r => r.appliedToInvoice || '—' },
      { label: 'Customer', cell: r => r.contact || '—' },
      { label: 'Date', cell: r => day(r.date) },
      { label: 'Amount', align: 'right', cell: r => money(r.amount) },
    ],
    note: (rows) => rows[0]?.adjustedTo != null ? `This month was adjusted by hand on the Commercial Scorecard: counted as ${rows[0].adjustedTo}, not ${rows.length}.` : null,
    footer: (rows, money) => `Total credited ${money(sum(rows, 'amount'))}`,
  },
  avgValueSecured: {
    countLabel: 'project', columns: DEAL_COLS, sort: byDateDesc,
    footer: (rows, money) => rows.length ? `Total ${money(sum(rows, 'value'))} over ${rows.length} project${rows.length === 1 ? '' : 's'} = ${money(sum(rows, 'value') / rows.length)} average  (rolling 6 months, variations excluded)` : null,
  },
  waterIngressRockFault: {
    countLabel: 'report', sort: byDateDesc,
    columns: () => [
      { label: 'Date on form', cell: r => <span>{day(r.date)}{!r.dateFromForm && <span title="No date on the form - date submitted used" style={{ color: '#d97706' }}> *</span>}</span> },
      { label: 'Project', cell: r => r.project || '—' },
      { label: 'Reported by', cell: r => r.reportedBy || '—' },
      { label: 'Surveyed by', cell: r => r.surveyedBy || '—' },
      { label: 'Cause', cell: r => <span style={{ display: 'inline-block', maxWidth: 380 }}>{r.cause || '—'}</span> },
      { label: '', cell: r => <a href={`/operations/forms?open=${encodeURIComponent(r.id)}`} target="_blank" rel="noreferrer" style={{ color: '#2a78d6', whiteSpace: 'nowrap' }}>Open report ↗</a> },
    ],
    note: (rows) => rows.some(r => !r.dateFromForm) ? '* No date filled in on the form - the date it was submitted is used.' : null,
  },
}
