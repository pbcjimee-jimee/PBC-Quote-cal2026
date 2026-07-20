import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ClaimDetail } from '@/components/progress-invoices/claim-detail'
import { ClaimEditor, progressClaimEditorKey } from '@/components/progress-invoices/claim-editor'
import { getProgressClaimEditor } from '@/lib/progress-invoices/claim-service'
import { getProgressInvoiceSeriesWorkspace } from '@/lib/progress-invoices/workspace-service'

export default async function ProgressClaimPage({ params }: { params: Promise<{ seriesId: string; claimId: string }> }) {
  const { seriesId, claimId } = await params
  const workspaceResult = await getProgressInvoiceSeriesWorkspace(seriesId)
  if (!workspaceResult.ok || !workspaceResult.data) notFound()
  const claim = workspaceResult.data.claims.find((item) => item.id === claimId)
  if (!claim) notFound()

  let body: React.ReactNode
  if (claim.status === 'draft') {
    const editorResult = await getProgressClaimEditor({ claimId })
    if (!editorResult.ok || !editorResult.data || editorResult.data.seriesId !== seriesId) notFound()
    body = <ClaimEditor key={progressClaimEditorKey(editorResult.data)} editor={editorResult.data} />
  } else {
    body = <ClaimDetail claim={claim} />
  }

  return <main className="pbc-page">
    <nav className="pbc-crumb" aria-label="Breadcrumb"><Link href="/progress-invoices">Progress Invoices</Link><span>›</span><Link href={`/progress-invoices/${seriesId}`}>Series</Link><span>›</span><strong>{claim.taxInvoiceNumber}</strong></nav>
    {body}
    <Link className="pbc-btn pbc-btn--secondary pbc-progress-detail-back" href={`/progress-invoices/${seriesId}`}>
      Back to Series
    </Link>
  </main>
}
