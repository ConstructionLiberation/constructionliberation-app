import { get } from '../../lib/db'
import { pdfLogoUrl } from '../../lib/pdfBrand'
import { buildProjectReportPDF, openIssuesFor } from '../../lib/projectReportPdf'
import withTenant from '../../lib/withTenant'

// GET /api/project-report-pdf?id=pr_... -> branded, date-stamped report PDF
async function handler(req, res) {
  const id = req.query.id
  if (!id) return res.status(400).json({ error: 'Missing report id' })
  try {
    const reports = (await get('ops:project-reports')) || []
    const report = reports.find(r => r.id === id)
    if (!report) return res.status(404).json({ error: 'Report not found' })
    const origin = `https://${req.headers.host}`
    // the issues it includes - one copy of the rule (lib/projectReportPdf, 1234)
    const openIssues = await openIssuesFor(report)
    const bytes = await buildProjectReportPDF({ report, logoUrl: pdfLogoUrl(req), openIssues })
    const fname = `Project Report ${report.reportId || ''} - ${(report.projectName || report.projectNo || 'report')}.pdf`.replace(/[^a-zA-Z0-9 .-]/g, '')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${fname}"`)
    return res.send(Buffer.from(bytes))
  } catch (e) {
    console.error('project-report-pdf error:', e)
    return res.status(500).json({ error: e.message || 'PDF generation failed' })
  }
}

export default withTenant(handler)
