// /management opens straight on Vision, Mission & Values (1027). The landing
// page of links duplicated the nav bar above it.
//
// A server-side redirect, so there is no flash of an empty page. Who may see
// the destination is decided there - ManagementShell on the screen,
// requireArea on every /api/management route.
export async function getServerSideProps() {
  return { redirect: { destination: "/management/vmv", permanent: false } }
}

export default function ManagementHome() { return null }
