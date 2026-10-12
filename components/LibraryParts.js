import { useState } from 'react'
import * as XLSX from 'xlsx'

// SHARED SCREEN PARTS for the estimating libraries (1086) - the price list and
// labour rates pages use the same upload check, section list, CSV download and
// styles, from ONE place.

// CSV: a byte-order mark makes Excel read it as UTF-8 (the pound sign and m2 survive).
export function saveCsv(rows, name) {
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows), { forceQuotes: false })
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// Read a chosen file as rows. A CSV is read as TEXT so codes keep leading zeros.
export async function readRows(file, sheetName) {
  const isCsv = /\.csv$/i.test(file.name)
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: 'string', raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const sheet = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })
}

export function CheckPanel({ s, fileName, busy, m4, onImport, onCancel, noun = 'products' }) {
  const [showWarn, setShowWarn] = useState(false)
  const warnKinds = {}
  for (const w of s.warnings) { const k = w.msg.replace(/'.*$/, '').replace(/ - .*$/, ''); warnKinds[k] = (warnKinds[k] || 0) + 1 }
  const blocked = s.errors.length > 0
  return (
    <div style={{ background: '#fff', border: `2px solid ${blocked ? '#f5c2c2' : '#99f6e4'}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{blocked ? 'This file cannot be imported yet' : 'Ready to import'} <span style={{ fontWeight: 400, color: '#888', fontSize: 13 }}>· {fileName}</span></div>
          <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
            {s.products.toLocaleString()} {noun} in {s.sections} sections · <strong>{s.added}</strong> new · <strong>{s.changed}</strong> changed · <strong style={{ color: s.removed ? '#b42318' : undefined }}>{s.removed}</strong> removed
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={btn}>Cancel</button>
          <button onClick={onImport} disabled={blocked || busy} style={{ ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', opacity: blocked || busy ? 0.45 : 1 }}>Import</button>
        </div>
      </div>
      {blocked && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#b42318', marginBottom: 4 }}>{s.errors.length} error{s.errors.length === 1 ? '' : 's'} - fix these in the file and upload it again:</div>
          <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 12.5 }}>
            {s.errors.slice(0, 200).map((e, i) => <div key={i} style={{ padding: '2px 0' }}>Row {e.row}{e.ref ? ` (${e.ref})` : ''}: {e.msg}</div>)}
          </div>
        </div>
      )}
      {s.warnings.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: '#92400e' }}>
          {s.warnings.length} warning{s.warnings.length === 1 ? '' : 's'} (these import, and show under Needs attention): {Object.entries(warnKinds).map(([k, n]) => `${n} × ${k.toLowerCase()}`).join(' · ')}
          {' '}<button onClick={() => setShowWarn(v => !v)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12.5, padding: 0 }}>{showWarn ? 'Hide' : 'Show'}</button>
          {showWarn && <div style={{ maxHeight: 180, overflow: 'auto', marginTop: 4, color: '#555' }}>{s.warnings.slice(0, 400).map((w, i) => <div key={i}>Row {w.row}{w.ref ? ` (${w.ref})` : ''}: {w.msg}</div>)}</div>}
        </div>
      )}
      {s.removed > 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: '#b42318' }}>Removed - in the current list but not in this file: {s.removedRefs.join(' · ')}{s.removed > s.removedRefs.length ? ` … and ${s.removed - s.removedRefs.length} more` : ''}</div>}
      {s.priceChanged.length > 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: '#555' }}>Rates changing: {s.priceChanged.slice(0, 12).map(c => `${c.ref} ${c.from != null ? m4(c.from) : '—'} → ${c.to != null ? m4(c.to) : '—'}`).join(' · ')}{s.priceChanged.length > 12 ? ` … and ${s.priceChanged.length - 12} more` : ''}</div>}
    </div>
  )
}


export const F = ({ label, span = 1, children }) => <label style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#666' }}>{label}{children}</label>
export const SecBtn = ({ on, onClick, label, n, warn }) => (
  <button onClick={onClick} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%', textAlign: 'left', border: 'none', borderRadius: 7, padding: '7px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, background: on ? '#1a1a19' : 'transparent', color: on ? '#fff' : warn && n ? '#92400e' : '#333' }}>
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span><span style={{ opacity: 0.6 }}>{n}</span>
  </button>
)
export const th = { padding: '9px 10px', fontSize: 11.5, fontWeight: 600, color: '#666', background: '#faf9f7', borderBottom: '1px solid #ecebe6', position: 'sticky', top: 0, whiteSpace: 'nowrap' }
export const td = { padding: '7px 10px', borderBottom: '1px solid #f4f3f0', verticalAlign: 'top' }
export const tdR = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }
export const inp = { width: '100%', boxSizing: 'border-box', fontSize: 13.5, padding: '8px 9px', border: '1px solid #d4d4d0', borderRadius: 7, fontFamily: 'inherit' }
export const btn = { fontSize: 13, padding: '8px 14px', border: '1px solid #d4d4d0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', display: 'inline-block' }
