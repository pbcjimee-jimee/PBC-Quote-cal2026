'use client'

import Decimal from 'decimal.js'
import { useRef, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { createStandaloneProgressInvoiceFromJobber } from '@/lib/actions/progress-invoice-jobber'
import {
  buildStandaloneDraft,
  formatJobberAddress,
  parseJobberInvoicePreviewResponse,
  parseJobberInvoiceSearchResponse,
  type JobberInvoiceCandidateDto,
  type JobberInvoicePreviewDto,
} from '@/lib/progress-invoices/standalone-import-contract'
import {
  isValidProgressInvoiceMoney,
  ProgressInvoiceSeriesFields,
  type ProgressInvoiceSeriesDraft,
  type ProgressInvoiceSeriesField,
  type ProgressInvoiceSeriesFieldErrors,
} from './progress-invoice-series-fields'
import type {
  ProgressInvoiceSaveAttempt,
  ProgressInvoiceSaveState,
} from './manual-progress-invoice-form'
import { SectionLabel } from '@/components/ui/card'
import { Icons } from '@/components/ui/icons'

export type JobberSearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'ready'; candidates: readonly JobberInvoiceCandidateDto[] }
  | { status: 'empty' }
  | { status: 'error'; message: string }

export type JobberPreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; preview: JobberInvoicePreviewDto }
  | { status: 'error'; message: string }

export interface JobberProgressInvoiceViewModel {
  readonly invoiceNumber: string
  readonly selectedInvoiceId: string | null
  readonly searchState: JobberSearchState
  readonly previewState: JobberPreviewState
  readonly draft: ProgressInvoiceSeriesDraft | null
  readonly fieldErrors: ProgressInvoiceSeriesFieldErrors
  readonly saveState: ProgressInvoiceSaveState
  readonly saveAttempt: ProgressInvoiceSaveAttempt | null
  readonly searchRequestGeneration: number
  readonly previewRequestGeneration: number
  readonly saveRequestGeneration: number
}

export type JobberProgressInvoiceEvent =
  | { type: 'invoiceNumberChanged'; value: string }
  | { type: 'searchValidationFailed'; message: string }
  | { type: 'searchStarted'; requestGeneration: number }
  | {
      type: 'searchFinished'
      requestGeneration: number
      state: Exclude<JobberSearchState, { status: 'searching' }>
    }
  | {
      type: 'invoiceSelected'
      invoiceId: string
      resetSaveAttempt: boolean
    }
  | { type: 'previewStarted'; requestGeneration: number }
  | {
      type: 'previewFinished'
      requestGeneration: number
      state: Exclude<JobberPreviewState, { status: 'loading' }>
      draft: ProgressInvoiceSeriesDraft | null
    }
  | { type: 'draftChanged'; field: ProgressInvoiceSeriesField; value: string }
  | { type: 'validationFailed'; errors: ProgressInvoiceSeriesFieldErrors }
  | {
      type: 'saveStarted'
      requestGeneration: number
      attempt: ProgressInvoiceSaveAttempt
    }
  | { type: 'saveFailed'; requestGeneration: number; message: string }
  | { type: 'saveCancelled'; requestGeneration: number; message: string }
  | { type: 'saveSucceeded'; requestGeneration: number }

const EMPTY_DRAFT: ProgressInvoiceSeriesDraft = {
  acceptedNumberingBase: '',
  recipientName: '',
  recipientCompany: '',
  recipientAddress: '',
  recipientEmail: '',
  recipientPhone: '',
  recipientAbn: '',
  siteName: '',
  siteAddress: '',
  defaultDescription: '',
  reference: '',
  baseContractExGst: '',
}

export const INITIAL_JOBBER_PROGRESS_INVOICE_VIEW_MODEL: JobberProgressInvoiceViewModel = {
  invoiceNumber: '',
  selectedInvoiceId: null,
  searchState: { status: 'idle' },
  previewState: { status: 'idle' },
  draft: null,
  fieldErrors: {},
  saveState: { status: 'idle' },
  saveAttempt: null,
  searchRequestGeneration: 0,
  previewRequestGeneration: 0,
  saveRequestGeneration: 0,
}

