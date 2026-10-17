// BILLS TO CHECK (1240) - every supplier bill in Xero since a start date, sorted against the
// purchase orders:
//   matched      its PO number quoted (or linked by hand), the PO not over-billed
//   over         the PO's bills, all together ex VAT, more than its value (beyond the tolerance)
//   cancelled    quoting / linked to a PO that was cancelled
//   noPo         from a supplier you raise POs with, but no PO found - link it, or "no PO needed"
//   noPoNeeded   marked as not needing a PO (with the reason)
//   other        suppliers never on a PO (utilities, say) - their own tab (1241), where one can
//                still be linked to a PO
// The matching is the SAME rule as committed costs (lib/poCommitted: the PO number in the
// reference, number or a line's description, same supplier), and a bill linked by hand counts
// against that PO there too - so the two screens never disagree.
//   bills:check    -> { at, from, bills: [...] }      read from Xero by "Refresh from Xero"
//   bills:links    -> { billId: poId }                (lib/poCommitted - BILL_LINKS)
//   bills:noPo     -> { billId: { by, at, reason } }
//   bills:settings -> { fromDate, tolerancePct, toleranceAbs }
import { get, set, getTokens, saveTokens } from './db'
import { refreshXeroToken } from './xero'
import { listPos, loadPo } from './purchaseOrders'
import { poTotal } from './poShared'
import { billMentionsPo, BILL_LINKS } from './poCommitted'

export const BILLS_KEY = 'bills:check', NOPO_KEY = 'bills:noPo', SETTINGS_KEY = 'bills:settings'
const XERO_API = 'https://api.xero.com'
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const dateOf = (x) => { if (!x) return ''; const m = /\/Date\((\d+)/.exec(String(x)); return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : String(x).slice(0, 10) }

export async function billsSettings() {
  const s = (await get(SETTINGS_KEY).catch(() => null)) || {}
  return { fromDate: s.fromDate || '', tolerancePct: s.tolerancePct != null ? Number(s.tolerancePct) : 2, toleranceAbs: s.toleranceAbs != null ? Number(s.toleranceAbs) : 5 }
}

// READ THE BILLS FROM XERO - paged (a page carries its bills' lines), deleted and voided left out
export async function refreshBills() {
  let tokens = await getTokens()
  if (!tokens) return { error: 'Xero is not connected.' }
  try { const nt = await refreshXeroToken(tokens.refresh_token); tokens = { ...tokens, ...nt }; await saveTokens(tokens) } catch {}
  const st = await billsSettings()
  // from: the setting, else a fortnight before the first purchase order
  let from = st.fromDate
  if (!from) { const firsts = (await listPos()).map(p => String(p.raisedAt || p.createdAt || '').slice(0, 10)).filter(Boolean).sort(); from = firsts[0] ? new Date(new Date(firsts[0]).getTime() - 14 * 864e5).toISOString().slice(0, 10) : new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10) }
  const bills = []
  let read = 0, skipped = 0, pages = 0   // WHAT WAS READ, said plainly on the page (1241)
  for (let page = 1; page <= 50; page++) {
    pages++
    const url = `${XERO_API}/api.xro/2.0/Invoices?page=${page}&pageSize=100&where=${encodeURIComponent(`Type=="ACCPAY" AND Date>=DateTime(${from.replace(/-/g, ',')})`)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tokens.access_token}`, 'Xero-Tenant-Id': tokens.tenant_id, Accept: 'application/json' } })
    if (!res.ok) { const t = await res.text().catch(() => ''); return { error: `Xero refused the bills (${res.status}) ${t.slice(0, 160)}` } }
    const list = ((await res.json()) || {}).Invoices || []
    read += list.length
    for (const inv of list) {
      if (inv.Type !== 'ACCPAY' || ['DELETED', 'VOIDED'].includes(inv.Status)) { skipped++; continue }
      bills.push({ id: inv.InvoiceID, number: inv.InvoiceNumber || '', reference: inv.Reference || '', contactId: (inv.Contact || {}).ContactID || '', contactName: (inv.Contact || {}).Name || '',
        date: dateOf(inv.DateString || inv.Date), dueDate: dateOf(inv.DueDateString || inv.DueDate), status: inv.Status || '', subTotal: r2(inv.SubTotal), total: r2(inv.Total), amountDue: r2(inv.AmountDue),
        lines: (inv.LineItems || []).map(l => ({ description: l.Description || '', amount: r2(l.LineAmount), account: l.AccountCode || '', tracking: (l.Tracking || []).map(t => t.Option).filter(Boolean).join(', ') })) })
    }
    if (list.length < 100) break
  }
  const rec = { at: new Date().toISOString(), from, bills, stats: { pages, read, skipped } }
  await set(BILLS_KEY, rec)
  return rec
}

