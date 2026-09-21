import TaskGrid from '../components/TaskGrid'
import BookkeepingNav from '../components/BookkeepingNav'
// Default list only - a customer's edited version wins. See lib/taskDefaults.js.
import { BK_WEEKLY as WEEKLY } from '../lib/taskDefaults'


export default function BookkeepingWeeklyTasks() {
  return <TaskGrid cadence="weekly" tasks={WEEKLY} scope="bookkeeping" apiPath="/api/bookkeeping-tasks"
    weekAnchor={4} startDate={new Date(2026, 6, 30)}
    title="Weekly Bookkeeping Tasks"
    subtitle="All weekly bookkeeping tasks to be completed by the end of play each Thursday."
    nav={<BookkeepingNav active="/bookkeeping-weekly-tasks" />} />
}
