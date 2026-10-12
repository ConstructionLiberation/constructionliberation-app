// /estimating opens on the Estimates list (1088) - where the work starts.
// A server-side redirect, so no flash of an empty page. Who may see it is
// decided there: EstimatingShell on the screen, requireArea('estimating') on the API.
export async function getServerSideProps() {
  return { redirect: { destination: '/estimating/estimates', permanent: false } }
}

export default function EstimatingHome() { return null }
