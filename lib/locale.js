import { currentTenant } from './tenantContext'
import { TERMS, DEFAULT_LOCALE } from './terms'

// LOCALE - MONEY, DATES, NUMBERS AND WORDS, PER CUSTOMER.
//
// SERVER SIDE ONLY. currentTenant() reads AsyncLocalStorage, which is Node.
// Importing this into a component drags async_hooks into the browser bundle.
// The client gets the same values through /api/tenant-brand - see
// components/TenantProvider.js, which exposes the same four function names so
// call sites read identically on both sides.
//
// WHY THIS EXISTS
// ---------------
// 159 hard-coded pound signs across 43 files, and 368 uses of 'en-GB' or
// 'GBP'. The tenant record has carried `currency` and `locale` fields since
// tenancy was built and NOTHING HAS EVER READ THEM - the same shape as
// logoUrl(), which is tenant-aware and has no consumers.
//
// A pound sign is not the problem. toLocaleString('en-GB') decides the decimal
// separator, the thousands grouping and the date order as well as the symbol,
// so a US tenant needs the whole format and not a swapped glyph. That is why
// this is a library rather than a find-and-replace.

const LOCALE_CODES = {
  UK: 'en-GB',
  US: 'en-US',
  AU: 'en-AU',
  NZ: 'en-NZ',
}

const CURRENCY_CODES = {
  UK: 'GBP',
  US: 'USD',
  AU: 'AUD',
  NZ: 'NZD',
}

// The customer's locale key: 'UK' | 'US' | 'AU' | 'NZ'.
// Falls back rather than throwing. An unrecognised or missing locale should
// render the app in British English, not break the page - unlike a sending
// address, a wrong date format is visible and reportable rather than silent.
export function localeKey() {
  const t = currentTenant()
  const raw = String((t && t.locale) || process.env.DEFAULT_LOCALE || DEFAULT_LOCALE).toUpperCase()
  return LOCALE_CODES[raw] ? raw : DEFAULT_LOCALE
}

// The BCP-47 tag for Intl.
export function localeCode() {
  return LOCALE_CODES[localeKey()]
}

// The ISO currency code. An explicit currency on the tenant record wins, so a
// customer can run, say, a NZ locale with GBP if that is genuinely what they
// invoice in.
export function currencyCode() {
  const t = currentTenant()
  const explicit = String((t && t.currency) || '').toUpperCase()
  if (/^[A-Z]{3}$/.test(explicit)) return explicit
  return CURRENCY_CODES[localeKey()]
}

// MONEY.
//   money(1234.5)              -> "GBP 1,234.50"  /  "$1,234.50"
//   money(1234.5, { dp: 0 })   -> "GBP 1,235"
//   money(null)                -> ""           (not "GBP 0.00" - a figure we do
//                                               not have is not zero, and a
//                                               zero against a target is a lie)
export function money(n, opts = {}) {
  if (n === null || n === undefined || n === '') return ''
  const num = Number(n)
  if (!Number.isFinite(num)) return ''
  const dp = opts.dp === undefined ? 2 : opts.dp
  try {
    return new Intl.NumberFormat(localeCode(), {
      style: 'currency',
      currency: currencyCode(),
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    }).format(num)
  } catch {
    return String(num)
  }
}

// The bare symbol, for a column header or an input prefix where the number is
// formatted separately.
export function currencySymbol() {
  try {
    const parts = new Intl.NumberFormat(localeCode(), { style: 'currency', currency: currencyCode() })
      .formatToParts(0)
    const sym = parts.find(p => p.type === 'currency')
    return sym ? sym.value : ''
  } catch {
    return ''
  }
}

// PLAIN NUMBERS. Separators still differ by locale even with no symbol.
export function num(n, dp = 0) {
  if (n === null || n === undefined || n === '') return ''
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  try {
    return new Intl.NumberFormat(localeCode(), { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(v)
  } catch {
    return String(v)
  }
}

// DATES.
//   'short'  10/03/2026  (03/10/2026 in the US - the reason this exists)
//   'medium' 10 Mar 2026
//   'long'   10 March 2026
//   'month'  Mar 26
const DATE_STYLES = {
  short: { day: '2-digit', month: '2-digit', year: 'numeric' },
  medium: { day: '2-digit', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  month: { month: 'short', year: '2-digit' },
}

export function formatDate(d, style = 'short') {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(localeCode(), DATE_STYLES[style] || DATE_STYLES.short).format(date)
  } catch {
    return ''
  }
}

// WORDS.
//
//   term('variation')  -> "variation"    UK/AU/NZ
//                      -> "change order" US
//
// Unknown keys return the key itself rather than throwing or returning empty,
// so a term added to a page before it is added to the map degrades to
// something readable instead of a blank.
//
// See lib/terms.js for which entries are cosmetic and which are STATUTORY.
// Statutory ones deliberately do not vary yet.
export function term(key, opts = {}) {
  const entry = TERMS[key]
  if (!entry) return String(key)
  const k = localeKey()
  const word = entry[k] || entry[DEFAULT_LOCALE] || String(key)
  if (opts.plural) return pluralise(word)
  if (opts.title) return word.replace(/\b\w/g, c => c.toUpperCase())
  return word
}

function pluralise(word) {
  if (/(s|x|z|ch|sh)$/i.test(word)) return word + 'es'
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies'
  return word + 's'
}

// Everything the browser needs, in one object. /api/tenant-brand returns this
// and components/TenantProvider.js reimplements the four functions above from
// it, so a call site reads the same on either side.
export function localePayload() {
  return {
    localeKey: localeKey(),
    localeCode: localeCode(),
    currency: currencyCode(),
    currencySymbol: currencySymbol(),
    terms: TERMS,
    defaultLocale: DEFAULT_LOCALE,
  }
}
