import { requireArea } from '../../../lib/portalAuth'
import withTenant from '../../../lib/withTenant'
import { parseBuildupSheets, checkTemplate, templateKey, summarise, normalizeTemplate, needsNormalizing } from '../../../lib/buildups'
import { loadBuildups, replaceBuildups, upsertBuildup, removeBuildup, knownRefs } from '../../../lib/buildupsStore'
import { moveDocs, deleteAllDocs } from '../../../lib/documentsStore'
import { removeFile, privateReady } from '../../../lib/privateFiles'
import { get, set } from '../../../lib/db'
// CATEGORIES ADDED ON THEIR OWN (1116) - kept so an empty category shows until
// build-ups are put in it. Categories in use come from the build-ups themselves.
const CATS = 'buildups:categories'
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

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
    let { index, items } = await loadBuildups()
    // ONE-TIME CLEAN-UP of the library (1102): notes and the old comment lines
    // removed (and any older line forms tidied), so nothing shows as "changed"
    // just by being opened. Recorded in the library's history; runs once.
    if (items.some(needsNormalizing)) {
      const cleaned = items.map(normalizeTemplate)
      index = await replaceBuildups(cleaned, { by: 'Portal - comments cleared (1102)', source: index?.source || '' })
      items = cleaned
    }
    return res.status(200).json({ index, templates: items, categories: (await get(CATS)) || [] })
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

  // ADD (1114): a NEW template only - used from the take-off. It never takes an
  // originalRef, so it can never overwrite: a name already in use is refused.
  if (b.action === 'add') {
    const t = b.template || {}
    const tpl = { ...t, section: String(t.section || '').trim(), description: String(t.description || '').trim() }
    if (!tpl.description) return res.status(400).json({ error: 'Give the new template a name' })
    tpl.ref = templateKey(tpl.section, tpl.description)
    const { errors } = checkTemplate(tpl, await knownRefs())
    if (errors.length) return res.status(400).json({ error: errors.join('; ') })
    const r = await upsertBuildup(tpl, { by, originalRef: null })
    if (r.errors) {
      const clash = /already used/.test(r.errors[0])
      return res.status(400).json({ error: clash ? `A template called "${tpl.description}" already exists in ${tpl.section || 'no category'} - templates are never changed from the take-off; give this one a new name` : r.errors[0] })
    }
    return res.status(200).json({ ok: true, template: r.item, index: r.index })
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
    // Renamed: its documents move with it (1093).
    if (b.originalRef && b.originalRef !== r.item.ref) await moveDocs('buildup', b.originalRef, r.item.ref)
    return res.status(200).json({ ok: true, template: r.item, index: r.index })
  }
  if (b.action === 'delete') {
    const r = await removeBuildup(b.ref, { by })
    if (r.errors) return res.status(404).json({ error: r.errors[0] })
    if (privateReady()) await deleteAllDocs('buildup', String(b.ref), removeFile)
    return res.status(200).json({ ok: true, index: r.index })
  }
  // ADD A CATEGORY (1116) - on its own, before any build-up is in it.
  if (b.action === 'add-category') {
    const name = String(b.name || '').trim().slice(0, 120)
    if (!name) return res.status(400).json({ error: 'Give the category a name' })
    const { items } = await loadBuildups()
    const extra = (await get(CATS)) || []
    if (items.some(t => sameName(t.section, name)) || extra.some(c => sameName(c, name))) return res.status(400).json({ error: `There is already a category called "${name}"` })
    await set(CATS, [...extra, name])
    return res.status(200).json({ ok: true, categories: [...extra, name] })
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
    for (let i = 0; i < items.length; i++) if (items[i].ref !== next[i].ref) await moveDocs('buildup', items[i].ref, next[i].ref)
    // ...and the categories added on their own (1116)
    const extra = (await get(CATS)) || []
    if (extra.some(c => sameName(c, from))) await set(CATS, b.action === 'delete-category' ? extra.filter(c => !sameName(c, from)) : extra.map(c => sameName(c, from) ? to : c))
    return res.status(200).json({ ok: true, moved, index: idx })
  }
  return res.status(400).json({ error: "action must be 'check', 'import', 'add', 'save', 'delete', 'add-category', 'rename-category' or 'delete-category'" })
}

export default withTenant(handler)
