'use client'

import { useRef, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { createManualProgressInvoiceSeries } from '@/lib/actions/progress-invoice-series'
import {
  isValidProgressInvoiceMoney,
  ProgressInvoiceSeriesFields,
  type ProgressInvoiceSeriesDraft,
  type ProgressInvoiceSeriesField,
  type ProgressInvoiceSeriesFieldErrors,
} from './progress-invoice-series-fields'
import { SectionLabel } from '@/components/ui/card'
import { Icons } from '@/components/ui/icons'

export interface ProgressInvoiceSaveAttempt {
  readonly signature: string
  readonly correlationKey: string
}

export type ProgressInvoiceSaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'error'; message: string }

export interface ManualProgressInvoiceViewModel {
  readonly draft: ProgressInvoiceSeriesDraft
  readonly fieldErrors: ProgressInvoiceSeriesFieldErrors
  readonly saveState: ProgressInvoiceSaveState
  readonly saveAttempt: ProgressInvoiceSaveAttempt | null
  readonly saveRequestGeneration: number
}

export type ManualProgressInvoiceEvent =
  | { type: 'fieldChanged'; field: ProgressInvoiceSeriesField; value: string }
  | { type: 'validationFailed'; errors: ProgressInvoiceSeriesFieldErrors }
  | {
      type: 'saveStarted'
      requestGeneration: number
      attempt: ProgressInvoiceSaveAttempt
    }
  | { type: 'saveFailed'; requestGeneration: number; message: string }
  | { type: 'saveSucceeded'; requestGeneration: number }

export const INITIAL_MANUAL_PROGRESS_INVOICE_VIEW_MODEL: ManualProgressInvoiceViewModel = {
  draft: {
    acceptedNumberingBase: '',
    baseContractExGst: '',
    recipientName: '',
    recipientCompany: '',
    recipientAddress: '',
    recipientEmail: '',
    recipientPhone: '',
    recipientAbn: '',
    siteName: '',
    siteAddress: '',
    defaultDescription: 'Progress painting works',
    reference: '',
  },
  fieldErrors: {},
  saveState: { status: 'idle' },
  saveAttempt: null,
  saveRequestGeneration: 0,
}

export function manualProgressInvoiceReducer(
  state: ManualProgressInvoiceViewModel,
  event: ManualProgressInvoiceEvent,
): ManualProgressInvoiceViewModel {
  switch (event.type) {
    case 'fieldChanged': {
      const fieldErrors = { ...state.fieldErrors }
      delete fieldErrors[event.field]
      return {
        ...state,
        draft: { ...state.draft, [event.field]: event.value },
        fieldErrors,
        saveState: { status: 'idle' },
      }
    }
    case 'validationFailed':
      return {
        ...state,
        fieldErrors: event.errors,
        saveState: {
          status: 'error',
          message: 'Complete the highlighted fields before creating the series.',
        },
      }
    case 'saveStarted':
      return {
        ...state,
        fieldErrors: {},
        saveState: { status: 'saving' },
        saveAttempt: event.attempt,
        saveRequestGeneration: event.requestGeneration,
      }
    case 'saveFailed':
      return event.requestGeneration === state.saveRequestGeneration
        ? { ...state, saveState: { status: 'error', message: event.message } }
        : state
    case 'saveSucceeded':
      return event.requestGeneration === state.saveRequestGeneration
        ? { ...state, saveState: { status: 'idle' }, saveAttempt: null }
        : state
  }
}

function optionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function validateManualDraft(
  draft: ProgressInvoiceSeriesDraft,
): ProgressInvoiceSeriesFieldErrors {
  const errors: ProgressInvoiceSeriesFieldErrors = {}
  for (const field of [
    'acceptedNumberingBase',
    'recipientName',
    'recipientAddress',
    'siteName',
    'siteAddress',
    'defaultDescription',
  ] as const) {
    if (!draft[field].trim()) errors[field] = 'This field is required.'
  }
  if (!isValidProgressInvoiceMoney(draft.baseContractExGst)) {
    errors.baseContractExGst = 'Enter a positive amount with up to two decimals.'
  }
  return errors
}

function manualSaveError(error: string): string {
  if (error === 'PROGRESS_UNIQUE_CONFLICT') {
    return 'That Invoice number base is already used by an active series.'
  }
  return 'The Progress Invoice series could not be created. Try again.'
}

