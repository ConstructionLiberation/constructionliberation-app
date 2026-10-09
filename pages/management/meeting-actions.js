import ManagementShell, { Heading, usePeople } from '../../components/ManagementShell'
import MgmtRowsTable from '../../components/MgmtRowsTable'
import { MONTHS, COMPLETED } from '../../lib/mgmtDocs'

// Business strategy meeting actions - the workbook's columns, plus the YEAR
// of the meeting: a month on its own stops meaning anything after twelve of
// them.
export default function MeetingActions() {
  const people = usePeople()
  const columns = [
    { key: 'meetingMonth', label: 'Meeting Month', type: 'select', options: MONTHS, width: 120 },
    { key: 'meetingYear', label: 'Year', type: 'year', width: 70 },
    { key: 'problem', label: 'Problem / Issue', type: 'textarea', width: 220 },
    { key: 'rootCause', label: 'Root Cause', type: 'textarea', width: 200 },
    { key: 'action', label: 'Corrective Action', type: 'textarea', width: 240 },
    { key: 'leader', label: 'Portal User Responsible', type: 'user', width: 180 },
    { key: 'deadline', label: 'Deadline', type: 'date', width: 140 },
    { key: 'completed', label: 'Completed', type: 'select', options: COMPLETED, width: 90 },
    { key: 'update1', label: 'Update Month 1', type: 'textarea', width: 200 },
    { key: 'update2', label: 'Update Month 2', type: 'textarea', width: 200 },
    { key: 'update3', label: 'Update Month 3', type: 'textarea', width: 200 },
  ]
  const today = new Date().toISOString().slice(0, 10)
  return (
    <ManagementShell active="actions" title="Meeting Actions" wide>
      <Heading title="Meeting Actions" sub="Actions from the business strategy meeting. Overdue and open actions are shaded red." />
      <MgmtRowsTable doc="meeting-actions" columns={columns} people={people}
        doneField="completed" doneValues={['Yes', 'N/A']}
        newRowDefaults={{ meetingMonth: MONTHS[new Date().getMonth()], meetingYear: String(new Date().getFullYear()), completed: 'No' }}
        rowColour={r => (r.completed !== 'Yes' && r.completed !== 'N/A' && r.deadline && r.deadline < today) ? '#fef2f2' : undefined} />
    </ManagementShell>
  )
}
