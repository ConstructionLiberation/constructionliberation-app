// WHAT A PROJECT REPORT PULLS IN BY ITSELF.
//
// Variations, issues and photos are gathered from the project rather than
// typed. The rules are not obvious - an open issue reappears on every report
// until it closes and then shows once more; photos come from submissions
// since the last report, and issue photos only count if that issue was sent
// to the customer.
//
// This lives in one place because it is now used by TWO screens: the portal
// and the Site App. Two copies of a rule this fiddly would diverge inside a
// month, and the divergence would show up as a report that disagrees with
// itself depending on which device wrote it.

const fmtN = (n) => (n == null || n === '' ? 0 : parseFloat(n) || 0)
const parseLocal = (d) => {
  if (!d) return null
  const [y, m, day] = String(d).split('-').map(Number)
  return new Date(y, (m || 1) - 1, day || 1)
}

// An issue counts if it was actually sent to the customer - either by the
// send step or marked as sent by hand.
const sentToCustomer = (i) =>
  i.sendToCustomer !== 'nosend' && (i.sentToCustomer === true || i.sentManually === true)

/**
 * @param projectNo   job number of the project
 * @param projectName its name, used where submissions were tagged by name
 * @param allReports  every report, for the "since last report" window and the
 *                    closed-issue history
 * @param excludeId   the report being edited, so it does not count as prior
 * @returns { variationsSnapshot, issuesSnapshot, photos, lastReportDate,
 *            customerName, projectAddress }
 */
export async function autofillReport({ projectNo, projectName, allReports = [], excludeId = null }) {
  const no = projectNo
  const empty = { variationsSnapshot: [], issuesSnapshot: [], photos: [], lastReportDate: '', customerName: '', projectAddress: '' }
  if (!no) return empty

  // The window for photos: everything since this project's previous report.
  const prior = (allReports || [])
    .filter(r => r.projectNo === no && r.id !== excludeId && r.date)
    .sort((a, b) => parseLocal(b.date) - parseLocal(a.date))[0]
  const lastReportDate = (prior && prior.date) || ''

  const [dashR, issR, subR] = await Promise.all([
    fetch('/api/dashboard').then(r => r.json()).catch(() => ({})),
    fetch('/api/issues').then(r => r.json()).catch(() => ({})),
    fetch('/api/submissions').then(r => r.json()).catch(() => ({})),
  ])

  // Variations: all of them, instructed or not. The report shows the
  // not-instructed ones for information and does not total them.
  const proj = (dashR.projects || []).find(x =>
    x.jobNo === no || x.projectNo === no ||
    (projectName && (x.name === projectName || x.projectName === projectName)))
  const variationsSnapshot = (proj?.settings?.variations || proj?.variations || []).map(v => ({
    varNumber: v.varNumber || '\u2014',
    description: v.description || '',
    instructed: (v.instructed === 'yes' || v.instructed === true),
    total: fmtN(v.materials) + fmtN(v.labour) + fmtN(v.profit),
  }))

  // Issues: an OPEN issue appears on every report until it closes; when it
  // closes it appears once more, then never again. So exclude anything that
  // already appeared on an earlier report while it was closed.
  const closedInPriorReport = new Set()
  for (const rep of (allReports || [])) {
    if (rep.projectNo !== no || rep.id === excludeId) continue
    for (const s of (rep.issueHistory || [])) {
      if (s.id && s.status === 'Closed') closedInPriorReport.add(s.id)
    }
  }
  const issuesSnapshot = (issR.issues || [])
    .filter(i => i.projectNo === no && sentToCustomer(i) && !closedInPriorReport.has(i.id))
    .map(i => ({
      id: i.id,
      dateCreated: i.createdAt ? new Date(i.createdAt).toISOString().slice(0, 10) : '',
      issueName: i.issueName,
      issueTypes: [...(i.issueTypes || []), ...(i.issueOther ? ['Other'] : [])],
      requiredDate: i.requiredDate || '',
      status: i.resolvedDate ? 'Closed' : 'Open',
    }))

  // Photos from submissions in the window. An issue photo only counts if that
  // issue went to the customer; ordinary form photos always count.
  const sentIssueSubIds = new Set(
    (issR.issues || [])
      .filter(i => i.projectNo === no && sentToCustomer(i))
      .map(i => i.submissionId)
      .filter(Boolean))
  const cutoff = lastReportDate ? parseLocal(lastReportDate).getTime() : 0
  const inWindow = (subR.submissions || [])
    .filter(s => (s.projectId === no || s.projectName === projectName))
    .filter(s => (s.submittedAt || 0) >= cutoff)
  const fulls = await Promise.all(inWindow.map(s =>
    fetch(`/api/submissions?id=${s.id}`).then(r => r.json()).then(d => d.submission).catch(() => null)))

  const photos = []
  for (const sub of fulls.filter(Boolean)) {
    if (sub.isIssue && !sentIssueSubIds.has(sub.id)) continue
    for (const v of Object.values(sub.answers || {})) {
      if (Array.isArray(v)) {
        for (const u of v) if (typeof u === 'string' && /^https?:|^data:/.test(u)) photos.push(u)
      }
    }
  }

  // The customer and address come from the SAME dashboard row the variations
  // came from, rather than from whatever list the calling screen happened to
  // have. The portal's project list and the Site App's carry these under
  // different names (customer/address vs customer/location), and resolving it
  // here means neither screen has to know that.
  return {
    variationsSnapshot, issuesSnapshot, photos, lastReportDate,
    customerName: proj?.customer || proj?.customerName || '',
    projectAddress: proj?.location || proj?.projectAddress || proj?.address || '',
  }
}