export function jobberProgressInvoiceReducer(
  state: JobberProgressInvoiceViewModel,
  event: JobberProgressInvoiceEvent,
): JobberProgressInvoiceViewModel {
  switch (event.type) {
    case 'invoiceNumberChanged':
      return { ...state, invoiceNumber: event.value }
    case 'searchValidationFailed':
      return { ...state, searchState: { status: 'error', message: event.message } }
    case 'searchStarted':
      return {
        ...state,
        selectedInvoiceId: null,
        searchState: { status: 'searching' },
        previewState: { status: 'idle' },
        draft: null,
        fieldErrors: {},
        saveState: { status: 'idle' },
        saveAttempt: null,
        searchRequestGeneration: event.requestGeneration,
        previewRequestGeneration: state.previewRequestGeneration + 1,
      }
    case 'searchFinished':
      return event.requestGeneration === state.searchRequestGeneration
        ? { ...state, searchState: event.state }
        : state
    case 'invoiceSelected':
      return {
        ...state,
        selectedInvoiceId: event.invoiceId,
        saveState: { status: 'idle' },
        saveAttempt: event.resetSaveAttempt ? null : state.saveAttempt,
      }
    case 'previewStarted':
      return {
        ...state,
        previewState: { status: 'loading' },
        draft: null,
        fieldErrors: {},
        saveState: { status: 'idle' },
        previewRequestGeneration: event.requestGeneration,
      }
    case 'previewFinished':
      return event.requestGeneration === state.previewRequestGeneration
        ? { ...state, previewState: event.state, draft: event.draft }
        : state
    case 'draftChanged':
      if (!state.draft) return state
      {
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
          message: 'Complete the required fields and enter a positive base contract with up to two decimals.',
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
    case 'saveCancelled':
      return state.saveState.status === 'saving'
        ? {
            ...state,
            saveState: { status: 'error', message: event.message },
            saveRequestGeneration: event.requestGeneration,
          }
        : state
    case 'saveSucceeded':
      return event.requestGeneration === state.saveRequestGeneration
        ? { ...state, saveState: { status: 'idle' }, saveAttempt: null }
        : state
  }
}

function formatMoney(value: string): string {
  const [whole, fraction] = new Decimal(value).toFixed(2).split('.')
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `$${groupedWhole}.${fraction}`
}

function statusLabel(status: string): string {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function optionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function safeSaveError(code: string | undefined): string {
  if (code === 'VALIDATION') return 'Check the required series fields and try again.'
  if (code === 'JOBBER_ERROR') return 'Jobber could not be read for this import. Try again.'
  return 'The Progress Invoice series could not be created. Try again.'
}

function fromStandaloneDraft(
  draft: ReturnType<typeof buildStandaloneDraft>,
): ProgressInvoiceSeriesDraft {
  return { acceptedNumberingBase: '', ...draft }
}

function InvoiceCandidates({
  candidates,
  selectedInvoiceId,
  onSelect,
}: {
  candidates: readonly JobberInvoiceCandidateDto[]
  selectedInvoiceId: string | null
  onSelect: (candidate: JobberInvoiceCandidateDto) => void
}) {
  return (
    <div className="pbc-progress-candidates" aria-label="Jobber invoice search results">
      {candidates.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          className="pbc-progress-candidate"
          aria-pressed={selectedInvoiceId === candidate.id}
          onClick={() => onSelect(candidate)}
        >
          <span>Invoice {candidate.invoiceNumber}</span>
          <small>{statusLabel(candidate.normalizedStatus)}</small>
        </button>
      ))}
    </div>
  )
}

