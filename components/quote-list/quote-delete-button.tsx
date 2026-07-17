'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { deleteQuote } from '@/lib/actions/quotes'

interface QuoteDeleteButtonProps {
  quoteId: string
  redirectToQuotes?: boolean
}

export function QuoteDeleteButton({ quoteId, redirectToQuotes = false }: QuoteDeleteButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)

  function handleDeleteClick() {
    setError(null)
    setIsConfirming(true)
  }

  function handleCancel() {
    if (isPending) return
    setIsConfirming(false)
  }

  function handleConfirmDelete() {
    setError(null)

    startTransition(async () => {
      const result = await deleteQuote(quoteId)
      if (!result.ok) {
        setError(result.error)
        return
      }

      // deleteQuote already revalidates /quotes; stay on the client router so the
      // app shell, bundles and router cache survive the mutation.
      if (redirectToQuotes) {
        router.replace('/quotes')
        return
      }
      setIsConfirming(false)
      router.refresh()
    })
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDeleteClick}
        disabled={isPending}
        className="pbc-btn pbc-btn--danger pbc-btn--sm"
      >
        {isPending ? 'Deleting...' : 'Delete'}
      </button>
      {error && !isConfirming ? <span className="text-xs text-[var(--danger)]">{error}</span> : null}
      {isConfirming ? (
        <span className="pbc-dialogbackdrop" role="presentation">
          <span
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-quote-title-${quoteId}`}
            className="pbc-dialog"
          >
            <span id={`delete-quote-title-${quoteId}`} className="block text-base font-semibold text-[var(--foreground)]">
              Delete this quote?
            </span>
            <span className="mt-2 block text-sm text-[var(--muted)]">
              This will permanently remove the quote and cannot be undone.
            </span>
            {error ? <span className="pbc-alert pbc-alert--danger mt-4 block text-sm">{error}</span> : null}
            <span className="pbc-dialog__actions">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="pbc-btn pbc-btn--ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isPending}
                className="pbc-btn pbc-btn--danger"
              >
                {isPending ? 'Deleting...' : 'Delete quote'}
              </button>
            </span>
          </span>
        </span>
      ) : null}
    </span>
  )
}
