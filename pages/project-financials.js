import Head from 'next/head'
import { useFormat } from '../components/TenantProvider'
import { useEffect, useState } from 'react'
import PreContractNav from '../components/PreContractNav'

export default function ProjectFinancials() {
  const { companyName: brand } = useFormat()
  const [height, setHeight] = useState('calc(100vh - 52px)')

  return (
    <>
      <Head><title>{brand ? `${brand} - Project Financials` : 'Project Financials'}</title></Head>
      <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif', minHeight: '100vh', background: '#fafaf9' }}>
        <PreContractNav active="financials" />

        {/* Iframe filling remaining height */}
        <iframe
          src="/commercial?mode=eom&embed=true"
          style={{
            width: '100%',
            height: height,
            border: 'none',
            display: 'block',
          }}
          title="Project Financials — EOM Report"
        />
      </div>
    </>
  )
}
