import type {
  JobberQuoteDraft,
  JobberQuoteDraftExpense,
  JobberQuoteDraftJobExpenses,
  JobberQuoteDraftLineItem,
} from '@/lib/jobber/mapper'
import type { JobberSnapshotChangeStatus } from '@/lib/jobber/snapshot-diff'
import type { JobberSnapshotChangeSummaryItem } from '@/lib/dev-data'
import { formatJobberRefreshTime } from '@/components/quote-detail/jobber-refresh-time'

interface CustomerPanelProps {
  customerName: string
  customerAddress: string
  jobberLookupType: 'quote' | 'job'
  jobberQuoteId: string
  workType: string
  customerType: string
  onCustomerNameChange: (value: string) => void
  onCustomerAddressChange: (value: string) => void
  onJobberLookupTypeChange: (value: 'quote' | 'job') => void
  onJobberQuoteIdChange: (value: string) => void
  onFetchJobberQuote: () => void
  onApplyJobberRefreshChanges?: () => void
  onKeepCurrentJobberQuote?: () => void
  onWorkTypeChange: (value: string) => void
  isFetchingJobberQuote: boolean
  jobberFetchError: string | null
  jobberQuoteDraft: JobberQuoteDraft | null
  jobberActionMode?: 'fetch' | 'refresh'
  jobberRefreshPreview?: JobberRefreshPreview | null
}

export interface JobberRefreshPreview {
  status: JobberSnapshotChangeStatus
  summary: JobberSnapshotChangeSummaryItem[]
  refreshedAt: string
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-AU', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date)
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(value)
}

function formatOptionalMoney(value: number | null): string {
  return typeof value === 'number' ? formatMoney(value) : '-'
}

function formatCategory(value: string): string {
  return value.toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase())
}

