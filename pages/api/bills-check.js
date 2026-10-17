// BILLS TO CHECK (1240) - see lib/billsCheck.js. Bookkeeping (1243).
//   GET                                   -> { at, from, settings, groups, other, total, pos }
//   POST { action: 'refresh' }            -> read the bills from Xero again
//   POST { action: 'link', billId, poId } / { action: 'unlink', billId }
//   POST { action: 'nopo', billId, reason } / { action: 'unnopo', billId }
//   POST { action: 'settings', fromDate, tolerancePct, toleranceAbs }
import withTenant from '../../lib/withTenant'
import { get, set } from '../../lib/db'
import { requireArea } from '../../lib/portalAuth'
import { refreshBills, sortBills, NOPO_KEY, SETTINGS_KEY } from '../../lib/billsCheck'
import { BILL_LINKS } from '../../lib/poCommitted'

async function handler(req, res) {
  const session = requireArea(req, res, 'bookkeeping')   // Bookkeeping > Bills to Check (1243)
  if (!session) return
  const by = session.name || session.email || ''
  if (req.method === 'GET') return res.status(200).json(await sortBills())
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}
  const billId = String(b.billId || '')
  if (b.action === 'refresh') {
    const r = await refreshBills()
    if (r.error) return res.status(502).json({ error: r.error })
    return res.status(200).json(await sortBills())
  }
  if (b.action === 'link' || b.action === 'unlink') {
    if (!billId) return res.status(400).json({ error: 'Which bill?' })
    const links = (await get(BILL_LINKS)) || {}
    if (b.action === 'link') { if (!b.poId) return res.status(400).json({ error: 'Which purchase order?' }); links[billId] = String(b.poId) } else delete links[billId]
    await set(BILL_LINKS, links)
    if (b.action === 'link') { const n = (await get(NOPO_KEY)) || {}; if (n[billId]) { delete n[billId]; await set(NOPO_KEY, n) } }
    return res.status(200).json(await sortBills())
  }
  if (b.action === 'nopo' || b.action === 'unnopo') {
    if (!billId) return res.status(400).json({ error: 'Which bill?' })
    const n = (await get(NOPO_KEY)) || {}
    if (b.action === 'nopo') { const reason = String(b.reason || '').trim().slice(0, 300); if (!reason) return res.status(400).json({ error: 'Say why it needs no purchase order.' }); n[billId] = { by, at: new Date().toISOString(), reason } } else delete n[billId]
    await set(NOPO_KEY, n)
    return res.status(200).json(await sortBills())
  }
  if (b.action === 'settings') {
    const pct = Number(b.tolerancePct), abs = Number(b.toleranceAbs)
    const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fromDate || '')) ? String(b.fromDate) : ''
    await set(SETTINGS_KEY, { fromDate, tolerancePct: isFinite(pct) && pct >= 0 ? pct : 2, toleranceAbs: isFinite(abs) && abs >= 0 ? abs : 5 })
    return res.status(200).json(await sortBills())
  }
  return res.status(400).json({ error: 'Unknown action' })
}
export default withTenant(handler)