function ComparisonPanel({ preview }: { preview: JobberInvoicePreviewDto }) {
  return (
    <div className="pbc-softpanel pbc-progress-comparison" aria-label="Jobber invoice comparison">
      <div className="pbc-panelhead">
        <div className="pbc-panelhead__copy">
          <h3 className="pbc-paneltitle">Jobber invoice {preview.invoiceNumber}</h3>
          <p className="pbc-panelsub">Status: {statusLabel(preview.normalizedStatus)}</p>
        </div>
        <span className="pbc-progress-badge pbc-progress-badge--muted">
          Imported once on save
        </span>
      </div>
      {preview.amounts ? (
        <dl className="pbc-progress-comparison-grid">
          <div><dt>Subtotal</dt><dd>{formatMoney(preview.amounts.subtotal)}</dd></div>
          <div><dt>GST</dt><dd>{formatMoney(preview.amounts.taxAmount)}</dd></div>
          <div><dt>Total</dt><dd>{formatMoney(preview.amounts.total)}</dd></div>
          <div><dt>Balance</dt><dd>{formatMoney(preview.amounts.invoiceBalance)}</dd></div>
        </dl>
      ) : (
        <p className="pbc-panelsub">Jobber amount details are unavailable for this invoice.</p>
      )}
    </div>
  )
}

interface StandaloneProgressInvoiceFormProps {
  viewModel: JobberProgressInvoiceViewModel
  dispatch: (event: JobberProgressInvoiceEvent) => void
  isSaveRequestCurrent: (requestGeneration: number) => boolean
}

