import OperationsShell, { PageHeading, ComingSoon } from '../../../components/OperationsShell'
import { useFormat } from '../../../components/TenantProvider'

export default function RamsBuilderPage() {
  const { term } = useFormat()
  const rams = term('rams')
  return (
    <OperationsShell active="hs:rams-builder" section="hs" title={`${rams} Builder`}>
      <PageHeading title={`${rams} Builder`} sub={`Generate branded ${rams} from your library and task data, then edit before issuing.`} />
      <ComingSoon title={`${rams} Builder`} note={`Auto-generate ${rams} from your library of previous ${rams} and task data, then edit before issuing. We'll build this once your ${rams} library is uploaded.`} />
    </OperationsShell>
  )
}
