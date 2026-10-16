// The company's variation clarifications, on the server (1197).
import { get, set } from './db'
import { VAR_CLAR_KEY, cleanVarClar } from './variationDefaults'
export async function loadVariationClarifications() { return cleanVarClar(await get(VAR_CLAR_KEY).catch(() => null)) }
export async function saveVariationClarifications(list) { const clean = cleanVarClar(list); await set(VAR_CLAR_KEY, clean); return clean }
