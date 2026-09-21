import { useState, useEffect } from 'react'
import { useFormat } from '../../components/TenantProvider'
import Head from 'next/head'
import OperationsNav from '../../components/OperationsNav'

// Ops Project Financials = exact editable mirror of the Commercial EOM view.
// Rendered full-bleed (Ops nav, then the embed edge-to-edge beneath it) so it
// reads as one continuous native page rather than an inserted card.
export default function OpsProjectFinancials() {
  const { companyName: brand } = useFormat()
  const [height, setHeight] = useState('calc(100vh - 52px)')
  useEffect(() => {
    const fit = () => setHeight('calc(100vh - 52px)')
    fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit)
  }, [])
  return (
    <>
      <Head><title>{brand ? `${brand} - Project Financials` : 'Project Financials'}</title></Head>
      <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif', minHeight: '100vh', background: '#fafaf9' }}>
        <OperationsNav active="financials" section="financials" />
        <iframe
          src="/commercial?mode=eom&embed=true"
          style={{ width: '100%', height, border: 'none', display: 'block', background: '#fafaf9' }}
          title="Project Financials"
        />
      </div>
    </>
  )
}
