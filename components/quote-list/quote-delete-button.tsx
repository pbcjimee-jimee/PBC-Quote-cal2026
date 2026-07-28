'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { deleteQuote } from '@/lib/actions/quotes'

interface QuoteDeleteButtonProps {
  quoteId: string
  redirectToQuotes?: boolean
}

export function QuoteDeleteButton({ quoteId, redirectToQuotes = false }: QuoteDeleteButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLSpanElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)

  function handleDeleteClick() {
    setError(null)
    setIsConfirming(true)
  }

  function handleCancel() {
    if (isPending) return
    setIsConfirming(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!isConfirming) return

    cancelRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (isPending) return
        event.stopPropagation()
        setIsConfirming(false)
        triggerRef.current?.focus()
        return
      }

      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled])'))

      // 삭제 진행 중에는 모든 버튼이 disabled — 포커스가 배경으로 새지 않게 다이얼로그에 잡아둔다
      if (focusables.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (active === last || !dialog.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isConfirming, isPending])

  function handleConfirmDelete() {
    setError(null)

    startTransition(async () => {
      const result = await deleteQuote(quoteId)
      if (!result.ok) {
        setError(result.error)
        return
      }

      if (redirectToQuotes) {
        window.location.href = '/quotes'
        return
      }
      window.location.reload()
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
        {isPending ? 'Deleting...' : 'Delete'}
      </button>
      {error && !isConfirming ? <span className="text-xs text-[var(--danger-text)]">{error}</span> : null}
      {isConfirming ? (
        <span
          className="pbc-dialogbackdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) handleCancel()
          }}
        >
          <span
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-quote-title-${quoteId}`}
            tabIndex={-1}
            className="pbc-dialog"
          >
            <span id={`delete-quote-title-${quoteId}`} className="block text-base font-semibold text-[var(--foreground)]">
              Delete this quote?
            </span>
            <span className="mt-2 block text-sm text-[var(--muted)]">
              This will permanently remove the quote and cannot be undone.
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
