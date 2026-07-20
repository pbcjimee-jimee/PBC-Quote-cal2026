'use client'

import { useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import {
  approveProgressAdjustment,
  createProgressAdjustment,
  rejectProgressAdjustment,
  supersedeProgressAdjustment,
  updateDraftProgressAdjustment,
} from '@/lib/actions/progress-invoice-adjustments'
import type { ProgressInvoiceAdjustmentDto } from '@/lib/progress-invoices/workspace-service'

function formatMoney(value: string): string {
  const [whole, cents] = value.split('.')
  return `$${(whole ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents ?? '00'}`
}

function safeError(error: string): string {
  if (error === 'PROGRESS_RECONCILIATION_REQUIRED') {
    return 'This Credit would reduce the adjusted contract below Current issued Claims. Reconcile the Claims first; no changes were saved.'
  }
  if (error === 'PROGRESS_VERSION_CONFLICT') return 'This adjustment changed. Refresh before trying again.'
  if (error === 'PROGRESS_SERIES_VOID') return 'This Void Series is read-only.'
  return 'The adjustment could not be saved. Check the fields and try again.'
}

export function AdjustmentRegister({
  seriesId,
  adjustments,
  readOnly,
}: {
  seriesId: string
  adjustments: readonly ProgressInvoiceAdjustmentDto[]
  readOnly: boolean
}) {
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [type, setType] = useState<'variation' | 'credit'>('variation')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [rowDrafts, setRowDrafts] = useState<Record<string, {
    type: 'variation' | 'credit'
    effectiveDate: string
    description: string
    amountExGst: string
  }>>({})
  const keys = useRef(new Map<string, { signature: string; key: string }>())

  function key(scope: string, payload: unknown): string {
    const signature = JSON.stringify(payload)
    const existing = keys.current.get(scope)
    if (existing?.signature === signature) return existing.key
    const created = crypto.randomUUID()
    keys.current.set(scope, { signature, key: created })
    return created
  }

  function run(
    scope: string,
    payload: unknown,
    operation: (correlationKey: string) => Promise<{ ok: boolean; error?: string }>,
  ): void {
    const correlationKey = key(scope, payload)
    setMessage(null)
    startTransition(async () => {
      const result = await operation(correlationKey)
      if (!result.ok) {
        setMessage(safeError(result.error ?? 'PROGRESS_REQUEST_FAILED'))
        return
      }
      if (keys.current.get(scope)?.key === correlationKey) keys.current.delete(scope)
      setMessage('Adjustment saved.')
      router.refresh()
    })
  }

  function create(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const payload = {
      seriesId, type, effectiveDate: date, description, amountExGst: amount,
      gstRate: '0.10' as const, pbcQuoteItemId: null,
    }
    run('create', payload, (correlationKey) => createProgressAdjustment({ ...payload, correlationKey }))
  }

  return (
    <div className="pbc-form">
      {!readOnly && (
        <form className="pbc-formgroup" onSubmit={create}>
          <h3>Add adjustment</h3>
          <div className="pbc-progress-form-grid">
            <label className="pbc-field"><span className="pbc-field__label">Type</span>
              <select className="pbc-select" value={type} onChange={(event) => setType(event.target.value as 'variation' | 'credit')} disabled={isPending}>
                <option value="variation">Variation</option><option value="credit">Credit</option>
              </select>
            </label>
            <label className="pbc-field"><span className="pbc-field__label">Effective date</span>
              <input className="pbc-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} required disabled={isPending} />
            </label>
            <label className="pbc-field"><span className="pbc-field__label">Amount Ex GST</span>
              <input className="pbc-input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required disabled={isPending} />
              <span className="pbc-field__hint">Fixed GST 10%</span>
            </label>
            <label className="pbc-field pbc-progress-form-grid__wide"><span className="pbc-field__label">Description</span>
              <input className="pbc-input" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1200} required disabled={isPending} />
            </label>
          </div>
          <button className="pbc-btn pbc-btn--primary" type="submit" disabled={isPending}>Add Draft adjustment</button>
        </form>
      )}

      {adjustments.length === 0 ? <p className="pbc-progress-empty">No adjustments.</p> : (
        <div className="pbc-progress-table-scroll" tabIndex={0} aria-label="Adjustments table">
          <table className="pbc-progress-detail-table">
            <caption>Variation and Credit adjustments</caption>
            <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount Ex GST</th><th>GST</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{adjustments.map((adjustment) => {
              const rowDraft = rowDrafts[adjustment.id] ?? {
                type: adjustment.type,
                effectiveDate: adjustment.effectiveDate,
                description: adjustment.description,
                amountExGst: adjustment.amountExGst,
              }
              const setRow = (change: Partial<typeof rowDraft>) => setRowDrafts((current) => ({
                ...current, [adjustment.id]: { ...rowDraft, ...change },
              }))
              return <tr key={adjustment.id}>
                <td>{adjustment.effectiveDate}</td><td>{adjustment.type === 'variation' ? 'Variation' : 'Credit'}</td>
                <th scope="row">{adjustment.description}</th><td>{formatMoney(adjustment.amountExGst)}</td><td>10%</td><td>{adjustment.status}</td>
                <td>{!readOnly && adjustment.status === 'draft' ? (
                  <div className="pbc-alert__actions">
                    <select aria-label={`Edit type for ${adjustment.description}`} className="pbc-select" value={rowDraft.type} onChange={(event) => setRow({ type: event.target.value as 'variation' | 'credit' })} disabled={isPending}>
                      <option value="variation">Variation</option><option value="credit">Credit</option>
                    </select>
                    <input aria-label={`Edit date for ${adjustment.description}`} className="pbc-input" type="date" value={rowDraft.effectiveDate} onChange={(event) => setRow({ effectiveDate: event.target.value })} disabled={isPending} />
                    <input aria-label={`Edit description for ${adjustment.description}`} className="pbc-input" value={rowDraft.description} onChange={(event) => setRow({ description: event.target.value })} disabled={isPending} />
                    <input aria-label={`Edit amount for ${adjustment.description}`} className="pbc-input" value={rowDraft.amountExGst} onChange={(event) => setRow({ amountExGst: event.target.value })} disabled={isPending} />
                    <button type="button" className="pbc-btn pbc-btn--secondary" disabled={isPending} onClick={() => {
                      const payload = {
                        adjustmentId: adjustment.id, expectedVersion: adjustment.version, type: rowDraft.type,
                        effectiveDate: rowDraft.effectiveDate, description: rowDraft.description,
                        amountExGst: rowDraft.amountExGst, gstRate: '0.10' as const, pbcQuoteItemId: null,
                      }
                      run(`edit-${adjustment.id}`, payload, (correlationKey) => updateDraftProgressAdjustment({ ...payload, correlationKey }))
                    }}>Edit</button>
                    <button type="button" className="pbc-btn pbc-btn--primary" disabled={isPending} onClick={() => {
                      const payload = { adjustmentId: adjustment.id, expectedVersion: adjustment.version }
                      run(`approve-${adjustment.id}`, payload, (correlationKey) => approveProgressAdjustment({ ...payload, correlationKey }))
                    }}>Approve</button>
                    <input aria-label={`Reject reason for ${adjustment.description}`} className="pbc-input" value={reasons[adjustment.id] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [adjustment.id]: event.target.value }))} disabled={isPending} />
                    <button type="button" className="pbc-btn pbc-btn--danger" disabled={isPending || !(reasons[adjustment.id]?.trim())} onClick={() => {
                      const payload = {
                        adjustmentId: adjustment.id, expectedVersion: adjustment.version,
                        reason: reasons[adjustment.id] ?? '',
                      }
                      run(`reject-${adjustment.id}`, payload, (correlationKey) => rejectProgressAdjustment({ ...payload, correlationKey }))
                    }}>Reject</button>
                  </div>
                ) : !readOnly && adjustment.status === 'approved' ? (
                  <div className="pbc-alert__actions">
                    <select aria-label={`Correction type for ${adjustment.description}`} className="pbc-select" value={rowDraft.type} onChange={(event) => setRow({ type: event.target.value as 'variation' | 'credit' })} disabled={isPending}>
                      <option value="variation">Variation</option><option value="credit">Credit</option>
                    </select>
                    <input aria-label={`Correction date for ${adjustment.description}`} className="pbc-input" type="date" value={rowDraft.effectiveDate} onChange={(event) => setRow({ effectiveDate: event.target.value })} disabled={isPending} />
                    <input aria-label={`Correction description for ${adjustment.description}`} className="pbc-input" value={rowDraft.description} onChange={(event) => setRow({ description: event.target.value })} disabled={isPending} />
                    <input aria-label={`Correction amount for ${adjustment.description}`} className="pbc-input" value={rowDraft.amountExGst} onChange={(event) => setRow({ amountExGst: event.target.value })} disabled={isPending} />
                    <input aria-label={`Correction reason for ${adjustment.description}`} className="pbc-input" value={reasons[adjustment.id] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [adjustment.id]: event.target.value }))} disabled={isPending} />
                    <button type="button" className="pbc-btn pbc-btn--secondary" disabled={isPending || !(reasons[adjustment.id]?.trim())} onClick={() => {
                      const payload = {
                        adjustmentId: adjustment.id, expectedVersion: adjustment.version, reason: reasons[adjustment.id] ?? '',
                        replacement: { ...rowDraft, gstRate: '0.10' as const, pbcQuoteItemId: null },
                      }
                      run(`correct-${adjustment.id}`, payload, (correlationKey) => supersedeProgressAdjustment({ ...payload, correlationKey }))
                    }}>Correct</button>
                  </div>
                ) : 'Read-only'}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
      )}
      <div role="status" aria-live="polite">{isPending ? 'Saving adjustment…' : message}</div>
    </div>
  )
}
