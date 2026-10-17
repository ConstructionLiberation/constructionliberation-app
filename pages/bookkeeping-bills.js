import Head from 'next/head'
import BookkeepingNav from '../components/BookkeepingNav'
import BillsToCheck from '../components/BillsToCheck'
import { useFormat } from '../components/TenantProvider'

// BOOKKEEPING > BILLS TO CHECK (1243) - moved here from Purchasing; the page itself is
// components/BillsToCheck.js
export default function BookkeepingBills() {
  const { companyName } = useFormat()
  return (
    <>
      <Head><title>{companyName ? `${companyName} - Bills to Check` : 'Bills to Check'}</title></Head>
      <div style={{ minHeight: '100vh', background: '#f7f6f3' }}>
        <BookkeepingNav active="/bookkeeping-bills" />
        <div style={{ padding: '20px 24px', maxWidth: 1600, margin: '0 auto' }}><BillsToCheck /></div>
      </div>
    </>
  )
}
