'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { voidProgressClaimDraft } from '@/lib/actions/progress-invoice-claims'

interface ClaimDraftVoidDialogProps {
  seriesId: string
  claimId: string
  taxInvoiceNumber: string
  expectedSeriesVersion: number
  expectedClaimVersion: number
  expectedCurrentRevisionSetId: string | null
  expectedCurrentManifestHash: string | null
}

export function ClaimDraftVoidDialog(props: ClaimDraftVoidDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const retry = useRef<{ fingerprint: string; key: string } | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  async function submit(): Promise<void> {
    const normalizedReason = reason.trim()
    if (!normalizedReason || !confirmed || pending) return
    const fingerprint = JSON.stringify({ normalizedReason, ...props })
    const correlationKey = retry.current?.fingerprint === fingerprint
      ? retry.current.key
      : crypto.randomUUID()
    retry.current = { fingerprint, key: correlationKey }
    setPending(true)
    setError('')
    setConflict(false)
    const result = await voidProgressClaimDraft({
      seriesId: props.seriesId,
      claimId: props.claimId,
      expectedSeriesVersion: props.expectedSeriesVersion,
      expectedClaimVersion: props.expectedClaimVersion,
      expectedCurrentRevisionSetId: props.expectedCurrentRevisionSetId,
      expectedCurrentManifestHash: props.expectedCurrentManifestHash,
      reason: normalizedReason,
      correlationKey,
    })
    setPending(false)
    if (!result.ok) {
      const stale = result.code === 'VERSION_CONFLICT'
      setConflict(stale)
      setError(stale
        ? 'This Draft or Series changed. Reload the latest values before trying again.'
        : 'The Draft could not be deleted. It remains unchanged.')
      const focusError = () => errorRef.current?.focus()
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusError)
      else focusError()
      return
    }
    retry.current = null
    router.replace(`/progress-invoices/${props.seriesId}`)
    router.refresh()
  }

  if (!open) {
    return <button type="button" className="pbc-btn pbc-btn--danger" onClick={() => setOpen(true)}>Delete draft</button>
  }

  return <div className="pbc-dialogbackdrop" role="presentation">
    <section className="pbc-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-draft-heading">
      <h2 id="delete-draft-heading">Delete draft</h2>
      <p>
        This marks {props.taxInvoiceNumber} Void. The Claim, Revision 1, number reservation,
        snapshots, and audit history are retained permanently.
      </p>
      <label className="pbc-field"><span className="pbc-field__label">Reason</span>
        <textarea className="pbc-textarea" value={reason} maxLength={500} required
          onChange={(event) => setReason(event.target.value)} />
      </label>
      <label className="pbc-progress-confirmation">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        I understand this Draft will become Void and its Tax Invoice number will never be reused.
      </label>
      {error ? <div ref={errorRef} className="pbc-alert pbc-alert--danger" role="alert" tabIndex={-1}>{error}</div> : null}
      {conflict ? <button type="button" className="pbc-btn pbc-btn--ghost" onClick={() => router.refresh()}>Reload latest Draft</button> : null}
      <div className="pbc-dialog__actions">
        <button type="button" className="pbc-btn pbc-btn--ghost" disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="pbc-btn pbc-btn--danger" disabled={pending || !confirmed || reason.trim().length === 0} onClick={submit}>
          {pending ? 'Deleting…' : 'Confirm Delete draft'}
        </button>
      </div>
    </section>
  </div>
}
