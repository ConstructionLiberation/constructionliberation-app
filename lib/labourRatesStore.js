import { getClient } from './db'
import { checkLabour, checkSettings } from './labourRates'
import { createLibraryStore } from './libraryStore'

// LABOUR RATES STORAGE (1086). Server only. The shared library store
// (labourrates:index, labourrates:v<version>:s<n>) plus the day rate setting:
//   labour:settings   { dayRate, hoursPerDay, updatedAt, updatedBy }
// Absent until the company sets it - never written on its own.
const store = createLibraryStore({ prefix: 'labourrates', check: checkLabour })
export const loadLabour = () => store.load()
export const replaceLabour = (items, meta) => store.replace(items, meta)
export const upsertLabour = (raw, meta) => store.upsert(raw, meta)
export const removeLabour = (ref, meta) => store.remove(ref, meta)

const SETTINGS = 'labour:settings'
export async function loadLabourSettings() { return (await (await getClient()).get(SETTINGS)) || null }
export async function saveLabourSettings(raw, { by }) {
  const { settings, errors } = checkSettings(raw)
  if (errors.length) return { errors }
  const s = { ...settings, updatedAt: new Date().toISOString(), updatedBy: by || '' }
  await (await getClient()).set(SETTINGS, s)
  return { settings: s }
}
