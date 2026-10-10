// PAYLESS NOTICES = CREDIT NOTES (1041) - one rule, used by the Commercial
// Scorecard (/api/commercial-metrics) and the Business Scorecard.
//
//   Which credit notes: those on LIVE projects - status INPROGRESS on the
//     dashboard cache, minus the shared hidden list - as the Commercial
//     Scorecard has always counted them.
//   Which month: the date on the credit note.
//   The count: one per credit note, unless a month has been ADJUSTED by hand on
//     the Commercial Scorecard (e.g. 7 raw, 4 because 3 were minor) - then the
//     adjusted figure.

export const monthKey = (s) => s ? String(s).substring(0, 7) : null

// Every invoice line on the live, unhidden projects, tagged with its project.
export async function liveInvoiceLines(get) {
  const cached = await get('dashboard:cache')
  const hiddenIds = (await Promise.resolve(get('config:hidden-projects')).catch(() => null)) || []
  const hiddenSet = new Set(hiddenIds.map(String))
  const projects = (cached || []).filter(p => p.status === 'INPROGRESS' && !hiddenSet.has(String(p.xeroId)))
  const out = []
  for (const p of projects) {
    try {
      const lines = await get(`invoiced:lines:${p.xeroId}`)
      if (lines) for (const inv of lines) out.push({ ...inv, projectName: p.name, jobNo: p.jobNo })
    } catch {}
  }
  return { projects, lines: out }
}

// -> { details, byMonth, countByMonth: { 'YYYY-MM': { raw, adjusted, isAdjusted } }, undated }
export function paylessFromLines(allInvoiceLines, manual) {
  const details = (allInvoiceLines || [])
    .filter(l => l.creditNote)
    .map(l => ({
      projectName: l.projectName || '',
      jobNo: l.jobNo || '',
      creditNoteNumber: l.invoiceNumber || '',
      appliedToInvoice: l.appliedToInvoice || l.reference || '',
      date: l.date || '',
      amount: Math.abs(l.sales200 != null ? l.sales200 : (l.subTotal || l.total || 0)),
      contact: l.contact || '',
    }))
  const byMonth = {}
  let undated = 0
  for (const cn of details) {
    const mk = monthKey(cn.date)
    if (!mk) { undated++; continue }
    ;(byMonth[mk] ||= []).push(cn)
  }
  const adj = manual || {}
  const countByMonth = {}
  for (const mk of Object.keys(byMonth)) {
    const raw = byMonth[mk].length
    const a = adj[mk]
    const isAdjusted = a != null && a !== ''
    countByMonth[mk] = { raw, adjusted: isAdjusted ? Number(a) : raw, isAdjusted }
  }
  return { details, byMonth, countByMonth, undated }
}
