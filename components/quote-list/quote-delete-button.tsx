'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { moveQuoteToTrash } from '@/lib/actions/quote-lifecycle'

interface QuoteDeleteButtonProps {
  quoteId: string
  quoteVersion: number
  redirectToQuotes?: boolean
}

export function QuoteDeleteButton({ quoteId, quoteVersion, redirectToQuotes = false }: QuoteDeleteButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isConfirming) return
    cancelRef.current?.focus?.()
    const trigger = triggerRef.current
    return () => trigger?.focus?.()
  }, [isConfirming])

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
      try {
        const result = await moveQuoteToTrash({ id: quoteId, expectedVersion: quoteVersion })
        if (!result.ok) {
          setError(result.error)
          return
        }
        setIsConfirming(false)
        if (redirectToQuotes) router.push('/quotes')
        router.refresh()
      } catch {
        setError('Unable to move this quote to Trash. Please try again.')
      }
    })
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleDeleteClick}
        disabled={isPending}
        className="pbc-btn pbc-btn--danger pbc-btn--sm"
      >
        {isPending ? 'Moving...' : 'Delete'}
      </button>
      {error && !isConfirming ? <span className="text-xs text-[var(--danger)]">{error}</span> : null}
      {isConfirming ? (
        <span className="pbc-dialogbackdrop" role="presentation">
          <span
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-quote-title-${quoteId}`}
            aria-describedby={`delete-quote-description-${quoteId}`}
            aria-busy={isPending}
            className="pbc-dialog"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !isPending) setIsConfirming(false)
              if (event.key === 'Tab') {
                event.preventDefault()
                if (document.activeElement === cancelRef.current) confirmRef.current?.focus?.()
                else cancelRef.current?.focus?.()
              }
            }}
          >
            <span id={`delete-quote-title-${quoteId}`} className="block text-base font-semibold text-[var(--foreground)]">
              Move this quote to Trash?
            </span>
            <span id={`delete-quote-description-${quoteId}`} className="mt-2 block text-sm text-[var(--muted)]">
              This quote will be hidden from the app. Admins can restore it from Trash with its saved contents.
            </span>
            {error ? <span role="alert" className="pbc-alert pbc-alert--danger mt-4 block text-sm">{error}</span> : null}
            <span className="pbc-dialog__actions">
              <button
                ref={cancelRef}
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="pbc-btn pbc-btn--ghost"
              >
                Cancel
              </button>
              <button
                ref={confirmRef}
                type="button"
                onClick={handleConfirmDelete}
                disabled={isPending}
                className="pbc-btn pbc-btn--danger"
              >
                {isPending ? 'Moving...' : 'Move to Trash'}
              </button>
            </span>
          </span>
        </span>
      ) : null}
    </span>
  )
}
