// VARIATION SETTINGS (1194, 1197)
//
// The clarifications on a new variation are a COMPANY SETTING - Admin > Quote
// Documents > Variation clarifications - stored as variation:clarifications. A
// company that has not set any up gets none: nothing is written or offered for
// anyone automatically, so no company ever inherits another's wording.
export const VAR_CLAR_KEY = 'variation:clarifications'
export const cleanVarClar = (list) => (Array.isArray(list) ? list : []).map(x => String(x == null ? '' : x).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 60).map(x => x.slice(0, 600))
// The units the builder prices in, and the take-off's equivalents.
export const BUILDER_UNITS = ['m2', 'm', 'nr', 'item']
export const toBuilderUnit = (u) => BUILDER_UNITS.includes(u) ? u : (u === 'no' || u === 'each' || u === 'ea') ? 'nr' : 'item'
