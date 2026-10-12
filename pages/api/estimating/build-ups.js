import { requireArea } from '../../../lib/portalAuth'
import withTenant from '../../../lib/withTenant'
import { parseBuildupSheets, checkTemplate, templateKey, summarise } from '../../../lib/buildups'
import { loadBuildups, replaceBuildups, upsertBuildup, removeBuildup, knownRefs } from '../../../lib/buildupsStore'

// RATE BUILD-UPS API (1087) - Estimating area.
// GET                                          -> { index, templates }
// POST check | import  { sheets: {lines, sizes, rules}, fileName }
// POST save            { template, originalRef }   (save / override, or save as new)
// POST delete          { ref }
// POST rename-category { from, to }  |  delete-category { name } (its build-ups become uncategorised)
// Every template is checked against THIS company's price list and labour rates.
export const config = { api: { bodyParser: { sizeLimit: '12mb' } } }

async function handler(req, res) {
  const session = requireArea(req, res, 'estimating')
  if (!session) return
  if (req.method === 'GET') {
    const { index, items } = await loadBuildups()
    return res.status(200).json({ index, templates: items })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}
  const by = session.name || session.email || ''

  if (b.action === 'check' || b.action === 'import') {
    const refs = await knownRefs()
    if (!refs.counts.products || !refs.counts.labour) {
      return res.status(400).json({ error: `Upload the ${!refs.counts.products ? 'price list' : 'labour rates'} first - every build-up line is checked against it.` })
    }
    const parsed = parseBuildupSheets(b.sheets || {}, refs)
    const { items: current } = await loadBuildups()
    const cur = new Map(current.map(t => [t.ref, t])), inc = new Map(parsed.templates.map(t => [t.ref, t]))
    const summary = {
      products: parsed.templates.length, sections: Object.keys(summarise(parsed.templates)).length,
      errors: parsed.errors.map(e => ({ row: e.row, ref: e.sheet, msg: e.msg })),
      warnings: parsed.warnings.map(e => ({ row: e.row, ref: e.sheet, msg: e.msg })),
      added: [...inc.keys()].filter(k => !cur.has(k)).length,
      changed: [...inc.keys()].filter(k => cur.has(k) && JSON.stringify(cur.get(k)) !== JSON.stringify(inc.get(k))).length,
      removed: [...cur.keys()].filter(k => !inc.has(k)).length,
      removedRefs: [...cur.values()].filter(t => !inc.has(t.ref)).slice(0, 50).map(t => `${t.section || '(no category)'} / ${t.description}`),
      priceChanged: [],
    }
    if (b.action === 'check') return res.status(200).json({ summary })
    if (parsed.errors.length) return res.status(400).json({ error: `The file has ${parsed.errors.length} error(s) - nothing was imported.`, summary })
    const index = await replaceBuildups(parsed.templates, { by, source: String(b.fileName || '').slice(0, 200) })
    return res.status(200).json({ ok: true, index, summary })
  }

  if (b.action === 'save') {
    const t = b.template || {}
    const tpl = { ...t, section: String(t.section || '').trim(), description: String(t.description || '').trim() }
    tpl.ref = templateKey(tpl.section, tpl.description)
    const { errors } = checkTemplate(tpl, await knownRefs())
    if (errors.length) return res.status(400).json({ error: errors.join('; ') })
    const r = await upsertBuildup(tpl, { by, originalRef: b.originalRef || null })
    if (r.errors) {
      const clash = /already used/.test(r.errors[0])
      return res.status(400).json({ error: clash ? `A build-up called "${tpl.description}" already exists in ${tpl.section || 'no category'} - choose another name` : r.errors[0] })
    }
    return res.status(200).json({ ok: true, template: r.item, index: r.index })
  }
  if (b.action === 'delete') {
    const r = await removeBuildup(b.ref, { by })
    if (r.errors) return res.status(404).json({ error: r.errors[0] })
    return res.status(200).json({ ok: true, index: r.index })
  }
  if (b.action === 'rename-category' || b.action === 'delete-category') {
    const { items, index } = await loadBuildups()
    const from = String(b.from ?? b.name ?? '').trim(), to = b.action === 'delete-category' ? '' : String(b.to || '').trim()
    if (b.action === 'rename-category' && !to) return res.status(400).json({ error: 'Give the category a name' })
    let moved = 0
    const next = items.map(t => {
      if ((t.section || '') !== from) return t
      moved++
      return { ...t, section: to, ref: templateKey(to, t.description) }
    })
    const keys = new Set()
    for (const t of next) { if (keys.has(t.ref)) return res.status(400).json({ error: `"${t.description}" already exists in "${to || 'no category'}" - rename one first` }); keys.add(t.ref) }
    const idx = await replaceBuildups(next, { by, source: index?.source || '' })
    return res.status(200).json({ ok: true, moved, index: idx })
  }
  return res.status(400).json({ error: "action must be 'check', 'import', 'save', 'delete', 'rename-category' or 'delete-category'" })
}

export default withTenant(handler)
