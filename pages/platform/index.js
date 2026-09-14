import { useState, useEffect } from 'react'
import Head from 'next/head'
import { MODULES, validateModules } from '../../lib/modules'

// PLATFORM ADMIN - the customer list. James only.
//
// Deliberately plain. This is a tool for one person, used a handful of times per
// customer, so it is built to be unambiguous rather than pretty.
//
// Until the control database exists it shows what is missing and how to fix it,
// rather than an empty table that looks broken.

const box = { background: '#fff', border: '1px solid #e1e0d9', borderRadius: 10, padding: 18, marginBottom: 16 }
const label = { display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }
const input = { width: '100%', padding: '8px 10px', border: '1px solid #d8d6cd', borderRadius: 7, fontSize: 13, marginBottom: 12 }
const btn = { background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }

const EMPTY = {
  id: '', name: '', hosts: '', modules: [],
  senderName: '', sendingAddress: '', replyTo: '', logoUrl: '', senders: {},
  timezone: 'Europe/London', currency: 'GBP', locale: 'UK',
  redis: { url: '', token: '' }, active: true,
}

export default function PlatformPage() {
  const [state, setState] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(null)

  async function load() {
    setErr('')
    try {
      const r = await fetch('/api/platform/tenants')
      if (r.status === 404) { setErr('Not available from this address.'); return }
      if (r.status === 401 || r.status === 403) { setErr('Admin only.'); return }
      const d = await r.json()
      if (d.error) { setErr(d.error); return }
      setState(d)
    } catch (e) { setErr(e?.message || 'Could not load') }
  }
  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleModule = (id) => {
    setForm(f => ({
      ...f,
      modules: f.modules.includes(id) ? f.modules.filter(m => m !== id) : [...f.modules, id],
    }))
  }

  async function save() {
    setErr(''); setBusy(true)
    try {
      const body = { ...form, hosts: String(form.hosts).split(',').map(h => h.trim()).filter(Boolean) }
      if (!body.redis.url || !body.redis.token) delete body.redis   // keep the existing pointer
      const r = await fetch('/api/platform/tenants', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || `Save failed (${r.status})`); return }
      setForm(null)
      await load()
    } catch (e) { setErr(e?.message || 'Save failed') }
    finally { setBusy(false) }
  }

  const problems = form ? validateModules(form.modules) : []

  return (
    <div style={{ minHeight: '100vh', background: '#faf9f5', padding: 24 }}>
      <Head><title>Platform - Customers</title></Head>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Customers</h1>
        <div style={{ color: '#888', fontSize: 12, marginBottom: 18 }}>
          Construction Liberation platform administration
        </div>

        {err && (
          <div style={{ ...box, borderColor: '#e63946', color: '#e63946' }}>{err}</div>
        )}

        {state && !state.controlDatabaseConfigured && (
          <div style={box}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>No control database yet</div>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>
              {state.message}
            </div>
          </div>
        )}

        {state && state.controlDatabaseConfigured && (
          <div style={box}>
            <div style={{ fontSize: 13 }}>
              Tenant resolution is <strong>{state.tenancyEnabled ? 'ON' : 'OFF'}</strong>.
              {!state.tenancyEnabled && ' Set TENANCY_ENABLED=1 in Vercel once a customer resolves correctly here.'}
            </div>
            {/* An open door should be visible on the page, not only in the API
                response. Nobody reads a JSON field they have to go looking for. */}
            {!state.restrictedToNamedAdmins && (
              <div style={{ fontSize: 12, color: '#b45309', marginTop: 8 }}>
                Any admin can reach this page. Set PLATFORM_ADMINS in Vercel to your
                email to restrict it.
              </div>
            )}
            {state.platformHosts?.length > 0 && (
              <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
                Platform addresses: {state.platformHosts.join(', ')}
              </div>
            )}
          </div>
        )}

        {state?.tenants?.length > 0 && (
          <div style={box}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#666', fontSize: 11 }}>
                  <th style={{ padding: '6px 8px' }}>Customer</th>
                  <th style={{ padding: '6px 8px' }}>Addresses</th>
                  <th style={{ padding: '6px 8px' }}>Modules</th>
                  <th style={{ padding: '6px 8px' }}>Database</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.tenants.map(t => (
                  <tr key={t.id} style={{ borderTop: '1px solid #eee' }}>
                    <td style={{ padding: '8px' }}>
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      <div style={{ color: '#999', fontSize: 11 }}>{t.id}</div>
                    </td>
                    <td style={{ padding: '8px', fontSize: 12 }}>{(t.hosts || []).join(', ')}</td>
                    <td style={{ padding: '8px', fontSize: 12 }}>{(t.modules || []).length}</td>
                    <td style={{ padding: '8px', fontSize: 12 }}>
                      {t.databaseConfigured ? 'set' : <span style={{ color: '#e63946' }}>missing</span>}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      <button
                        onClick={() => setForm({ ...EMPTY, ...t, hosts: (t.hosts || []).join(', '), redis: { url: '', token: '' } })}
                        style={{ ...btn, background: '#f0f2f5', color: '#333', padding: '6px 12px' }}
                      >Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {state?.controlDatabaseConfigured && !form && (
          <button style={btn} onClick={() => setForm({ ...EMPTY })}>Add a customer</button>
        )}

        {form && (
          <div style={box}>
            <div style={{ fontWeight: 600, marginBottom: 14 }}>
              {form.createdAt ? `Edit ${form.name}` : 'New customer'}
            </div>

            <label style={label}>Id (appears in web addresses, cannot be changed later)</label>
            <input style={input} autoComplete="off" value={form.id} disabled={!!form.createdAt}
              onChange={e => set('id', e.target.value)} placeholder="wilson" />

            <label style={label}>Company name</label>
            <input style={input} autoComplete="off" value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Wilson Construction Ltd" />

            <label style={label}>Web addresses (comma separated)</label>
            <input style={input} autoComplete="off" value={form.hosts} onChange={e => set('hosts', e.target.value)}
              placeholder="wilson.constructionliberation.com" />

            <label style={label}>Modules</label>
            <div style={{ marginBottom: 12 }}>
              {MODULES.map(m => {
                const on = form.modules.includes(m.id)
                return (
                  <button key={m.id} onClick={() => toggleModule(m.id)}
                    style={{
                      margin: '0 6px 6px 0', padding: '6px 12px', borderRadius: 20, fontSize: 12,
                      border: '1px solid ' + (on ? '#1a1a2e' : '#d8d6cd'),
                      background: on ? '#1a1a2e' : '#fff', color: on ? '#fff' : '#555',
                      cursor: 'pointer',
                    }}>
                    {m.label}
                  </button>
                )
              })}
            </div>
            {problems.length > 0 && (
              <div style={{ color: '#e63946', fontSize: 12, marginBottom: 12 }}>
                {problems.map((p, i) => <div key={i}>{p}</div>)}
              </div>
            )}

            <label style={label}>Sender name on their emails</label>
            <input style={input} autoComplete="off" value={form.senderName} onChange={e => set('senderName', e.target.value)}
              placeholder="Wilson Construction" />

            <label style={label}>Sending address</label>
            <input style={input} autoComplete="off" value={form.sendingAddress} onChange={e => set('sendingAddress', e.target.value)}
              placeholder="notifications@constructionliberation.com" />

            <div style={{ fontSize: 11, color: '#888', marginTop: -6, marginBottom: 12 }}>
              Used for every email unless overridden below.
            </div>

            <label style={label}>
              Different senders for particular emails (optional)
            </label>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
              Full address including the name, e.g.
              {' '}Rock Roofing Accounts &lt;accountsreceivable@rockroofing.co.uk&gt;.
              Leave blank to use the sender above. Rock needs one here for
              applications, because its customers already know that address.
            </div>
            {[
              ['notify', 'Notifications and variations'],
              ['commercial', 'Applications'],
              ['forms', 'Forms, pre-start and reports'],
              ['accounts', 'Chase emails'],
            ].map(([k, lbl]) => (
              <div key={k} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>{lbl}</div>
                <input style={{ ...input, marginBottom: 0 }} autoComplete="off"
                  value={(form.senders && form.senders[k]) || ''}
                  onChange={e => set('senders', { ...(form.senders || {}), [k]: e.target.value })}
                  placeholder="(uses the sender above)" />
              </div>
            ))}
            <div style={{ height: 12 }} />

            <label style={label}>Reply-to for system emails</label>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>
              Password resets, login details, pre-start notifications, operative
              invitations. Variations and applications already reply to whoever
              sent them, so this does not affect those.
            </div>
            <input style={input} autoComplete="off" value={form.replyTo} onChange={e => set('replyTo', e.target.value)}
              placeholder="accounts@wilsonconstruction.co.uk" />

            <label style={label}>Timezone</label>
            <input style={input} autoComplete="off" value={form.timezone} onChange={e => set('timezone', e.target.value)}
              placeholder="Europe/London" />

            <div style={{ borderTop: '1px solid #eee', margin: '8px 0 14px' }} />
            <label style={label}>
              Their database - REST url and token.
              {form.createdAt ? ' Leave blank to keep the current one.' : ''}
            </label>
            <input style={input} autoComplete="off" value={form.redis.url}
              onChange={e => set('redis', { ...form.redis, url: e.target.value })} placeholder="https://....upstash.io" />
            <input style={input} autoComplete="off" type="password" value={form.redis.token}
              onChange={e => set('redis', { ...form.redis, token: e.target.value })} placeholder="token" />
            <div style={{ fontSize: 11, color: '#888', marginTop: -6, marginBottom: 12 }}>
              Never shown again once saved. Create the database empty - never by copying another customer's.
            </div>

            <button style={btn} onClick={save} disabled={busy || problems.length > 0}>
              {busy ? 'Saving...' : 'Save'}
            </button>
            <button style={{ ...btn, background: '#f0f2f5', color: '#333', marginLeft: 8 }}
              onClick={() => { setForm(null); setErr('') }}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}
