import { useState } from 'react'
import { personKey } from '../lib/scorecardPeople'

// Button + panel for hiding a person's scorecard tab. One component, used by
// the pre-contract and the operations scorecards, so both behave the same.
//
// people:   [{ key, label, sub }]   EVERY person, hidden or not
// hidden:   [key]                   already personKey()'d
// canEdit:  management/admin. Everyone else sees the count and the
//           "show hidden" switch, but no ticks.
// onToggle: (key, hide) => void     the page saves and reports errors
export default function HiddenPeoplePicker({ people, hidden, canEdit, showHidden, setShowHidden, onToggle }) {
  const [open, setOpen] = useState(false)
  const isHidden = (p) => hidden.includes(personKey(p.key))
  const count = people.filter(isHidden).length
  if (!people.length) return null

  return (
    <div style={{ position: 'relative', alignSelf: 'center' }}>
      <button onClick={() => setOpen(v => !v)} style={btn}>
        People{count ? ` (${count} hidden)` : ''}
      </button>
      {open && (
        <div style={panel}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 1.4 }}>
            {canEdit
              ? 'Untick someone who has left to hide their scorecard. Their work still counts in team totals, and they can be shown again at any time.'
              : 'Hidden scorecards are set by management.'}
          </div>
          {canEdit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
              {people.map(p => (
                <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1a1a19', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!isHidden(p)} onChange={() => onToggle(p.key, !isHidden(p))} style={{ cursor: 'pointer' }} />
                  <span>{p.label}</span>
                  {p.sub && <span style={{ fontSize: 11, color: '#aaa' }}>{p.sub}</span>}
                </label>
              ))}
            </div>
          )}
          {count > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#555', cursor: 'pointer', borderTop: '0.5px solid #e1e0d9', paddingTop: 10 }}>
              <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />
              Show hidden tabs on this page
            </label>
          )}
          <div style={{ textAlign: 'right', marginTop: 10 }}>
            <button onClick={() => setOpen(false)} style={btn}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

const btn = { background: '#fff', border: '0.5px solid #d0d0cc', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#555', cursor: 'pointer', fontFamily: 'inherit' }
const panel = { position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 30, background: '#fff', border: '1px solid #e1e0d9', borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.10)', padding: 14, minWidth: 280, maxHeight: 420, overflowY: 'auto' }
