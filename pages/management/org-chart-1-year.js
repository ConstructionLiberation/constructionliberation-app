import PlanOrgChart from '../../components/PlanOrgChart'

// 1-YEAR ORG CHART - the structure the business is planning for next year.
// The page itself is components/PlanOrgChart.js (shared with the 3-Year chart).
export default function OrgChartOneYear() {
  return <PlanOrgChart active="org-1y" label="1-Year" doc="org-future" slug="1-year" />
}
