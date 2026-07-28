'use client'

import { useEffect, useState, useTransition } from 'react'
import { refreshJobberQuoteSnapshot } from '@/lib/actions/quotes'
import type { QuoteRecord } from '@/lib/dev-data'
import { formatJobberRefreshTime } from '@/components/quote-detail/jobber-refresh-time'
import { Icons } from '@/components/ui/icons'
import { Alert } from '@/components/ui/card'

type RefreshStatus = 'unknown' | 'unchanged' | 'changed'

const REFRESH_FEEDBACK_MS = 8000

export function JobberRefreshPanel({ quote }: { quote: QuoteRecord }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus | null>(null)

  // 성공 피드백은 액션 직후 잠시만 보여준다 — 오래 남으면 최신 상태처럼 오독된다
  useEffect(() => {
    if (!refreshStatus) return
    const timer = window.setTimeout(() => setRefreshStatus(null), REFRESH_FEEDBACK_MS)
    return () => window.clearTimeout(timer)
  }, [refreshStatus])

  if (!quote.jobberQuoteId) return null

  function refresh() {
    setError(null)
    setRefreshStatus(null)
    startTransition(async () => {
      try {
        const result = await refreshJobberQuoteSnapshot(quote.id)
        if (!result.ok) {
          setError(result.error)
          return
        }
        setRefreshStatus(result.data.status)
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
          aria-busy={isPending}
          className="pbc-btn pbc-btn--ghost pbc-btn--sm"
        >
          {Icons.refresh({ size: 14 })} {isPending ? 'Refreshing...' : 'Refresh from Jobber'}
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {isPending ? 'Refreshing from Jobber' : ''}
      </p>

      {displayError ? (
        <p className="pbc-alert pbc-alert--danger" role="alert">
          {displayError}
        </p>
      ) : null}

      {refreshStatus && !displayError ? (
        <Alert tone="success">
          Refresh complete - {refreshStatus === 'changed'
            ? 'Jobber changes detected below.'
            : refreshStatus === 'unchanged'
              ? 'no changes since the previous snapshot.'
              : 'first snapshot saved, no previous version to compare.'}
        </Alert>
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
