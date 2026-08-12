'use client'

import { useState, useTransition } from 'react'
import { refreshJobberQuoteSnapshot } from '@/lib/actions/quotes'
import type { QuoteRecord } from '@/lib/dev-data'
import { formatJobberRefreshTime } from '@/components/quote-detail/jobber-refresh-time'
import { Icons } from '@/components/ui/icons'

export type JobberRefreshQuote = Pick<
  QuoteRecord,
  | 'id'
  | 'jobberQuoteId'
  | 'jobberSnapshotRefreshedAt'
  | 'jobberSnapshotRefreshError'
  | 'jobberSnapshotChangeStatus'
  | 'jobberSnapshotChangeSummary'
>

export function JobberRefreshPanel({ quote }: { quote: JobberRefreshQuote }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!quote.jobberQuoteId) return null

  function refresh() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await refreshJobberQuoteSnapshot(quote.id)
        if (!result.ok) setError(result.error)
      } catch {
        setError('Unable to refresh Jobber quote.')
      }
    })
  }

  const displayError = error ?? quote.jobberSnapshotRefreshError

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="pbc-listitem__meta">
            Last refreshed from Jobber: {formatJobberRefreshTime(quote.jobberSnapshotRefreshedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending}
          className="pbc-btn pbc-btn--ghost pbc-btn--sm"
        >
          {Icons.refresh({ size: 14 })} {isPending ? 'Refreshing...' : 'Refresh from Jobber'}
        </button>
      </div>

      {displayError ? (
        <p className="pbc-alert pbc-alert--danger" role="alert">
          {displayError}
        </p>
      ) : null}

      {quote.jobberSnapshotChangeStatus === 'changed' ? (
        <div className="pbc-alert pbc-alert--warning">
          <div>
            <b>Jobber changed since the previous snapshot.</b>
            <ul className="mt-2 space-y-1">
              {quote.jobberSnapshotChangeSummary.map((item, index) => (
                <li key={`${item.field}-${index}`}>
                  {item.label}: {item.before} -&gt; {item.after}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}
