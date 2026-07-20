'use client'

import { useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import {
  createManualProgressPayment,
  reconcileProgressPayment,
  replaceManualProgressPayment,
  undoProgressPaymentReconciliation,
  voidManualProgressPayment,
} from '@/lib/actions/progress-invoice-payments'
import type { ProgressInvoicePaymentListItemDto } from '@/lib/progress-invoices/workspace-service'

function formatMoney(value: string): string {
  const [whole, cents] = value.split('.')
  const sign = whole?.startsWith('-') ? '-' : ''
  const digits = (whole ?? '0').replace('-', '')
  return `${sign}$${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents ?? '00'}`
}

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function safeError(error: string): string {
  if (error === 'PROGRESS_VERSION_CONFLICT') return 'A receipt changed. Refresh before trying again.'
  if (error === 'PROGRESS_SERIES_VOID') return 'This Void Series is read-only.'
  if (error === 'PROGRESS_PAYMENT_MATCH_INVALID') return 'These receipts can no longer be matched. Refresh and compare them again.'
  return 'The receipt could not be saved. Check the fields and try again.'
}

type PaymentDraft = {
  receivedDate: string
  amount: string
  method: string
  reference: string
  reason: string
}

const EMPTY_DRAFT: PaymentDraft = { receivedDate: '', amount: '', method: '', reference: '', reason: '' }

export function PaymentLedger({
  payments,
  seriesId,
  expectedSeriesVersion,
  readOnly = true,
}: {
  payments: readonly ProgressInvoicePaymentListItemDto[]
  seriesId?: string
  expectedSeriesVersion?: number
  readOnly?: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [rowDrafts, setRowDrafts] = useState<Record<string, PaymentDraft>>({})
  const [matchReasons, setMatchReasons] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const keys = useRef(new Map<string, string>())

  function key(name: string): string {
    const existing = keys.current.get(name)
    if (existing) return existing
    const created = crypto.randomUUID()
    keys.current.set(name, created)
    return created
  }

  function run(operation: () => Promise<{ ok: boolean; error?: string }>): void {
    setMessage(null)
    startTransition(async () => {
      const result = await operation()
      if (!result.ok) {
        setMessage(safeError(result.error ?? 'PROGRESS_REQUEST_FAILED'))
        return
      }
      setMessage('Receipt ledger saved.')
      router.refresh()
    })
  }

  function create(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!seriesId || !expectedSeriesVersion) return
    run(() => createManualProgressPayment({
      seriesId,
      expectedSeriesVersion,
      receivedDate: draft.receivedDate,
      amount: draft.amount,
      method: draft.method,
      reference: draft.reference.trim() || null,
      correlationKey: key('create'),
    }))
  }

  const manualCandidates = payments.filter((payment) => (
    payment.source === 'manual' && payment.currentRevision?.status === 'active'
  ))
  const jobberCandidates = payments.filter((payment) => (
    payment.source === 'jobber' && payment.currentRevision?.status === 'active'
      && payment.matchedManualPaymentId === null
  ))

  return (
    <div className="pbc-form">
      {!readOnly && seriesId && expectedSeriesVersion && (
        <form className="pbc-formgroup" onSubmit={create}>
          <h3>Add Manual receipt</h3>
          <div className="pbc-progress-form-grid">
            <label className="pbc-field"><span className="pbc-field__label">Received date</span><input className="pbc-input" type="date" value={draft.receivedDate} onChange={(event) => setDraft((current) => ({ ...current, receivedDate: event.target.value }))} required disabled={isPending} /></label>
            <label className="pbc-field"><span className="pbc-field__label">Actual receipt Inc GST</span><input className="pbc-input" inputMode="decimal" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} required disabled={isPending} /></label>
            <label className="pbc-field"><span className="pbc-field__label">Method</span><input className="pbc-input" value={draft.method} onChange={(event) => setDraft((current) => ({ ...current, method: event.target.value }))} required maxLength={80} disabled={isPending} /></label>
            <label className="pbc-field"><span className="pbc-field__label">Reference</span><input className="pbc-input" value={draft.reference} onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))} maxLength={120} disabled={isPending} /></label>
          </div>
          <button className="pbc-btn pbc-btn--primary" type="submit" disabled={isPending}>Add Manual receipt</button>
        </form>
      )}

      {payments.length === 0 ? <p className="pbc-progress-empty">No payments recorded.</p> : (
        <div className="pbc-progress-table-scroll" tabIndex={0} aria-label="Payment ledger table">
          <table className="pbc-progress-detail-table">
            <caption>Payment ledger</caption>
            <thead><tr><th>Source</th><th>Received date</th><th>Observed Inc GST</th><th>Effective receipt Inc GST</th><th>Status</th><th>Method</th><th>Reference</th><th>Actions</th></tr></thead>
            <tbody>{payments.map((payment) => {
              const revision = payment.currentRevision
              const rowDraft = rowDrafts[payment.id] ?? {
                receivedDate: revision?.receivedDate ?? '', amount: revision?.observedAmount ?? '',
                method: revision?.paymentMethod ?? '', reference: revision?.reference ?? '', reason: '',
              }
              const badges = [payment.source === 'jobber' ? 'Jobber' : 'Manual']
              if (payment.matchedManualPaymentId) badges.push('Matched')
              if (revision?.status === 'superseded') badges.push('Superseded')
              if (revision?.status === 'unconfirmed') badges.push('Unconfirmed')
              if (revision?.status === 'void') badges.push('Void')
              const canMutate = !readOnly && payment.source === 'manual' && revision?.status === 'active'
              return (
                <tr key={payment.id}>
                  <th scope="row">{badges.map((badge) => <span className="pbc-badge" key={badge}>{badge}</span>)}</th>
                  <td>{revision?.receivedDate ?? 'Not available'}</td>
                  <td>{revision ? formatMoney(revision.observedAmount) : 'Not available'}</td>
                  <td>{revision ? formatMoney(revision.effectiveReceiptAmount) : 'Not available'}</td>
                  <td>{revision ? label(revision.status) : 'Unavailable'}</td>
                  <td>{revision?.paymentMethod ?? '—'}</td><td>{revision?.reference ?? '—'}</td>
                  <td>{canMutate ? (
                    <div className="pbc-formgroup">
                      <input aria-label="Replacement received date" className="pbc-input" type="date" value={rowDraft.receivedDate} onChange={(event) => setRowDrafts((current) => ({ ...current, [payment.id]: { ...rowDraft, receivedDate: event.target.value } }))} disabled={isPending} />
                      <input aria-label="Replacement amount Inc GST" className="pbc-input" value={rowDraft.amount} onChange={(event) => setRowDrafts((current) => ({ ...current, [payment.id]: { ...rowDraft, amount: event.target.value } }))} disabled={isPending} />
                      <input aria-label="Replacement method" className="pbc-input" value={rowDraft.method} onChange={(event) => setRowDrafts((current) => ({ ...current, [payment.id]: { ...rowDraft, method: event.target.value } }))} disabled={isPending} />
                      <input aria-label="Replacement reference" className="pbc-input" value={rowDraft.reference} onChange={(event) => setRowDrafts((current) => ({ ...current, [payment.id]: { ...rowDraft, reference: event.target.value } }))} disabled={isPending} />
                      <input aria-label="Replacement or Void reason" className="pbc-input" value={rowDraft.reason} onChange={(event) => setRowDrafts((current) => ({ ...current, [payment.id]: { ...rowDraft, reason: event.target.value } }))} disabled={isPending} />
                      <div className="pbc-alert__actions">
                        <button type="button" className="pbc-btn pbc-btn--secondary" disabled={isPending || !rowDraft.reason.trim()} onClick={() => run(() => replaceManualProgressPayment({
                          paymentId: payment.id, expectedVersion: payment.version, receivedDate: rowDraft.receivedDate,
                          amount: rowDraft.amount, method: rowDraft.method, reference: rowDraft.reference.trim() || null,
                          reason: rowDraft.reason, correlationKey: key(`replace-${payment.id}`),
                        }))}>Replace</button>
                        <button type="button" className="pbc-btn pbc-btn--danger" disabled={isPending || !rowDraft.reason.trim()} onClick={() => run(() => voidManualProgressPayment({
                          paymentId: payment.id, expectedVersion: payment.version, reason: rowDraft.reason,
                          correlationKey: key(`void-${payment.id}`),
                        }))}>Void payment</button>
                      </div>
                    </div>
                  ) : 'Read-only'}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}

      {!readOnly && jobberCandidates.flatMap((jobber) => manualCandidates.map((manual) => {
        const pair = `${jobber.id}:${manual.id}`
        const canonicalSuggestion = jobber.currentRevision?.receivedDate === manual.currentRevision?.receivedDate
          && jobber.currentRevision?.observedAmount === manual.currentRevision?.observedAmount
        return (
          <section className="pbc-formgroup" key={pair}>
            <h3>Compare Jobber and Manual receipts</h3>
            <p>{canonicalSuggestion ? 'Same canonical date and amount; identity still requires confirmation.' : 'Dates or amounts differ. Compare the source records before confirming.'}</p>
            <button type="button" className="pbc-btn pbc-btn--secondary" disabled={isPending}>Compare</button>
            <label className="pbc-field"><span className="pbc-field__label">Match reason</span><input className="pbc-input" value={matchReasons[pair] ?? ''} onChange={(event) => setMatchReasons((current) => ({ ...current, [pair]: event.target.value }))} disabled={isPending} /></label>
            <button type="button" className="pbc-btn pbc-btn--primary" disabled={isPending || !matchReasons[pair]?.trim()} onClick={() => run(() => reconcileProgressPayment({
              jobberPaymentId: jobber.id, manualPaymentId: manual.id, jobberExpectedVersion: jobber.version,
              manualExpectedVersion: manual.version, reason: matchReasons[pair], idempotencyKey: key(`match-${pair}`),
            }))}>Confirm Match</button>
          </section>
        )
      }))}

      {!readOnly && payments.filter((payment) => payment.source === 'jobber' && payment.matchedManualPaymentId).map((jobber) => {
        const manual = payments.find((payment) => payment.id === jobber.matchedManualPaymentId)
        if (!manual) return null
        const pair = `${jobber.id}:${manual.id}:undo`
        return (
          <section className="pbc-formgroup" key={pair}>
            <h3>Matched receipt</h3>
            <label className="pbc-field"><span className="pbc-field__label">Undo reason</span><input className="pbc-input" value={matchReasons[pair] ?? ''} onChange={(event) => setMatchReasons((current) => ({ ...current, [pair]: event.target.value }))} disabled={isPending} /></label>
            <button type="button" className="pbc-btn pbc-btn--secondary" disabled={isPending || !matchReasons[pair]?.trim()} onClick={() => run(() => undoProgressPaymentReconciliation({
              jobberPaymentId: jobber.id, manualPaymentId: manual.id, jobberExpectedVersion: jobber.version,
              manualExpectedVersion: manual.version, reason: matchReasons[pair], idempotencyKey: key(`undo-${pair}`),
            }))}>Undo Match</button>
          </section>
        )
      })}
      <div role="status" aria-live="polite">{isPending ? 'Saving receipt ledger…' : message}</div>
    </div>
  )
}
