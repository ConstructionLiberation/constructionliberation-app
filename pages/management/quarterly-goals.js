import GoalTracker from '../../components/GoalTracker'
export default function QuarterlyGoals() {
  return <GoalTracker active="quarterly" title="Quarterly Goals" doc="quarterly-goals" goalLabel="Quarterly Goal" withPriority
    commentCols={[{ key: 'comment1', label: 'Comments Month 1' }, { key: 'comment2', label: 'Comments Month 2' }, { key: 'comment3', label: 'Comments Month 3' }]} />
}
