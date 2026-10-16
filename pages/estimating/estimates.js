import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import EstimatingShell, { Heading, ErrorBar, estApi } from '../../components/EstimatingShell'
import { useFormat } from '../../components/TenantProvider'
import { th, td, tdR, inp, btn } from '../../components/LibraryParts'

// ESTIMATING > ESTIMATES (1088). Every estimate, newest first; open one to
// carry on. New estimate: linked to a CRM deal (search the pipeline) or
// standalone. The take-off: pages/estimating/estimate/[id].js.

export default function EstimatesPage() {
  const router = useRouter()
  const { money } = useFormat()
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState('active')       // active | archived (deal lost in the CRM) | deleted (1177, admins)
  const [bin, setBin] = useState(null)
  const loadBin = () => estApi('/api/estimating/estimates?bin=1').then(d => setBin(d)).catch(e => setErr(e.message))
  useEffect(() => { if (tab === 'deleted') loadBin() }, [tab])
  async function restore(e) { try { await estApi('/api/estimating/estimates', { action: 'restore', id: e.id }); await Promise.all([load(), loadBin()]) } catch (x) { setErr(x.message) } }
  async function purge(e) { if (!window.confirm(`Delete "${e.title}" permanently? Its revisions and documents are removed for good - this cannot be undone.`)) return; try { await estApi('/api/estimating/estimates', { action: 'purge', id: e.id }); await loadBin() } catch (x) { setErr(x.message) } }
  const [who, setWho] = useState({ canDelete: false, admins: [] })

  const load = () => estApi('/api/estimating/estimates').then(d => { setList(d.estimates); setWho({ canDelete: !!d.canDelete, admins: d.admins || [] }) }).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])
  const archivedCount = (list || []).filter(e => e.archived).length
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return (list || []).filter(e => (tab === 'archived') === !!e.archived)
      .filter(e => words.every(w => `${e.title} ${e.dealTitle} ${e.organisation} ${e.quoteRef}`.toLowerCase().includes(w)))
  }, [list, q, tab])
  async function del(e, ev) {
    ev.stopPropagation()
    if (!window.confirm(`Delete the whole estimate "${e.title}" - all its revisions? It moves to Deleted estimates, where an admin can restore it for 30 days.`)) return
    try { await estApi('/api/estimating/estimates', { action: 'delete', id: e.id }); await load() } catch (x) { setErr(x.message) }
  }

  return (
    <EstimatingShell active="estimates" title="Estimates" wide>
      <Heading title="Estimates" sub={list ? `${list.length} estimate${list.length === 1 ? '' : 's'}` : ''}
        action={<button onClick={() => setCreating(true)} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}>+ New estimate</button>} />
      <ErrorBar error={err} onClose={() => setErr('')} />
      {!list ? <div style={{ color: '#aaa', padding: 30 }}>Loading…</div> : !list.length ? (
        <div style={{ background: '#fff', border: '1px dashed #d4d4d0', borderRadius: 12, padding: 32, textAlign: 'center', color: '#666', fontSize: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a19', marginBottom: 6 }}>No estimates yet</div>
          Start one from a CRM deal with + New estimate. Price lists, labour rates and build-ups need to be uploaded first.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            {[['active', `Active (${list.length - archivedCount})`], ['archived', `Archived (${archivedCount})`], ...(who.canDelete ? [['deleted', 'Deleted estimates']] : [])].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{ ...btn, background: tab === k ? '#1a1a19' : '#fff', color: tab === k ? '#fff' : '#555', borderColor: tab === k ? '#1a1a19' : '#d4d4d0' }}>{label}</button>
            ))}
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search estimate, deal, customer or quote ref…" style={{ ...inp, maxWidth: 380 }} />
            {!who.canDelete && <span style={{ fontSize: 12, color: '#888' }}>Only an admin can delete an issued estimate{who.admins.length ? ` - ask ${who.admins.join(', ')}` : ''}.</span>}
          </div>
          {tab === 'deleted' && (
            <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, overflow: 'auto' }}>
              <div style={{ fontSize: 12.5, color: '#666', padding: '10px 12px' }}>Deleted estimates - with all their revisions and documents. Restore one within {bin?.days || 30} days; after that it is removed for good.</div>
              {!bin ? <div style={{ color: '#aaa', padding: 12 }}>Loading…</div> : !bin.deleted.length ? <div style={{ color: '#aaa', padding: 12, fontSize: 13 }}>Nothing deleted.</div> : (
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                  <thead><tr>{['Estimate', 'CRM deal', 'Quote ref', 'Revisions issued', 'Deleted', 'Removed for good', ''].map((h, i) => <th key={i} style={{ ...th }}>{h}</th>)}</tr></thead>
                  <tbody>{bin.deleted.map(e => { const left = Math.max(0, Math.ceil((new Date(e.deletedAt).getTime() + (bin.days || 30) * 86400000 - Date.now()) / 86400000))
                    return <tr key={e.id}>
                      <td style={{ ...td, fontWeight: 600 }}>{e.title}</td><td style={td}>{e.dealTitle}</td><td style={td}>{e.quoteRef}</td><td style={td}>{e.revisions || 0}</td>
                      <td style={{ ...td, color: '#666' }}>{new Date(e.deletedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{e.deletedBy ? ` by ${e.deletedBy}` : ''}</td>
                      <td style={{ ...td, color: left <= 5 ? '#b42318' : '#666' }}>in {left} day{left === 1 ? '' : 's'}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}><button onClick={() => restore(e)} style={{ ...btn, color: '#0f766e', borderColor: '#99f6e4', marginRight: 6 }}>Restore</button><button onClick={() => purge(e)} style={{ ...btn, color: '#b42318', borderColor: '#f5c2c2' }}>Delete permanently</button></td>
                    </tr> })}</tbody>
                </table>)}
            </div>
          )}
          {tab === 'archived' && <div style={{ fontSize: 12.5, color: '#666', marginBottom: 8 }}>Archived: the estimate's CRM deal was lost. They are read-only; reopening the deal in the CRM brings the estimate back.</div>}
          {tab !== 'deleted' &&           <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
              <thead><tr>{['Estimate', 'CRM deal', 'Customer', 'Quote ref', 'Rev', 'Items', 'Total', tab === 'archived' ? 'Lost' : 'Last saved', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 6 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>
                {shown.map(e => (
                  <tr key={e.id} onClick={() => router.push(`/estimating/estimate/${e.id}`)} style={{ cursor: 'pointer', color: e.archived ? '#888' : undefined }}>
                    <td style={{ ...td, fontWeight: 600 }}>{e.title}</td>
                    <td style={td}>{e.dealTitle || <span style={{ color: '#aaa' }}>not linked</span>}</td>
                    <td style={td}>{e.organisation}</td>
                    <td style={td}>{e.quoteRef}</td>
                    <td style={td}>{e.revision}</td>
                    <td style={td}>{e.items}</td>
                    <td style={{ ...tdR, fontWeight: 600 }}>{money(e.total, { dp: 2 })}</td>
                    <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{e.archived ? (e.lostTime ? new Date(e.lostTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'lost') : <>{e.updatedAt ? new Date(e.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}{e.updatedBy ? ` · ${e.updatedBy}` : ''}</>}</td>
                    <td style={td}>{who.canDelete && <button onClick={(ev) => del(e, ev)} style={{ border: 'none', background: 'none', color: '#b42318', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }}>Delete</button>}</td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 24 }}>Nothing matches.</td></tr>}
              </tbody>
            </table>
          </div>}
        </>
      )}
      {creating && <NewEstimate onClose={() => setCreating(false)} onCreated={(id) => router.push(`/estimating/estimate/${id}`)} />}
    </EstimatingShell>
  )
}

function NewEstimate({ onClose, onCreated }) {
  const [deals, setDeals] = useState(null)
  const [q, setQ] = useState('')
  const [title, setTitle] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { estApi('/api/estimating/estimates?deals=1').then(d => setDeals(d.deals)).catch(e => setErr(e.message)) }, [])
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (deals || []).filter(d => words.length && words.every(w => `${d.title} ${d.organisation}`.toLowerCase().includes(w))).slice(0, 30)
  async function create(dealId) {
    setBusy(true); setErr('')
    try { const d = await estApi('/api/estimating/estimates', { action: 'create', dealId: dealId || null, title: dealId ? undefined : (title.trim() || 'New estimate') }); onCreated(d.estimate.id) }
    catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>New estimate</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Link it to a CRM deal</div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={deals ? `Search ${deals.length} deals by name or customer…` : 'Loading deals…'} style={inp} autoFocus />
        <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 6 }}>
          {matches.map(d => (
            <button key={d.id} onClick={() => create(d.id)} disabled={busy} style={{ display: 'block', width: '100%', textAlign: 'left', border: '1px solid #eee', borderRadius: 8, padding: '8px 10px', marginBottom: 4, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{d.title}</div>
              <div style={{ fontSize: 11.5, color: '#888' }}>{d.organisation}{d.status ? ` · ${d.status}` : ''}</div>
            </button>
          ))}
          {words.length > 0 && deals && !matches.length && <div style={{ fontSize: 12.5, color: '#aaa', padding: 8 }}>No deal matches.</div>}
        </div>
        <div style={{ borderTop: '1px solid #eee', marginTop: 12, paddingTop: 12, fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Or start without a deal</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Estimate name" style={inp} />
            <button onClick={() => create(null)} disabled={busy} style={btn}>Create</button>
          </div>
        </div>
        {err && <div style={{ color: '#b42318', fontSize: 13, marginTop: 10 }}>{err}</div>}
      </div>
    </div>
  )
}
