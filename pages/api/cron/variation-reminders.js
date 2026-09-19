import { fromEmail, baseUrl } from '../../../lib/tenantSettings'
import { currentTenantId } from '../../../lib/tenantContext'
import forEachTenant from '../../../lib/forEachTenant'
import { getAllProjectSettings, saveProject, getProject, get } from '../../../lib/db'
import { isInstructed } from '../../../lib/applications'
import { createInstructToken, addWorkingDays, projectLabel } from '../../../lib/variationInstruct'
import { buildVariationPDF } from '../../../lib/variationPdf'

// Chases variations the customer has not instructed.
//
// THREE WORKING DAYS after the original send, not three calendar days: one sent on
// Thursday is chased the following Tuesday, so a reminder never lands at a weekend where
// it is buried by Monday morning.
//
// Sent ONCE. A variation that is still not instructed after that is a conversation to
// have, not another email to ignore - and an automated chase that repeats weekly trains
// people to filter it.
//
// ?dry=1 reports what it would send without sending. ?force=1 ignores the wait.
async function handler(req, res) {
  const dry = req.query.dry === '1'
  const force = req.query.force === '1'

  const out = { checked: 0, due: [], sent: [], skipped: 0, errors: [] }
  try {
    const all = await getAllProjectSettings()
    const now = Date.now()

    let cache = []
    try { cache = (await get('dashboard:cache')) || [] } catch {}
    let registry = {}
    try { registry = (await get('projects:registry')) || {} } catch {}
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) registry = {}

    // THE CUSTOMER'S OWN ADDRESS, NOT THE HOST THIS REQUEST ARRIVED ON.
    //
    // A cron is invoked by Vercel against the DEPLOYMENT url - rock-3k4sdnhn9-rock-
    // roofing.vercel.app - not the custom domain. Vercel puts Deployment Protection in
    // front of those, so every instruct link this job has ever sent led a customer to a
    // Vercel sign-in page. Before the app ran at all, so nothing here could help them.
    //
    // The first send works because a person clicks it on app.rockroofing.co.uk. Only the
    // chase was broken, for every customer, since this job was written.
    //
    // baseUrl() resolves the tenant's own first host and was built for exactly this -
    // its comment says every link in an outgoing email must come from the customer's
    // address, never from the request. The design emails already use it.
    const origin = baseUrl()
    // REPORTED IN THE RESPONSE so this is testable without emailing a customer.
    //
    // The fault it exists to catch cannot be seen from the production domain: reading
    // the host worked perfectly there and only broke when a cron ran it. So the thing
    // worth checking is that `origin` is the same wherever the route is invoked FROM -
    // which now means opening this on the deployment url and reading it back.
    out.origin = origin
    out.invokedOnHost = req.headers.host || ''
    const RESEND_KEY = process.env.RESEND_API_KEY
    // Customer's sender. The environment used to win here; see lib/designEmail.js.
    const FROM = fromEmail('notify')

    for (const [projectId, proj] of Object.entries(all || {})) {
      const vars = Array.isArray(proj?.variations) ? proj.variations : []
      for (const v of vars) {
        const b = v.builder || {}
        if (!b.firstSentAt) continue                 // never sent - nothing to chase
        out.checked++
        // Already instructed - do not chase the customer for it again. Tested with
        // isInstructed, or a variation instructed from the tracker (boolean) would
        // have kept getting reminders.
        if (isInstructed(v)) { out.skipped++; continue }
        if (b.reminderSentAt) { out.skipped++; continue }            // chased once already
        if (!(b.sentTo || []).length) { out.skipped++; continue }    // nobody to chase

        const dueAt = addWorkingDays(new Date(b.firstSentAt), 3).getTime()
        if (!force && now < dueAt) { out.skipped++; continue }

        // WHICH PROJECT THIS IS - WITH SOMEWHERE TO FALL BACK TO.
        //
        // dashboard:cache has a 4-hour TTL, so a cron running on a cold cache found
        // nothing and sent "Reminder: Variation V03 - " with the project name simply
        // missing, to a customer. Nothing errored; the label was just empty.
        //
        // projects:registry is our own permanent record of every project Xero has
        // returned, so it is there whether or not the cache is warm. Settings come last
        // because they are keyed by tracking option id OR job number, so the id we have
        // may be either.
        const row = Array.isArray(cache) ? cache.find(p => String(p.xeroId) === String(projectId)) : null
        let jobNo = row?.jobNo || ''
        let name = row?.name || ''
        if (!jobNo && !name) {
          const reg = registry[String(projectId)]
            || Object.values(registry).find(r => r && String(r.jobNo) === String(projectId))
          jobNo = reg?.jobNo || proj?.jobNo || ''
          name = reg?.name || proj?.name || proj?.projectName || ''
        }
        const project = { ...proj, jobNo, name }
        const label = projectLabel(project.jobNo, project.name)
        const value = (parseFloat(v.materials) || 0) + (parseFloat(v.labour) || 0) + (parseFloat(v.profit) || 0)
        const money = '£' + value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

        // The label is included so a blank project name shows up here too, rather than
        // only in a customer's inbox.
        out.due.push({ projectId, varNumber: v.varNumber, project: label, to: b.sentTo, sentAt: new Date(b.firstSentAt).toISOString() })
        if (dry || !RESEND_KEY) continue

        try {
          const bytes = await buildVariationPDF({ variation: v, project, logoUrl: `${origin}/rock-logo.jpg` })
          const b64 = Buffer.from(bytes).toString('base64')
          const fname = `Variation ${v.varNumber} - ${label}.pdf`.replace(/[^a-zA-Z0-9 .-]/g, '')
          const esc = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

          for (const addr of b.sentTo) {
            const link = `${origin}/instruct/${createInstructToken({ projectId, varNumber: v.varNumber, email: addr, tenantId: currentTenantId() })}`
            const text = `Hi,\n\n`
              + `Following up on variation ${v.varNumber} for ${label}, sent on ${new Date(b.firstSentAt).toLocaleDateString('en-GB')}.\n\n`
              + `We have not yet received your instruction. The variation is attached again for convenience.\n\n`
              + (b.subContractRef ? `Sub-Contract Ref: ${b.subContractRef}\n` : '')
              + (v.description ? `Description: ${v.description}\n` : '')
              + `Value: ${money}\n\n`
              + `Could you confirm your instruction so we can programme the works.\n\n`
              + `We are unable to proceed without your instruction via the below instruct button.\n\n`
              + `Kind regards\nRock Roofing Limited`
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: FROM, to: [addr],
                subject: `Reminder: Variation ${v.varNumber} - ${label}`,
                // Replies go back to whoever raised it, as they do on the original.
                ...(b.sentBy ? { reply_to: b.sentBy } : {}),
                text,
                // Button ABOVE the sign-off, same as the first send. Split on "Kind
                // regards" so it does not end up under the signature where people have
                // stopped reading.
                html: (() => {
                  const NOTICE = 'We are unable to proceed without your instruction via the below instruct button.'
                  const asHtml = (t) => esc(t).replace(/\n/g, '<br>').replace(esc(NOTICE), `<strong>${esc(NOTICE)}</strong>`)
                  const m = /\n(Kind regards|Best regards|Regards|Many thanks|Thanks|Cheers|Yours sincerely|Yours faithfully)\b/i.exec(text)
                  const head = m ? text.slice(0, m.index) : text
                  const tail = m ? text.slice(m.index) : ''
                  return `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#1a1a2e;line-height:1.6">`
                    + asHtml(head)
                    + `<div style="margin:22px 0"><a href="${link}" style="display:inline-block;background:#15803d;color:#fff;`
                    + `text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:700;font-size:15px">`
                    + `Instruct variation ${esc(v.varNumber)}</a></div>`
                    + (tail ? asHtml(tail) : '')
                    + `<div style="margin-top:18px;font-size:12px;color:#888">This link is unique to you and records your instruction.<br>${esc(link)}</div></div>`
                })(),
                attachments: [{ filename: fname, content: b64 }],
              }),
            })
          }

          // Marked BEFORE anything else can go wrong with the next project, so a failure
          // half way through the run cannot double-chase the ones already done.
          const fresh = (await getProject(projectId)) || {}
          const next = (fresh.variations || []).map(x => String(x.varNumber) !== String(v.varNumber) ? x
            : ({ ...x, builder: { ...(x.builder || {}), reminderSentAt: Date.now() } }))
          await saveProject(projectId, { ...fresh, variations: next })
          out.sent.push({ projectId, varNumber: v.varNumber, to: b.sentTo })
        } catch (e) {
          out.errors.push({ projectId, varNumber: v.varNumber, error: e?.message || 'failed' })
        }
      }
    }
    return res.json({ ok: true, dry, force, ...out })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'failed', ...out })
  }
}

export default forEachTenant('variation-reminders', handler)