export function StandaloneProgressInvoiceForm({
  viewModel,
  dispatch,
  isSaveRequestCurrent,
}: StandaloneProgressInvoiceFormProps) {
  const router = useRouter()
  const searchGenerationRef = useRef(viewModel.searchRequestGeneration)
  const previewGenerationRef = useRef(viewModel.previewRequestGeneration)
  const saveGenerationRef = useRef(viewModel.saveRequestGeneration)

  async function loadPreview(
    invoiceId: string,
    selectedJobberJobId?: string,
    selectedJobberPropertyId?: string,
  ): Promise<void> {
    const requestGeneration = ++previewGenerationRef.current
    dispatch({ type: 'previewStarted', requestGeneration })
    const params = new URLSearchParams()
    if (selectedJobberJobId) params.set('selectedJobberJobId', selectedJobberJobId)
    if (selectedJobberPropertyId) params.set('selectedJobberPropertyId', selectedJobberPropertyId)
    const query = params.toString()

    try {
      const response = await fetch(
        `/api/jobber/progress-invoices/invoices/${encodeURIComponent(invoiceId)}${query ? `?${query}` : ''}`,
        { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } },
      )
      const parsed = parseJobberInvoicePreviewResponse(await response.json())
      if (!parsed.ok) {
        dispatch({
          type: 'previewFinished',
          requestGeneration,
          state: { status: 'error', message: parsed.error },
          draft: null,
        })
        return
      }
      const draft = !parsed.data.selectionRequired.job && !parsed.data.selectionRequired.property
        ? fromStandaloneDraft(buildStandaloneDraft(parsed.data))
        : null
      dispatch({
        type: 'previewFinished',
        requestGeneration,
        state: { status: 'ready', preview: parsed.data },
        draft,
      })
    } catch {
      dispatch({
        type: 'previewFinished',
        requestGeneration,
        state: {
          status: 'error',
          message: 'The Jobber invoice preview could not be loaded. Try again.',
        },
        draft: null,
      })
    }
  }

  async function searchInvoices(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const term = viewModel.invoiceNumber.trim()
    if (!term) {
      dispatch({
        type: 'searchValidationFailed',
        message: 'Enter a Jobber Invoice Number.',
      })
      return
    }

    const requestGeneration = ++searchGenerationRef.current
    previewGenerationRef.current += 1
    dispatch({ type: 'searchStarted', requestGeneration })
    try {
      const response = await fetch(
        `/api/jobber/progress-invoices/invoices/search?term=${encodeURIComponent(term)}`,
        { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } },
      )
      const parsed = parseJobberInvoiceSearchResponse(await response.json())
      dispatch({
        type: 'searchFinished',
        requestGeneration,
        state: !parsed.ok
          ? { status: 'error', message: parsed.error }
          : parsed.data.invoices.length === 0
            ? { status: 'empty' }
            : { status: 'ready', candidates: parsed.data.invoices },
      })
    } catch {
      dispatch({
        type: 'searchFinished',
        requestGeneration,
        state: {
          status: 'error',
          message: 'The Jobber invoice search could not be completed. Try again.',
        },
      })
    }
  }

  function selectInvoice(candidate: JobberInvoiceCandidateDto): void {
    dispatch({
      type: 'invoiceSelected',
      invoiceId: candidate.id,
      resetSaveAttempt: viewModel.selectedInvoiceId !== candidate.id,
    })
    void loadPreview(candidate.id)
  }

  async function saveSeries(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (viewModel.previewState.status !== 'ready' || !viewModel.draft) return
    const draft = viewModel.draft
    const fieldErrors: ProgressInvoiceSeriesFieldErrors = {}
    for (const field of [
      'recipientName',
      'recipientAddress',
      'siteName',
      'siteAddress',
      'defaultDescription',
    ] as const) {
      if (!draft[field].trim()) fieldErrors[field] = 'This field is required.'
    }
    if (!isValidProgressInvoiceMoney(draft.baseContractExGst)) {
      fieldErrors.baseContractExGst = 'Enter a positive amount with up to two decimals.'
    }
    if (Object.keys(fieldErrors).length > 0) {
      dispatch({ type: 'validationFailed', errors: fieldErrors })
      return
    }

    const preview = viewModel.previewState.preview
    const command = {
      selectedJobberInvoiceId: preview.invoiceId,
      selectedJobberJobId: preview.selectedJobberJobId ?? undefined,
      selectedJobberPropertyId: preview.selectedJobberPropertyId ?? undefined,
      baseContractExGst: draft.baseContractExGst,
      gstRate: '0.10' as const,
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
    const requestGeneration = ++saveGenerationRef.current
    dispatch({ type: 'saveStarted', requestGeneration, attempt })

    let result: Awaited<ReturnType<typeof createStandaloneProgressInvoiceFromJobber>>
    try {
      result = await createStandaloneProgressInvoiceFromJobber({
        selectedJobberInvoiceId: command.selectedJobberInvoiceId,
        ...(command.selectedJobberJobId
          ? { selectedJobberJobId: command.selectedJobberJobId }
          : {}),
        ...(command.selectedJobberPropertyId
          ? { selectedJobberPropertyId: command.selectedJobberPropertyId }
          : {}),
        baseContractExGst: command.baseContractExGst,
        gstRate: command.gstRate,
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
        message: safeSaveError(result.code),
      })
      return
    }

    if (!isSaveRequestCurrent(requestGeneration)) return

    dispatch({ type: 'saveSucceeded', requestGeneration })
    router.push('/progress-invoices')
    router.refresh()
  }

  const readyPreview = viewModel.previewState.status === 'ready'
    ? viewModel.previewState.preview
    : null
  const formDraft = viewModel.draft ?? EMPTY_DRAFT
  const formDisabled = viewModel.draft === null

  return (
    <div className="pbc-card pbc-card--pad pbc-progress-standalone">
      <SectionLabel icon={Icons.progressInvoice({ size: 16 })}>Import from Jobber</SectionLabel>
      <p className="pbc-progress-create-copy">
        Find an existing Jobber invoice, review its client and site details, then create a local Progress Invoice series.
      </p>
      <form className="pbc-progress-search-form" aria-label="Find a Jobber invoice" onSubmit={searchInvoices}>
        <label className="pbc-field" htmlFor="jobber-invoice-number">
          <span className="pbc-field__label">Jobber Invoice Number</span>
          <input
            id="jobber-invoice-number"
            className="pbc-input"
            name="jobberInvoiceNumber"
            value={viewModel.invoiceNumber}
            maxLength={100}
            autoComplete="off"
            required
            onChange={(event) => dispatch({ type: 'invoiceNumberChanged', value: event.target.value })}
          />
        </label>
        <button type="submit" className="pbc-btn pbc-btn--primary" disabled={viewModel.searchState.status === 'searching'}>
          {viewModel.searchState.status === 'searching' ? 'Searching…' : 'Fetch invoice'}
        </button>
      </form>

      <div aria-live="polite">
        {viewModel.searchState.status === 'ready' ? (
          <InvoiceCandidates
            candidates={viewModel.searchState.candidates}
            selectedInvoiceId={viewModel.selectedInvoiceId}
            onSelect={selectInvoice}
          />
        ) : null}
        {viewModel.searchState.status === 'empty' ? (
          <div className="pbc-empty pbc-progress-search-message">No Jobber invoices matched that number.</div>
        ) : null}
        {viewModel.searchState.status === 'error' ? (
          <div className="pbc-alert pbc-alert--danger" role="alert">{viewModel.searchState.message}</div>
        ) : null}
      </div>

      {viewModel.previewState.status === 'loading' ? (
        <div className="pbc-progress-preview-status" role="status">Loading Jobber invoice preview…</div>
      ) : null}
      {viewModel.previewState.status === 'error' ? (
        <div className="pbc-alert pbc-alert--danger" role="alert">{viewModel.previewState.message}</div>
      ) : null}

      <p className="pbc-alert pbc-alert--warning pbc-progress-comparison__notice">
        <strong>Jobber amounts are for comparison only.</strong>{' '}
        Enter the original base contract Ex GST after selecting the invoice.
      </p>

      {readyPreview ? (
        <>
          {(readyPreview.jobs.length > 1 || readyPreview.properties.length > 1) ? (
            <div className="pbc-progress-selectors" aria-label="Jobber invoice relations">
              {readyPreview.jobs.length > 1 ? (
                <label className="pbc-field">
                  <span className="pbc-field__label">Jobber Job</span>
                  <select
                    className="pbc-statuscontrol"
                    value={readyPreview.selectedJobberJobId ?? ''}
                    onChange={(event) => void loadPreview(
                      readyPreview.invoiceId,
                      event.target.value || undefined,
                      readyPreview.selectedJobberPropertyId ?? undefined,
                    )}
                  >
                    <option value="">Select a Jobber Job</option>
                    {readyPreview.jobs.map((job, index) => (
                      <option key={job.id} value={job.id}>Job {index + 1} · {job.id}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {readyPreview.properties.length > 1 ? (
                <label className="pbc-field">
                  <span className="pbc-field__label">Jobber Property</span>
                  <select
                    className="pbc-statuscontrol"
                    value={readyPreview.selectedJobberPropertyId ?? ''}
                    onChange={(event) => void loadPreview(
                      readyPreview.invoiceId,
                      readyPreview.selectedJobberJobId ?? undefined,
                      event.target.value || undefined,
                    )}
                  >
                    <option value="">Select a Jobber Property</option>
                    {readyPreview.properties.map((property, index) => (
                      <option key={property.id} value={property.id}>
                        {formatJobberAddress(property.address) || `Property ${index + 1} · ${property.id}`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
          {(readyPreview.selectionRequired.job || readyPreview.selectionRequired.property) ? (
            <div className="pbc-alert pbc-alert--warning" role="status">
              Select each required Jobber Job or Property before editing the local series.
            </div>
          ) : null}
          <ComparisonPanel preview={readyPreview} />
        </>
      ) : null}

      <form className="pbc-progress-series-form" aria-label="Create standalone Progress Invoice series" onSubmit={saveSeries}>
        <ProgressInvoiceSeriesFields
          draft={formDraft}
          disabled={formDisabled || viewModel.saveState.status === 'saving'}
          showAcceptedNumberingBase={false}
          errors={viewModel.fieldErrors}
          idPrefix="jobber-progress-invoice"
          baseContractHelp="Enter the original contract amount, not the adjusted Jobber subtotal."
          seriesDetailsCopy="These values stay in PBC after the one-time import."
          onChange={(field, value) => dispatch({ type: 'draftChanged', field, value })}
        />
        {viewModel.saveState.status === 'error' ? (
          <div className="pbc-alert pbc-alert--danger" role="alert">{viewModel.saveState.message}</div>
        ) : null}
        <div className="pbc-progress-series-form__actions">
          <button
            type="submit"
            className="pbc-btn pbc-btn--primary"
            disabled={formDisabled || viewModel.saveState.status === 'saving'}
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
