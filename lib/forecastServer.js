import { businessFinancials } from '../pages/api/business-financials'
import { forecastFromViews } from './forecastMonths'

// THE FORECAST P&L, BUILT ON THE SERVER (1035).
//
// The Forecast P&L page builds its model in the browser from three Business
// Financials views. This runs the same three views here - through the route's
// own body, so not a copy of any of it - and the same model with the same
// saved settings (forecastFromViews). The figures therefore match the page.
//
// The caller must have done its own auth: this bypasses the admin check on
// purpose, so that a management user can see two numbers from the forecast
// without being given the reports. Call inside withTenant.
async function view(name) {
  let status = 200, body = null
  const res = {
    status(c) { status = c; return res },
    json(d) { body = d; return res },
    setHeader() { return res },
    end() { return res },
  }
  await businessFinancials({ method: 'GET', query: { view: name }, body: {} }, res)
  if (status >= 400 || !body) throw new Error(`Business Financials ${name} view failed${body?.error ? `: ${body.error}` : ` (${status})`}`)
  return body
}

export async function computeForecastPl() {
  const [oh, mg, cf] = await Promise.all([view('budgets-overheads'), view('margin'), view('cashflow')])
  const model = forecastFromViews({ oh, mg, cf })
  if (!model) throw new Error('The Forecast P&L could not be built from Budgets, Margin and Cash Flow.')
  return model
}
