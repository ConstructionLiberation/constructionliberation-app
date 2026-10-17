import { useEffect } from 'react'
import { useRouter } from 'next/router'

// Bills to Check moved to Bookkeeping (1243) - this address forwards there.
export default function BillsMoved() {
  const router = useRouter()
  useEffect(() => { router.replace('/bookkeeping-bills') }, [])
  return <div style={{ padding: 40, fontFamily: 'Arial, sans-serif', color: '#666' }}>Bills to Check is now under Bookkeeping - taking you there...</div>
}
