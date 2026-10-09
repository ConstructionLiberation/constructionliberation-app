// THE MANAGEMENT PORTAL'S STORED DOCUMENTS (1026).
//
// One definition per document. The API reads this to decide what a save may
// contain, so a field that is not listed here cannot be written - a typo in a
// page fails loudly rather than storing a field nothing reads.
//
// Two kinds:
//   'doc'  - one record, saved whole (Vision/Mission/Values, SWOT). Saves carry
//            the updatedAt they started from; if someone else saved in between
//            the save is refused, not silently overwritten.
//   'rows' - a list (goals, meeting actions, outsourced services). Each save
//            is ONE row, merged on the server by id, so two people editing
//            different rows at once cannot undo each other.
//
// NOTHING IS SEEDED. Every document starts empty for every tenant.

export const PROGRESS = ['Not Started', 'In Progress', 'In Progress - On Track', 'In Progress - Not On Track', 'On Hold', 'Complete']
export const COMPLETED = ['Yes', 'No', 'N/A']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// leader + leaderId: the person responsible is a PORTAL USER (1027). The id is
// what identifies them; the name is kept beside it so the row still reads
// correctly after they leave and drop off the user list.
const GOAL_FIELDS = ['monthSet', 'yearSet', 'goal', 'measure', 'targetMonth', 'targetYear', 'leader', 'leaderId', 'progress']

export const DOCS = {
  'vmv': { kind: 'doc', key: 'mgmt:vmv', fields: { vision: 'text', mission: 'text', values: 'text' } },
  'swot': { kind: 'doc', key: 'mgmt:swot', fields: { strengths: 'list', weaknesses: 'list', opportunities: 'list', threats: 'list' } },
  'quarterly-goals': { kind: 'rows', key: 'mgmt:goals:quarterly', fields: [...GOAL_FIELDS, 'comment1', 'comment2', 'comment3'] },
  'one-year-goals': { kind: 'rows', key: 'mgmt:goals:1y', fields: [...GOAL_FIELDS, 'comments'] },
  'three-year-goals': { kind: 'rows', key: 'mgmt:goals:3y', fields: [...GOAL_FIELDS, 'comments'] },
  'meeting-actions': { kind: 'rows', key: 'mgmt:meeting-actions', // teamMember is no longer shown (1027) but stays accepted, so any value
  // already saved is not orphaned by a field the API now refuses.
  fields: ['meetingMonth', 'meetingYear', 'problem', 'rootCause', 'action', 'leader', 'leaderId', 'teamMember', 'deadline', 'completed', 'update1', 'update2', 'update3'] },
  'org-external': { kind: 'rows', key: 'mgmt:org:external', fields: ['service', 'provider', 'contactName', 'contactDetails', 'reportsTo', 'notes'] },
}

const MAX_TEXT = 10000
const MAX_LIST = 200

export const cleanText = (v) => String(v ?? '').slice(0, MAX_TEXT)
export const cleanList = (v) => (Array.isArray(v) ? v : []).map(x => cleanText(x).trim()).filter(Boolean).slice(0, MAX_LIST)

// Keep only the fields this document defines. Unknown fields are reported
// back so the caller can refuse, not quietly dropped.
export function cleanDocData(def, data) {
  const out = {}, unknown = []
  for (const k of Object.keys(data || {})) if (!(k in def.fields)) unknown.push(k)
  for (const [k, type] of Object.entries(def.fields)) out[k] = type === 'list' ? cleanList(data?.[k]) : cleanText(data?.[k])
  return { out, unknown }
}

export function cleanRowFields(def, fields) {
  const out = {}, unknown = []
  for (const k of Object.keys(fields || {})) {
    if (def.fields.includes(k)) out[k] = cleanText(fields[k])
    else unknown.push(k)
  }
  return { out, unknown }
}
