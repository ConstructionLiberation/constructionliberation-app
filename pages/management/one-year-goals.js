import GoalTracker from '../../components/GoalTracker'
export default function OneYearGoals() {
  return <GoalTracker active="one-year" title="1-Year Goals" doc="one-year-goals" goalLabel="1-Year Goal"
    commentCols={[{ key: 'comments', label: 'Comments' }]} />
}
