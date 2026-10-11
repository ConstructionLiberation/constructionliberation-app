import { useMemo, useState } from 'react'
import { useFormat } from './TenantProvider'
import { differingFields, defaultPick } from '../lib/crmMerge'
import { stageIdToLabel } from '../lib/crmDashboardAdapter'

// MERGE TWO PROJECTS (1075). Opened from "Merge" inside a deal.
//   1. Search for the other project - narrows as you type.
//   2. Side by side: for every field that differs, choose which to keep.
//      Value (with its value history) and stage + status (with theirs) are
//      chosen as a whole. Notes, activities, emails and the rest of the history
//      come from both.
//   3. Merge. The deal you are in survives and keeps its CRM number; the other
//      is retired into it. See lib/crmMerge.js and the merge-deals action.
export default function MergeDealModal({ deal, allDeals, schema, saving, onClose }) {
  const { money } = useFormat()
  const [q, setQ] = useState('')
  const [other, setOther] = useState(null)
  const [picks, setPicks] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const labelOf = (k) => (schema || []).find(f => f.key === k)?.label || k.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
  const show = (v) => v == null || v === '' ? <span style={{ color: '#bbb' }}>—</span> : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)
  const statusText = (d) => `${stageIdToLabel(d.stageId) || d.stageId || '—'} · ${d.status === 'won' ? 'Won' : d.status === 'lost' ? 'Lost' : 'Open'}`

  const results = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    return (allDeals || []).filter(d => String(d.id) !== String(deal.id)).filter(d => {
      const hay = `${d.title || ''} ${d.fields?.organization || ''} ${d.id} crm-${d.id} ${d.fields?.glenigan_id || ''}`.toLowerCase()
      return words.every(w => hay.includes(w))
    }).slice(0, 25)
  }, [q, allDeals, deal.id])

  function choose(d) {
    setOther(d)
    const keys = ['title', '__value', '__outcome', ...differingFields(deal, d)]
    setPicks(Object.fromEntries(keys.map(k => [k, defaultPick(deal, d, k)])))
  }

  async function merge() {
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'merge-deals', keepId: String(deal.id), mergeId: String(other.id), picks }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Merge failed (${r.status})`)
      // A full reload onto the surviving deal: the page's in-memory copies of
      // both deals are now out of date, and must not be autosaved back.
      window.location.href = `/crm?deal=${encodeURIComponent(deal.id)}`
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  const rows = other ? [
    { k: 'title', label: 'Project name', a: deal.title, b: other.title },
    { k: '__value', label: 'Value (and its value history)', a: money(deal.fields?.value || 0, { dp: 0 }), b: money(other.fields?.value || 0, { dp: 0 }), note: 'Only the chosen deal\'s value history is kept - so the pricing is not counted twice.' },
    { k: '__outcome', label: 'Stage and status (and their history)', a: statusText(deal), b: statusText(other), warn: deal.status !== other.status ? 'The two have a different status - this changes the scorecards.' : '' },
    ...differingFields(deal, other).map(k => ({ k, label: labelOf(k), a: show(deal.fields?.[k]), b: show(other.fields?.[k]) })),
  ] : []

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div role="dialog" aria-label="Merge projects" style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: other ? 980 : 620, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Merge projects</div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
        </div>

        {!other ? (
          <div style={{ padding: 20, overflow: 'auto' }}>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>Merge another project into <strong>{deal.title}</strong> (CRM-{deal.id}). Search by name, organisation or CRM number.</div>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Start typing a project…"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'inherit' }} />
            <div style={{ marginTop: 10 }}>
              {q.trim() && !results.length && <div style={{ fontSize: 13, color: '#999', padding: 10 }}>No project matches.</div>}
              {results.map(d => (
                <button key={d.id} onClick={() => choose(d)} style={{ display: 'block', width: '100%', textAlign: 'left', border: '1px solid #eef0f3', borderRadius: 8, background: '#fff', padding: '9px 12px', marginBottom: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#111' }}>{d.title || '(untitled)'} <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 12 }}>CRM-{d.id}</span></div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{d.fields?.organization || 'No organisation'} · {statusText(d)} · {money(d.fields?.value || 0, { dp: 0 })}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 20px', fontSize: 13, color: '#555', borderBottom: '1px solid #f1f5f9' }}>
              Choose what to keep where the two differ. Notes, activities, emails and the rest of the history come from <strong>both</strong>.
              {' '}<button onClick={() => setOther(null)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 13, padding: 0 }}>Pick a different project</button>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}><tr>
                  <th style={th}>Field</th>
                  <th style={th}>This project · CRM-{deal.id} <span style={{ fontWeight: 400, color: '#16a34a' }}>(survives)</span></th>
                  <th style={th}>{other.title} · CRM-{other.id} <span style={{ fontWeight: 400, color: '#9ca3af' }}>(merged in)</span></th>
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.k} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ ...td, fontWeight: 600, color: '#374151', width: 210 }}>{r.label}
                        {r.note && <div style={{ fontWeight: 400, fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.note}</div>}
                        {r.warn && <div style={{ fontWeight: 600, fontSize: 11, color: '#b45309', marginTop: 2 }}>{r.warn}</div>}</td>
                      {['keep', 'other'].map(sideKey => (
                        <td key={sideKey} style={{ ...td, background: picks[r.k] === sideKey ? '#f0fdf4' : 'transparent', cursor: 'pointer' }} onClick={() => setPicks(p => ({ ...p, [r.k]: sideKey }))}>
                          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                            <input type="radio" name={r.k} checked={picks[r.k] === sideKey} onChange={() => setPicks(p => ({ ...p, [r.k]: sideKey }))} style={{ marginTop: 2 }} />
                            <span style={{ wordBreak: 'break-word' }}>{sideKey === 'keep' ? r.a : r.b}</span>
                          </label>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {err && <div style={{ margin: '10px 20px 0', background: '#fdecec', border: '1px solid #f5c2c2', color: '#b42318', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>{err}</div>}
            <div style={{ padding: '14px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 12.5, color: '#6b7280' }}>
                <strong>{other.title}</strong> (CRM-{other.id}) will be merged into <strong>{deal.title}</strong> (CRM-{deal.id}) and removed from the lists. Its notes, activities and emails move across. This cannot be undone.
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={onClose} style={btn}>Cancel</button>
                <button onClick={merge} disabled={busy || saving} style={{ ...btn, background: '#1a1a2e', color: '#fff', borderColor: '#1a1a2e', opacity: busy || saving ? 0.5 : 1 }}>
                  {saving ? 'Saving your last change…' : busy ? 'Merging…' : 'Merge'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
const th = { textAlign: 'left', padding: '9px 12px', fontSize: 12, fontWeight: 600, color: '#4b5563', borderBottom: '1px solid #e5e7eb' }
const td = { padding: '9px 12px', verticalAlign: 'top' }
const btn = { fontSize: 13, padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }
