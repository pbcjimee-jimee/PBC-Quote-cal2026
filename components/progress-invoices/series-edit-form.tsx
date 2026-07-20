'use client'

import { useRef, useState, useTransition, type FormEvent } from 'react'

import { updateProgressInvoiceSeries } from '@/lib/actions/progress-invoice-series'
import type { ProgressInvoiceSeriesDetail } from '@/lib/progress-invoices/series-service'
import {
  ProgressInvoiceSeriesFields,
  type ProgressInvoiceSeriesDraft,
  type ProgressInvoiceSeriesField,
} from './progress-invoice-series-fields'

function optional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function safeEditError(error: string): string {
  if (error === 'PROGRESS_VERSION_CONFLICT') return 'This Series changed. Reload the page before saving again.'
  if (error === 'PROGRESS_BASE_CONTRACT_LOCKED') return 'Base Contract Ex GST is locked because a Claim exists.'
  if (error === 'PROGRESS_SERIES_VOID') return 'This Void Series is read-only.'
  return 'The Series could not be saved. Check the fields and try again.'
}

export function SeriesEditForm({
  series,
  canEditBaseContract,
}: {
  series: ProgressInvoiceSeriesDetail
  canEditBaseContract: boolean
}) {
  const [draft, setDraft] = useState<ProgressInvoiceSeriesDraft>({
    acceptedNumberingBase: series.acceptedNumberingBase ?? '',
    baseContractExGst: series.baseContractExGst,
    recipientName: series.recipientName,
    recipientCompany: series.recipientCompany,
    recipientAddress: series.recipientAddress,
    recipientEmail: series.recipientEmail,
    recipientPhone: series.recipientPhone,
    recipientAbn: series.recipientAbn,
    siteName: series.siteName,
    siteAddress: series.siteAddress,
    defaultDescription: series.defaultDescription,
    reference: series.reference,
  })
  const correlationKey = useRef(crypto.randomUUID())
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function change(field: ProgressInvoiceSeriesField, value: string): void {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setMessage(null)
    startTransition(async () => {
      const result = await updateProgressInvoiceSeries({
        seriesId: series.id,
        expectedVersion: series.version,
        baseContractExGst: draft.baseContractExGst,
        gstRate: '0.10',
        recipientName: draft.recipientName,
        recipientCompany: optional(draft.recipientCompany),
        recipientAddress: draft.recipientAddress,
        recipientEmail: optional(draft.recipientEmail),
        recipientPhone: optional(draft.recipientPhone),
        recipientAbn: optional(draft.recipientAbn),
        siteName: draft.siteName,
        siteAddress: draft.siteAddress,
        defaultDescription: draft.defaultDescription,
        reference: optional(draft.reference),
        correlationKey: correlationKey.current,
      })
      if (!result.ok) {
        setMessage(safeEditError(result.error))
        return
      }
      setMessage('Series defaults saved.')
      window.location.reload()
    })
  }

  return (
    <form className="pbc-form" onSubmit={submit}>
      <ProgressInvoiceSeriesFields
        draft={draft}
        disabled={isPending}
        baseContractDisabled={!canEditBaseContract}
        showAcceptedNumberingBase={false}
        onChange={change}
        idPrefix="series-edit"
        baseContractHelp={canEditBaseContract
          ? 'Base Contract Ex GST is editable until the first Claim exists.'
          : 'Base Contract Ex GST is locked because a Claim exists. Use a Variation or Credit for contract changes.'}
        seriesDetailsCopy="Existing Claim and document snapshots never change when Series defaults are edited."
      />
      <div className="pbc-alert pbc-alert--warning">
        Contract changes after the first Claim must use a Variation or Credit.
      </div>
      <div aria-live="polite">{message}</div>
      <button className="pbc-btn pbc-btn--primary" type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save Series defaults'}
      </button>
    </form>
  )
}
