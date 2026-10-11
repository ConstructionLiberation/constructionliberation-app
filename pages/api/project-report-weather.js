import withTenant from '../../lib/withTenant'
import { fetchSiteWeather, reportWindow } from '../../lib/siteWeather'

// GET /api/project-report-weather?address=...&date=YYYY-MM-DD&last=YYYY-MM-DD (1067)
//
// The weather for the days a Project Report covers - from the day after the
// previous report (last) to the report's date - at the project's postcode.
// Finished days only. See lib/siteWeather.js.
//
// Guarded, like /api/project-reports, by the login middleware; it reads only
// public weather and returns nothing about the business.
async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const { address = '', date = '', last = '' } = req.query
  const win = reportWindow({ reportDate: String(date), lastReportDate: String(last || '') })
  if (!win) return res.status(400).json({ error: 'The report needs a date first.' })
  if (win.empty) return res.status(200).json({ weather: null, note: 'No finished days in this report\'s week yet - the weather fills in from tomorrow.' })
  try {
    const weather = await fetchSiteWeather({ address: String(address), from: win.from, to: win.to })
    return res.status(200).json({ weather })
  } catch (e) {
    // A missing or unknown postcode is the user's to fix - say so plainly.
    const userFixable = e.code === 'NO_POSTCODE' || e.code === 'BAD_POSTCODE'
    return res.status(userFixable ? 200 : 502).json({ weather: null, note: userFixable ? e.message : undefined, error: userFixable ? undefined : e.message })
  }
}

export default withTenant(handler)
