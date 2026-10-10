import { useEffect } from 'react'

// THE DRILL-DOWN POP-OUT (1053) - what is behind one month of one metric.
//
// Styled as the pre-contract scorecard's pop-out: dark backdrop, title and a
// count, a table whose header stays put while it scrolls, Escape or x to close.
// A click on the backdrop does NOT close it - a stray click behind a table you
// are reading should not throw it away.
//
// columns: [{ label, cell: (row) => node, align, width }]
// rows:    the rows, already in display order
// footer:  optional line under the table (the total, worked from these rows,
//          so it can be checked against the point that was clicked)
export default function ScorecardDrillModal({ title, countLabel, columns, rows, footer, note, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const th = { padding: '8px 10px', fontWeight: 500, color: '#555', textAlign: 'left', fontSize: 12, borderBottom: '1px solid #e1e0d9', whiteSpace: 'nowrap', background: '#fff' }
  const td = { padding: '7px 10px', borderBottom: '0.5px solid #f0efec', fontSize: 12, verticalAlign: 'top' }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div role="dialog" aria-label={title} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 1100, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e1e0d9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
            <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{rows.length} {countLabel}{rows.length === 1 ? '' : 's'}</span>
            {note && <div style={{ fontSize: 12, color: '#a16207', marginTop: 4 }}>{note}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ fontSize: 18, border: 'none', background: 'none', cursor: 'pointer', color: '#888', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          {rows.length === 0 ? <div style={{ padding: 28, color: '#aaa', fontSize: 13, textAlign: 'center' }}>Nothing in this month.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>{columns.map((c, i) => <th key={i} style={{ ...th, textAlign: c.align || 'left', width: c.width }}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id || i} style={{ background: i % 2 === 0 ? '#fff' : '#fafaf9' }}>
                    {columns.map((c, j) => <td key={j} style={{ ...td, textAlign: c.align || 'left' }}>{c.cell(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {footer && <div style={{ padding: '10px 20px', borderTop: '1px solid #e1e0d9', fontSize: 12.5, color: '#333', background: '#fafaf9', borderRadius: '0 0 12px 12px' }}>{footer}</div>}
      </div>
    </div>
  )
}
