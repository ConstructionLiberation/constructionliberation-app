import { useFormat } from './TenantProvider'

// THE CUSTOMER'S LOGO, IN ONE PLACE.
//
// This line existed nineteen times:
//
//   <img src="/rock-logo.jpg" alt="Rock Roofing" style={{ height: 32, ... }} />
//
// Four of those nineteen are in the nav components, which between them are
// imported by forty-four pages - so on a tenant that is not Rock, Rock's
// actual logo was rendering in the nav bar of most of the portal. Same shape
// as the login page found on 19 September, just further in.
//
// logoUrl() has been tenant-aware since pkg937 and had ZERO consumers. This
// is the consumer.
//
// ---------------------------------------------------------------------------
// WHAT IT RENDERS, IN ORDER
// ---------------------------------------------------------------------------
// 1. Feed not back yet   -> a transparent box of the right size. Reserving the
//                           space matters: every page in the portal mounts one
//                           of these, and a 32px element appearing a moment
//                           after paint shifts the whole nav row sideways.
// 2. Tenant has a logo   -> the image.
// 3. No logo, has a name -> initials on a plain square. A customer who has not
//                           uploaded a logo yet still gets a nav bar with an
//                           anchor in it rather than a gap.
// 4. Neither             -> the transparent box. Never a broken image, and
//                           NEVER a fallback to /rock-logo.jpg. A default that
//                           renders somebody else's brand is the bug this
//                           component exists to remove.
//
// ---------------------------------------------------------------------------
// COLOURS
// ---------------------------------------------------------------------------
// All four nav bars are dark (#1a1a19 and #1a1a2e), so the initials square is
// white on dark, which is how the Rock logo image reads on them today. If a
// light-background consumer turns up later, give it a `tone` prop then - do
// not add one speculatively.

// LEGAL SUFFIXES AND ARTICLES ONLY.
// This list had 'construction', 'contractors', 'group' and 'holdings' in it
// for about ten minutes, until running it turned "Construction Liberation"
// into "LI". Those are parts of a company's actual name, not noise.
const SUFFIXES = new Set([
  'ltd', 'limited', 'llc', 'inc', 'plc', 'pty', 'llp',
  'co', 'company', 'corp', 'corporation', 'the', 'and',
])

// "Rock Roofing Ltd" -> RR.  "WPC" -> WPC.  "Demo" -> DE.
export function initialsOf(name) {
  if (!name) return ''
  const words = String(name)
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return ''

  // Drop the legal suffix, but only if something is left after dropping it -
  // a company actually called "The Group" should not end up blank.
  const kept = words.filter(w => !SUFFIXES.has(w.toLowerCase()))
  const use = kept.length ? kept : words

  if (use.length === 1) {
    const w = use[0]
    return (w.length <= 3 ? w : w.slice(0, 2)).toUpperCase()
  }
  return use.slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

export default function BrandLogo({ size = 32, radius = 4, style = {} }) {
  const { companyName, logoUrl, loaded } = useFormat()

  // flexShrink stops the logo being squeezed to nothing when a nav row wraps
  // on a narrow window. OperationsNav set it by hand; every consumer wants it.
  //
  // display MATTERS. An inline span ignores width and height, so the
  // placeholder box would collapse to nothing. All five consumers today are
  // flex containers, which blockifies their children and hides that - which is
  // exactly the kind of thing that works until the sixth consumer is not.
  const box = { display: 'inline-block', height: size, width: size, borderRadius: radius, flexShrink: 0, ...style }

  if (!loaded) return <span style={box} aria-hidden="true" />

  if (logoUrl) {
    return <img src={logoUrl} alt={companyName || ''} style={{ ...box, objectFit: 'contain' }} />
  }

  const initials = initialsOf(companyName)
  if (!initials) return <span style={box} aria-hidden="true" />

  return (
    <span
      title={companyName}
      style={{
        ...box,
        background: '#fff',
        color: '#1a1a19',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(10, Math.round(size * 0.38)),
        fontWeight: 700,
        letterSpacing: 0.5,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >{initials}</span>
  )
}
