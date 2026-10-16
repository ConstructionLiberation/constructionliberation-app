// SUPPLIERS (1198) - price-list suppliers linked to their Xero contacts.
//
//   GET                                   -> { suppliers, contacts, contactsAt, xero }
//   POST { action: 'refresh' }            -> re-read the Xero contacts
//   POST { action: 'link', supplier, contactIds, main }
//   POST { action: 'unlink', supplier }
//   POST { action: 'po', supplier, po }   -> a supplier we raise POs with, or not
//   POST { action: 'dext', supplier, set } -> Vinay: its Dext rule matches (accounts, management, admin)
//
// Xero is only READ here (contacts). A company with no Xero connected gets the
// list with nothing to link to and a note - a normal state, not an error.
import withTenant from '../../lib/withTenant'
import { requireArea } from '../../lib/portalAuth'
import { normRole } from '../../lib/roles'
import { get, set, getTokens, saveTokens } from '../../lib/db'
import { refreshXeroToken, fetchContacts } from '../../lib/xero'
import { loadPriceList } from '../../lib/priceListStore'
import { CONTACTS_KEY, LINKS_KEY, suggest, dextShould } from '../../lib/suppliers'

async function priceListSuppliers() {
  const { products } = await loadPriceList()
  const n = {}
  for (const p of products || []) { const s = String(p.supplier || '').trim(); if (s) n[s] = (n[s] || 0) + 1 }
  return Object.entries(n).map(([name, products]) => ({ name, products })).sort((a, b) => a.name.localeCompare(b.name))
}

async function handler(req, res) {
  const session = requireArea(req, res, 'purchasing'); if (!session) return
  const by = session.name || session.email || ''
  if (req.method === 'GET') {
    const [list, cache, links, tokens] = await Promise.all([priceListSuppliers(), get(CONTACTS_KEY), get(LINKS_KEY), getTokens()])
    const contacts = (cache && cache.contacts) || []
    const L = links || {}
    const suppliers = list.map(s => {
      const link = L[s.name] || null
      return { ...s, link, dextShould: dextShould(link), suggestions: link && link.contacts && link.contacts.length ? [] : suggest(s.name, contacts) }
    })
    return res.status(200).json({ suppliers, contacts, contactsAt: (cache && cache.at) || null, xero: !!tokens, canDext: ['accounts', 'management', 'admin'].includes(normRole(session.role)) })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}
  if (b.action === 'refresh') {
    let tokens = await getTokens()
    if (!tokens) return res.status(200).json({ ok: false, notConnected: true, message: 'Xero is not connected for this company - nothing to read contacts from.' })
    try { const nt = await refreshXeroToken(tokens.refresh_token); tokens = { ...tokens, ...nt }; await saveTokens(tokens) } catch {}
    let contacts
    try { contacts = await fetchContacts(tokens.access_token, tokens.tenant_id) } catch (e) { return res.status(502).json({ error: `Could not read Xero contacts: ${e.message}` }) }
    const at = new Date().toISOString()
    await set(CONTACTS_KEY, { at, contacts })
    return res.status(200).json({ ok: true, count: contacts.length, at })
  }
  const name = String(b.supplier || '').trim()
  if (!name) return res.status(400).json({ error: 'Which supplier?' })
  const links = (await get(LINKS_KEY)) || {}
  const cur = links[name] || {}
  const now = new Date().toISOString()
  if (b.action === 'link') {
    const cache = (await get(CONTACTS_KEY)) || { contacts: [] }
    const byId = new Map(cache.contacts.map(c => [c.id, c]))
    const ids = [...new Set((b.contactIds || []).map(String))].filter(id => byId.has(id))
    if (!ids.length) return res.status(400).json({ error: 'Pick at least one Xero contact' })
    const main = ids.includes(String(b.main)) ? String(b.main) : ids[0]
    links[name] = { ...cur, contacts: ids.map(id => ({ id, name: byId.get(id).name })), main, po: cur.po !== false, linkedBy: by, linkedAt: now }
  } else if (b.action === 'unlink') {
    delete links[name]
  } else if (b.action === 'po') {
    // changing whether we raise POs with a supplier changes its Dext rule - so it needs setting again
    links[name] = { ...cur, po: !!b.po, dextSet: false, dextSetBy: '', dextSetAt: null }
  } else if (b.action === 'dext') {
    if (!['accounts', 'management', 'admin'].includes(normRole(session.role))) return res.status(403).json({ error: 'Only the bookkeeper or an admin can confirm the Dext settings' })
    links[name] = { ...cur, dextSet: !!b.set, dextSetBy: b.set ? by : '', dextSetAt: b.set ? now : null }
  } else return res.status(400).json({ error: 'Unknown action' })
  await set(LINKS_KEY, links)
  return res.status(200).json({ ok: true, link: links[name] || null })
}
export default withTenant(handler)
