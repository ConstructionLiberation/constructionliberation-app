// PURCHASE ORDERS IN THE CASH FLOW (1223). A forecast's materials line can be a PO,
// ticked in on the Commercial Cash Flow (Add from purchase orders). Such a line
// carries poId. It must only ever forecast what is STILL COMMITTED on that PO now -
// once a bill comes in, that part is an actual cost, and forecasting it as well would
// count it twice. So everywhere a materials line is turned into money (the project
// cash flow, and the business cash flow and forecast P&L) uses poLineAmount:
//   - an ordinary line              -> its saved amount, unchanged
//   - a PO line                     -> the smaller of its saved amount and what is still
//                                      committed on the PO now; 0 once the PO is billed,
//                                      closed, cancelled or deleted
//   - committed figures unavailable -> the saved amount (never wipe the forecast because
//                                      a lookup failed)
export { poLineAmount } from './poShared'   // the rule is client-safe; it lives there (1223)
// the server's map of PO id -> still committed (approved / sent; closed counts 0)
export async function poCommittedById() {
  const { listPos, loadPo } = await import('./purchaseOrders')
  const { committedOf, billLinks } = await import('./poCommitted')
  const links = await billLinks()   // bills linked by hand (1240)
  const { get } = await import('./db')
  const linesOf = {}, out = {}
  for (const s of await listPos()) {
    if (!['approved', 'sent', 'closed'].includes(s.status)) continue
    const pid = String(s.projectId || '')
    if (!(pid in linesOf)) linesOf[pid] = (await get(`costs:lines:${pid}`).catch(() => null)) || []
    const po = await loadPo(s.id); if (po) out[po.id] = committedOf(po, linesOf[pid], links).committed
  }
  return out
}

// COSTS REMAINING ticked into forecasts (1232): every project's cost-remaining lines, as
// { '<xero project id>:<line id>': amount } - the CM's current figures
export async function remainingByRef() {
  const { keys, get } = await import('./db')
  const out = {}
  for (const k of (await keys('forecast:remaining:*')) || []) {
    const pid = String(k).replace('forecast:remaining:', '')
    const rec = (await get(k).catch(() => null)) || {}
    for (const l of (Array.isArray(rec.lines) ? rec.lines : [])) if (l && l.id) out[`${pid}:${l.id}`] = Number(l.amount) || 0
  }
  return out
}
