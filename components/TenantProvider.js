import { createContext, useContext, useEffect, useState } from 'react'
// Imported, NOT reimplemented. lib/locale.js cannot come into the bundle
// because currentTenant() reads AsyncLocalStorage; lib/businessDate.js imports
// nothing at all and is pure Intl, so it is the same code on both sides. The
// third fault class in this codebase is the client keeping its own copy of a
// server rule - this avoids adding a fourth.
import { businessToday, businessNow, businessDay } from '../lib/businessDate'

// THE SAME FOUR FUNCTIONS AS lib/locale.js, ON THE CLIENT.
//
// lib/locale.js cannot be imported into a component: currentTenant() reads
// AsyncLocalStorage, which is Node-only, and importing it would drag
// async_hooks into the browser bundle - exactly what the bundlecheck exists to
// catch.
//
// So the values come over the wire from /api/tenant-brand and the same four
// names are reimplemented here. money(), num(), formatDate() and term() read
// identically on both sides, which is the point: a developer moving a line
// between a page and an API route should not have to rewrite it, and should
// not be able to leave a pound sign behind by accident.
//
// DEFAULTS ARE BRITISH, AND THAT IS DELIBERATE.
// If the feed has not arrived yet, the page renders in en-GB rather than
// blank. A brief flash of the wrong date format is better than a layout that
// jumps or a page that cannot render at all. `loaded` is exposed for the rare
// case where a component would rather wait.

const FALLBACK = {
  // EMPTY, NOT A WORD.
  //
  // This was 'Portal', and the login page renders `{brand} Portal` - so when
  // the feed failed the heading read "Portal Portal". A placeholder that reads
  // as real content composes into nonsense at the call site. An empty string
  // lets each call site choose its own fallback, and makes the failure look
  // like a missing name rather than a wrong one.
  name: '',
  logoUrl: '',
  localeKey: 'UK',
  localeCode: 'en-GB',
  timezone: 'Europe/London',
  gleniganTrackingFrom: null,
  currency: 'GBP',
  currencySymbol: '\u00A3',
  terms: {},
  resolved: false,
}

const TenantContext = createContext({ ...FALLBACK, loaded: false })

export function TenantProvider({ children }) {
  const [brand, setBrand] = useState(FALLBACK)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/tenant-brand')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d || d.error) return
        setBrand({ ...FALLBACK, ...d })
      })
      .catch(() => {
        // Branding failing must never stop a page rendering. The fallback is
        // British English and the word "Portal", which is wrong but readable.
      })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  return (
    <TenantContext.Provider value={{ ...brand, loaded }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  return useContext(TenantContext)
}

// The formatters, as a hook. Destructure what you need:
//   const { money, formatDate, term, companyName } = useFormat()
export function useFormat() {
  const t = useContext(TenantContext)

  const money = (n, opts = {}) => {
    if (n === null || n === undefined || n === '') return ''
    const v = Number(n)
    if (!Number.isFinite(v)) return ''
    const dp = opts.dp === undefined ? 2 : opts.dp
    try {
      return new Intl.NumberFormat(t.localeCode, {
        style: 'currency', currency: t.currency,
        minimumFractionDigits: dp, maximumFractionDigits: dp,
      }).format(v)
    } catch { return String(v) }
  }

  const num = (n, dp = 0) => {
    if (n === null || n === undefined || n === '') return ''
    const v = Number(n)
    if (!Number.isFinite(v)) return ''
    try {
      return new Intl.NumberFormat(t.localeCode, { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(v)
    } catch { return String(v) }
  }

  const DATE_STYLES = {
    short: { day: '2-digit', month: '2-digit', year: 'numeric' },
    medium: { day: '2-digit', month: 'short', year: 'numeric' },
    long: { day: 'numeric', month: 'long', year: 'numeric' },
    month: { month: 'short', year: '2-digit' },
  }

  const formatDate = (d, style = 'short') => {
    if (!d) return ''
    const date = d instanceof Date ? d : new Date(d)
    if (isNaN(date.getTime())) return ''
    try {
      return new Intl.DateTimeFormat(t.localeCode, DATE_STYLES[style] || DATE_STYLES.short).format(date)
    } catch { return '' }
  }

  const term = (key, opts = {}) => {
    const entry = t.terms && t.terms[key]
    if (!entry) return String(key)
    const word = entry[t.localeKey] || entry.UK || String(key)
    if (opts.title) return word.replace(/\b\w/g, c => c.toUpperCase())
    return word
  }

  return {
    money,
    num,
    formatDate,
    term,
    // Bound to the customer's timezone, so a page calls businessToday() with
    // no argument and gets the right answer instead of London's.
    //
    // WATCH THE FIRST RENDER. Until the feed lands these return the fallback
    // (London). A value read straight into useState or frozen in a useMemo
    // whose deps do not include `loaded` will KEEP that first answer for the
    // life of the page. Either include `loaded` in the deps or re-derive in an
    // effect when it flips.
    businessToday: () => businessToday(t.timezone),
    businessNow: () => businessNow(t.timezone),
    businessDay: (d) => businessDay(d, t.timezone),
    timezone: t.timezone,
    gleniganTrackingFrom: t.gleniganTrackingFrom,
    currencySymbol: t.currencySymbol,
    companyName: t.name,
    logoUrl: t.logoUrl,
    localeKey: t.localeKey,
    loaded: t.loaded,
  }
}
