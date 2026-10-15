import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import BrandLogo from './BrandLogo'
import { useFormat } from './TenantProvider'
import DocumentsPanel from './DocumentsPanel'
import { PLACEHOLDERS, CLAR_KINDS, currentTerms, fillPlaceholders, letterOf, letterIsCustom, letterProblems, letterProblemText, clarOf, clarIsCustom, clarTemplateOf, clarStarter } from '../lib/quoteDocs'
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
// TURN TYPED-OVER RED BLACK, KEEPING THE CURSOR WHERE IT WAS (1171) - swapping the red
// section for plain text loses the cursor, so the rest of the typing went in
// before the first letter. The cursor is saved as a character count and put back.
function unredTyped(el) {
  const spans = [...el.querySelectorAll('span[data-red]')].filter(sp => sp.textContent !== sp.dataset.orig)
  if (!spans.length) return
  const s = window.getSelection()
  let at = null
  if (s && s.rangeCount && el.contains(s.getRangeAt(0).endContainer)) { const r = document.createRange(); r.selectNodeContents(el); r.setEnd(s.getRangeAt(0).endContainer, s.getRangeAt(0).endOffset); at = r.toString().length }
  for (const sp of spans) sp.replaceWith(document.createTextNode(sp.textContent))
  el.normalize()
  if (at == null) return
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, left = at
  while ((n = walk.nextNode())) { if (left <= n.nodeValue.length) { const r = document.createRange(); r.setStart(n, left); r.collapse(true); s.removeAllRanges(); s.addRange(r); return } left -= n.nodeValue.length }
}
// SHARED RED EDITING (1171) - the editor the selection is in, and Make / Clear red on it
const editorOfSelection = () => { const s = window.getSelection(); if (!s || !s.rangeCount) return null; const n = s.getRangeAt(0).commonAncestorContainer; const el = (n.nodeType === 1 ? n : n.parentElement); return el && el.closest ? el.closest('[data-redit]') : null }
function makeRedSel() { const el = editorOfSelection(); const s = window.getSelection(); if (!el || !s.rangeCount) return; const r = s.getRangeAt(0); if (r.collapsed) return; const sp = document.createElement('span'); sp.dataset.red = '1'; sp.style.color = '#dc2626'; sp.appendChild(r.extractContents()); sp.dataset.orig = sp.textContent; r.insertNode(sp); el.__emit && el.__emit() }
function clearRedSel() { const el = editorOfSelection(); const s = window.getSelection(); if (!el || !s.rangeCount) return; const r = s.getRangeAt(0); for (const sp of [...el.querySelectorAll('span[data-red]')]) if (r.intersectsNode(sp) || sp.contains(r.startContainer)) sp.replaceWith(document.createTextNode(sp.textContent)); el.__emit && el.__emit() }
// A one-paragraph editor that shows [red]...[/red] as red (clarifications, 1171).
// keepRed (the template): red stays red while typing; otherwise typing inside red
// turns it black, like the letter.
function RedLine({ text, setText, keepRed, placeholder }) {
  const ref = useRef(null), last = useRef(null)
  useEffect(() => { const el = ref.current; if (el && text !== last.current) { el.innerHTML = toHtml(text); last.current = text } }, [text])
  const emit = () => { const el = ref.current; if (!el) return; const t = serialize(el); last.current = t; setText(t) }
  useEffect(() => { if (ref.current) ref.current.__emit = emit })
  const onInput = () => { const el = ref.current; if (!keepRed) unredTyped(el); emit() }
  return <div ref={ref} data-redit="1" contentEditable suppressContentEditableWarning onInput={onInput} data-placeholder={placeholder}
    onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
    onPaste={e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s*\n\s*/g, ' ')) }}
    style={{ ...area, flex: 1, fontSize: 12.5, minHeight: 38, whiteSpace: 'pre-wrap', outline: 'none', background: '#fff' }} />
}
function LetterRich({ text, setText, template }) {
  const ref = useRef(null), last = useRef(null)
  useEffect(() => { const el = ref.current; if (el && text !== last.current) { el.innerHTML = toHtml(text); last.current = text } }, [text])
  const emit = () => { const el = ref.current; if (!el) return; const t = serialize(el); last.current = t; setText(t) }
  const onInput = () => {
    const el = ref.current
    if (!template) unredTyped(el)
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

export function ClarificationsTab({ est, change, templates, canEditTemplate, onSaveTemplate }) {
  // CLARIFICATIONS (1165) - one list, sorted under headers; the company template
  // unless changed for this quote.
  const custom = clarIsCustom(est)
  const company = clarTemplateOf(templates)
  const list = clarOf(est, templates)
  const setList = (l) => change(e => ({ ...e, clarList: l }))
  const [tpl, setTpl] = useState(null)
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  async function saveTemplate() { setBusy(true); setErr(''); try { await onSaveTemplate(tpl); setTpl(null) } catch (e) { setErr(e.message) } setBusy(false) }
  return (
    <div style={{ ...box, maxWidth: 980 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{tpl != null ? 'Clarifications template' : 'Clarifications'}</strong>
        {tpl == null && (custom
          ? <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '2px 8px' }}>customised for this quote</span>
          : <span style={{ fontSize: 11, fontWeight: 600, color: '#0f766e', background: '#f0fdfa', borderRadius: 8, padding: '2px 8px' }}>using the company template</span>)}
        <span style={{ flex: 1 }} />
        {tpl == null && custom && <button onClick={() => { if (window.confirm('Go back to the company template? This quote\'s own clarifications are dropped.')) change(e => ({ ...e, clarList: null, clarifications: null })) }} style={small}>Reset to template</button>}
        {canEditTemplate && tpl == null && <button onClick={() => setTpl(clarStarter(templates).map(x => ({ ...x })))} style={{ ...small, color: '#0f766e', borderColor: '#99f6e4' }} title="Edit the clarifications every quote follows">Edit template</button>}
      </div>
      {tpl != null ? (
        <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12.5, color: '#0f766e', marginBottom: 8 }}>Every quote using the template follows it (customised ones keep their own).{!Array.isArray(templates && templates.clarTemplate) ? ' Started from your old company list - remove what should not be on every quote.' : ''}</div>
          <ClarListEditor list={tpl} setList={setTpl} template />
          {err && <div style={{ color: '#b42318', fontSize: 12.5, marginTop: 6 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setTpl(null); setErr('') }} style={small}>Cancel</button>
            <button onClick={saveTemplate} disabled={busy} style={{ ...small, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}>Save template</button>
          </div>
        </div>
      ) : <>
        {!company.length && !custom && <div style={{ fontSize: 12.5, color: '#92400e', marginBottom: 8 }}>No clarifications template yet{canEditTemplate ? ' - use Edit template to write it.' : ' - an admin writes it with Edit template.'} You can add this quote's here.</div>}
        <ClarListEditor list={list} setList={setList} />
        {!custom && company.length > 0 && <div style={{ fontSize: 11.5, color: '#888', marginTop: 6 }}>Changing these makes a copy for this quote only - the template is not changed.</div>}
      </>}
    </div>
  )
}
// THE CLARIFICATIONS LIST EDITOR (1165) - headers (bold) and clarifications;
// drag by the handle or use the arrows to sort; + Add clarification / + Add header.
export function ClarListEditor({ list, setList, template }) {
  const [drag, setDrag] = useState(null), [dropAt, setDropAt] = useState(null)
  // TICK AND ACT ON SEVERAL (1172) - a header takes the clarifications under it
  const [sel, setSel] = useState(() => new Set())
  const live = new Set(list.map(x => x.id))
  const ticked = new Set([...sel].filter(id => live.has(id)))
  const toggle = (id) => setSel(cur => {
    const n = new Set(cur), on = !n.has(id), k = list.findIndex(x => x.id === id), ids = [id]
    if (k >= 0 && list[k].kind === 'header') for (let j = k + 1; j < list.length && list[j].kind !== 'header'; j++) ids.push(list[j].id)
    for (const i of ids) { if (on) n.add(i); else n.delete(i) }
    return n
  })
  const allTicked = list.length > 0 && list.every(x => ticked.has(x.id))
  const plain = (t) => String(t || '').replace(/\[\/?red\]/g, '')
  const bulkRed = () => setList(list.map(x => ticked.has(x.id) && x.kind !== 'header' && plain(x.text).trim() ? { ...x, text: `[red]${plain(x.text)}[/red]` } : x))
  const bulkClear = () => setList(list.map(x => ticked.has(x.id) ? { ...x, text: plain(x.text) } : x))
  const bulkDelete = () => { if (window.confirm(`Delete ${ticked.size} ticked row${ticked.size === 1 ? '' : 's'}?`)) { setList(list.filter(x => !ticked.has(x.id))); setSel(new Set()) } }
  const bb = { fontSize: 12, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }
  const nid = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  const set = (id, patch) => setList(list.map(x => x.id === id ? { ...x, ...patch } : x))
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const l = [...list]; [l[i], l[j]] = [l[j], l[i]]; setList(l) }
  const drop = (targetId, after) => { if (!drag || drag === targetId) return; const moving = list.find(x => x.id === drag); const rest = list.filter(x => x.id !== drag); let k = rest.findIndex(x => x.id === targetId); if (after) k++; rest.splice(k, 0, moving); setList(rest) }
  let n = 0
  const reds = list.reduce((n, x) => n + ((String(x.text || '').match(/\[red\][\s\S]*?\[\/red\]/g) || []).length), 0)
  const redBar = template
    ? <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <button onMouseDown={e => e.preventDefault()} onClick={makeRedSel} title="Select words in a clarification, then Make red - for what may not apply to every quote" style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #dc2626', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Make red</button>
        <button onMouseDown={e => e.preventDefault()} onClick={clearRedSel} title="Click in red text (or select it), then Clear red" style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Clear red</button>
        <span style={{ fontSize: 11.5, color: '#888' }}>red = check it applies on each quote - part of a sentence or all of it</span>
      </div>
    : reds > 0 ? <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '6px 10px' }}>
        <span style={{ fontSize: 12.5, color: '#b91c1c' }}>⚠ {reds} red part{reds === 1 ? '' : 's'} - check each applies to this quote: select it and Clear red to keep it, type over it, or delete the line. The quote cannot be sent until none are left.</span>
        <button onMouseDown={e => e.preventDefault()} onClick={clearRedSel} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 'auto' }}>Clear red</button>
      </div> : null
  return <>
    {redBar}
    {list.length > 0 && <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666', margin: '0 0 6px 2px', cursor: 'pointer' }}>
      <input type="checkbox" checked={allTicked} onChange={() => setSel(allTicked ? new Set() : new Set(list.map(x => x.id)))} /> Tick all</label>}
    {ticked.size > 0 && (
      <div style={{ position: 'sticky', top: 6, zIndex: 20, display: 'flex', gap: 8, alignItems: 'center', background: '#0f766e', color: '#fff', borderRadius: 8, padding: '7px 10px', marginBottom: 8, fontSize: 13 }}>
        <strong>{ticked.size} ticked</strong>
        <button onClick={bulkRed} title="Make each ticked clarification red - to check on each quote" style={{ ...bb, border: '1px solid #dc2626', background: '#dc2626', color: '#fff' }}>Mark red</button>
        <button onClick={bulkClear} style={{ ...bb, border: '1px solid #fff', background: '#fff', color: '#dc2626' }}>Clear red</button>
        <button onClick={bulkDelete} style={{ ...bb, border: '1px solid #fca5a5', background: 'transparent', color: '#fff' }}>Delete</button>
        <button onClick={() => setSel(new Set())} style={{ ...bb, marginLeft: 'auto', fontWeight: 400, border: '1px solid rgba(255,255,255,0.7)', background: 'transparent', color: '#fff' }}>Untick</button>
      </div>
    )}
    {!list.length && <div style={{ fontSize: 12.5, color: '#bbb', margin: '4px 0 8px' }}>None yet.</div>}
    {list.map((x, i) => {
      if (x.kind !== 'header') n++
      return (
        <div key={x.id} onDragOver={e => { if (!drag) return; e.preventDefault(); const b = e.currentTarget.getBoundingClientRect(); setDropAt({ id: x.id, after: e.clientY > b.top + b.height / 2 }) }}
          onDrop={e => { e.preventDefault(); if (dropAt) drop(dropAt.id, dropAt.after); setDrag(null); setDropAt(null) }}
          style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '3px 0', marginTop: x.kind === 'header' && i ? 10 : 0, opacity: drag === x.id ? 0.4 : 1,
            boxShadow: dropAt && dropAt.id === x.id ? (dropAt.after ? 'inset 0 -3px 0 #0f766e' : 'inset 0 3px 0 #0f766e') : undefined }}>
          <input type="checkbox" checked={ticked.has(x.id)} onChange={() => toggle(x.id)} title={x.kind === 'header' ? 'Tick this header and the clarifications under it' : 'Tick'} style={{ marginTop: 10 }} />
          <span draggable onDragStart={e => { setDrag(x.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', x.id) } catch {} }} onDragEnd={() => { setDrag(null); setDropAt(null) }}
            title="Drag to move" style={{ cursor: 'grab', color: '#aaa', padding: '6px 2px', userSelect: 'none', fontSize: 13 }}>⋮⋮</span>
          {x.kind === 'header'
            ? <input value={x.text} onChange={e => set(x.id, { text: e.target.value })} placeholder="Header - e.g. Access" style={{ ...area, flex: 1, fontWeight: 700, fontSize: 13.5, background: '#f4f4f2' }} />
            : <><span style={{ fontSize: 12.5, color: '#888', padding: '7px 0', minWidth: 22, textAlign: 'right' }}>{n}.</span>
                <RedLine text={x.text} setText={(t) => set(x.id, { text: t })} keepRed={template} placeholder="Clarification" /></>}
          <button onClick={() => move(i, -1)} title="Move up" style={{ border: 'none', background: 'none', color: '#999', cursor: 'pointer', padding: '6px 2px' }}>↑</button>
          <button onClick={() => move(i, 1)} title="Move down" style={{ border: 'none', background: 'none', color: '#999', cursor: 'pointer', padding: '6px 2px' }}>↓</button>
          <button onClick={() => setList(list.filter(y => y.id !== x.id))} title="Remove" style={{ border: 'none', background: 'none', color: '#999', cursor: 'pointer', padding: '6px 2px' }}>✕</button>
        </div>
      )
    })}
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <button onClick={() => setList([...list, { id: nid(), kind: 'item', text: '' }])} style={small}>+ Add clarification</button>
      <button onClick={() => setList([...list, { id: nid(), kind: 'header', text: '' }])} style={{ ...small, fontWeight: 700 }}>+ Add header</button>
    </div>
  </>
}