// SORT THEM against the purchase orders
export async function sortBills() {
  const rec = (await get(BILLS_KEY).catch(() => null)) || { at: null, from: '', bills: [] }
  const [links, noPo, st, queries, contacts] = await Promise.all([get(BILL_LINKS).then(v => v || {}).catch(() => ({})), get(NOPO_KEY).then(v => v || {}).catch(() => ({})), billsSettings(),
    get('bills:queries').then(v => v || {}).catch(() => ({})), get('xero:contacts').then(v => (v && v.contacts) || []).catch(() => [])])
  const emailOf = Object.fromEntries(contacts.filter(c => c && c.id).map(c => [c.id, c.email || '']))
  const pos = []
  for (const s of await listPos()) { if (s.status === 'draft' || s.status === 'awaiting-approval' || s.status === 'rejected') continue; const po = await loadPo(s.id); if (po && po.number) pos.push(po) }
  const byId = Object.fromEntries(pos.map(p => [p.id, p]))
  const poSuppliers = new Set(pos.map(p => p.contactId).filter(Boolean))
  // each bill's PO: linked by hand, else the shared rule (the first PO it quotes)
  const textOf = (b) => `${b.reference} ${b.number} ${(b.lines || []).map(l => l.description).join(' ')}`
  const poOf = {}
  for (const b of rec.bills) {
    if (links[b.id] && byId[links[b.id]]) { poOf[b.id] = { po: byId[links[b.id]], how: 'linked' }; continue }
    const hit = pos.find(p => billMentionsPo(p, b.contactId, textOf(b)))
    if (hit) poOf[b.id] = { po: hit, how: 'quoted' }
  }
  // each PO's bills, all together, against its value
  const billedOn = {}
  for (const b of rec.bills) { const m = poOf[b.id]; if (m) billedOn[m.po.id] = r2((billedOn[m.po.id] || 0) + b.subTotal) }
  const groups = { matched: [], over: [], cancelled: [], noPo: [], noPoNeeded: [], other: [] }
  for (const b of rec.bills) {
    const m = poOf[b.id]
    const projectOf = (b.lines || []).map(l => l.tracking).find(Boolean) || ''
    // the supplier's email (the PO's, else the Xero contact's) and any query on the bill (1242)
    const q = queries[b.id]
    const base = { ...b, project: projectOf, supplierEmail: (m && m.po.to) || emailOf[b.contactId] || '', query: q ? { status: q.status, at: (q.messages || []).slice(-1)[0]?.at || q.createdAt, messages: q.messages, to: q.to, raisedBy: q.raisedBy, resolvedBy: q.resolvedBy || '', resolvedAt: q.resolvedAt || '' } : null }
    if (m) {
      const net = r2(poTotal(m.po)), billed = billedOn[m.po.id] || 0, allow = Math.max(net * st.tolerancePct / 100, st.toleranceAbs)
      const row = { ...base, po: { id: m.po.id, number: m.po.number, status: m.po.status, net, billed, over: r2(billed - net), jobNo: m.po.jobNo || '', projectName: m.po.projectName || '' }, how: m.how }
      if (m.po.status === 'cancelled') groups.cancelled.push(row)
      else if (billed > net + allow) groups.over.push(row)
      else groups.matched.push(row)
    } else if (poSuppliers.has(b.contactId)) {
      if (noPo[b.id]) groups.noPoNeeded.push({ ...base, noPo: noPo[b.id] })
      else groups.noPo.push(base)
    } else groups.other.push(base)
  }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  // QUERIES (1242): every bill with a query still open or answered, from whichever group
  groups.queries = Object.values(groups).flat().filter(b => b.query && b.query.status !== 'resolved').sort((a, b) => String(b.query.at).localeCompare(String(a.query.at)))
  return { at: rec.at, from: rec.from, stats: rec.stats || null, settings: st, groups, other: groups.other.length, total: rec.bills.length, poSuppliers: poSuppliers.size,
    pos: pos.filter(p => p.status !== 'cancelled').map(p => ({ id: p.id, number: p.number, supplier: p.contactName || p.supplier || '', contactId: p.contactId || '', jobNo: p.jobNo || '', projectName: p.projectName || '', status: p.status, net: r2(poTotal(p)), billed: billedOn[p.id] || 0 })) }
}
