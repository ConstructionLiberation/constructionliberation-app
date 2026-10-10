import ManagementShell, { Heading, usePeople } from './ManagementShell'
import MgmtRowsTable from './MgmtRowsTable'
import { PROGRESS, MONTHS } from '../lib/mgmtDocs'

// Quarterly, 1-Year and 3-Year goals share one layout - the columns from the
// monthly reporting workbook. Only the goal label and the comment columns
// differ.
const PROGRESS_TINT = {
  'Complete': '#f0fdf4',
  'In Progress - On Track': '#f7fdf9',
  'In Progress - Not On Track': '#fef2f2',
  'On Hold': '#f5f5f4',
}

export default function GoalTracker({ active, title, doc, goalLabel, commentCols, withPriority = false }) {
  const people = usePeople()
  const columns = [
    { key: 'monthSet', label: 'Month Set', type: 'select', options: MONTHS, width: 120 },
    { key: 'yearSet', label: 'Year Set', type: 'year', width: 70 },
    { key: 'goal', label: goalLabel, type: 'textarea', width: 240 },
    { key: 'measure', label: 'Success Measure', type: 'textarea', width: 240 },
    { key: 'targetMonth', label: 'Target Month', type: 'select', options: MONTHS, width: 120 },
    { key: 'targetYear', label: 'Target Year', type: 'year', width: 70 },
    { key: 'leader', label: 'Portal User Responsible', type: 'user', allowAll: true, width: 180 },
    { key: 'progress', label: 'Progress', type: 'select', options: PROGRESS, width: 200 },
    ...commentCols.map(c => ({ ...c, type: 'textarea', width: 220 })),
  ]
  return (
    <ManagementShell active={active} title={title} wide>
      <Heading title={title} />
      <MgmtRowsTable doc={doc} columns={columns} people={people} priorityField={withPriority ? 'priority' : undefined}
        doneField="progress" doneValues={['Complete']}
        newRowDefaults={{ monthSet: MONTHS[new Date().getMonth()], yearSet: String(new Date().getFullYear()), progress: 'Not Started' }}
        rowColour={r => PROGRESS_TINT[r.progress]} />
    </ManagementShell>
  )
}
