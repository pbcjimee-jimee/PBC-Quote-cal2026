import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ClaimEditor, progressClaimEditorKey } from '@/components/progress-invoices/claim-editor'
import { getProgressClaimEditor } from '@/lib/progress-invoices/claim-service'

export default async function ProgressClaimPage({ params }: { params: Promise<{ seriesId: string; claimId: string }> }) {
  const { seriesId, claimId } = await params
  const result = await getProgressClaimEditor({ claimId })
  if (!result.ok || !result.data || result.data.seriesId !== seriesId) notFound()
  return <main className="pbc-page">
    <nav className="pbc-crumb" aria-label="Breadcrumb"><Link href="/progress-invoices">Progress Invoices</Link><span>›</span><Link href={`/progress-invoices/${seriesId}`}>Series</Link><span>›</span><strong>{result.data.taxInvoiceNumber}</strong></nav>
    <ClaimEditor key={progressClaimEditorKey(result.data)} editor={result.data} />
  </main>
}
