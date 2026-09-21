import forEachTenant from '../../../lib/forEachTenant'
import { get, set, getTokens, saveTokens } from '../../../lib/db'
import { refreshXeroToken, fetchPurchaseOrders } from '../../../lib/xero'

// Scheduled sync: pulls newly-approved POs into the Delivery Schedule without
// anyone opening the page. Mirrors the ID-based logic in /api/deliveries.
// Scheduled hourly via vercel.json crons.
async function getDeliveries() { return (await get('ops:deliveries')) || [] }
async function saveDeliveries(v) { await set('ops:deliveries', v) }
async function getSeenIds() { return (await get('ops:deliveries:seenPoIds')) || [] }
async function setSeenIds(ids) { await set('ops:deliveries:seenPoIds', ids) }

async function handler(req, res) {
  try {
    let tokens = await getTokens()
    // NOT CONNECTED IS A SKIP, NOT A FAILURE.
    //
    // This returned ok: false, and lib/forEachTenant.js reads the body - so a
    // tenant with no Xero produced a failed cron run, an error email and a
    // cron-health alert EVERY DAY, for the entirely correct state of not
    // having connected an accounting package.
    //
    // Seen the moment a second tenant existed: demo generated a
    // deliveries-sync failure within hours of being registered. Same shape as
    // the msConfigured() skip added to the email sync in pkg931, and the same
    // reasoning - an alert that fires for a normal condition is an alert
    // people stop reading.
    //
    // `skipped` is the flag forEachTenant already understands: it does not
    // count as a failure and it does not overwrite the heartbeat of a real
    // run.
    if (!tokens) return res.status(200).json({ ok: true, skipped: true, reason: 'Xero not connected for this customer' })
    // THE REFRESH FAILING IS THE MOST LIKELY CAUSE OF THE FETCH FAILING, and
    // it was swallowed whole. Kept and reported alongside, because "po fetch
    // failed" with an expired token is a different problem from "po fetch
    // failed" with a live one.
    let refreshError = null
    try { const nt = await refreshXeroToken(tokens.refresh_token); tokens = { ...tokens, ...nt }; await saveTokens(tokens) }
    catch (e) { refreshError = (e && e.message) || String(e) }

    let pos = []
    try { pos = await fetchPurchaseOrders(tokens.access_token, tokens.tenant_id, { status: 'AUTHORISED' }) }
    catch (e) {
      // `error`, not `reason` - see lib/forEachTenant.js failureFromBody. A
      // reason alone never reached the alert email.
      const detail = (e && e.message) || String(e)
      return res.status(200).json({
        ok: false,
        error: `po fetch failed: ${detail}${refreshError ? ` (token refresh also failed: ${refreshError})` : ''}`,
      })
    }

    let seen = await getSeenIds()
    // If no baseline yet, set it and add nothing (matches the page's first-run).
    if (seen.length === 0) {
      await setSeenIds(pos.map(p => p.purchaseOrderId))
      return res.status(200).json({ ok: true, baseline: pos.length, added: 0 })
    }

    const seenSet = new Set(seen)
    let deliveries = await getDeliveries()
    const existingPoIds = new Set(deliveries.filter(d => d.purchaseOrderId).map(d => d.purchaseOrderId))
    let added = 0
    for (const po of pos) {
      if (seenSet.has(po.purchaseOrderId) || existingPoIds.has(po.purchaseOrderId)) { seenSet.add(po.purchaseOrderId); continue }
      deliveries.push({
        id: `po_${po.purchaseOrderId}`,
        purchaseOrderId: po.purchaseOrderId,
        source: 'xero',
        poNumber: po.poNumber,
        supplier: po.supplier,
        orderDate: po.orderDate || '',
        deliveryAddress: po.deliveryAddress || '',
        requiredDeliveryDate: po.deliveryDate || '',
        lineItems: po.lineItems || [],
        projectName: po.tracking?.name || '',
        projectNo: po.tracking?.jobNo || '',
        poSent: false, supplierConfirmedDate: false, secondCheck: false,
        actualDeliveryDate: '', attachments: [], comments: '',
        createdAt: Date.now(),
      })
      seenSet.add(po.purchaseOrderId)
      added++
    }
    if (added) await saveDeliveries(deliveries)
    await setSeenIds([...seenSet])
    return res.status(200).json({ ok: true, added })
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) })
  }
}

export default forEachTenant('deliveries-sync', handler)
