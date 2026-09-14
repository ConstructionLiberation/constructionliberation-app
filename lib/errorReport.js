// TELL SOMEBODY WHEN A PAGE BREAKS.
//
// Until now a failing API route told the user something unhelpful and told
// nobody anything. You found out when someone mentioned it on Friday, if at all
// - most people refresh, work around it, and say nothing. For the fault class
// that matters most, that is the least reliable detection method available.
//
// THE ONE RULE THIS FILE OBEYS
// ----------------------------
// It must not depend on anything that might be broken.
//
//   - It does NOT use lib/db.js. The error being reported is frequently a
//     database error, and a reporter that needs the database to report a
//     database failure reports nothing.
//   - It does NOT use lib/tenantSettings.js. That throws when a customer is not
//     resolved, which is EXACTLY the error most worth hearing about.
//   - It reads plain environment variables and posts straight to Resend.
//   - Every failure inside it is swallowed. A reporter that can break a working
//     request is worse than no reporter.

// Throttle, held in memory per running instance.
//
// Not in the database, for the reason above. The cost is that a cold start
// forgets and may re-send - which is the right way round: over-reporting is
// noise, under-reporting is the thing this exists to prevent.
const lastSent = new Map()
const THROTTLE_MS = 30 * 60 * 1000

function throttled(key) {
  const now = Date.now()
  const prev = lastSent.get(key)
  if (prev && now - prev < THROTTLE_MS) return true
  lastSent.set(key, now)
  // Keep the map from growing without bound on a long-lived instance.
  if (lastSent.size > 200) {
    for (const [k, t] of lastSent) if (now - t > THROTTLE_MS) lastSent.delete(k)
  }
  return false
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export async function reportError({ where, error, req, tenantId, detail }) {
  try {
    const key = process.env.RESEND_API_KEY
    // WHERE PORTAL ERRORS GO.
    //
    // Its own variable, separate from ALERT_EMAIL. ALERT_EMAIL is also the
    // address a user's "Report a problem" reaches, and those two want different
    // people: a problem report goes to whoever runs the portal for that
    // customer; a stack trace goes to whoever maintains the software.
    //
    // Under multi-tenancy that distinction becomes the difference between the
    // customer and Construction Liberation. Falls back to ALERT_EMAIL so
    // nothing stops working before the new variable is set.
    const to = process.env.ERROR_REPORT_EMAIL || process.env.ALERT_EMAIL || process.env.FORMS_REPLY_TO
    const from = process.env.NOTIFY_FROM_EMAIL || process.env.FORMS_FROM_EMAIL
    if (!key || !to || !from) return

    const route = String(where || (req && req.url) || 'unknown').split('?')[0]
    const message = (error && error.message) || String(error || 'unknown error')

    // Throttled per route AND message, so two different faults on the same route
    // are both heard, and the same fault 400 times is heard once.
    // Keyed by CUSTOMER as well as route and message. Without the customer, one
    // company's error suppresses another company's identical error on the same
    // route for half an hour - and "the same error on two customers" is exactly
    // the thing worth hearing twice.
    if (throttled((tenantId || '-') + '|' + route + '|' + message.slice(0, 120))) return

    const host = (req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || ''
    const method = (req && req.method) || ''
    const stack = (error && error.stack) ? String(error.stack).split('\n').slice(0, 8).join('\n') : ''

    const html = `
      <div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6">
        <h2 style="margin:0 0 12px;color:#b91c1c">Portal error</h2>
        <table style="border-collapse:collapse;font-size:13px">
          <tr><td style="padding:2px 12px 2px 0;color:#666">Route</td><td><strong>${esc(method)} ${esc(route)}</strong></td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#666">Customer</td><td>${esc(tenantId || 'none resolved')}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#666">Address</td><td>${esc(host)}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#666">When</td><td>${new Date().toISOString()}</td></tr>
        </table>
        <p style="margin:14px 0 4px;color:#666">Error</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px">${esc(message)}</div>
        ${detail ? `<p style="margin:14px 0 4px;color:#666">What the route said</p>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px">${esc(detail)}</div>` : ''}
        ${stack ? `<p style="margin:14px 0 4px;color:#666">Stack</p>
        <div style="background:#f8f8f8;border:1px solid #eee;border-radius:6px;padding:10px;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:11px;color:#555">${esc(stack)}</div>` : ''}
        <p style="margin-top:16px;color:#888;font-size:12px">
          Repeats of this same error on this same route are suppressed for 30 minutes.
        </p>
      </div>`

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: `Portal error: ${route}`,
        html,
      }),
    })
  } catch {
    // Never let reporting a failure cause one.
  }
}
