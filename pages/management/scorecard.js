import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import ManagementShell, { Heading, ErrorBar, mgmtApi } from '../../components/ManagementShell'
import { useFormat } from '../../components/TenantProvider'
import { BUSINESS_METRICS } from '../../lib/businessScorecard'

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

  async function load() {
    setError('')
    try {
      const [d, t] = await Promise.all([
        mgmtApi(`/api/management/scorecard?from=${from}&to=${to}`),
        mgmtApi('/api/targets'),
      ])
      setData(d); setTargets(t.targets || {})
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
  const monthLabel = (s) => new Date(s + '-01').toLocaleDateString(undefined, { month: 'short', year: '2-digit' })

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
              From {pick(data.from, v => { setFrom(v); setTo(data.to) })}
              to {pick(data.to, v => { setFrom(data.from); setTo(v) })}
              {!isDefault && <button onClick={() => { setFrom(''); setTo('') }} style={{ ...dateInp, fontSize: 12, cursor: 'pointer', background: '#fff' }}>This financial year</button>}
            </div>
          )
        })()} />
      <ErrorBar error={error} onClose={() => setError('')} />
      {(data?.notices || []).map((n, i) => (
        <div key={i} style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>{n}</div>
      ))}
      {!data ? (!error && <div style={{ color: '#aaa', padding: 40, textAlign: 'center' }}>Loading…</div>) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
            {BUSINESS_METRICS.map(m => {
              const values = series.map(s => s[m.key])
              // The big figure: the metric's own headline where it has one
              // (gross margin: year to date), otherwise the latest month.
              const head = data.headlines?.[m.key]
              const latest = head ? head.value : [...values].reverse().find(v => v != null) ?? null
              const trend = trendline(values)
              const chartData = series.map((s, i) => ({ month: monthLabel(s.month), value: s[m.key], trend: trend[i] }))
              const isOn = connected.has(m.key)
              return (
                <div key={m.key} style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #e1e0d9', display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'center', minHeight: 140 }}>
                  <div>
                    <div style={{ fontSize: 13.5, color: '#888', lineHeight: 1.3 }}>{m.label}<div style={{ color: '#bbb', fontSize: 12 }}>({m.basis})</div></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
                      <span style={{ width: 11, height: 11, borderRadius: '50%', background: rag(latest, targetOf(m), m.mode) }} />
                      <div style={{ fontSize: 26, fontWeight: 600, color: '#1a1a19' }}>{fmt(m)(latest)}</div>
                    </div>
                    {head && <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>{head.label}<div style={{ color: '#aaa', fontSize: 11 }}>{head.sub}</div></div>}
                    <div style={{ fontSize: 13, color: '#999' }}>{targetBox(m, false)}</div>
                  </div>
                  <div style={{ height: 116 }}>
                    {!isOn ? (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #e1e0d9', borderRadius: 8, color: '#aaa', fontSize: 13 }}>
                        Not connected yet - data source to be agreed
                      </div>
                    ) : values.some(v => v != null) && (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                          <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#bbb' }} interval="preserveStartEnd" />
                          <YAxis hide domain={['auto', 'auto']} />
                          <Tooltip formatter={(v) => fmt(m)(v)} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="value" stroke="#2a78d6" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                          <Line type="linear" dataKey="trend" stroke="#bbb" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
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
                {BUSINESS_METRICS.map(m => (
                  <tr key={m.key}>
                    <td style={{ ...td, position: 'sticky', left: 0, background: '#fff' }}>{m.label}<span style={{ fontSize: 10, color: '#bbb' }}> ({m.basis})</span></td>
                    <td style={{ ...td, color: '#888' }}>{targetBox(m, true)}</td>
                    {series.map(s => {
                      const v = s[m.key]
                      return <td key={s.month} style={{ ...td, textAlign: 'right', color: v == null ? '#ddd' : rag(v, targetOf(m), m.mode), fontWeight: v == null ? 400 : 500 }}>{fmt(m)(v)}</td>
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
