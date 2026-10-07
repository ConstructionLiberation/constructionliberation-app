// EXTRA SECTIONS ON THE PROJECT REPORT.
//
// The report has always had a fixed set of sections. This adds customer-owned
// ones underneath Works completed, defined once as a template and filled in
// on every report after that.
//
// ---------------------------------------------------------------------------
// A REPORT KEEPS THE TEMPLATE IT WAS WRITTEN WITH
// ---------------------------------------------------------------------------
// Saving a report stores `sections` ON THE REPORT, a copy of the template at
// that moment. The view and the PDF render from that copy, never from the
// live template.
//
// Without it, editing the template rewrites history: rename a heading and
// last March's report - already issued to a customer and possibly argued
// over - silently says something different from the PDF they hold. The same
// reason an application freezes its variations when it is sent.
//
// The cost is that a renamed heading does not propagate to old reports. That
// is the correct trade for a document that leaves the building.

export const SECTION_TYPES = ['text', 'list', 'photos']

// Nothing by default. The report as it stands today is the baseline, and a
// customer who never opens the template editor sees exactly what they see
// now - no empty headings appearing on a document they already rely on.
export const DEFAULT_TEMPLATE = { sections: [] }

// Keys are permanent; labels are not. A deal... a REPORT stores its answers
// keyed by `key`, so renaming "Delays" to "Delays and disruption" keeps every
// answer already written. Generated once, never derived from the label.
export function newSectionKey() {
  return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export function normaliseTemplate(raw) {
  const sections = Array.isArray(raw && raw.sections) ? raw.sections : []
  return {
    sections: sections
      .filter(s => s && s.key && String(s.label || '').trim())
      .map((s, i) => ({
        key: String(s.key),
        label: String(s.label).trim(),
        type: SECTION_TYPES.includes(s.type) ? s.type : 'text',
        required: !!s.required,
        order: Number.isFinite(Number(s.order)) ? Number(s.order) : i + 1,
      }))
      .sort((a, b) => a.order - b.order),
  }
}

// The sections a report should render: its own snapshot if it has one, the
// live template only for a report being created now.
export function sectionsFor(report, template) {
  const snap = report && Array.isArray(report.sections) ? report.sections : null
  if (snap) return normaliseTemplate({ sections: snap }).sections
  return normaliseTemplate(template).sections
}
