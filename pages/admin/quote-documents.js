import { useEffect, useRef, useState } from 'react'
import AdminShell from '../../components/AdminShell'
import { PLACEHOLDERS, CLAR_KINDS, currentTerms, checklistOf } from '../../lib/quoteDocs'

// ADMIN > QUOTE DOCUMENTS (1092). The company's standard quote text:
//   - the covering LETTER, with {{placeholders}} filled from each quote
//   - the standard CLARIFICATIONS library (inclusions, exclusions,
//     clarifications) that estimators tick per quote
//   - the TERMS & CONDITIONS - each save is a new version; an issued quote
//     keeps the version it went out with
// Admins edit; estimators read them inside each estimate.
const API = '/api/estimating/quote-templates'
const uid = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

async function api(body) {
  const r = await fetch(API, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`)
  return d
}

export default function QuoteDocuments() {
  const [tpl, setTpl] = useState(null)
  const [terms, setTerms] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [dirty, setDirty] = useState(false)
  const letterRef = useRef(null)
  useEffect(() => { api().then(d => { setTpl(d.templates); setTerms(currentTerms(d.templates)?.text || '') }).catch(e => setErr(e.message)) }, [])

  const edit = (fn) => { setTpl(t => fn(t)); setDirty(true); setMsg('') }
  function insert(key) {
    const el = letterRef.current, tag = `{{${key}}}`
    const body = tpl.letter.body || ''
    const at = el ? el.selectionStart : body.length
    edit(t => ({ ...t, letter: { ...t.letter, body: body.slice(0, at) + tag + body.slice(at) } }))
    setTimeout(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = at + tag.length } }, 0)
  }
  async function save() {
    setErr(''); try { const d = await api({ action: 'save', letter: tpl.letter, library: tpl.library, checklist: checklistOf(tpl) }); setTpl(d.templates); setDirty(false); setMsg('Saved.') } catch (e) { setErr(e.message) }
  }
  async function saveTerms() {
    setErr(''); try { const d = await api({ action: 'terms', text: terms }); setTpl(d.templates); setMsg(d.unchanged ? 'The Terms & Conditions are unchanged.' : `Saved as version ${currentTerms(d.templates).v}.`) } catch (e) { setErr(e.message) }
  }
  const cur = tpl && currentTerms(tpl)
  return (
    <AdminShell active="/admin/quote-documents" title="Quote Documents">
      {err && <div style={{ background: '#fdecec', color: '#b42318', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {!tpl ? <div style={{ color: '#aaa' }}>Loading…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>The standard text every quote starts from. Estimators use these inside each estimate (Letter, Clarifications and Quote tabs) - and can change them for that quote.</p>

          <Card title="Covering letter" hint="Click a placeholder to insert it where the cursor is. It is filled from each quote - live from the CRM deal.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {PLACEHOLDERS.map(([k, label]) => <button key={k} onClick={() => insert(k)} title={`{{${k}}}`} style={chip}>{label}</button>)}
            </div>
            <textarea ref={letterRef} value={tpl.letter.body || ''} onChange={e => edit(t => ({ ...t, letter: { ...t.letter, body: e.target.value } }))} rows={16} placeholder={'Dear {{contactFirstName}},\n\nRe: {{project}}, {{location}}\n\nThank you for the opportunity to quote...'} style={area} />
          </Card>

          <Card title="Standard clarifications" hint="Estimators tick these per quote, and can add their own.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {CLAR_KINDS.map(([k, label]) => (
                <div key={k}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{label}</div>
                  {(tpl.library[k] || []).map((x, i) => (
                    <div key={x.id} style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
                      <textarea value={x.text} onChange={e => edit(t => ({ ...t, library: { ...t.library, [k]: t.library[k].map(y => y.id === x.id ? { ...y, text: e.target.value } : y) } }))} rows={2} style={{ ...area, fontSize: 12.5 }} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <button onClick={() => edit(t => { const l = [...t.library[k]]; if (i > 0) [l[i - 1], l[i]] = [l[i], l[i - 1]]; return { ...t, library: { ...t.library, [k]: l } } })} style={icon}>↑</button>
                        <button onClick={() => edit(t => ({ ...t, library: { ...t.library, [k]: t.library[k].filter(y => y.id !== x.id) } }))} style={icon}>✕</button>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => edit(t => ({ ...t, library: { ...t.library, [k]: [...(t.library[k] || []), { id: uid(), text: '' }] } }))} style={small}>+ {label.replace(/s$/, '')}</button>
                </div>
              ))}
            </div>
          </Card>
          {/* THE PRICING CHECKLIST (1142) - shown above the total on every take-off */}
          <Card title="Pricing checklist" hint={`Reminders on every take-off, above the total - estimators tick them, and can add their own per estimate.${Array.isArray(tpl.checklist) ? '' : ' This is the starter list until you save your own.'}`}>
            {checklistOf(tpl).map((x, i) => (
              <div key={x.id} style={{ display: 'flex', gap: 4, marginBottom: 5, maxWidth: 760 }}>
                <input value={x.text} onChange={e => edit(t => ({ ...t, checklist: checklistOf(t).map(y => y.id === x.id ? { ...y, text: e.target.value } : y) }))} style={{ ...area, fontSize: 13, padding: '6px 9px' }} />
                <button onClick={() => edit(t => { const l = [...checklistOf(t)]; if (i > 0) [l[i - 1], l[i]] = [l[i], l[i - 1]]; return { ...t, checklist: l } })} style={icon} title="Move up">↑</button>
                <button onClick={() => edit(t => ({ ...t, checklist: checklistOf(t).filter(y => y.id !== x.id) }))} style={icon} title="Remove">✕</button>
              </div>
            ))}
            <button onClick={() => edit(t => ({ ...t, checklist: [...checklistOf(t), { id: uid(), text: '' }] }))} style={small}>+ Reminder</button>
          </Card>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={save} disabled={!dirty} style={{ ...btn, background: '#1a1a2e', color: '#fff', opacity: dirty ? 1 : 0.5 }}>Save letter, clarifications and checklist</button>
            {dirty && <span style={{ fontSize: 12.5, color: '#b45309' }}>Unsaved changes</span>}
            {msg && <span style={{ fontSize: 12.5, color: '#15803d' }}>{msg}</span>}
          </div>

          <Card title="Terms & Conditions" hint={cur ? `Version ${cur.v} - saved ${new Date(cur.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${cur.by ? ` by ${cur.by}` : ''}. Saving a change makes a new version; issued quotes keep theirs.` : 'Not written yet.'}>
            <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={18} style={area} placeholder="Paste or write your Terms & Conditions." />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
              <button onClick={saveTerms} disabled={!terms.trim() || terms === (cur?.text || '')} style={{ ...btn, background: '#1a1a2e', color: '#fff', opacity: !terms.trim() || terms === (cur?.text || '') ? 0.5 : 1 }}>Save as version {(cur?.v || 0) + 1}</button>
              {(tpl.terms.versions || []).length > 1 && <span style={{ fontSize: 12, color: '#888' }}>Earlier versions: {tpl.terms.versions.slice(0, -1).map(v => `v${v.v} (${new Date(v.at).toLocaleDateString('en-GB')})`).join(', ')}</span>}
            </div>
          </Card>
        </div>
      )}
    </AdminShell>
  )
}

function Card({ title, hint, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, color: '#888', margin: '2px 0 10px' }}>{hint}</div>}
      {children}
    </div>
  )
}
const area = { width: '100%', boxSizing: 'border-box', fontSize: 13.5, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontFamily: 'inherit', lineHeight: 1.5 }
const chip = { fontSize: 11.5, padding: '3px 8px', border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' }
const icon = { border: 'none', background: 'none', cursor: 'pointer', color: '#888', fontSize: 12, padding: 2 }
const small = { fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }
const btn = { fontSize: 13, padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }
