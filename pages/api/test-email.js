import { requireRole } from '../../lib/portalAuth'
import { alertEmail, fromEmail } from '../../lib/tenantSettings'
import withTenant from '../../lib/withTenant'

// PROVE THE ALERT PATH WORKS - FOR THIS CUSTOMER.
//
// Read process.env.ALERT_EMAIL and sent from a hard-coded "Rock Roofing Sales
// Dashboard <onboarding@resend.dev>". Both are wrong under tenancy: the test
// proved the DEPLOYMENT could send to ROCK, which tells a second customer
// nothing about their own configuration - the one thing this endpoint exists
// to answer.
async function handler(req, res) {
  if (!requireRole(req, res, ['admin'])) return;
  const RESEND_KEY = process.env.RESEND_API_KEY
  const ALERT_EMAIL = alertEmail()

  if (!RESEND_KEY || !ALERT_EMAIL) {
    return res.status(400).json({ error: 'Missing RESEND_API_KEY, or no alert address configured for this customer.' })
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail('notify'),
        to: ALERT_EMAIL,
        subject: 'Test alert - portal alert path',
        html: '<p>This is a test email to confirm the alert system is working correctly.</p>'
      })
    })

    const data = await response.json()
    return res.status(200).json({ sent: response.ok, response: data })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

export default withTenant(handler)
