// FINANCIAL YEARS (1032). Pure functions - the start month is passed in.
//
// A financial year is named by the calendar year it ENDS in. With a December
// start (Rock), FY2026 runs 1 Dec 2025 to 30 Nov 2026. With an April start
// (typical in New Zealand), FY2027 runs 1 Apr 2026 to 31 Mar 2027. With a
// January start it is simply the calendar year.
//
// The start month comes from the tenant record - see fyStartMonth() in
// lib/tenantSettings.js - never from a constant here.

const pad = (n) => String(n).padStart(2, '0')

// 'YYYY-MM' -> the FY (end year) it belongs to.
export function fyOfMonth(mo, startMonth) {
  const [y, m] = mo.split('-').map(Number)
  return startMonth > 1 && m >= startMonth ? y + 1 : y
}

// The twelve 'YYYY-MM' keys of FY `endYear`, in order.
export function fyMonths(endYear, startMonth) {
  const out = []
  let y = startMonth > 1 ? endYear - 1 : endYear, m = startMonth
  for (let i = 0; i < 12; i++) { out.push(`${y}-${pad(m)}`); m++; if (m > 12) { m = 1; y++ } }
  return out
}

export const monthKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
