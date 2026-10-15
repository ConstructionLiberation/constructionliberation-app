import { requireArea } from '../../../lib/portalAuth'
import withTenant from '../../../lib/withTenant'
import { get, set, getPortalUsers } from '../../../lib/db'
import { normRole } from '../../../lib/roles'
import { checkEstimate, newId, priceEstimate, nextRevision, diffEstimates, crmDetailsOf } from '../../../lib/estimate'
import { resolveMerged } from '../../../lib/crmMerge'
import { currentTerms, letterOf, letterProblems, letterProblemText, placeholderValues, clarOf } from '../../../lib/quoteDocs'
import { detailsFor } from '../../../lib/estimate'
import { DEFAULT_FIELD_SCHEMA } from '../../../lib/crmFieldSchema'
import { itemsMissingSizes } from '../../../lib/buildups'
import { uncostedItems, uncostedText, priceLibOf, withLock } from '../../../lib/estimate'
// WORKING COPIES (1154): an estimate has ONE active working copy (the draft, or a
// revision being edited) and may PARK the other - est.parked = [{ content, at }].
// The shell (id, revisions...) is shared; everything else is the copy's content.
const SHELL = new Set(['id', 'revisions', 'parked', 'createdAt', 'createdBy', 'dealId', 'title', 'quoteRef', 'archived', 'updatedAt', 'updatedBy'])
const shellOf = (e) => Object.fromEntries(Object.entries(e).filter(([k]) => SHELL.has(k)))
const contentOf = (e) => Object.fromEntries(Object.entries(e).filter(([k]) => !SHELL.has(k)))
const copyKey = (content) => content && content.reopened ? content.reopened.revision : 'draft'
import { deleteAllDocs } from '../../../lib/documentsStore'
import { removeFile, privateReady } from '../../../lib/privateFiles'
import { listEstimates, loadEstimate, saveEstimate, deleteEstimate, saveRevision, loadRevision } from '../../../lib/estimateStore'
import { loadPriceList } from '../../../lib/priceListStore'
import { loadLabour, loadLabourSettings } from '../../../lib/labourRatesStore'

// ESTIMATES API (1088) - Estimating area.
// GET                  -> { estimates }  the list
// GET ?id=             -> { estimate }
// GET ?deals=1         -> { deals: [{ id, title, organisation, status }] }  to link a CRM deal
// POST create { dealId?, title? }   -> { estimate }  (settings start from the company's day rate)
// POST save   { estimate }          -> the whole estimate; the list total is worked out HERE
// POST delete { id }

// THE DEAL, LIVE (1090): followed through any CRM merge to the deal it became.
// -> { dealId, title, organisation, details } or { missing: true }
// THE CRM's OWN RULE for organisation and contact details (1164): the deal's value
// first, then the ORGANISATION's / CONTACT's master record, matched by name - as
// the CRM page shows them. (The customer address lives on the organisation.)
const GROUP_OF = Object.fromEntries(DEFAULT_FIELD_SCHEMA.filter(f => f.group === 'organization' || f.group === 'person').map(f => [f.key, f.group]))
const blank = (v) => v == null || String(v).trim() === '' || String(v).trim() === '-'
async function liveDeals() {
  const [deals, merged, orgs, contacts] = await Promise.all([get('crm:deals'), get('crm:merged'), get('crm:orgs'), get('crm:contacts')])
  const byId = new Map((Array.isArray(deals) ? deals : []).map(d => [String(d.id), d]))
  const byName = (list) => new Map((Array.isArray(list) ? list : []).map(x => [String(x.name || '').trim().toLowerCase(), x]))
  const orgOf = byName(orgs), contactOf = byName(contacts)
  return (dealId) => {
    if (!dealId) return null
    const d0 = byId.get(resolveMerged(merged || {}, dealId))
    if (!d0) return { missing: true }
    const f0 = d0.fields || {}
    const org = orgOf.get(String(f0.organization || '').trim().toLowerCase()) || {}
    const person = contactOf.get(String(f0.contact_person || '').trim().toLowerCase()) || {}
    const filled = { ...f0 }
    for (const [k, g] of Object.entries(GROUP_OF)) if (blank(filled[k])) { const v = (g === 'organization' ? org : person)[k]; if (!blank(v)) filled[k] = v }
    const d = { ...d0, fields: filled }
    const f = d.fields || {}
    // ARCHIVED (1091): the deal was LOST in the CRM. Read live, so a deal
    // reopened in the CRM brings its estimate back by itself.
    return { dealId: String(d.id), title: d.title || '', organisation: f.organization || '', details: crmDetailsOf(d),
      status: d.status || 'open', archived: d.status === 'lost', lostTime: f.lost_time || null, lostReason: f.lost_reason || '' }
  }
}

