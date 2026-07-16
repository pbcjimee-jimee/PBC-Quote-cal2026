'use client'

import Decimal from 'decimal.js'
import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { createStandaloneProgressInvoiceFromJobber } from '@/lib/actions/progress-invoice-jobber'
import {
  buildStandaloneDraft,
  formatJobberAddress,
  parseJobberInvoicePreviewResponse,
  parseJobberInvoiceSearchResponse,
  type JobberInvoiceCandidateDto,
  type JobberInvoicePreviewDto,
  type StandaloneEditableDraft,
} from '@/lib/progress-invoices/standalone-import-contract'
import { PROGRESS_INVOICE_TEXT_LIMITS } from '@/lib/progress-invoices/types'
import { SectionLabel } from '@/components/ui/card'
import { Icons } from '@/components/ui/icons'

type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'ready'; candidates: readonly JobberInvoiceCandidateDto[] }
  | { status: 'empty' }
  | { status: 'error'; message: string }

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; preview: JobberInvoicePreviewDto }
  | { status: 'error'; message: string }

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'error'; message: string }

interface SaveAttempt {
  readonly signature: string
  readonly correlationKey: string
}

const BASE_CONTRACT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/
const EMPTY_DRAFT: StandaloneEditableDraft = {
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

function isValidBaseContract(value: string): boolean {
  if (!BASE_CONTRACT_PATTERN.test(value)) return false
  const amount = new Decimal(value)
  return amount.isFinite() && amount.greaterThan(0) && amount.decimalPlaces() <= 2
}

function safeSaveError(code: string | undefined): string {
  if (code === 'VALIDATION') return 'Check the required series fields and try again.'
  if (code === 'JOBBER_ERROR') return 'Jobber could not be read for this import. Try again.'
  return 'The Progress Invoice series could not be created. Try again.'
}

function editableInput(
  draft: StandaloneEditableDraft,
  field: keyof StandaloneEditableDraft,
  value: string,
): StandaloneEditableDraft {
  return { ...draft, [field]: value }
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

export function StandaloneProgressInvoiceForm() {
  const router = useRouter()
  const saveAttemptRef = useRef<SaveAttempt | null>(null)
  const previewRequestGenerationRef = useRef(0)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' })
  const [previewState, setPreviewState] = useState<PreviewState>({ status: 'idle' })
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })
  const [draft, setDraft] = useState<StandaloneEditableDraft | null>(null)

  async function loadPreview(
    invoiceId: string,
    selectedJobberJobId?: string,
    selectedJobberPropertyId?: string,
  ): Promise<void> {
    const requestGeneration = ++previewRequestGenerationRef.current
    setPreviewState({ status: 'loading' })
    setDraft(null)
    setSaveState({ status: 'idle' })
    const params = new URLSearchParams()
    if (selectedJobberJobId) params.set('selectedJobberJobId', selectedJobberJobId)
    if (selectedJobberPropertyId) {
      params.set('selectedJobberPropertyId', selectedJobberPropertyId)
    }
    const query = params.toString()

    try {
      const response = await fetch(
        `/api/jobber/progress-invoices/invoices/${encodeURIComponent(invoiceId)}${query ? `?${query}` : ''}`,
        { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } },
      )
      const body = await response.json()
      if (requestGeneration !== previewRequestGenerationRef.current) return
      const parsed = parseJobberInvoicePreviewResponse(body)
      if (!parsed.ok) {
        setPreviewState({ status: 'error', message: parsed.error })
        return
      }
      setPreviewState({ status: 'ready', preview: parsed.data })
      if (!parsed.data.selectionRequired.job && !parsed.data.selectionRequired.property) {
        setDraft(buildStandaloneDraft(parsed.data))
      }
    } catch {
      if (requestGeneration !== previewRequestGenerationRef.current) return
      setPreviewState({
        status: 'error',
        message: 'The Jobber invoice preview could not be loaded. Try again.',
      })
    }
  }

  async function searchInvoices(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const term = invoiceNumber.trim()
    if (!term) {
      setSearchState({ status: 'error', message: 'Enter a Jobber Invoice Number.' })
      return
    }

    previewRequestGenerationRef.current += 1
    setSearchState({ status: 'searching' })
    setSelectedInvoiceId(null)
    setPreviewState({ status: 'idle' })
    setDraft(null)
    setSaveState({ status: 'idle' })
    saveAttemptRef.current = null

    try {
      const response = await fetch(
        `/api/jobber/progress-invoices/invoices/search?term=${encodeURIComponent(term)}`,
        { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } },
      )
      const parsed = parseJobberInvoiceSearchResponse(await response.json())
      if (!parsed.ok) {
        setSearchState({ status: 'error', message: parsed.error })
        return
      }
      setSearchState(parsed.data.invoices.length === 0
        ? { status: 'empty' }
        : { status: 'ready', candidates: parsed.data.invoices })
    } catch {
      setSearchState({
        status: 'error',
        message: 'The Jobber invoice search could not be completed. Try again.',
      })
    }
  }

  function selectInvoice(candidate: JobberInvoiceCandidateDto): void {
    if (selectedInvoiceId !== candidate.id) saveAttemptRef.current = null
    setSelectedInvoiceId(candidate.id)
    setSaveState({ status: 'idle' })
    void loadPreview(candidate.id)
  }

  function changeDraft(field: keyof StandaloneEditableDraft, value: string): void {
    setDraft((current) => current ? editableInput(current, field, value) : current)
    setSaveState({ status: 'idle' })
  }

  async function saveSeries(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (previewState.status !== 'ready' || !draft) return
    const requiredValues = [
      draft.recipientName,
      draft.recipientAddress,
      draft.siteName,
      draft.siteAddress,
      draft.defaultDescription,
    ]
    if (requiredValues.some((value) => !value.trim()) || !isValidBaseContract(draft.baseContractExGst)) {
      setSaveState({
        status: 'error',
        message: 'Complete the required fields and enter a positive base contract with up to two decimals.',
      })
      return
    }

    const preview = previewState.preview
    const command = {
      selectedJobberInvoiceId: preview.invoiceId,
      ...(preview.selectedJobberJobId
        ? { selectedJobberJobId: preview.selectedJobberJobId }
        : {}),
      ...(preview.selectedJobberPropertyId
        ? { selectedJobberPropertyId: preview.selectedJobberPropertyId }
        : {}),
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
    if (!saveAttemptRef.current || saveAttemptRef.current.signature !== signature) {
      saveAttemptRef.current = { signature, correlationKey: crypto.randomUUID() }
    }

    setSaveState({ status: 'saving' })
    let result: Awaited<ReturnType<typeof createStandaloneProgressInvoiceFromJobber>>
    try {
      result = await createStandaloneProgressInvoiceFromJobber({
        ...command,
        correlationKey: saveAttemptRef.current.correlationKey,
      })
    } catch {
      setSaveState({
        status: 'error',
        message: 'The Progress Invoice series could not be created. Try again.',
      })
      return
    }
    if (!result.ok) {
      setSaveState({ status: 'error', message: safeSaveError(result.code) })
      return
    }

    saveAttemptRef.current = null
    router.push('/progress-invoices')
    router.refresh()
  }

  const readyPreview = previewState.status === 'ready' ? previewState.preview : null
  const formDraft = draft ?? EMPTY_DRAFT
  const formDisabled = draft === null

  return (
    <section className="pbc-card pbc-card--pad pbc-progress-standalone">
      <SectionLabel icon={Icons.progressInvoice({ size: 16 })}>Standalone</SectionLabel>
      <p className="pbc-progress-create-copy">
        Find an existing Jobber invoice, review its client and site details, then create a local Progress Invoice series.
      </p>

      <form
        className="pbc-progress-search-form"
        aria-label="Find a Jobber invoice"
        onSubmit={searchInvoices}
      >
        <label className="pbc-field" htmlFor="jobber-invoice-number">
          <span className="pbc-field__label">Jobber Invoice Number</span>
          <input
            id="jobber-invoice-number"
            className="pbc-input"
            name="jobberInvoiceNumber"
            value={invoiceNumber}
            maxLength={100}
            autoComplete="off"
            required
            onChange={(event) => setInvoiceNumber(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="pbc-btn pbc-btn--primary"
          disabled={searchState.status === 'searching'}
        >
          {searchState.status === 'searching' ? 'Searching…' : 'Fetch invoice'}
        </button>
      </form>

      <div aria-live="polite">
        {searchState.status === 'ready' ? (
          <InvoiceCandidates
            candidates={searchState.candidates}
            selectedInvoiceId={selectedInvoiceId}
            onSelect={selectInvoice}
          />
        ) : null}
        {searchState.status === 'empty' ? (
          <div className="pbc-empty pbc-progress-search-message">
            No Jobber invoices matched that number.
          </div>
        ) : null}
        {searchState.status === 'error' ? (
          <div className="pbc-alert pbc-alert--danger" role="alert">{searchState.message}</div>
        ) : null}
      </div>

      {previewState.status === 'loading' ? (
        <div className="pbc-progress-preview-status" role="status">
          Loading Jobber invoice preview…
        </div>
      ) : null}
      {previewState.status === 'error' ? (
        <div className="pbc-alert pbc-alert--danger" role="alert">
          {previewState.message}
        </div>
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

      <form
        className="pbc-progress-series-form"
        aria-label="Create standalone Progress Invoice series"
        onSubmit={saveSeries}
      >
          <div className="pbc-formgroup">
            <div className="pbc-panelhead">
              <div className="pbc-panelhead__copy">
                <h3 className="pbc-paneltitle">Recipient</h3>
                <p className="pbc-panelsub">Editable local snapshot for the Tax Invoice recipient.</p>
              </div>
            </div>
            <div className="pbc-progress-form-grid">
              <label className="pbc-field">
                <span className="pbc-field__label">Recipient name</span>
                <input
                  className="pbc-input"
                  name="recipientName"
                  value={formDraft.recipientName}
                  maxLength={PROGRESS_INVOICE_TEXT_LIMITS.recipientName}
                  disabled={formDisabled}
                  required
                  onChange={(event) => changeDraft('recipientName', event.target.value)}
                />
              </label>
              <label className="pbc-field">
                <span className="pbc-field__label">Company</span>
                <input
                  className="pbc-input"
                  name="recipientCompany"
                  value={formDraft.recipientCompany}
                  maxLength={PROGRESS_INVOICE_TEXT_LIMITS.recipientCompany}
                  disabled={formDisabled}
                  onChange={(event) => changeDraft('recipientCompany', event.target.value)}
                />
              </label>
              <label className="pbc-field pbc-progress-form-grid__wide">
                <span className="pbc-field__label">Billing address</span>
                <textarea
                  className="pbc-textarea"
                  name="recipientAddress"
                  value={formDraft.recipientAddress}
                  maxLength={PROGRESS_INVOICE_TEXT_LIMITS.address}
                  rows={2}
                  disabled={formDisabled}
                  required
                  onChange={(event) => changeDraft('recipientAddress', event.target.value)}
                />
              </label>
              <label className="pbc-field">
                <span className="pbc-field__label">Email</span>
                <input
                  className="pbc-input"
                  name="recipientEmail"
                  type="email"
                  value={formDraft.recipientEmail}
                  maxLength={PROGRESS_INVOICE_TEXT_LIMITS.email}
                  disabled={formDisabled}
                  onChange={(event) => changeDraft('recipientEmail', event.target.value)}
                />
              </label>
              <label className="pbc-field">
                <span className="pbc-field__label">Phone</span>
                <input
                  className="pbc-input"
                  name="recipientPhone"
                  type="tel"
                  value={formDraft.recipientPhone}
                  maxLength={PROGRESS_INVOICE_TEXT_LIMITS.phone}
                  disabled={formDisabled}
                  onChange={(event) => changeDraft('recipientPhone', event.target.value)}
                />
              </label>
              <label className="pbc-field">
                <span className="pbc-field__label">Recipient ABN</span>
                <input
                  className="pbc-input"
                  name="recipientAbn"
                  value={formDraft.recipientAbn}
                  maxLength={PROGRESS_INVOICE_TEXT_LIMITS.abn}
                  disabled={formDisabled}
                  onChange={(event) => changeDraft('recipientAbn', event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="pbc-formgroup">
            <div className="pbc-panelhead">
              <div className="pbc-panelhead__copy">
                <h3 className="pbc-paneltitle">Site</h3>
                <p className="pbc-panelsub">Editable local snapshot for the construction site.</p>
              </div>
            </div>
            <div className="pbc-progress-form-grid">
              <label className="pbc-field">
                <span className="pbc-field__label">Site name</span>
                <input
                  className="pbc-input"
                  name="siteName"
                  value={formDraft.siteName}
                  maxLength={PROGRESS_INVOICE_TEXT_LIMITS.siteName}
                  disabled={formDisabled}
                  required
                  onChange={(event) => changeDraft('siteName', event.target.value)}
                />
              </label>
              <label className="pbc-field pbc-progress-form-grid__wide">
                <span className="pbc-field__label">Site address</span>
                <textarea
                  className="pbc-textarea"
                  name="siteAddress"
                  value={formDraft.siteAddress}
                  maxLength={PROGRESS_INVOICE_TEXT_LIMITS.siteAddress}
                  rows={2}
                  disabled={formDisabled}
                  required
                  onChange={(event) => changeDraft('siteAddress', event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="pbc-formgroup">
            <div className="pbc-panelhead">
              <div className="pbc-panelhead__copy">
                <h3 className="pbc-paneltitle">Series details</h3>
                <p className="pbc-panelsub">These values stay in PBC after the one-time import.</p>
              </div>
            </div>
            <div className="pbc-progress-form-grid">
              <label className="pbc-field">
                <span className="pbc-field__label">Base contract Ex GST</span>
                <input
                  className="pbc-input mono"
                  name="baseContractExGst"
                  value={formDraft.baseContractExGst}
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={formDisabled}
                  required
                  aria-describedby="base-contract-help"
                  onChange={(event) => changeDraft('baseContractExGst', event.target.value)}
                />
                <span id="base-contract-help" className="pbc-field__hint">
                  Enter the original contract amount, not the adjusted Jobber subtotal.
                </span>
              </label>
              <label className="pbc-field">
                <span className="pbc-field__label">Reference</span>
                <input
                  className="pbc-input"
                  name="reference"
                  value={formDraft.reference}
                  maxLength={PROGRESS_INVOICE_TEXT_LIMITS.reference}
                  disabled={formDisabled}
                  onChange={(event) => changeDraft('reference', event.target.value)}
                />
              </label>
              <label className="pbc-field pbc-progress-form-grid__wide">
                <span className="pbc-field__label">Default description</span>
                <textarea
                  className="pbc-textarea"
                  name="defaultDescription"
                  value={formDraft.defaultDescription}
                  maxLength={PROGRESS_INVOICE_TEXT_LIMITS.description}
                  rows={3}
                  disabled={formDisabled}
                  required
                  onChange={(event) => changeDraft('defaultDescription', event.target.value)}
                />
              </label>
            </div>
          </div>

          {saveState.status === 'error' ? (
            <div className="pbc-alert pbc-alert--danger" role="alert">{saveState.message}</div>
          ) : null}
          <div className="pbc-progress-series-form__actions">
            <button
              type="submit"
              className="pbc-btn pbc-btn--primary"
              disabled={formDisabled || saveState.status === 'saving'}
            >
              {saveState.status === 'saving'
                ? 'Creating Progress Invoice series…'
                : 'Create Progress Invoice series'}
            </button>
          </div>
      </form>
    </section>
  )
}
