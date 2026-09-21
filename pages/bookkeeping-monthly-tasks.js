import TaskGrid from '../components/TaskGrid'
import BookkeepingNav from '../components/BookkeepingNav'
// Default list only - a customer's edited version wins. See lib/taskDefaults.js.
import { BK_MONTHLY as MONTHLY } from '../lib/taskDefaults'


export default function BookkeepingMonthlyTasks() {
  return <TaskGrid cadence="monthly" tasks={MONTHLY} scope="bookkeeping" apiPath="/api/bookkeeping-tasks"
    startDate={new Date(2026, 7, 15)}
    title="Monthly Bookkeeping Tasks"
    subtitle="All monthly bookkeeping tasks to be completed no later than the 15th of each month."
    nav={<BookkeepingNav active="/bookkeeping-monthly-tasks" />} />
}