// DOCUMENTS TO APPEND TO THE QUOTE (1169) - mark-ups, technical documents... -
// per REVISION: these are the working revision's; earlier ones stay with theirs.
export function DocumentsTab({ est, readOnly }) {
  const rev = (est.reopened && est.reopened.revision) || est.revision
  return <>
    <div style={{ fontSize: 12.5, color: '#666', marginBottom: 8 }}>Documents to append to the quote - mark-ups, technical documents and the like. They are listed on the quote's Documents page. Each revision has its own: Rev {rev}'s are added here; earlier revisions keep theirs.</div>
    <DocumentsPanel ownerType="estimate" ownerId={est.id} revision={rev} title={`Documents for Rev ${rev}`} readOnly={readOnly} />
  </>
}

// THE QUOTE as the customer sees it. Prints to PDF (the browser's Print ->
// Save as PDF) with only the quote on the page.
export function QuotePreview({ est, values, priced, totals, templates, money, companyName, termsOverride, lib, draft, actions, revBar, documents }) {
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
  const th = { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #1a1a19', fontSize: 12 }
  const td = { padding: '5px 8px', borderBottom: '1px solid #eee', fontSize: 12.5, verticalAlign: 'top' }
  const num = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }
  // THE QUOTE ON REAL A4 PAGES (1168, 1173) - Letter, Clarifications, Rates (inc.
  // below the line), Documents, Terms & Conditions. Each section starts a new
  // page; content that does not fit FLOWS ONTO THE NEXT SHEET ("Rates
  // (continued)"), the rates headings repeated. Each piece (a letter line, a
  // clarification, a rates row) is measured at the page width, off screen, and
  // placed onto 210 x 297 mm sheets - the size they print at, so the screen shows
  // the pages as they will print.
  const PAGE_W = 794, PAGE_H = 1123, PAD_X = 52, PAD_Y = 46
  const CONTENT_W = PAGE_W - 2 * PAD_X, CONTENT_H = PAGE_H - 2 * PAD_Y
  const clarItems = clarOf(est, templates).filter(x => String(x.text || '').trim())
  const docs = (documents || []).filter(d => d && d.name)
  const COLS = <colgroup><col style={{ width: '51%' }} /><col style={{ width: '10%' }} /><col style={{ width: '8%' }} /><col style={{ width: '14%' }} /><col style={{ width: '17%' }} /></colgroup>
  const tbl = (rows) => <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>{COLS}<tbody>{rows}</tbody></table>
  const h3 = (t, extra) => <h3 style={{ fontSize: 15, margin: '0 0 10px' }}>{t}{extra}</h3>
  // letter lines, each keeping its own red (a red part across lines is closed and reopened)
  const letterLines = (() => { let inRed = false; return String(letterOf(est, templates) || '').split('\n').map(line => {
    let l = (inRed ? '[red]' : '') + line
    const opens = (l.match(/\[red\]/g) || []).length, closes = (l.match(/\[\/red\]/g) || []).length
    inRed = opens > closes; if (inRed) l += '[/red]'
    return l }) })()
  let clarN = 0
  const sections = [
    { key: 'letter', title: 'Letter', full: true, blocks: [
      { id: 'head', el: <QuoteLetterhead companyName={companyName} draft={draft} /> },
      ...(letterLines.join('').trim() ? letterLines.map((l, i) => ({ id: `l${i}`, el: <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6 }}>{l.trim() ? letterNodes(l, values) : '\u00a0'}</div> }))
        : [{ id: 'none', el: <div style={{ color: '#aaa', fontSize: 13 }}>No letter written yet.</div> }]),
    ] },
    ...(clarItems.some(x => x.kind !== 'header') ? [{ key: 'clar', title: 'Clarifications', blocks: [
      { id: 't', el: h3('Clarifications') },
      ...clarItems.map(x => ({ id: x.id, el: x.kind === 'header'
        ? <div style={{ fontSize: 13, fontWeight: 700, padding: '10px 0 4px' }}>{x.text}</div>
        : <div style={{ display: 'flex', gap: 6, fontSize: 12.5, lineHeight: 1.55, paddingLeft: 4 }}><span style={{ minWidth: 22, color: '#555' }}>{++clarN}.</span><span>{redNodes(x.text)}</span></div> })),
    ] }] : []),
    { key: 'rates', title: 'Rates', heads: {
        rates: { id: 'rh', el: tbl(<tr><th style={th}>Description</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={th}>Unit</th><th style={{ ...th, textAlign: 'right' }}>Rate</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr>) },
        below: { id: 'bh', el: <div style={{ paddingTop: 4 }}>{h3('Below the line', <span style={{ fontWeight: 400, fontSize: 12, color: '#666' }}> (rate-only and optional items - not included in the total)</span>)}</div> } },
      blocks: [
        { id: 't', el: h3('Schedule of rates and prices') },
        ...shown.map(r => ({ id: r.id, table: 'rates', el: tbl(r.kind === 'section'
          ? <tr><td colSpan={5} style={{ ...td, fontWeight: 700, textDecoration: 'underline', background: '#f6f6f4', paddingTop: 10 }}>{r.title}</td></tr>
          : <tr><td style={td}>{lineText(r)}</td><td style={num}>{r.qty ?? ''}</td><td style={td}>{BU_UNIT_LABEL[r.unit] || ''}</td><td style={num}>{m2(priced[r.id]?.rate)}</td><td style={num}>{m2(priced[r.id]?.total)}</td></tr>) })),
        { id: 'total', table: 'rates', el: tbl(<tr><td colSpan={4} style={{ ...td, fontWeight: 700, borderTop: '2px solid #1a1a19', borderBottom: 'none' }}>Total</td><td style={{ ...num, fontWeight: 700, borderTop: '2px solid #1a1a19', borderBottom: 'none' }}>{m2(totals.total)}</td></tr>) },
        ...(s.mcd > 0 ? [{ id: 'mcd', el: <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>Our prices include a {+(s.mcd * 100).toFixed(2)}% main contractor's discount.</div> }] : []),
        ...(below.length ? [{ id: 'gap', el: <div style={{ height: 18 }} /> }] : []),
        ...below.map(r => { const pr = priced[r.id] || {}; const opt = pr.optional && pr.total != null
          return { id: `b${r.id}`, table: 'below', el: tbl(<tr><td style={td}>{lineText(r)}</td><td style={num}>{opt ? pr.qty : 'TBC'}</td><td style={td}>{BU_UNIT_LABEL[r.unit] || ''}</td><td style={num}>{m2(pr.rate)}</td><td style={{ ...num, color: '#6d28d9' }}>{opt ? `${m2(pr.total)} optional` : 'Rate only'}</td></tr>) } }),
      ] },
    ...(docs.length ? [{ key: 'docs', title: 'Documents', blocks: [
      { id: 't', el: h3('Documents') },
      { id: 'i', el: <div style={{ fontSize: 12.5, color: '#555', marginBottom: 8 }}>The following documents accompany and form part of this quotation:</div> },
      // clickable on screen for the team; plain names when printed - a customer
      // cannot open a portal link (it needs a portal sign-in)
      ...docs.map((d, i) => ({ id: `d${d.id || i}`, el: <div style={{ display: 'flex', gap: 8, fontSize: 12.5, lineHeight: 1.7, paddingLeft: 4 }}><span style={{ minWidth: 22, color: '#555' }}>{i + 1}.</span>
        {d.href ? <><a className="q-screen" href={d.href} target="_blank" rel="noreferrer" style={{ color: '#0f766e' }}>{d.name}</a><span className="q-print">{d.name}</span></> : <span>{d.name}</span>}</div> })),
    ] }] : []),
    ...(terms ? [{ key: 'terms', title: 'Terms & Conditions', blocks: [
      { id: 't', el: h3('Terms & Conditions', <span style={{ fontWeight: 400, fontSize: 11.5, color: '#888' }}> version {terms.v}</span>) },
      ...String(terms.text || '').split('\n').map((l, i) => ({ id: `t${i}`, el: termsLine(l) })),
    ] }] : []),
  ]
  // MEASURE every piece at the page's content width, then lay out the pages
  const measureRef = useRef(null)
  const [heights, setHeights] = useState(null)
  useLayoutEffect(() => {
    const el = measureRef.current; if (!el) return
    const h = {}; for (const c of el.children) h[c.dataset.mk] = c.getBoundingClientRect().height
    if (JSON.stringify(h) !== JSON.stringify(heights)) setHeights(h)
  })
  const sheets = []
  if (heights) {
    const compactH = heights.__compact || 60
    for (const sec of sections) {
      let page = null, used = 0, cont = false
      const start = () => { page = { sec, cont, blocks: [], oversize: false }; sheets.push(page); used = sec.full && !cont ? 0 : compactH + 4; cont = true; page.tables = new Set() }
      start()
      for (const b of sec.blocks) {
        const bh = heights[`${sec.key}:${b.id}`] || 0
        const head = b.table && sec.heads && sec.heads[b.table]
        const hh = head && !page.tables.has(b.table) ? (heights[`${sec.key}:head:${b.table}`] || 0) : 0
        if (used + hh + bh > CONTENT_H && page.blocks.length) { start() }
        if (b.table && head && !page.tables.has(b.table)) { page.blocks.push({ ...head, id: `head-${b.table}`, isHead: true }); page.tables.add(b.table); used += heights[`${sec.key}:head:${b.table}`] || 0 }
        page.blocks.push(b); used += bh
        if (used > CONTENT_H) page.oversize = true
      }
    }
  }
  return (
    <div>
      <style>{`.q-print { display: none; }
@media print { @page { size: A4; margin: 0; } body * { visibility: hidden !important; } .quote-doc, .quote-doc * { visibility: visible !important; } .quote-doc { position: absolute; left: 0; top: 0; width: 210mm; }
  .quote-sheet { width: 210mm !important; height: 297mm !important; box-shadow: none !important; border: none !important; border-radius: 0 !important; margin: 0 !important; overflow: hidden !important; page-break-after: always; break-after: page; }
  .quote-sheet.q-last { page-break-after: auto; break-after: auto; } .quote-label, .no-print, .q-screen { display: none !important; } .q-print { display: inline !important; } }`}</style>
      {revBar && <div className="no-print" style={{ marginBottom: 10 }}>{revBar}</div>}
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {actions}
        {/* NO TERMS YET (1175) - on screen only */}
        {!terms && <span style={{ fontSize: 12.5, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '4px 10px' }}>⚠ No Terms &amp; Conditions yet - add them in <a href="/admin/quote-documents" style={{ color: '#b45309', fontWeight: 600 }}>Admin &gt; Quote Documents</a></span>}
        <button onClick={() => window.print()} style={small}>{draft ? 'Print draft' : 'Print'}</button>
        <span style={{ fontSize: 12, color: '#888' }}>Choose "Save as PDF" in the print window. {sheets.length ? `${sheets.length} A4 pages, as they print.` : ''}</span>
      </div>
      {/* the measuring room - off screen, at the page's content width */}
      <div ref={measureRef} aria-hidden="true" style={{ position: 'absolute', left: -20000, top: 0, width: CONTENT_W, visibility: 'hidden', color: '#1a1a19' }}>
        <div data-mk="__compact" style={{ display: 'flow-root' }}><QuoteLetterhead companyName={companyName} compact refText={`Ref ${est.quoteRef || '-'} · Rev ${est.revision}`} title="Rates (continued)" /></div>
        {sections.flatMap(sec => [
          ...sec.blocks.map(b => <div key={`${sec.key}:${b.id}`} data-mk={`${sec.key}:${b.id}`} style={{ display: 'flow-root' }}>{b.el}</div>),
          ...Object.entries(sec.heads || {}).map(([k, h]) => <div key={`${sec.key}:head:${k}`} data-mk={`${sec.key}:head:${k}`} style={{ display: 'flow-root' }}>{h.el}</div>),
        ])}
      </div>
      <div className="quote-doc" style={{ color: '#1a1a19' }}>
        {sheets.map((pg, i) => (
          <div key={i}>
            <div className="quote-label no-print" style={{ width: PAGE_W, margin: '18px auto 6px', fontSize: 11.5, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6 }}>Page {i + 1} of {sheets.length} · {pg.sec.title}{pg.cont && !(pg.sec.full && pg === sheets.find(x => x.sec === pg.sec)) && sheets.find(x => x.sec === pg.sec) !== pg ? ' (continued)' : ''}</div>
            <div className={`quote-sheet${i === sheets.length - 1 ? ' q-last' : ''}`} style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 3, padding: `${PAD_Y}px ${PAD_X}px`, width: PAGE_W, height: pg.oversize ? 'auto' : PAGE_H, minHeight: PAGE_H, boxSizing: 'border-box', margin: '0 auto', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              {!(pg.sec.full && sheets.find(x => x.sec === pg.sec) === pg) && <div style={{ marginBottom: 4 }}><QuoteLetterhead companyName={companyName} compact refText={`Ref ${est.quoteRef || '-'} · Rev ${est.revision}`} title={`${pg.sec.title}${sheets.find(x => x.sec === pg.sec) !== pg ? ' (continued)' : ''}`} /></div>}
              {pg.blocks.map(b => <div key={b.id} style={{ display: 'flow-root' }}>{b.el}</div>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// The separator between stacked descriptions (1147) drawn as a THICK CHARCOAL
// RULE (1155) rather than a row of dashes.
const ruled = (text, key = '') => String(text ?? '').split(/\n?————————\n?/).flatMap((t, i) => i ? [<span key={`${key}r${i}`} style={{ display: 'block', borderTop: '3px solid #36454f', margin: '6px 0' }} />, t] : [t])

// THE QUOTE'S LETTERHEAD (1166) - the logo, large, and the company's address and
// contact details from Admin > Company details. The name is written only when
// there is no logo.
function QuoteLetterhead({ companyName, compact, draft, refText, title }) {
  // (1166, 1173) the logo on the left; OUR DETAILS TOP RIGHT - name, address,
  // contact, VAT and company registration numbers (Admin > Company details).
  const { logoUrl, company } = useFormat()
  const c = company || {}
  const logo = (h, w) => logoUrl ? <img src={logoUrl} alt={companyName || ''} style={{ height: h, maxWidth: w, width: 'auto', objectFit: 'contain', display: 'block' }} /> : null
  if (compact) return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1a1a19', paddingBottom: 8, marginBottom: 14 }}>
      {logo(38, 160) || <div style={{ fontSize: 13, fontWeight: 800 }}>{companyName}</div>}
      <div style={{ textAlign: 'right', fontSize: 11.5, color: '#444', lineHeight: 1.5 }}><div style={{ fontWeight: 700, fontSize: 12.5 }}>{refText}</div><div>{title}</div></div>
    </div>
  )
  const contact = [c.phone, c.email, c.website].filter(Boolean)
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 26 }}>
      <div>{logo(100, 300)}</div>
      <div style={{ textAlign: 'right', fontSize: 11.5, color: '#444', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a19' }}>{companyName}</div>
        {c.address}
        {contact.map(x => <div key={x}>{x}</div>)}
        {c.vatNumber && <div>VAT no. {c.vatNumber}</div>}
        {c.companyNumber && <div>Company reg. no. {c.companyNumber}</div>}
        {draft && <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: '#b45309', letterSpacing: 1 }}>DRAFT - not yet sent</div>}
      </div>
    </div>
  )
}

// [red]...[/red] drawn red (1171)
export const redNodes = (text) => String(text || '').split(/(\[red\][\s\S]*?\[\/red\])/).map((part, i) => { const m = part.match(/^\[red\]([\s\S]*?)\[\/red\]$/); return m ? <span key={i} style={{ color: '#dc2626' }}>{m[1]}</span> : <span key={i}>{part}</span> })

// TERMS & CONDITIONS FORMATTING (1175) - from the text as pasted, no codes needed:
//   HEADINGS (bold)   a line in CAPITALS; a short numbered line with no full stop
//                     at the end ("1. Definitions"); a line starting "#"
//   CLAUSES           "1.1", "2.3.1", "(a)", "(i)", "a)" - the number in its own
//                     column, the text beside it; deeper ones indented further
export function termsLine(raw) {
  const l = String(raw || '')
  const t = l.trim()
  if (!t) return <div style={{ height: 8 }} />
  const base = { fontSize: 11.5, lineHeight: 1.5, color: '#333' }
  if (/^#+\s*/.test(t)) return <div style={{ ...base, fontWeight: 700, fontSize: 12.5, color: '#1a1a19', marginTop: 8 }}>{t.replace(/^#+\s*/, '')}</div>
  const letters = t.replace(/[^A-Za-z]/g, '')
  if (letters.length >= 3 && letters === letters.toUpperCase() && t.length <= 90) return <div style={{ ...base, fontWeight: 700, fontSize: 12, color: '#1a1a19', marginTop: 8 }}>{t}</div>
  const m = t.match(/^(\d+(?:\.\d+)*\.?|\(?[a-z]{1,3}\)|\([ivxlc]+\))\s+(.*)$/i)
  if (m) {
    const num = m[1], text = m[2]
    const top = /^\d+\.?$/.test(num)
    if (top && text.length <= 70 && !/[.;:]$/.test(text)) return <div style={{ ...base, fontWeight: 700, fontSize: 12, color: '#1a1a19', marginTop: 8, display: 'flex', gap: 8 }}><span style={{ minWidth: 34 }}>{num}</span><span>{text}</span></div>
    const depth = /^\d/.test(num) ? Math.max(0, num.replace(/\.$/, '').split('.').length - 1) : 2
    return <div style={{ ...base, display: 'flex', gap: 8, paddingLeft: depth * 18 }}><span style={{ minWidth: 34, flexShrink: 0 }}>{num}</span><span>{text}</span></div>
  }
  return <div style={{ ...base, whiteSpace: 'pre-wrap' }}>{l}</div>
}
