import { useEffect, useState } from 'react'

// PRIVATE DOCUMENTS PANEL (1093) - one panel for: an estimate's Documents tab,
// one item on it (the pop-out - e.g. the green roof supplier's quote on the
// green roof rate), and a build-up template in the library.
//   ownerType 'estimate' | 'buildup';  ownerId;  itemId - show / attach to one item
//   items - the estimate's items, to name them and to attach on upload
// Files go straight from the browser to the PRIVATE store (any size up to 50 MB)
// and open through the portal, which checks who is asking first.
const API = '/api/estimating/documents'
const size = (n) => n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`

// PER REVISION (1169): with `revision`, this is the quote's documents for that
// revision - added and removed here; earlier revisions' listed read-only (never
// carried forward); ones from before revisions were tracked can be placed on it.
export default function DocumentsPanel({ ownerType, ownerId, itemId = null, items = null, title = 'Documents', readOnly = false, revision = null }) {
  const [state, setState] = useState(null)      // { documents, ready, folder, maxBytes }
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [attachTo, setAttachTo] = useState(itemId || '')
  const q = `ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`
  const load = async () => {
    try { const r = await fetch(`${API}?${q}`); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load the documents'); setState(d) } catch (e) { setErr(e.message) }
  }
  useEffect(() => { if (ownerId) load() }, [ownerType, ownerId])

  async function add(files) {
    setErr('')
    for (const file of files) {
      if (file.size > (state?.maxBytes || 0)) { setErr(`${file.name} is over ${size(state.maxBytes)}`); continue }
      setBusy(`Uploading ${file.name}…`)
      try {
        // The upload code (~230 KB) loads only when someone actually adds a document.
        const { upload } = await import('@vercel/blob-private/client')
        const blob = await upload(`${state.folder}${file.name}`, file, { access: 'private', handleUploadUrl: API, clientPayload: JSON.stringify({ ownerType, ownerId }) })
        const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', ownerType, ownerId, pathname: blob.pathname, name: file.name, ...(revision ? { revision } : {}), itemId: attachTo || null }) })
        const d = await r.json(); if (!r.ok) throw new Error(d.error)
      } catch (e) { setErr(`${file.name}: ${e.message}`) }
    }
    setBusy(''); await load()
  }
  async function remove(doc) {
    if (!window.confirm(`Delete "${doc.name}"? It is removed from storage.`)) return
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', ownerType, ownerId, docId: doc.id }) })
    const d = await r.json(); if (!r.ok) setErr(d.error); await load()
  }

  const all = state?.documents || []
  const docs = revision ? all.filter(d => !d.itemId && d.revision === revision) : all.filter(d => !itemId || d.itemId === itemId)
  const earlier = revision ? [...new Set(all.filter(d => !d.itemId && d.revision && d.revision !== revision).map(d => d.revision))].sort().reverse() : []
  const unplaced = revision ? all.filter(d => !d.itemId && !d.revision) : []
  async function place(doc) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-revision', ownerType, ownerId, docId: doc.id }) })
    const d = await r.json(); if (!r.ok) setErr(d.error); await load()
  }
  const link = (d) => <a href={`${API}?${q}&download=${d.id}`} target="_blank" rel="noreferrer" style={{ color: '#0f766e', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</a>
  const meta = (d) => <span style={{ fontSize: 11.5, color: '#999', whiteSpace: 'nowrap' }}>{size(d.size)} · {new Date(d.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {d.uploadedBy}</span>
  const itemName = (id) => (items || []).find(i => i.id === id)?.description
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>{title} <span style={{ fontWeight: 400, fontSize: 11.5, color: '#999' }}>private - opened through the portal only</span></strong>
        {state?.ready && !readOnly && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {items && !itemId && !revision && items.length > 0 && (
              <select value={attachTo} onChange={e => setAttachTo(e.target.value)} style={{ fontSize: 12.5, padding: '5px 6px', border: '1px solid #d4d4d0', borderRadius: 6 }}>
                <option value="">The whole estimate</option>
                {items.map(i => <option key={i.id} value={i.id}>Item: {i.description}</option>)}
              </select>
            )}
            <label style={{ fontSize: 12.5, padding: '6px 12px', border: '1px solid #0f766e', background: '#0f766e', color: '#fff', borderRadius: 7, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Uploading…' : '+ Add documents'}
              <input type="file" multiple disabled={!!busy} style={{ display: 'none' }} onChange={e => { add([...e.target.files]); e.target.value = '' }} />
            </label>
          </div>
        )}
      </div>
      {state && !state.ready && <div style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px' }}>Private file storage is not set up yet - an admin connects a private Blob store in Vercel.</div>}
      {busy && <div style={{ fontSize: 12.5, color: '#0f766e', marginBottom: 6 }}>{busy}</div>}
      {err && <div style={{ fontSize: 12.5, color: '#b42318', marginBottom: 6 }}>{err}</div>}
      {state?.ready && !docs.length && <div style={{ fontSize: 12.5, color: '#aaa' }}>No documents yet.</div>}
      {docs.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid #f4f3f0', fontSize: 13 }}>
          <a href={`${API}?${q}&download=${d.id}`} target="_blank" rel="noreferrer" style={{ color: '#0f766e', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</a>
          {!itemId && d.itemId && <span style={{ fontSize: 11.5, color: '#666', background: '#f4f4f2', borderRadius: 10, padding: '1px 8px' }}>{itemName(d.itemId) || 'an item'}</span>}
          <span style={{ fontSize: 11.5, color: '#999', whiteSpace: 'nowrap' }}>{size(d.size)} · {new Date(d.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {d.uploadedBy}</span>
          {!readOnly && <button onClick={() => remove(d)} style={{ border: 'none', background: 'none', color: '#b42318', cursor: 'pointer', fontSize: 12 }}>Delete</button>}
        </div>
      ))}
      {unplaced.length > 0 && !readOnly && (
        <div style={{ marginTop: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>Not yet on a revision <span style={{ fontWeight: 400 }}>- added before documents were kept per revision</span></div>
          {unplaced.map(d => <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 13 }}>{link(d)}{meta(d)}
            <button onClick={() => place(d)} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', cursor: 'pointer' }}>Add to Rev {revision}</button>
            <button onClick={() => remove(d)} style={{ border: 'none', background: 'none', color: '#b42318', cursor: 'pointer', fontSize: 12 }}>Delete</button></div>)}
        </div>
      )}
      {earlier.map(rv => (
        <details key={rv} style={{ marginTop: 10, fontSize: 13 }}>
          <summary style={{ cursor: 'pointer', color: '#555' }}>Rev {rv} - {all.filter(d => !d.itemId && d.revision === rv).length} document{all.filter(d => !d.itemId && d.revision === rv).length === 1 ? '' : 's'} <span style={{ fontSize: 11.5, color: '#999' }}>(issued - kept with Rev {rv}, not carried forward)</span></summary>
          {all.filter(d => !d.itemId && d.revision === rv).map(d => <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0 4px 14px', borderTop: '1px solid #f4f3f0' }}>{link(d)}{meta(d)}</div>)}
        </details>
      ))}
    </div>
  )
}
