// SUPPLIERS LINKED TO XERO CONTACTS (1198)
//
// Each supplier on the price list is linked to its supplier contact(s) in Xero, so
// a purchase order, the supplier's bill and the supplier always line up. A
// supplier may be linked to SEVERAL Xero contacts (duplicates such as "Soprema"
// and "Soprema UK Ltd"): one is the MAIN contact, used for raising POs; a bill on
// any of them counts as that supplier's.
//
//   xero:contacts     { at, contacts: [{ id, name, supplier, customer, email }] }   a copy, refreshed on request
//   suppliers:links   { [price-list supplier name]: { contacts: [{ id, name }], main, po, dextSet, dextSetBy, dextSetAt, linkedBy, linkedAt } }
//
// "Dext should publish as": Awaiting Approval for a supplier we raise POs with
// (po, on by default - POs are raised from the price list), else Awaiting Payment.
// The app cannot change Dext, so Vinay ticks "Set in Dext" once its rule matches.

export const CONTACTS_KEY = 'xero:contacts'
export const LINKS_KEY = 'suppliers:links'
// the Dext tick for a Xero contact we raise POs with that is NOT on the price list (1207)
//   suppliers:dext   { [contactId]: { dextSet, dextSetBy, dextSetAt } }
export const DEXT_KEY = 'suppliers:dext'

const STOP = new Set(['ltd', 'limited', 'plc', 'llp', 'uk', 'the', 'co', 'company', 'group', 'and', 'inc', 'gb'])
export const words = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w && !STOP.has(w))
// how alike two names are, 0..1 - shared words over all words, with a lift when
// one name's words are all in the other ("Soprema" ~ "Soprema UK Ltd")
export function likeness(a, b) {
  const A = new Set(words(a)), B = new Set(words(b))
  if (!A.size || !B.size) return 0
  let both = 0; for (const w of A) if (B.has(w)) both++
  const jac = both / (A.size + B.size - both)
  const within = both === Math.min(A.size, B.size) ? 0.35 : 0
  return Math.min(1, jac + within)
}
// the closest Xero contacts to a supplier name, best first (suppliers favoured on a tie)
export function suggest(name, contacts, n = 3) {
  return contacts.map(c => ({ ...c, score: likeness(name, c.name) + (c.supplier ? 0.01 : 0) }))
    .filter(c => c.score >= 0.34).sort((x, y) => y.score - x.score).slice(0, n)
    .map(c => ({ id: c.id, name: c.name, supplier: c.supplier, score: Math.round(Math.min(1, c.score) * 100) / 100 }))
}
export const dextShould = (link) => (!link || link.po !== false) ? 'Awaiting Approval' : 'Awaiting Payment'
