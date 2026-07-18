import Link from 'next/link'

import type { ActionResult } from '@/lib/actions/types'
import type { ProgressInvoiceHistoryPageDto } from '@/lib/progress-invoices/workspace-service'

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Sydney',
  }).format(new Date(value))
}

function eventLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

export function HistoryPanel({
  seriesId,
  result,
}: {
  seriesId: string
  result: ActionResult<ProgressInvoiceHistoryPageDto>
}) {
  if (!result.ok) {
    return (
      <div className="pbc-alert pbc-alert--danger" role="status">
        History could not be loaded. The rest of this series is still available.
      </div>
    )
  }

  return (
    <>
      {result.data.events.length === 0 ? (
        <p className="pbc-progress-empty">No history events.</p>
      ) : (
        <ol className="pbc-progress-history-list">
          {result.data.events.map((event) => (
            <li key={event.id}>
              <div>
                <strong>{eventLabel(event.eventType)}</strong>
                <span>{formatDateTime(event.occurredAt)}</span>
              </div>
              <span className="pbc-badge">{event.source}</span>
            </li>
          ))}
        </ol>
      )}
      {result.data.nextCursor ? (
        <Link
          className="pbc-btn pbc-btn--secondary pbc-progress-history-more"
          href={`/progress-invoices/${seriesId}?cursor=${result.data.nextCursor}#progress-invoice-history`}
        >
          Older history
        </Link>
      ) : null}
    </>
  )
}
