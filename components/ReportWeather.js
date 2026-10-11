// The weather table on a Project Report (1067) - one row per day of the
// report's week, with the flags that matter for roofing. Used by the editor
// and the read-only view, so they always match. Data from
// /api/project-report-weather (lib/siteWeather.js).
const FLAG = { 'Heavy rain': '#b91c1c', 'Rain': '#2563eb', 'High wind': '#b45309', 'Frost': '#0e7490' }
const dayLabel = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export default function ReportWeather({ weather }) {
  if (!weather || !weather.days?.length) return null
  const th = { textAlign: 'left', padding: '6px 8px', fontSize: 11.5, fontWeight: 600, color: '#666', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }
  const td = { padding: '6px 8px', fontSize: 12.5, borderBottom: '0.5px solid #f2f2f2', whiteSpace: 'nowrap' }
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr>
            <th style={th}>Day</th><th style={th}>Conditions</th><th style={{ ...th, textAlign: 'right' }}>High / low</th>
            <th style={{ ...th, textAlign: 'right' }}>Rain</th><th style={{ ...th, textAlign: 'right' }}>Wind / gusts</th><th style={th}>Flags</th>
          </tr></thead>
          <tbody>
            {weather.days.map(d => (
              <tr key={d.date}>
                <td style={td}>{dayLabel(d.date)}</td>
                <td style={td}>{d.desc}</td>
                <td style={{ ...td, textAlign: 'right' }}>{d.tMax ?? '—'}° / {d.tMin ?? '—'}°C</td>
                <td style={{ ...td, textAlign: 'right' }}>{d.rainMm ?? '—'} mm</td>
                <td style={{ ...td, textAlign: 'right' }}>{d.windMph ?? '—'} / {d.gustMph ?? '—'} mph</td>
                <td style={td}>{(d.flags || []).map(f => <span key={f} style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 600, color: FLAG[f] || '#555', border: `1px solid ${FLAG[f] || '#ccc'}55`, borderRadius: 999, padding: '1px 7px', marginRight: 4 }}>{f}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
        Postcode {weather.postcode} · {weather.source}. Flags: rain 1 mm+, heavy rain 10 mm+, high wind gusts 30 mph+, frost 0°C or below.
      </div>
    </div>
  )
}