interface ManualProgressInvoiceFormProps {
  viewModel: ManualProgressInvoiceViewModel
  dispatch: (event: ManualProgressInvoiceEvent) => void
  isSaveRequestCurrent: (requestGeneration: number) => boolean
}

export function ManualProgressInvoiceForm({
  viewModel,
  dispatch,
  isSaveRequestCurrent,
}: ManualProgressInvoiceFormProps) {
  const router = useRouter()
  const requestGenerationRef = useRef(viewModel.saveRequestGeneration)

  async function saveSeries(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const errors = validateManualDraft(viewModel.draft)
    if (Object.keys(errors).length > 0) {
      dispatch({ type: 'validationFailed', errors })
      return
    }

    const draft = viewModel.draft
    const command = {
      acceptedNumberingBase: draft.acceptedNumberingBase.trim(),
      baseContractExGst: draft.baseContractExGst,
      recipientName: draft.recipientName.trim(),
      recipientCompany: optionalText(draft.recipientCompany),
      recipientAddress: draft.recipientAddress.trim(),
      recipientEmail: optionalText(draft.recipientEmail),
      recipientPhone: optionalText(draft.recipientPhone),
      recipientAbn: optionalText(draft.recipientAbn),
      siteName: draft.siteName.trim(),
      siteAddress: draft.siteAddress.trim(),
      defaultDescription: draft.defaultDescription.trim(),
      reference: optionalText(draft.reference),
    }
    const signature = JSON.stringify(command)
    const attempt = viewModel.saveAttempt?.signature === signature
      ? viewModel.saveAttempt
      : { signature, correlationKey: crypto.randomUUID() }
    const requestGeneration = ++requestGenerationRef.current
    dispatch({ type: 'saveStarted', requestGeneration, attempt })

    let result: Awaited<ReturnType<typeof createManualProgressInvoiceSeries>>
    try {
      result = await createManualProgressInvoiceSeries({
        acceptedNumberingBase: command.acceptedNumberingBase,
        baseContractExGst: command.baseContractExGst,
        recipientName: command.recipientName,
        recipientCompany: command.recipientCompany,
        recipientAddress: command.recipientAddress,
        recipientEmail: command.recipientEmail,
        recipientPhone: command.recipientPhone,
        recipientAbn: command.recipientAbn,
        siteName: command.siteName,
        siteAddress: command.siteAddress,
        defaultDescription: command.defaultDescription,
        reference: command.reference,
        correlationKey: attempt.correlationKey,
      })
    } catch {
      dispatch({
        type: 'saveFailed',
        requestGeneration,
        message: 'The Progress Invoice series could not be created. Try again.',
      })
      return
    }

    if (!result.ok) {
      dispatch({
        type: 'saveFailed',
        requestGeneration,
        message: manualSaveError(result.error),
      })
      return
    }

    if (!isSaveRequestCurrent(requestGeneration)) return

    dispatch({ type: 'saveSucceeded', requestGeneration })
    router.push('/progress-invoices')
    router.refresh()
  }

  return (
    <div className="pbc-card pbc-card--pad pbc-progress-standalone">
      <SectionLabel icon={Icons.progressInvoice({ size: 16 })}>Create manually</SectionLabel>
      <p className="pbc-progress-create-copy">
        Enter the local recipient, site, contract and Invoice number details.
      </p>
      <form
        className="pbc-progress-series-form"
        aria-label="Create manual Progress Invoice series"
        noValidate
        onSubmit={saveSeries}
      >
        <ProgressInvoiceSeriesFields
          draft={viewModel.draft}
          disabled={viewModel.saveState.status === 'saving'}
          showAcceptedNumberingBase
          errors={viewModel.fieldErrors}
          idPrefix="manual-progress-invoice"
          onChange={(field, value) => dispatch({ type: 'fieldChanged', field, value })}
        />
        {viewModel.saveState.status === 'error' ? (
          <div className="pbc-alert pbc-alert--danger" role="alert">
            {viewModel.saveState.message}
          </div>
        ) : null}
        <div className="pbc-progress-series-form__actions">
          <button
            type="submit"
            className="pbc-btn pbc-btn--primary"
            disabled={viewModel.saveState.status === 'saving'}
          >
            {viewModel.saveState.status === 'saving'
              ? 'Creating Progress Invoice series…'
              : 'Create Progress Invoice series'}
          </button>
        </div>
      </form>
    </div>
  )
}
