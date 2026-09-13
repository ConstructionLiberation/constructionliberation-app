import { canAccessArea } from './roles'
// WHAT A CUSTOMER CAN BUY.
//
// The portal is already divided into AREAS - see lib/roles.js AREA_ACCESS,
// which answers "may this ROLE see this area". This file adds the question in
// front of it: "has this CUSTOMER bought this area at all".
//
// Two separate questions, deliberately. A customer who has not bought
// Bookkeeping should not see it whatever role someone has; a post-contract user
// at a customer who HAS bought it still should not see Business Financials.
// Collapsing the two would mean a customer's purchase could grant a role access
// it should not have.
//
// The module names match the area names in lib/roles.js exactly, so one check
// can ask both questions without a translation table between them. A
// translation table is a second copy of the same list, and second copies
// diverge.

export const MODULES = [
  { id: 'operations',          label: 'Operations',          core: true },
  { id: 'hr',                  label: 'HR',                  core: true },
  { id: 'lessons-learnt',      label: 'Lessons Learnt',      core: true },
  { id: 'pre-contract',        label: 'Pre-Contract / CRM' },
  { id: 'commercial',          label: 'Commercial' },
  { id: 'bookkeeping',         label: 'Bookkeeping' },
  { id: 'design',              label: 'Design' },
  { id: 'business-financials', label: 'Business Financials' },
  { id: 'management',          label: 'Management' },
]

// Modules every customer gets. Switching these off is not offered - the portal
// has no coherent shape without them.
export const CORE_MODULES = MODULES.filter(m => m.core).map(m => m.id)

// WHAT BREAKS WHAT.
//
// Turning off a module that another one reads does not produce an error. It
// produces a page that loads with nothing in it, or worse, with a figure
// computed from half its inputs. So the dependencies are declared and
// provisioning refuses an incoherent combination rather than creating it.
export const MODULE_REQUIRES = {
  // Reads what Bookkeeping produces - overheads, bank, VAT. Without it the
  // P&L and the cash flow are built from half their inputs and still render.
  'business-financials': ['bookkeeping'],
  // Applications, variations and retention are all against Operations projects.
  'commercial': ['operations'],
  // The design register hangs off projects.
  'design': ['operations'],
}

// Which modules need a Xero connection to mean anything. Not a dependency
// between modules - a setup step - but provisioning should say so, because a
// Commercial module with no Xero is a page of zeroes.
export const NEEDS_XERO = ['commercial', 'bookkeeping', 'business-financials']

export function moduleLabel(id) {
  const m = MODULES.find(x => x.id === id)
  return m ? m.label : id
}

// Returns [] when the selection is coherent, or a list of plain-English
// problems when it is not.
export function validateModules(selected) {
  const set = new Set([...CORE_MODULES, ...(selected || [])])
  const problems = []
  for (const [mod, needs] of Object.entries(MODULE_REQUIRES)) {
    if (!set.has(mod)) continue
    for (const need of needs) {
      if (!set.has(need)) {
        problems.push(`${moduleLabel(mod)} needs ${moduleLabel(need)}, which is switched off.`)
      }
    }
  }
  return problems
}

// Core modules are always included, whatever was passed in.
export function normaliseModules(selected) {
  const set = new Set([...CORE_MODULES, ...(selected || [])])
  return MODULES.map(m => m.id).filter(id => set.has(id))
}

export function hasModule(tenant, moduleId) {
  // No tenant resolved means single-tenant, where everything is on. That is the
  // state the app runs in today and until tenancy is switched on.
  if (!tenant) return true
  if (CORE_MODULES.includes(moduleId)) return true
  const mods = tenant.modules
  // A customer record with no module list gets everything, rather than nothing.
  // A new customer whose modules have not been set yet should look broken to
  // whoever is setting them up, not to their staff.
  if (!Array.isArray(mods)) return true
  return mods.includes(moduleId)
}

// THE COMBINED CHECK. Use this, not the two halves.
//
// An area is visible only when BOTH are true:
//   the customer has bought the module   (this file)
//   the role is allowed the area          (lib/roles.js)
//
// Exported from here rather than roles.js so there is exactly one function
// anyone calls. Two near-identical checks in two files is how one of them gets
// updated and the other does not.
export function canSeeArea(role, area, modules) {
  if (!canAccessArea(role, area)) return false
  // No module list means single tenant, or a customer whose modules have not
  // been set. Everything on - see hasModule above for why.
  if (!Array.isArray(modules)) return true
  if (CORE_MODULES.includes(area)) return true
  // Areas that are not sellable modules - 'admin' - are role-gated only.
  if (!MODULES.some(m => m.id === area)) return true
  return modules.includes(area)
}

// The module list for a tenant, or null when single tenant. null means
// "everything", and is what the portal sees today.
export function enabledModules(tenant) {
  if (!tenant) return null
  if (!Array.isArray(tenant.modules)) return null
  return normaliseModules(tenant.modules)
}
