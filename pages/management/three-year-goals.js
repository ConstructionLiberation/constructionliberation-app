import GoalTracker from '../../components/GoalTracker'
export default function ThreeYearGoals() {
  return <GoalTracker active="three-year" title="3-Year Goals" doc="three-year-goals" goalLabel="3-Year Goal"
    commentCols={[{ key: 'comments', label: 'Comments' }]} />
}
