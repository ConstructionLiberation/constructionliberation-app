// THE VARIATION BUILDER'S DEFAULTS (1194) - shared by the builder and by variations
// priced on the Estimating take-off, so there is one list, not two.
export const BASE_CLARIFICATIONS = [
  'Attendances: craneage, 110V power, forklift, access, perimeter handrailing, skips, and safety netting by others.',
  'Included for 1 No. continuous visit.',
  'Programme periods to be agreed.',
  'Quantities subject to remeasurement.',
  'All works to be completed from scaffold or the roof. Rates available if working required from a MEWP.',
]
// The units the builder prices in, and the take-off's equivalents.
export const BUILDER_UNITS = ['m2', 'm', 'nr', 'item']
export const toBuilderUnit = (u) => BUILDER_UNITS.includes(u) ? u : (u === 'no' || u === 'each' || u === 'ea') ? 'nr' : 'item'