// Who can delete: active admins, by name - shown to everyone else so they
// know who to ask.
async function adminNames() {
  return ((await getPortalUsers()) || []).filter(u => u.active !== false && normRole(u.role) === 'admin')
    .map(u => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email).filter(Boolean)
}
const ARCHIVED = (d) => `This estimate is archived - its CRM deal${d.title ? ` "${d.title}"` : ''} was lost. Reopen the deal in the CRM to work on it again.`

async function loadLib() {
  const [{ products }, { items }] = await Promise.all([loadPriceList(), loadLabour()])
  return { product: Object.fromEntries(products.map(p => [p.ref, p])), labour: Object.fromEntries(items.map(i => [i.ref, i])) }
}

async function summaryOf(est, lib) {
  const { totals } = priceEstimate(est, lib || await loadLib())
  return {
    id: est.id, quoteRef: est.quoteRef || '', revision: est.revision || '', title: est.title || '',
    dealId: est.dealId || null, dealTitle: est.dealTitle || '', organisation: est.organisation || '',
    total: Math.round(totals.total * 100) / 100, items: totals.items, updatedAt: est.updatedAt, updatedBy: est.updatedBy,
  }
}

async function handler(req, res) {
  const session = requireArea(req, res, 'estimating')
  if (!session) return
  const by = session.name || session.email || ''
  if (req.method === 'GET') {
    if (req.query.deals) {
      const deals = (await get('crm:deals')) || []
      return res.status(200).json({ deals: (Array.isArray(deals) ? deals : []).map(d => ({ id: d.id, title: d.title || '', organisation: (d.fields || {}).organization || '', status: d.status || '' })) })
    }
    if (req.query.id && req.query.rev) {
      const r = await loadRevision(String(req.query.id), String(req.query.rev))
      if (!r) return res.status(404).json({ error: 'That revision was not found' })
      return res.status(200).json({ revision: r })
    }
    if (req.query.id) {
      const est = await loadEstimate(String(req.query.id))
      if (!est) return res.status(404).json({ error: 'That estimate no longer exists' })
      return res.status(200).json({ estimate: est, crm: (await liveDeals())(est.dealId), canDelete: normRole(session.role) === 'admin', admins: await adminNames() })
    }
    // The list shows the deal's CURRENT name and customer, not the ones it had when saved.
    const live = await liveDeals()
    return res.status(200).json({ estimates: (await listEstimates()).map(e => {
      const d = live(e.dealId)
      return d && !d.missing ? { ...e, dealTitle: d.title, organisation: d.organisation, archived: d.archived, lostTime: d.lostTime } : e
    }), canDelete: normRole(session.role) === 'admin', admins: await adminNames() })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}

  if (b.action === 'create') {
    let dealTitle = '', organisation = ''
    if (b.dealId) {
      const d = ((await get('crm:deals')) || []).find(x => String(x.id) === String(b.dealId))
      if (!d) return res.status(404).json({ error: 'That CRM deal no longer exists' })
      dealTitle = d.title || ''; organisation = (d.fields || {}).organization || ''
    }
    const ls = await loadLabourSettings()
    const now = new Date().toISOString()
    const est = {
      id: newId('e'), dealId: b.dealId || null, dealTitle, organisation, title: String(b.title || dealTitle || 'New estimate').slice(0, 200),
      // Linked: the project and customer details are read LIVE from the deal, never copied.
      quoteRef: '', revision: 'A', header: b.dealId ? {} : { project: String(b.title || '') },
      // Profit and MCD are the estimator's to set; the day rate starts from the company setting.
      settings: { profit: null, mcd: null, labourFactor: 1, dayRate: ls?.dayRate ?? null },
      rows: [], createdAt: now, createdBy: by, updatedAt: now, updatedBy: by,
    }
    await saveEstimate(est, await summaryOf(est))
    return res.status(200).json({ estimate: est })
  }
  if (b.action === 'save') {
    const est = b.estimate
    const errors = checkEstimate(est)
    if (errors.length) return res.status(400).json({ error: errors.join('; ') })
    const existing = await loadEstimate(est.id)
    if (!existing) return res.status(404).json({ error: 'That estimate no longer exists' })
    const dl = (await liveDeals())(existing.dealId)
    if (dl && dl.archived) return res.status(409).json({ error: ARCHIVED(dl) })
    // Someone else saved since this was opened -> refuse rather than overwrite their work.
    if (b.baseUpdatedAt && existing.updatedAt !== b.baseUpdatedAt) {
      return res.status(409).json({ error: `${existing.updatedBy || 'Someone'} saved this estimate at ${new Date(existing.updatedAt).toLocaleTimeString('en-GB')} since you opened it - reload to see their changes before saving` })
    }
    // Issued revisions are only ever added by 'issue' - a save cannot rewrite them.
    const saved = { ...existing, ...est, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy, revisions: existing.revisions || [], revision: existing.revision, updatedAt: new Date().toISOString(), updatedBy: by }
    await saveEstimate(saved, await summaryOf(saved))
    return res.status(200).json({ ok: true, estimate: saved })
  }
  // ISSUE A REVISION (1089). The SAVED estimate is frozen as its current
  // revision (kept for ever, with what changed since the one before), the
  // estimate moves on to the next letter, and the linked CRM deal's value is
  // set to the issued total - with a value history entry, exactly as an edit in
  // the CRM makes, so Value of work priced counts it.
  if (b.action === 'issue') {
    const est = await loadEstimate(String(b.id))
    if (!est) return res.status(404).json({ error: 'That estimate no longer exists' })
    if (b.baseUpdatedAt && est.updatedAt !== b.baseUpdatedAt) return res.status(409).json({ error: 'This estimate has changed since you opened it - reload, then issue' })
    const dl = (await liveDeals())(est.dealId)
    if (dl && dl.archived) return res.status(409).json({ error: ARCHIVED(dl) })
    const lib = await loadLib()
    const { totals, priced: pricedNow } = priceEstimate(est, lib)
    if (est.settings?.profit == null) return res.status(400).json({ error: 'Set the profit % before issuing' })
    // Mandatory sizes (1113): every one needs a number before a quote goes out.
    const noSize = itemsMissingSizes(est)
    if (noSize.length) return res.status(400).json({ error: `Enter the mandatory sizes first: ${noSize.slice(0, 6).map(x => `${x.description} (${x.sizes.join(', ')})`).join('; ')}${noSize.length > 6 ? ` and ${noSize.length - 6} more` : ''}` })
    // Every line costed (1142) - no £0 lines (comments aside), no £0 items.
    const unc = uncostedItems(est, lib)
    if (unc.length) return res.status(400).json({ error: `Every line needs a cost before the quote is issued - not yet costed: ${uncostedText(unc)}` })
    const total = Math.round(totals.total * 100) / 100
    // ISSUING A REVISION BEING EDITED (1154) replaces it - same letter, same place.
    const reo = est.reopened && (est.revisions || []).some(r => r.revision === est.reopened.revision) ? est.reopened.revision : null
    if (reo) {
      const lastR = est.revisions.slice(-1)[0]
      if (lastR.revision !== reo) return res.status(400).json({ error: `Rev ${reo} is no longer the latest revision - switch to the draft` })
      if (lastR.sent) return res.status(400).json({ error: `Rev ${reo} has been sent - unmark it on the Quote tab first, or issue the draft as a new revision` })
    }
    const prev = reo ? (est.revisions || []).slice(-2, -1)[0] : (est.revisions || []).slice(-1)[0]
    const prevSnap = prev ? await loadRevision(est.id, prev.revision) : null
    // compared at the earlier revision's OWN prices (1154), so a price change shows
    const changes = prevSnap ? diffEstimates({ ...prevSnap.estimate, priceLock: prevSnap.priceLib || prevSnap.estimate.priceLock || null }, est, lib) : []
    const issuedAt = new Date().toISOString()
    const rev = est.revision || 'A'
    const { revisions, parked: _parked, ...frozen } = est
    // A TRUE copy - nothing that later edits the estimate can reach the issued revision.
    // The CRM details AS THEY WERE TODAY go with the issued revision, so its
    // letter can always be reproduced exactly.
    const crmNow = (await liveDeals())(est.dealId)
    // ...and the Terms & Conditions version it went out with (1092).
    const qtNow = await get('quote:templates')
    // SENT TO THE CUSTOMER (1164) - not with a gap in the letter or red text still to edit
    if (b.sent) {
      const vals = placeholderValues({ est, details: detailsFor(est, crmNow), total, companyName: 'x', money: (v) => String(v), dateText: issuedAt })
      const p = letterProblems(letterOf(est, qtNow), vals)
      if (p.missing.length || p.red) return res.status(400).json({ error: `The letter cannot go to the customer yet: ${letterProblemText(p)}. Fix it on the Letter tab, then send.` })
    }
    const terms = currentTerms(qtNow)
    // the LETTER as it reads now goes with the revision - a later template change never rewrites it (1163)
    frozen.letter = { ...(frozen.letter || {}), body: letterOf(est, qtNow) }
    frozen.clarList = clarOf(est, qtNow)   // ...and the clarifications as they read (1165)
    await saveRevision(est.id, rev, { revision: rev, issuedAt, issuedBy: by, note: String(b.note || '').slice(0, 500), total, estimate: JSON.parse(JSON.stringify(frozen)), crm: crmNow, terms: terms ? { v: terms.v, text: terms.text } : null , priced: JSON.parse(JSON.stringify(pricedNow)), totals: JSON.parse(JSON.stringify(totals)), priceLib: priceLibOf(est, withLock(lib, est.priceLock)) })   // as issued, with its PRICES (1151/1154)
    let crm = null
    if (est.dealId) {
      const deals = (await get('crm:deals')) || []
      const target = resolveMerged((await get('crm:merged')) || {}, est.dealId)
      const i = deals.findIndex(d => String(d.id) === String(target))
      if (i < 0) crm = { error: 'The linked CRM deal no longer exists - its value was not updated' }
      else {
        const d = deals[i]
        const old = Number((d.fields || {}).value) || 0
        if (Math.abs(old - total) > 0.004) {
          const fmt = (v) => Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          deals[i] = { ...d, fields: { ...(d.fields || {}), value: total },
            history: [...(Array.isArray(d.history) ? d.history : []), { id: newId('h'), type: 'value', ts: issuedAt, text: `Value: ${fmt(old)} → ${fmt(total)} (estimate ${est.quoteRef || est.title} Rev ${rev}, by ${by})`, oldValue: old, newValue: total }] }
          await set('crm:deals', deals)
          crm = { updated: true, from: old, to: total }
        } else crm = { updated: false, note: 'The deal already had this value' }
      }
    }
    const entry = { revision: rev, issuedAt, issuedBy: by, note: String(b.note || '').slice(0, 500), total, changes, termsVersion: terms ? terms.v : null, ...(b.sent ? { sent: { at: issuedAt, by } } : {}) }
    const revList = reo ? [...est.revisions.slice(0, -1), entry] : [...(est.revisions || []), entry]
    const parked = est.parked || []
    const draft = parked.find(p => copyKey(p.content) === 'draft')
    const setAside = !reo && parked.some(p => copyKey(p.content) !== 'draft')
    let next
    if (reo && draft) {
      // the revision being edited is re-issued - the draft comes back (1154)
      next = { ...shellOf(est), ...draft.content, revisions: revList, parked: [], updatedAt: issuedAt, updatedBy: by }
    } else {
      // a new draft - following today's price list again (no lock)
      const { reopened: _ro, priceLock: _pl, ...rest } = est
      next = { ...rest, revision: nextRevision(rev), revisions: revList, parked: [], priceLock: null, updatedAt: issuedAt, updatedBy: by }
      // the next revision needs its own rates-held date once this one is SENT (1164)
      if (b.sent) next.ratesHeldUntil = null
    }
    await saveEstimate(next, await summaryOf(next, lib))
    return res.status(200).json({ ok: true, estimate: next, issued: rev, total, crm, changes, replaced: !!reo, setAside })
  }
  // SENT (1151): a revision is SENT when "Download and mark as sent" issued it, or
  // it is marked here; it can be UNMARKED (downloaded and marked by mistake, or a
  // change needed before it really went). A sent revision cannot be edited.
  if (b.action === 'mark-sent') {
    const est = await loadEstimate(String(b.id))
    if (!est) return res.status(404).json({ error: 'That estimate no longer exists' })
    const k = (est.revisions || []).findIndex(r => r.revision === b.revision)
    if (k < 0) return res.status(404).json({ error: `Rev ${b.revision} was not found` })
    // marking SENT (1164): the letter it was issued with must be complete
    if (b.sent) {
      const snap = await loadRevision(est.id, b.revision)
      if (snap && snap.estimate) {
        const vals = placeholderValues({ est: snap.estimate, details: detailsFor(snap.estimate, snap.crm), total: snap.total, companyName: 'x', money: (v) => String(v), dateText: snap.issuedAt })
        const p = letterProblems(letterOf(snap.estimate, await get('quote:templates')), vals)
        if (p.missing.length || p.red) return res.status(400).json({ error: `Rev ${b.revision}'s letter cannot go to the customer: ${letterProblemText(p)}. Edit Rev ${b.revision} (or issue a new revision) to fix it.` })
      }
    }
    const revisions = est.revisions.map((r, i) => i !== k ? r : (b.sent ? { ...r, sent: { at: new Date().toISOString(), by } } : (({ sent, ...rest }) => rest)(r)))
    const next = { ...est, revisions, updatedAt: new Date().toISOString(), updatedBy: by }
    // the latest revision sent -> the draft after it needs its own rates-held date (1164)
    if (b.sent && k === est.revisions.length - 1 && !est.reopened) next.ratesHeldUntil = null
    await saveEstimate(next, await summaryOf(next, await loadLib()))
    return res.status(200).json({ ok: true, estimate: next })
  }
  // EDIT A REVISION / SWITCH (1151, 1154) - the active working copy is PARKED,
  // never overwritten, so you can move between the draft and a revision being
  // edited and each keeps its changes. A revision can be opened for editing only
  // if it is the LATEST and NOT SENT; it is priced as at its issue (its own prices).
  if (b.action === 'reopen' || b.action === 'switch') {
    const est = await loadEstimate(String(b.id))
    if (!est) return res.status(404).json({ error: 'That estimate no longer exists' })
    if (b.baseUpdatedAt && est.updatedAt !== b.baseUpdatedAt) return res.status(409).json({ error: 'This estimate has changed since you opened it - reload, then try again' })
    const dl = (await liveDeals())(est.dealId)
    if (dl && dl.archived) return res.status(409).json({ error: ARCHIVED(dl) })
    const to = String(b.action === 'reopen' ? b.revision : b.to)
    if (copyKey(est) === to) return res.status(200).json({ ok: true, estimate: est })
    const parked = est.parked || []
    let target = parked.find(p => copyKey(p.content) === to)
    const at = new Date().toISOString()
    if (!target) {
      if (to === 'draft') return res.status(404).json({ error: 'There is no draft to switch to' })
      const last = (est.revisions || []).slice(-1)[0]
      if (!last || last.revision !== to) return res.status(400).json({ error: 'Only the latest revision can be edited - issue a new revision instead' })
      if (last.sent) return res.status(400).json({ error: `Rev ${last.revision} has been sent - unmark it as sent on the Quote tab to edit it, or issue a new revision` })
      const snap = await loadRevision(est.id, to)
      if (!snap || !snap.estimate) return res.status(404).json({ error: 'That revision could not be loaded' })
      target = { content: { ...contentOf(snap.estimate), revision: to, reopened: { revision: to, at, by }, priceLock: snap.priceLib || null } }
    }
    const next = { ...shellOf(est), ...target.content, parked: [...parked.filter(p => p !== target), { content: contentOf(est), at }], updatedAt: at, updatedBy: by }
    await saveEstimate(next, await summaryOf(next, await loadLib()))
    return res.status(200).json({ ok: true, estimate: next })
  }
  // LINK a deal (1090) - an estimate started without one, or moved to another.
  if (b.action === 'link') {
    const est = await loadEstimate(String(b.id))
    if (!est) return res.status(404).json({ error: 'That estimate no longer exists' })
    const live = await liveDeals()
    const cur = live(est.dealId)
    if (cur && cur.archived) return res.status(409).json({ error: ARCHIVED(cur) })
    const d = live(b.dealId)
    if (!d || d.missing) return res.status(404).json({ error: 'That CRM deal no longer exists' })
    if (d.archived) return res.status(409).json({ error: `"${d.title}" is lost in the CRM - link the estimate to an open deal` })
    const next = { ...est, dealId: d.dealId, dealTitle: d.title, organisation: d.organisation, updatedAt: new Date().toISOString(), updatedBy: by }
    await saveEstimate(next, await summaryOf(next))
    return res.status(200).json({ ok: true, estimate: next, crm: d })
  }
  // DELETE - admins only (1091), enforced here, not just hidden on the page.
  if (b.action === 'delete') {
    if (normRole(session.role) !== 'admin') {
      const names = await adminNames()
      return res.status(403).json({ error: `Only an admin can delete an estimate${names.length ? ` - ask ${names.join(', ')}` : ''}.` })
    }
    // Its private documents go too - out of storage, not just off the list (1093).
    if (privateReady()) await deleteAllDocs('estimate', String(b.id), removeFile)
    await deleteEstimate(String(b.id))
    return res.status(200).json({ ok: true })
  }
  return res.status(400).json({ error: "action must be 'create', 'save' or 'delete'" })
}

export default withTenant(handler)
