'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'

import { voidProgressInvoiceSeries } from '@/lib/actions/progress-invoice-series'
import { createBrowserUuid } from '@/lib/browser-uuid'

function safeVoidError(error: string): string {
  if (error === 'PROGRESS_VERSION_CONFLICT' || error === 'PROGRESS_CURRENT_SET_CONFLICT') {
    return 'This Series changed. Reload the page before trying again.'
  }
  if (error === 'PROGRESS_CLAIM_VOID_REQUIRED') {
    return 'An Issued Claim now exists. Use the official Claim Void workflow.'
  }
  return 'The Series could not be made Void. No changes were made.'
}

export function SeriesVoidDialog({
  seriesId,
  expectedVersion,
  expectedCurrentRevisionSetId,
  expectedCurrentManifestHash,
  hasDraftClaims,
}: {
  seriesId: string
  expectedVersion: number
  expectedCurrentRevisionSetId: string | null
  expectedCurrentManifestHash: string | null
  hasDraftClaims: boolean
}) {
  const [open, setOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const correlationKey = useRef(createBrowserUuid())
  const triggerRef = useRef<HTMLButtonElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) reasonRef.current?.focus()
  }, [open])

  function close(): void {
    setOpen(false)
    setTimeout(() => triggerRef.current?.focus(), 0)
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!confirmed || reason.trim() === '') return
    setMessage(null)
    startTransition(async () => {
      const result = await voidProgressInvoiceSeries({
        seriesId,
        expectedVersion,
        expectedCurrentRevisionSetId,
        expectedCurrentManifestHash,
        preparedRevisionSetId: null,
        reason,
        correlationKey: correlationKey.current,
      })
      if (!result.ok) {
        setMessage(safeVoidError(result.error))
        return
      }
      window.location.assign('/progress-invoices')
    })
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="pbc-btn pbc-btn--danger"
        type="button"
        onClick={() => setOpen(true)}
      >
        Void Series
      </button>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="void-series-heading"
        hidden={!open}
        onKeyDown={(event) => { if (event.key === 'Escape' && !isPending) close() }}
      >
        <form className="pbc-card pbc-card--pad pbc-form" onSubmit={submit}>
          <h3 id="void-series-heading">Void Series</h3>
          <p>
            {hasDraftClaims
              ? 'Draft Claims become Void, but every Claim number and numbering base remain permanently reserved.'
              : 'Claim-free numbering base becomes reusable after this Series is made Void.'}
          </p>
          <label className="pbc-field" htmlFor="void-series-reason">
            <span className="pbc-field__label">Reason</span>
            <textarea
              ref={reasonRef}
              id="void-series-reason"
              className="pbc-textarea"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              required
              rows={3}
              disabled={isPending}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={isPending}
            />{' '}
            I understand this Series will be Void and cannot be edited again.
          </label>
          <div aria-live="polite">{message}</div>
          <div className="pbc-alert__actions">
            <button type="button" className="pbc-btn pbc-btn--secondary" onClick={close} disabled={isPending}>
              Cancel
            </button>
            <button
              type="submit"
              className="pbc-btn pbc-btn--danger"
              disabled={isPending || !confirmed || reason.trim() === ''}
            >
              {isPending ? 'Making Void…' : 'Confirm Void Series'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
