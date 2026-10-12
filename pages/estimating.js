// /estimating opens on the Price List (1083) - for now its only page. A
// server-side redirect, so no flash of an empty page. Who may see it is decided
// there: EstimatingShell on the screen, requireArea('estimating') on the API.
export async function getServerSideProps() {
  return { redirect: { destination: '/estimating/price-list', permanent: false } }
}

export default function EstimatingHome() { return null }
