import { useEffect } from 'react'
import { useRouter } from 'next/router'

// MOVED TO /design/customers.
//
// Design Customers was under /admin, which made it feel like an Admin screen and
// meant its back button had to guess whether to return to Admin or to Design. It
// belongs to the Design portal, so it lives there now.
//
// This stays as a redirect rather than being deleted: the address will be in
// bookmarks and in old emails, and a 404 for somebody who has used this page for
// months is a worse outcome than one extra file.
export default function MovedToDesign() {
  const router = useRouter()
  useEffect(() => { router.replace('/design/customers') }, [router])
  return null
}
