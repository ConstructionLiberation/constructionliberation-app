// LABOUR RATES SCHEDULE (1073) - pure, no imports, used by the page and the
// server so both agree on what the lines are.
//
// The schedule is the project's LABOUR work, ready to price for a subcontract
// installer:
//   - every ABOVE-THE-LINE contracted item (the contract; below-the-line items
//     are not in it until instructed as a variation), with its headings
//   - every INSTRUCTED variation:
//       built in the Variation Builder -> one line per builder item, labour
//                                         rate = the item's labour total / qty
//       otherwise                      -> one line, qty 1, its labour lump sum
// Struck lines are left out.
//
// Each line has a stable KEY, so a rate typed against it, and a subbie
// schedule it has been sent in, stay attached to it:
//   contracted item       cr:<item id>
//   variation (lump)      var:<variation no. or position>
//   variation builder item var:<variation no. or position>:<item position>

const n = (v) => { const x = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isNaN(x) ? 0 : x }
const isInstructed = (v) => !!v && (v.instructed === true || v.instructed === 'yes')

export function buildLabourLines(crItems, variations) {
  const lines = []
  for (const x of crItems || []) {
    if (!x || x.struck || x.section !== 'above') continue
    if (x.kind === 'heading') { lines.push({ key: `cr:${x.id}`, kind: 'heading', description: x.description || '', group: 'contract' }); continue }
    if (x.kind !== 'item') continue
    const qty = x.qty == null ? null : n(x.qty)
    const budgetRate = x.labRate == null || x.labRate === '' ? null : n(x.labRate)
    lines.push({
      key: `cr:${x.id}`, kind: 'item', group: 'contract',
      ref: x.code || '', description: x.description || '', qty, unit: x.unit || '',
      budgetRate, budgetTotal: budgetRate != null && qty != null ? round2(budgetRate * qty) : null,
    })
  }
  const inst = (variations || []).map((v, i) => ({ v, i })).filter(({ v }) => isInstructed(v))
  if (inst.length) lines.push({ key: 'var:heading', kind: 'heading', description: 'Instructed variations', group: 'variation' })
  for (const { v, i } of inst) {
    const vid = String(v.varNumber || `#${i + 1}`)
    const items = Array.isArray(v.builder?.items) ? v.builder.items : []
    if (items.length) {
      items.forEach((it, k) => {
        const qty = n(it.qty) || 1
        const labTotal = it.labourTotal != null ? n(it.labourTotal) : (it.labour || []).reduce((s, r) => s + n(r.qty) * n(r.rate), 0)
        const budgetRate = round2(labTotal / qty)
        lines.push({
          key: `var:${vid}:${k}`, kind: 'item', group: 'variation',
          ref: `${vid}.${k + 1}`, description: it.description || v.description || '', qty, unit: it.unit || '',
          budgetRate, budgetTotal: round2(budgetRate * qty),
        })
      })
    } else {
      const budgetRate = round2(n(v.labour))
      lines.push({
        key: `var:${vid}`, kind: 'item', group: 'variation',
        ref: vid, description: v.description || '', qty: 1, unit: 'item',
        budgetRate, budgetTotal: budgetRate,
      })
    }
  }
  return lines
}

export const round2 = (v) => Math.round(v * 100) / 100

// The subbie's total for a line: their rate x the quantity. A line with no
// quantity (a rate-only line) has no total.
export const subTotal = (rate, qty) => (rate == null || rate === '' || qty == null) ? null : round2(n(rate) * qty)

// Saving (+) or overspend (-) for a line against its labour budget. Only where
// both sides exist - a missing rate is not a saving.
export const saving = (budgetTotal, total) => (budgetTotal == null || total == null) ? null : round2(budgetTotal - total)

// keys -> name of the schedule each one has been sent in.
export function sentIn(packages) {
  const m = new Map()
  for (const p of packages || []) for (const l of p.lines || []) m.set(l.key, p.name)
  return m
}