function formatStatus(value: string): string {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function ProductServiceRow({ item }: { item: JobberQuoteDraftLineItem }) {
  return (
    <li className="pbc-rowitem">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pbc-titletext">{item.name}</span>
            <span className="pbc-chip">{formatCategory(item.category)}</span>
          </div>
          {item.linkedName && item.linkedName !== item.name ? (
            <p className="pbc-listitem__meta">{item.linkedName}</p>
          ) : null}
          {item.description.trim() ? (
            <p className="pbc-bodytext mt-2 whitespace-pre-line">{item.description}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right text-xs text-[var(--muted)]">
          <div>Qty {item.quantity}</div>
          <div className="pbc-moneytext">{formatMoney(item.totalPrice)}</div>
        </div>
      </div>
    </li>
  )
}

function ExpenseRow({ expense }: { expense: JobberQuoteDraftExpense }) {
  return (
    <li className="pbc-rowitem">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pbc-titletext">{expense.title}</span>
            <span className="pbc-listitem__meta">{formatDate(expense.date)}</span>
          </div>
          {expense.description.trim() ? (
            <p className="pbc-bodytext mt-2 whitespace-pre-line">{expense.description}</p>
          ) : null}
          <p className="pbc-listitem__meta mt-2">
            Entered by {expense.enteredBy ?? '-'} | Paid by {expense.paidBy ?? '-'}
            {expense.reimbursableTo ? ` | Reimburse to ${expense.reimbursableTo}` : ''}
          </p>
        </div>
        <div className="pbc-moneytext shrink-0 text-right text-xs">
          {formatOptionalMoney(expense.total)}
        </div>
      </div>
    </li>
  )
}

function JobExpensesGroup({ job }: { job: JobberQuoteDraftJobExpenses }) {
  return (
    <div className="pbc-inlinepanel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="pbc-titletext">
            Job #{job.jobNumber}{job.jobTitle ? ` - ${job.jobTitle}` : ''}
          </p>
          <p className="pbc-listitem__meta">{formatStatus(job.jobStatus)}</p>
        </div>
        {job.jobUrl ? (
          <a href={job.jobUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-[var(--primary)] hover:text-[var(--primary-strong)]">
            Open job
          </a>
        ) : null}
      </div>
      {job.expenses.length > 0 ? (
        <ul className="mt-3">
          {job.expenses.map((expense) => (
            <ExpenseRow key={expense.id} expense={expense} />
          ))}
        </ul>
      ) : (
        <p className="pbc-empty mt-3">
          No expenses found for this Jobber job.
        </p>
      )}
    </div>
  )
}

export function JobberQuoteSummary({ quote }: { quote: JobberQuoteDraft }) {
  const sourceLabel = quote.sourceType === 'job' ? 'Jobber job' : 'Jobber quote'

  return (
    <div className="pbc-softpanel">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="pbc-field__label uppercase">{sourceLabel}</p>
          <p className="pbc-moneytext mt-1 text-sm">{quote.quoteNumber}</p>
        </div>
        <div>
          <p className="pbc-field__label uppercase">Created date</p>
          <p className="pbc-titletext mt-1">{formatDate(quote.createdAt)}</p>
        </div>
        <div>
          <p className="pbc-field__label uppercase">Address</p>
          <p className="pbc-titletext mt-1">{quote.customerAddress || '-'}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="pbc-field__label uppercase">Work type</p>
          <p className="pbc-titletext mt-1">{quote.workType || '-'}</p>
        </div>
        <div>
          <p className="pbc-field__label uppercase">Customer type</p>
          <p className="pbc-titletext mt-1">{quote.customerType || '-'}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="pbc-paneltitle">Product / Service</p>
        {quote.productsAndServices.length > 0 ? (
          <ul className="pbc-list pbc-jobber-original-scroll mt-3 overflow-y-auto p-3">
            {quote.productsAndServices.map((item) => (
              <ProductServiceRow key={item.id} item={item} />
            ))}
          </ul>
        ) : (
          <p className="pbc-empty mt-2">
            No product or service line items found.
          </p>
        )}
      </div>

      <div className="mt-4">
        <p className="pbc-paneltitle">Job Expenses</p>
        {quote.jobExpensesError ? (
          <div className="pbc-alert pbc-alert--warning mt-2">
            <p>{quote.jobExpensesError}</p>
            {quote.jobExpensesError.includes('Reconnect Jobber') ? (
              <a href="/api/jobber/connect" className="mt-2 inline-flex font-bold text-amber-800 underline underline-offset-2">
                Reconnect Jobber
              </a>
            ) : null}
          </div>
        ) : null}
        {quote.jobExpenses.length > 0 ? (
          <div className="mt-3 space-y-3">
            {quote.jobExpenses.map((job) => (
              <JobExpensesGroup key={job.jobId} job={job} />
            ))}
          </div>
        ) : (
          <p className="pbc-empty mt-2">
            No converted Jobber job expenses found.
          </p>
        )}
      </div>
    </div>
  )
}

function JobberQuoteSnapshotDetails({ quote }: { quote: JobberQuoteDraft }) {
  const sourceLabel = quote.sourceType === 'job' ? 'Jobber job' : 'Jobber quote'

  return (
    <details className="pbc-jobbersnapshot">
      <summary>
        <span className="pbc-titletext">Original Jobber detail</span>
        <span className="pbc-listitem__meta">
          {sourceLabel} {quote.quoteNumber} | {formatDate(quote.createdAt)} | {quote.customerAddress || '-'}
        </span>
      </summary>
      <div className="mt-3">
        <JobberQuoteSummary quote={quote} />
      </div>
    </details>
  )
}

function JobberRefreshPreviewPanel({
  preview,
  onApply,
  onKeep,
}: {
  preview: JobberRefreshPreview
  onApply?: () => void
  onKeep?: () => void
}) {
  if (preview.status === 'unchanged') {
    return (
      <div className="pbc-alert pbc-alert--success">
        No changes since last refresh - {formatJobberRefreshTime(preview.refreshedAt)}
      </div>
    )
  }

  if (preview.status !== 'changed') {
    return (
      <div className="pbc-alert pbc-alert--warning pbc-alert--stack">
        <span>Jobber refreshed - {formatJobberRefreshTime(preview.refreshedAt)}. Review before applying changes.</span>
        <span className="pbc-alert__actions">
          <button type="button" onClick={onApply} className="pbc-btn pbc-btn--primary pbc-btn--sm">
            Apply Jobber changes
          </button>
          <button type="button" onClick={onKeep} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
            Keep current quote
          </button>
        </span>
      </div>
    )
  }

  return (
    <div className="pbc-alert pbc-alert--warning pbc-alert--stack">
      <div>
        <b>Jobber changes detected</b>
        <ul className="mt-2 space-y-1">
          {preview.summary.map((item, index) => (
            <li key={`${item.field}-${index}`}>
              {item.label}: {item.before} -&gt; {item.after}
            </li>
          ))}
        </ul>
      </div>
      <span className="pbc-alert__actions">
        <button type="button" onClick={onApply} className="pbc-btn pbc-btn--primary pbc-btn--sm">
          Apply Jobber changes
        </button>
        <button type="button" onClick={onKeep} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
          Keep current quote
        </button>
      </span>
    </div>
  )
}

export function CustomerPanel(props: CustomerPanelProps) {
  const lookupLabel = props.jobberLookupType === 'job'
    ? 'Jobber Job Number or URL'
    : 'Jobber Quote Number or URL'
  const actionMode = props.jobberActionMode ?? 'fetch'
  const actionLabel = actionMode === 'refresh' ? 'Refresh from Jobber' : 'Fetch'
  const loadingLabel = actionMode === 'refresh' ? 'Refreshing' : 'Loading'

  return (
    <section className="space-y-4">
      <div className="pbc-panelhead">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Customer Info</h2>
        </div>
      </div>
      <div className="pbc-customerline">
        <label className="pbc-field pbc-customerline__customer">
          <span className="pbc-field__label">Customer</span>
          <input value={props.customerName} onChange={(event) => props.onCustomerNameChange(event.target.value)} className="pbc-input" />
        </label>
        <label className="pbc-field pbc-customerline__lookup">
          <span className="pbc-field__label">{lookupLabel}</span>
          <input value={props.jobberQuoteId} onChange={(event) => props.onJobberQuoteIdChange(event.target.value)} className="pbc-input" />
        </label>
        <div className="pbc-toggle pbc-customerline__mode" role="group" aria-label="Jobber lookup type">
          {(['quote', 'job'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => props.onJobberLookupTypeChange(type)}
              className={props.jobberLookupType === type ? 'is-on' : ''}
            >
              {type === 'quote' ? 'Quote' : 'Job'}
            </button>
          ))}
        </div>
        <button type="button" onClick={props.onFetchJobberQuote} disabled={props.isFetchingJobberQuote} className="pbc-btn pbc-btn--ghost pbc-customerline__action">
          {props.isFetchingJobberQuote ? loadingLabel : actionLabel}
        </button>
        {actionMode === 'refresh' ? (
          <span className="pbc-field__hint pbc-customerline__hint">
            Preview Jobber changes before applying them to this saved quote.
          </span>
        ) : null}
        {props.jobberFetchError ? (
          <span className="pbc-alert pbc-alert--danger pbc-customerline__error">
            {props.jobberFetchError}
            {props.jobberFetchError.includes('Reconnect Jobber') ? (
              <a href="/api/jobber/connect" className="ml-2 font-bold text-red-700 underline underline-offset-2">
                Reconnect Jobber
              </a>
            ) : null}
          </span>
        ) : null}
      </div>
      <label className="pbc-field">
        <span className="pbc-field__label">Address</span>
        <input value={props.customerAddress} onChange={(event) => props.onCustomerAddressChange(event.target.value)} className="pbc-input" />
      </label>
      {props.jobberRefreshPreview ? (
        <JobberRefreshPreviewPanel
          preview={props.jobberRefreshPreview}
          onApply={props.onApplyJobberRefreshChanges}
          onKeep={props.onKeepCurrentJobberQuote}
        />
      ) : null}
      {props.jobberQuoteDraft ? <JobberQuoteSnapshotDetails quote={props.jobberQuoteDraft} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="pbc-field">
          <span className="pbc-field__label">Work Type</span>
          <input value={props.workType} onChange={(event) => props.onWorkTypeChange(event.target.value)} className="pbc-input" placeholder="Interior, exterior..." />
        </label>
        <label className="pbc-field">
          <span className="pbc-field__label">Customer Type</span>
          <input value={props.customerType} readOnly className="pbc-input" />
        </label>
      </div>
    </section>
  )
}
