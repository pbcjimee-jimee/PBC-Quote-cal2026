import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  getProgressInvoiceSeriesWorkspace,
  listProgressInvoiceSeriesHistory,
} from '@/lib/actions/progress-invoice-series'
import { ProgressInvoiceSeriesDetailView } from '@/components/progress-invoices/series-detail'

export default async function ProgressInvoiceSeriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ seriesId: string }>
  searchParams: Promise<{ cursor?: string | string[] }>
}) {
  const { seriesId } = await params
  const query = await searchParams
  const workspaceResult = await getProgressInvoiceSeriesWorkspace(seriesId)

  if (!workspaceResult.ok) {
    if (workspaceResult.code === 'VALIDATION' || workspaceResult.code === 'NOT_FOUND') notFound()
    return (
      <div className="pbc-page">
        <div className="pbc-alert pbc-alert--danger" role="alert">
          This Progress Invoice series could not be loaded. Try again.
        </div>
        <Link className="pbc-btn pbc-btn--secondary" href="/progress-invoices">Back to Progress Invoices</Link>
      </div>
    )
  }
  if (!workspaceResult.data) notFound()

  const cursor = typeof query.cursor === 'string' ? query.cursor : null
  const historyResult = await listProgressInvoiceSeriesHistory({ seriesId, cursor, limit: 20 })

  return (
    <div className="pbc-page">
      <ProgressInvoiceSeriesDetailView workspace={workspaceResult.data} historyResult={historyResult} />
    </div>
  )
}
