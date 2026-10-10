import PlanOrgChart from '../../components/PlanOrgChart'

// 3-YEAR ORG CHART (1058) - the longer-term structure. Same page as the 1-Year
// chart (components/PlanOrgChart.js), its own stored plan, and it can start
// from a copy of the 1-Year chart as well as the current one.
export default function OrgChartThreeYear() {
  return <PlanOrgChart active="org-3y" label="3-Year" doc="org-future-3y" slug="3-year"
    copyPlan={{ doc: 'org-future', label: '1-Year' }} />
}
