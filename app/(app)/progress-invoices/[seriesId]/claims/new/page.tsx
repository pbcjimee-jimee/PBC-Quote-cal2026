import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ClaimEditor } from '@/components/progress-invoices/claim-editor'
import { progressClaimEditorKey } from '@/lib/progress-invoices/claim-editor-key'
import { getProgressClaimDefaults } from '@/lib/progress-invoices/claim-service'

export default async function NewProgressClaimPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  const result = await getProgressClaimDefaults({ seriesId })
  if (!result.ok || !result.data) notFound()
  return <main className="pbc-page">
    <nav className="pbc-crumb" aria-label="Breadcrumb"><Link href="/progress-invoices">Progress Invoices</Link><span>›</span><Link href={`/progress-invoices/${seriesId}`}>Series</Link><span>›</span><strong>New Claim</strong></nav>
    <ClaimEditor key={progressClaimEditorKey(result.data)} editor={result.data} />
  </main>
}
