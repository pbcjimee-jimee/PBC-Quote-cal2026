'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Decimal from 'decimal.js'
import { restoreQuote } from '@/lib/actions/quote-lifecycle'
import type { DeletedQuoteSummary } from '@/lib/quotes/lifecycle'

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Sydney',
})

function RestoreButton({ quote, onRestored }: { quote: DeletedQuoteSummary; onRestored: (id: string) => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  function restore() {
    if (isPending) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await restoreQuote({ id: quote.id, expectedVersion: quote.version })
        if (!result.ok) setError(result.error)
        else onRestored(result.data.id)
      } catch {
        setError('Unable to restore this quote. Please try again.')
      }
    })
  }
  return <div className="flex flex-col items-start gap-2 sm:items-end">
    <button type="button" className="pbc-btn pbc-btn--primary pbc-btn--sm" onClick={restore} disabled={isPending} aria-busy={isPending}>
      {isPending ? 'Restoring...' : 'Restore'}
    </button>
    {error ? <p role="alert" className="max-w-sm text-sm text-[var(--danger)]">{error}</p> : null}
  </div>
}

export function QuoteTrashList({ items }: { items: DeletedQuoteSummary[] }) {
  const router = useRouter()
  const [restoredIds, setRestoredIds] = useState<string[]>([])
  const restoredId = restoredIds.at(-1)
  function onRestored(id: string) {
    setRestoredIds((ids) => [...ids, id])
    router.refresh()
  }
  return <div className="space-y-3">
    {restoredId ? <p role="status" className="pbc-alert pbc-alert--success">
      Quote restored. <Link href={`/quotes/${restoredId}`} className="font-semibold underline">Open quote</Link>
    </p> : null}
    {items.filter((quote) => !restoredIds.includes(quote.id)).map((quote) => <article key={quote.id} className="pbc-card pbc-card--pad">
      <div className="flex flex-col justify-between gap-4 sm:flex-row">
        <div className="min-w-0 space-y-1">
          <h2 className="break-words text-base font-semibold">{quote.customerName || 'Untitled quote'}</h2>
          <p className="break-words text-sm text-[var(--muted)]">{quote.customerAddress || 'No address'}</p>
          <p className="break-words text-sm">{quote.quoteNumber ? `Quote #${quote.quoteNumber}` : 'No Jobber quote number'} · <span className="mono">${new Decimal(quote.subtotal).toFixed(2)}</span> ex GST</p>
          <p className="break-words text-xs text-[var(--muted)]">
            Deleted {dateFormatter.format(new Date(quote.deletedAt))} (Sydney) · {quote.deletedByName || 'Unknown user'}
          </p>
        </div>
        <RestoreButton quote={quote} onRestored={onRestored} />
      </div>
    </article>)}
  </div>
}
