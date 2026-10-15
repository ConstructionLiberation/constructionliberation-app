import { useEffect, useRef, useState } from 'react'
import BrandLogo from './BrandLogo'
import DocumentsPanel from './DocumentsPanel'
import { PLACEHOLDERS, CLAR_KINDS, currentTerms, fillPlaceholders, letterOf, letterIsCustom, letterProblems, letterProblemText } from '../lib/quoteDocs'
import { BU_UNIT_LABEL, descriptionText, descriptionParts } from '../lib/buildups'

// THE ESTIMATE'S QUOTE TABS (1092): Letter, Clarifications, Documents, Quote.
// The take-off is the other tab (pages/estimating/estimate/[id].js).
const uid = () => `own${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const box = { background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 16 }
const area = { width: '100%', boxSizing: 'border-box', fontSize: 13.5, padding: 10, border: '1px solid #d4d4d0', borderRadius: 8, fontFamily: 'inherit', lineHeight: 1.55 }
const chip = { fontSize: 11.5, padding: '3px 8px', border: '1px solid #99f6e4', background: '#f0fdfa', color: '#0f766e', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' }
const small = { fontSize: 12, padding: '5px 10px', border: '1px solid #d4d4d0', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }

export function LetterTab({ est, change, templates, values, canEditTemplate, onSaveTemplate }) {
  // THE LETTER (1163, 1164) - the company template unless changed for this quote.
  // The quote's letter is edited as it reads (red shows red; typing inside red
  // clears it); placeholders and Make / Clear red are in EDIT TEMPLATE only.
  const custom = letterIsCustom(est)
  const company = (templates && templates.letter && templates.letter.body) || ''
  const body = letterOf(est, templates)
  const setBody = (b) => change(e => ({ ...e, letter: { ...(e.letter || {}), body: b } }))
  const [tpl, setTpl] = useState(null)
  const [tplErr, setTplErr] = useState('')
  const [busy, setBusy] = useState(false)
  const probs = letterProblems(tpl != null ? tpl : body, values)
  async function saveTemplate() {
    setBusy(true); setTplErr('')
    try { await onSaveTemplate(tpl); setTpl(null) } catch (e) { setTplErr(e.message) }
    setBusy(false)
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <strong>{tpl != null ? 'Company letter template' : 'Letter for this quote'}</strong>
          {tpl == null && (custom
            ? <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '2px 8px' }}>customised for this quote</span>
            : <span style={{ fontSize: 11, fontWeight: 600, color: '#0f766e', background: '#f0fdfa', borderRadius: 8, padding: '2px 8px' }}>using the company template</span>)}
          <span style={{ flex: 1 }} />
          {tpl == null && custom && company && <button onClick={() => { if (window.confirm('Go back to the company template? This quote\'s own changes to the letter are dropped.')) change(e => ({ ...e, letter: { ...(e.letter || {}), body: null } })) }} style={small}>Reset to template</button>}
          {canEditTemplate && tpl == null && <button onClick={() => setTpl(company)} style={{ ...small, color: '#0f766e', borderColor: '#99f6e4' }} title="Edit the company letter every quote follows">Edit template</button>}
        </div>
        {tpl != null ? (
          <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 12.5, color: '#0f766e', marginBottom: 8 }}>Every quote using the template follows it (customised ones keep their own). Mark in red anything an estimator must edit on each quote.</div>
            <LetterRich text={tpl} setText={setTpl} template />
            {tplErr && <div style={{ color: '#b42318', fontSize: 12.5, marginTop: 6 }}>{tplErr}</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setTpl(null); setTplErr('') }} style={small}>Cancel</button>
              <button onClick={saveTemplate} disabled={busy} style={{ ...small, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}>Save template</button>
            </div>
          </div>
        ) : <>
          {!company && !custom && <div style={{ fontSize: 12.5, color: '#92400e', marginBottom: 8 }}>No company letter yet{canEditTemplate ? ' - use Edit template to write it.' : ' - an admin writes it with Edit template.'} You can write this one here.</div>}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#555', marginBottom: 8 }}>
            Rates held until
            <input type="date" value={est.ratesHeldUntil || ''} onChange={e => change(x => ({ ...x, ratesHeldUntil: e.target.value || null }))}
              style={{ fontSize: 12.5, padding: '4px 7px', border: `1px solid ${est.ratesHeldUntil ? '#d4d4d0' : '#fca5a5'}`, borderRadius: 6, background: est.ratesHeldUntil ? '#fff' : '#fef2f2', color: est.ratesHeldUntil ? undefined : '#b91c1c' }} />
            {!est.ratesHeldUntil && <span style={{ fontSize: 11.5, color: '#b91c1c' }}>set it for this revision</span>}
          </label>
          <LetterRich text={body} setText={setBody} />
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 4 }}>Red = to edit before sending - type over it and it turns black.{!custom && company ? ' Typing here makes a copy for this quote only.' : ''}</div>
        </>}
      </div>
      <div style={box}>
        <strong>As it will read</strong> <span style={{ fontSize: 11.5, color: '#999' }}>details live from the CRM deal</span>
        {(probs.missing.length > 0 || probs.red > 0) && <div style={{ fontSize: 12.5, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '6px 10px', marginTop: 8 }}>⚠ Cannot be sent yet: {letterProblemText(probs)}.</div>}
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6, marginTop: 10 }}>{(tpl != null ? tpl : body) ? letterNodes(tpl != null ? tpl : body, values) : <span style={{ color: '#aaa' }}>Nothing written yet.</span>}</div>
      </div>
    </div>
  )
}
// THE LETTER EDITOR (1164) - shows red text RED (no markers). On a quote, typing
// inside red text turns it black (the flag is done). In the TEMPLATE it stays red
// until Clear red, and the placeholders and Make / Clear red sit above it.
const escH = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const toHtml = (text) => String(text || '').split(/(\[red\][\s\S]*?\[\/red\])/).map(part => {
  const m = part.match(/^\[red\]([\s\S]*?)\[\/red\]$/)
  return m ? `<span data-red="1" data-orig="${escH(m[1])}" style="color:#dc2626">${escH(m[1])}</span>` : escH(part)
}).join('')
function serialize(el) {
  let out = ''
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) out += c.nodeValue
      else if (c.nodeName === 'BR') out += '\n'
      else if (c.dataset && c.dataset.red) out += `[red]${c.textContent}[/red]`
      else { if ((c.nodeName === 'DIV' || c.nodeName === 'P') && out && !out.endsWith('\n')) out += '\n'; walk(c) }
    }
  }
  walk(el)
  return out
}
function LetterRich({ text, setText, template }) {
  const ref = useRef(null), last = useRef(null)
  useEffect(() => { const el = ref.current; if (el && text !== last.current) { el.innerHTML = toHtml(text); last.current = text } }, [text])
  const emit = () => { const el = ref.current; if (!el) return; const t = serialize(el); last.current = t; setText(t) }
  const onInput = () => {
    const el = ref.current
    if (!template) for (const sp of el.querySelectorAll('span[data-red]')) if (sp.textContent !== sp.dataset.orig) { sp.replaceWith(document.createTextNode(sp.textContent)) }
    emit()
  }
  const inEditor = () => { const s = window.getSelection(); return s && s.rangeCount && ref.current && ref.current.contains(s.getRangeAt(0).commonAncestorContainer) ? s.getRangeAt(0) : null }
  const insert = (k) => { ref.current.focus(); const r = inEditor(); const tag = `{{${k}}}`; if (r) { r.deleteContents(); const n = document.createTextNode(tag); r.insertNode(n); r.setStartAfter(n); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r) } else ref.current.appendChild(document.createTextNode(tag)); emit() }
  const makeRed = () => { const r = inEditor(); if (!r || r.collapsed) return; const sp = document.createElement('span'); sp.dataset.red = '1'; sp.style.color = '#dc2626'; sp.appendChild(r.extractContents()); sp.dataset.orig = sp.textContent; r.insertNode(sp); emit() }
  const clearRed = () => {
    const r = inEditor(); if (!r) return
    for (const sp of [...ref.current.querySelectorAll('span[data-red]')]) if (r.intersectsNode(sp) || sp.contains(r.startContainer)) sp.replaceWith(document.createTextNode(sp.textContent))
    emit()
  }
  return <>
    {template && <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
        {PLACEHOLDERS.map(([k, label]) => <button key={k} onMouseDown={e => e.preventDefault()} onClick={() => insert(k)} style={chip}>{label}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <button onMouseDown={e => e.preventDefault()} onClick={makeRed} title="Select words, then Make red - an estimator must edit them on each quote" style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #dc2626', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Make red</button>
        <button onMouseDown={e => e.preventDefault()} onClick={clearRed} title="Click in red text (or select it), then Clear red" style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Clear red</button>
        <span style={{ fontSize: 11.5, color: '#888' }}>red = to edit on each quote before it is sent</span>
      </div>
    </>}
    <div ref={ref} contentEditable suppressContentEditableWarning onInput={onInput}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); onInput() } }}
      onPaste={e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')) }}
      style={{ ...area, minHeight: 420, whiteSpace: 'pre-wrap', outline: 'none', overflowY: 'auto', background: '#fff' }} />
  </>
}
// The letter as it reads (1163, 1164): placeholders filled - one with nothing to
// fill it shows RED as [Its name]; text marked red shows red.
export function letterNodes(text, values) {
  const label = Object.fromEntries(PLACEHOLDERS), v = values || {}
  let k = 0
  const fill = (t) => String(t).split(/(\{\{\s*[a-zA-Z]+\s*\}\})/).map(part => {
    const m = part.match(/^\{\{\s*([a-zA-Z]+)\s*\}\}$/)
    if (!m) return <span key={k++}>{part}</span>
    const val = String(v[m[1]] ?? '').trim()
    return val ? <span key={k++}>{val}</span> : <span key={k++} style={{ color: '#dc2626', fontWeight: 600 }}>[{label[m[1]] || m[1]}]</span>
  })
  return String(text || '').split(/(\[red\][\s\S]*?\[\/red\])/).map(part => {
    const m = part.match(/^\[red\]([\s\S]*?)\[\/red\]$/)
    return m ? <span key={k++} style={{ color: '#dc2626' }}>{fill(m[1])}</span> : <span key={k++}>{fill(part)}</span>
  })
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
        {letterOf(est, templates).trim() && <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6, marginBottom: 28 }}>{letterNodes(letterOf(est, templates), values)}</div>}

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
