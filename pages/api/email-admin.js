import { getPortalUsers } from '../../lib/db'
import { verifySessionToken, SESSION_COOKIE } from '../../lib/portalAuth'
import { hasRole, normRole } from '../../lib/roles'
import { EMAIL_REGISTER } from '../../lib/emailRegister'
import { readEmailLog } from '../../lib/emailLog'
import withTenant from '../../lib/withTenant'

// Admin > Email Notifications - the REGISTER and SENT LOG tabs (1080).
// GET ?view=register  -> { register }  every automatic email, with the people a
//                        role / job-title rule reaches in this company TODAY
// GET ?view=log       -> { log }       the emails sent, newest first (last 3,000)
// Admin only, as the rest of Email Notifications.

function readCookie(req, name) {
  const raw = req.headers.cookie || ''
  const m = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))
  return m ? decodeURIComponent(m.split('=').slice(1).join('=')) : null
}

async function handler(req, res) {
  const u = verifySessionToken(readCookie(req, SESSION_COOKIE))
  if (!u || !hasRole(u.role, ['admin'])) return res.status(403).json({ error: 'Admin only' })
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (req.query.view === 'log') {
    const log = await readEmailLog({ limit: Math.min(3000, parseInt(req.query.limit, 10) || 3000) })
    return res.status(200).json({ log })
  }

  const users = ((await getPortalUsers()) || []).filter(p => p.active !== false && p.email)
  const nameOf = (p) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email
  const register = EMAIL_REGISTER.map(e => {
    if (!e.resolve) return e
    const people = users.filter(p =>
      (e.resolve.roles && e.resolve.roles.includes(normRole(p.role))) ||
      (e.resolve.jobTitle && String(p.jobRole || '').trim().toLowerCase() === e.resolve.jobTitle.toLowerCase()))
    return { ...e, recipientsNow: people.map(p => ({ name: nameOf(p), email: p.email })) }
  })
  return res.status(200).json({ register })
}

export default withTenant(handler)
