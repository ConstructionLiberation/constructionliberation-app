// THE ESTIMATE'S LABOUR SCHEDULE (1167) - the take-off's labour, in the same
// shape as a project's (lib/labourSchedule.js buildLabourLines), so the same
// Labour Rates screen and subbie schedules work off an estimate:
//   headings   the take-off's sections, and "Below the line"
//   items      each item WITH labour - its quantity and unit, its description
//              (with the build-up's description, so a subbie sees what is
//              priced), and OUR labour rate per unit (before profit) and total
import { priceEstimate } from './estimate'
import { round2 } from './labourSchedule'
import { descriptionText, BU_UNIT_LABEL } from './buildups'

export function buildEstimateLabourLines(est, lib) {
  const { priced } = priceEstimate(est, lib)
  const out = []
  let past = false, n = 0
  for (const r of (est && est.rows) || []) {
    if (r.kind === 'line') { past = true; out.push({ key: 'est:below-the-line', kind: 'heading', description: 'Below the line (optional / rate only)', group: 'below' }); continue }
    if (r.kind === 'section') { out.push({ key: `est:${r.id}`, kind: 'heading', description: r.title || '', group: past ? 'below' : 'take-off' }); continue }
    if (r.kind !== 'item') continue
    const p = priced[r.id] || {}
    const budgetRate = p.labourRate == null ? null : round2(p.labourRate)
    if (!budgetRate) continue          // no labour on it - nothing to price for a subbie
    const qty = r.rateOnly ? null : (r.qty == null || r.qty === '' ? null : Number(r.qty))
    let spec = ''
    try { spec = r.buildup ? descriptionText(r.buildup, lib).replace(/\n?————————\n?/g, ' / ').replace(/\s+/g, ' ').trim() : '' } catch {}
    n++
    out.push({ key: `est:${r.id}`, kind: 'item', group: past ? 'below' : 'take-off', ref: String(n),
      description: spec ? `${r.description} - ${spec}` : (r.description || ''), qty, unit: BU_UNIT_LABEL[r.unit] || r.unit || '',
      budgetRate, budgetTotal: qty != null ? round2(budgetRate * qty) : null })
  }
  // headings with nothing under them are dropped
  return out.filter((l, i) => l.kind !== 'heading' || out.slice(i + 1).find(x => x.kind === 'item' || x.kind === 'heading')?.kind === 'item')
}
