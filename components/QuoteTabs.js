import { useRef } from 'react'
import BrandLogo from './BrandLogo'
import DocumentsPanel from './DocumentsPanel'
import { PLACEHOLDERS, CLAR_KINDS, currentTerms, fillPlaceholders } from '../lib/quoteDocs'
import { BU_UNIT_LABEL, descriptionText, descriptionParts } from '../lib/buildups'

// THE ESTIMATE'S QUOTE TABS (1092): Letter, Clarifications, Documents, Quote.
// The take-off is the other tab (pages/estimating/estimate/[id].js).
const uid = () => `own${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const box = { background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 16 }
const area = { width: '100%', boxSizing: 'border-box', fontSize: 13.5, padding: 10, border: '1px solid #d4d4d0', borderRadius: 8, fontFamily: 'inherit', lineHeight: 1.55 }
const chip = { fontSize: 11.5, padding: '3px 8px', border: '1px solid #99f6e4', background: '#f0fdfa', color: '#0f766e', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' }
const small = { fontSize: 12, padding: '5px 10px', border: '1px solid #d4d4d0', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }

export function LetterTab({ est, change, templates, values }) {
  const ref = useRef(null)
  const body = est.letter?.body || ''
  const setBody = (b) => change(e => ({ ...e, letter: { ...(e.letter || {}), body: b } }))
  const company = templates?.letter?.body || ''
  function insert(k) {
    const el = ref.current, tag = `{{${k}}}`, at = el ? el.selectionStart : body.length
    setBody(body.slice(0, at) + tag + body.slice(at))
    setTimeout(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = at + tag.length } }, 0)
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>Letter for this quote</strong>
          {company && <button onClick={() => { if (!body || window.confirm('Replace this letter with the company letter?')) setBody(company) }} style={small}>{body ? 'Reset to the company letter' : 'Start from the company letter'}</button>}
        </div>
        {!company && !body && <div style={{ fontSize: 12.5, color: '#92400e', marginBottom: 8 }}>No company letter yet - an admin writes it in Admin &gt; Quote Documents. You can write this one here.</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {PLACEHOLDERS.map(([k, label]) => <button key={k} onClick={() => insert(k)} style={chip}>{label}</button>)}
        </div>
        {/* RATES HELD UNTIL (1162) - fills {{ratesHeldUntil}}; blank shows [Rates held until] */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#555', marginBottom: 8 }}>
          Rates held until
          <input type="date" value={est.ratesHeldUntil || ''} onChange={e => change(x => ({ ...x, ratesHeldUntil: e.target.value || null }))}
            style={{ fontSize: 12.5, padding: '4px 7px', border: `1px solid ${est.ratesHeldUntil ? '#d4d4d0' : '#fcd34d'}`, borderRadius: 6, background: est.ratesHeldUntil ? '#fff' : '#fffbeb' }} />
          <span style={{ fontSize: 11.5, color: '#999' }}>{'{{ratesHeldUntil}}'} in the letter</span>
        </label>
        <textarea ref={ref} value={body} onChange={e => setBody(e.target.value)} rows={22} style={area} />
      </div>
      <div style={box}>
        <strong>As it will read</strong> <span style={{ fontSize: 11.5, color: '#999' }}>details live from the CRM deal; [gaps] show what is missing</span>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6, marginTop: 10 }}>{fillPlaceholders(body, values) || <span style={{ color: '#aaa' }}>Nothing written yet.</span>}</div>
      </div>
    </div>
  )
}

export function ClarificationsTab({ est, change, templates }) {
  const mine = est.clarifications || {}
  const lib = templates?.library || {}
  const setKind = (k, list) => change(e => ({ ...e, clarifications: { ...(e.clarifications || {}), [k]: list } }))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, alignItems: 'start' }}>
      {CLAR_KINDS.map(([k, label]) => {
        const list = mine[k] || []
        const ticked = new Set(list.map(x => x.id))
        return (
          <div key={k} style={box}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{label}</div>
            {(lib[k] || []).length > 0 && <div style={{ fontSize: 11.5, color: '#999', marginBottom: 4 }}>From the company list - tick to include</div>}
            {(lib[k] || []).map(x => (
              <label key={x.id} style={{ display: 'flex', gap: 7, fontSize: 12.5, marginBottom: 6, cursor: 'pointer', alignItems: 'flex-start' }}>
                <input type="checkbox" checked={ticked.has(x.id)} onChange={e => setKind(k, e.target.checked ? [...list, { id: x.id, text: x.text }] : list.filter(y => y.id !== x.id))} style={{ marginTop: 3 }} />
                <span>{x.text}</span>
              </label>
            ))}
            <div style={{ fontSize: 11.5, color: '#999', margin: '10px 0 4px' }}>On this quote</div>
            {list.map((x, i) => (
              <div key={x.id} style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
                <textarea value={x.text} onChange={e => setKind(k, list.map(y => y.id === x.id ? { ...y, text: e.target.value } : y))} rows={2} style={{ ...area, fontSize: 12.5 }} />
                <button onClick={() => setKind(k, list.filter(y => y.id !== x.id))} style={{ border: 'none', background: 'none', color: '#999', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
            {!list.length && <div style={{ fontSize: 12.5, color: '#bbb', marginBottom: 6 }}>None yet.</div>}
            <button onClick={() => setKind(k, [...list, { id: uid(), text: '' }])} style={small}>+ Add your own</button>
          </div>
        )
      })}
    </div>
  )
}

export function DocumentsTab({ est, readOnly }) {
  return <DocumentsPanel ownerType="estimate" ownerId={est.id} items={(est.rows || []).filter(r => r.kind === 'item')} title="Documents for this estimate" readOnly={readOnly} />
}

// THE QUOTE as the customer sees it. Prints to PDF (the browser's Print ->
// Save as PDF) with only the quote on the page.
export function QuotePreview({ est, values, priced, totals, templates, money, companyName, termsOverride, lib, draft, actions }) {
  // An item's quote line: its build-up DESCRIPTION when written, else its name (1098).
  // ...with a variable not yet chosen printed RED as [Warranty] (1121). Text marked
  // for amending prints normally - that red is for the take-off only.
  const lineText = (r) => {
    if (!(lib && r.buildup && descriptionText(r.buildup, lib))) return r.description
    return <span style={{ whiteSpace: 'pre-line' }}>{descriptionParts(r.buildup, lib).map((x, k) => x.red === 'missing' ? <span key={k} style={{ color: '#b91c1c', fontWeight: 700 }}>{x.text}</span> : <span key={k}>{ruled(x.text, k)}</span>)}</span>
  }
  const m2 = (v) => v == null ? '' : money(v, { dp: 2 })
  const s = est.settings || {}
  const terms = termsOverride || currentTerms(templates)
  const above = [], below = []
  let pastLine = false
  for (const r of est.rows || []) {
    if (r.kind === 'spacer') continue        // blank lines are take-off layout only (1139)
    if (r.kind === 'line') { pastLine = true; continue }
    if (pastLine) { if (r.kind === 'item') below.push(r); continue }   // below the line (1140)
    if (r.kind === 'section') above.push(r)
    else if (r.rateOnly) below.push(r)
    else above.push(r)
  }
  // a section header with no priced items under it before the next header is left off
  const shown = above.filter((r, i) => r.kind !== 'section' || above[i + 1]?.kind === 'item')
  const clar = est.clarifications || {}
  const th = { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #1a1a19', fontSize: 12 }
  const td = { padding: '5px 8px', borderBottom: '1px solid #eee', fontSize: 12.5, verticalAlign: 'top' }
  const num = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }
  return (
    <div>
      <style>{`@media print { body * { visibility: hidden !important; } .quote-doc, .quote-doc * { visibility: visible !important; } .quote-doc { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: none !important; } .no-print { display: none !important; } }`}</style>
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        {actions}
        <button onClick={() => window.print()} style={small}>Print draft</button>
        <span style={{ fontSize: 12, color: '#888' }}>Choose "Save as PDF" in the print window.</span>
      </div>
      <div className="quote-doc" style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 4, padding: '36px 44px', maxWidth: 860, margin: '0 auto', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', color: '#1a1a19' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div><BrandLogo style={{ maxHeight: 54 }} /><div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{companyName}</div></div>
          <div style={{ textAlign: 'right', fontSize: 12.5, lineHeight: 1.6 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Quotation</div>
            {est.quoteRef && <div>Ref {est.quoteRef} · Rev {est.revision}</div>}
            {values.date && <div>{values.date}</div>}
            {draft && <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', letterSpacing: 1 }}>DRAFT - not yet sent</div>}
          </div>
        </div>
        {(est.letter?.body || '').trim() && <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6, marginBottom: 28 }}>{fillPlaceholders(est.letter.body, values)}</div>}

        <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Schedule of rates and prices</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Description</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={th}>Unit</th><th style={{ ...th, textAlign: 'right' }}>Rate</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
          <tbody>
            {shown.map(r => r.kind === 'section'
              ? <tr key={r.id}><td colSpan={5} style={{ ...td, fontWeight: 700, textDecoration: 'underline', background: '#f6f6f4', paddingTop: 10 }}>{r.title}</td></tr>
              : <tr key={r.id}><td style={td}>{lineText(r)}</td><td style={num}>{r.qty ?? ''}</td><td style={td}>{BU_UNIT_LABEL[r.unit] || ''}</td><td style={num}>{m2(priced[r.id]?.rate)}</td><td style={num}>{m2(priced[r.id]?.total)}</td></tr>)}
            <tr><td colSpan={4} style={{ ...td, fontWeight: 700, borderTop: '2px solid #1a1a19', borderBottom: 'none' }}>Total</td><td style={{ ...num, fontWeight: 700, borderTop: '2px solid #1a1a19', borderBottom: 'none' }}>{m2(totals.total)}</td></tr>
          </tbody>
        </table>
        {s.mcd > 0 && <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>Our prices include a {+(s.mcd * 100).toFixed(2)}% main contractor's discount.</div>}

        {below.length > 0 && <>
          <h3 style={{ fontSize: 14, margin: '22px 0 6px' }}>Below the line <span style={{ fontWeight: 400, fontSize: 12, color: '#666' }}>(rate-only and optional items - not included in the total)</span></h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>{below.map(r => { const pr = priced[r.id] || {}; const opt = pr.optional && pr.total != null
              return <tr key={r.id}><td style={td}>{lineText(r)}</td><td style={num}>{opt ? pr.qty : 'TBC'}</td><td style={td}>{BU_UNIT_LABEL[r.unit] || ''}</td><td style={num}>{m2(pr.rate)}</td><td style={{ ...num, color: '#666' }}>{opt ? <>{m2(pr.total)} <span style={{ fontSize: 11 }}>optional</span></> : 'Rate only'}</td></tr> })}</tbody>
          </table>
        </>}

        {CLAR_KINDS.map(([k, label]) => (clar[k] || []).filter(x => x.text.trim()).length > 0 && (
          <div key={k} style={{ marginTop: 22 }}>
            <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>{label}</h3>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, lineHeight: 1.55 }}>{clar[k].filter(x => x.text.trim()).map(x => <li key={x.id}>{x.text}</li>)}</ol>
          </div>
        ))}

        {terms && <div style={{ marginTop: 28, pageBreakBefore: 'always' }}>
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>Terms &amp; Conditions <span style={{ fontWeight: 400, fontSize: 11.5, color: '#888' }}>version {terms.v}</span></h3>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, lineHeight: 1.5, color: '#333' }}>{terms.text}</div>
        </div>}
      </div>
    </div>
  )
}

// The separator between stacked descriptions (1147) drawn as a THICK CHARCOAL
// RULE (1155) rather than a row of dashes.
const ruled = (text, key = '') => String(text ?? '').split(/\n?————————\n?/).flatMap((t, i) => i ? [<span key={`${key}r${i}`} style={{ display: 'block', borderTop: '3px solid #36454f', margin: '6px 0' }} />, t] : [t])
