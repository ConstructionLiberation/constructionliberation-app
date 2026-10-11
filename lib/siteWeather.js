// SITE WEATHER FOR A PROJECT REPORT (1067) - server only.
//
//   1. The project's address -> its UK POSTCODE (the last postcode in the text).
//   2. Postcode -> latitude / longitude: postcodes.io (free, no key).
//   3. That spot, those dates -> daily weather: Open-Meteo. Its UK data comes
//      from the Met Office's own high-resolution model, on a grid of about 2 km.
//
// Recent weeks (the last ~3 months) come from Open-Meteo's forecast service,
// which holds recent days as observed by the models; older weeks from its
// historical archive.
//
// OPEN-METEO'S FREE SERVICE IS FOR NON-COMMERCIAL USE. Set OPEN_METEO_API_KEY
// (from an Open-Meteo paid plan) in Vercel for business use; the same calls
// then go to its customer service. Without the key it still works.
//
// No postcode -> no lookup, and the report says so. It never guesses a place.

const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/gi

export function postcodeFrom(address) {
  const all = [...String(address || '').toUpperCase().matchAll(UK_POSTCODE)]
  if (!all.length) return null
  const m = all[all.length - 1]
  return `${m[1]} ${m[2]}`
}

// WMO weather codes, as Open-Meteo returns them, in plain words.
const CODES = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail',
}
export const describe = (code) => CODES[code] ?? '—'

// FLAGS - indicative thresholds, shown on the report so they can be argued
// with. Rain day: 1 mm or more. Heavy rain: 10 mm or more. High wind: gusts of
// 30 mph or more.
export const THRESHOLDS = { rainMm: 1, heavyRainMm: 10, gustMph: 30 }
export function flagsFor(d) {
  const f = []
  if (d.rainMm != null && d.rainMm >= THRESHOLDS.heavyRainMm) f.push('Heavy rain')
  else if (d.rainMm != null && d.rainMm >= THRESHOLDS.rainMm) f.push('Rain')
  if (d.gustMph != null && d.gustMph >= THRESHOLDS.gustMph) f.push('High wind')
  if (d.tMin != null && d.tMin <= 0) f.push('Frost')
  return f
}

const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d) }

// The days a report covers: the day after the previous report for the project
// up to the report's own date - the same window its photos come from - capped
// at 14 days; a first report (or a long gap) covers the 7 days to its date.
// Only FINISHED days: never today or later.
export function reportWindow({ reportDate, lastReportDate, today = iso(new Date()) }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reportDate || ''))) return null
  let from = lastReportDate && /^\d{4}-\d{2}-\d{2}/.test(lastReportDate) ? addDays(String(lastReportDate).slice(0, 10), 1) : addDays(reportDate, -6)
  if (from < addDays(reportDate, -13)) from = addDays(reportDate, -6)
  const yesterday = addDays(today, -1)
  const to = reportDate < today ? reportDate : yesterday
  if (to < from) return { from, to, empty: true }
  return { from, to, empty: false }
}

// -> { postcode, lat, lon, from, to, days: [...], source, fetchedAt } or throws
// with a message the report can show.
export async function fetchSiteWeather({ address, from, to, fetchImpl = fetch, now = new Date() }) {
  const postcode = postcodeFrom(address)
  if (!postcode) throw Object.assign(new Error('No UK postcode in the project address - add one to show the weather.'), { code: 'NO_POSTCODE' })

  const pc = await fetchImpl(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, ''))}`)
  const pj = await pc.json().catch(() => ({}))
  if (!pc.ok || !pj?.result) throw Object.assign(new Error(`Postcode ${postcode} was not recognised.`), { code: 'BAD_POSTCODE' })
  const lat = pj.result.latitude, lon = pj.result.longitude

  const key = process.env.OPEN_METEO_API_KEY
  const recent = from >= iso(new Date(now.getTime() - 85 * 86400000))
  const host = recent ? (key ? 'customer-api.open-meteo.com/v1/forecast' : 'api.open-meteo.com/v1/forecast')
    : (key ? 'customer-archive-api.open-meteo.com/v1/archive' : 'archive-api.open-meteo.com/v1/archive')
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), timezone: 'Europe/London', wind_speed_unit: 'mph',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max',
    start_date: from, end_date: to,
  })
  if (key) q.set('apikey', key)
  const wr = await fetchImpl(`https://${host}?${q}`)
  const wj = await wr.json().catch(() => ({}))
  if (!wr.ok || !wj?.daily?.time) throw Object.assign(new Error(`Weather service: ${wj?.reason || `error ${wr.status}`}`), { code: 'WEATHER' })

  const D = wj.daily, r1 = (v) => v == null ? null : Math.round(v * 10) / 10, r0 = (v) => v == null ? null : Math.round(v)
  const days = D.time.map((date, i) => {
    const d = {
      date, code: D.weather_code?.[i] ?? null, desc: describe(D.weather_code?.[i]),
      tMax: r1(D.temperature_2m_max?.[i]), tMin: r1(D.temperature_2m_min?.[i]),
      rainMm: r1(D.precipitation_sum?.[i]), windMph: r0(D.wind_speed_10m_max?.[i]), gustMph: r0(D.wind_gusts_10m_max?.[i]),
    }
    d.flags = flagsFor(d)
    return d
  })
  return { postcode, lat, lon, from, to, days, source: recent ? 'Open-Meteo (Met Office UK model)' : 'Open-Meteo historical archive', fetchedAt: new Date().toISOString() }
}
