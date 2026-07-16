import Decimal from 'decimal.js'

import { IntentLink } from '@/components/navigation/intent-link'
import { Icons } from '@/components/ui/icons'
import type { ActionResult } from '@/lib/actions/types'
import type {
  ProgressInvoiceDashboardDto,
  ProgressInvoiceListInput,
} from '@/lib/progress-invoices/series-service'

export const PROGRESS_INVOICE_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'reconciliation_required', label: 'Reconciliation required' },
  { value: 'void', label: 'Void' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'part_paid', label: 'Part paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'credit_balance', label: 'Credit balance' },
] as const

type DashboardResult = ActionResult<ProgressInvoiceDashboardDto>

interface ProgressInvoiceDashboardProps {
  result: DashboardResult
  filters: ProgressInvoiceListInput
}

function formatMoney(value: string): string {
  const [whole, fraction] = new Decimal(value).toFixed(2).split('.')
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `$${groupedWhole}.${fraction}`
}

function sumMoney(
  data: ProgressInvoiceDashboardDto,
  pick: (item: ProgressInvoiceDashboardDto['items'][number]) => string,
): string {
  return data.items.reduce(
    (total, item) => total.add(pick(item)),
    new Decimal(0),
  ).toFixed(2)
}

function titleCaseStatus(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function sourceLabel(sourceType: ProgressInvoiceDashboardDto['items'][number]['sourceType']): string {
  if (sourceType === 'pbc_quote') return 'PBC Quote'
  if (sourceType === 'jobber_job') return 'Jobber Job'
  return 'Jobber Invoice'
}

function statusTone(status: string): string {
  if (status === 'paid' || status === 'completed') return 'success'
  if (status === 'overdue' || status === 'reconciliation_required') return 'danger'
  if (status === 'part_paid' || status === 'credit_balance') return 'warning'
  return 'muted'
}

function formatJobberFreshness(
  syncedAt: string | null,
  errorCode: string | null,
): string {
  if (errorCode) return 'Jobber sync needs attention'
  if (!syncedAt) return 'Jobber not synced'

  const date = new Date(syncedAt)
  if (Number.isNaN(date.getTime())) return 'Jobber sync date unavailable'
  return `Jobber synced ${new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  }).format(date)}`
}

function buildPageHref(filters: ProgressInvoiceListInput, page: number): string {
  const params = new URLSearchParams()
  if (filters.query) params.set('q', filters.query)
  for (const status of filters.statuses) params.append('status', status)
  if (filters.quoteId) params.set('quoteId', filters.quoteId)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return `/progress-invoices${query ? `?${query}` : ''}`
}

function DashboardFilters({ filters }: { filters: ProgressInvoiceListInput }) {
  return (
    <form action="/progress-invoices" method="get" className="pbc-progress-filters pbc-card pbc-card--pad">
      <label className="pbc-field pbc-progress-filters__search">
        <span className="pbc-field__label">Search series</span>
        <span className="pbc-search !mb-0">
          <span className="pbc-search__icon">{Icons.search({ size: 16 })}</span>
          <input
            className="pbc-search__input"
            type="search"
            name="q"
            maxLength={160}
            defaultValue={filters.query}
            placeholder="Search by builder, recipient, site, quote or Jobber invoice"
          />
        </span>
      </label>

      <label className="pbc-field pbc-progress-filters__status">
        <span className="pbc-field__label">Status</span>
        <select
          className="pbc-statuscontrol"
          name="status"
          defaultValue={filters.statuses[0] ?? ''}
        >
          <option value="">All statuses</option>
          {PROGRESS_INVOICE_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      {filters.quoteId ? <input type="hidden" name="quoteId" value={filters.quoteId} /> : null}

      <div className="pbc-progress-filters__actions">
        <button type="submit" className="pbc-btn pbc-btn--primary">Apply filters</button>
        <IntentLink href="/progress-invoices" className="pbc-btn pbc-btn--ghost">Clear</IntentLink>
      </div>
    </form>
  )
}

function DashboardStats({ data }: { data: ProgressInvoiceDashboardDto }) {
  const adjusted = sumMoney(data, (item) => item.adjustedContractExGst)
  const claimed = sumMoney(data, (item) => item.claimedIncGst)
  const received = sumMoney(data, (item) => item.receivedIncGst)
  const outstanding = sumMoney(data, (item) => item.outstandingReceivable)

  return (
    <div className="pbc-stats" aria-label="Progress invoice totals for the visible page">
      <div className="pbc-stat">
        <span className="pbc-stat__label">Adjusted contract</span>
        <span className="pbc-stat__value mono">{formatMoney(adjusted)}</span>
        <span className="pbc-stat__sub">visible page · ex GST</span>
      </div>
      <div className="pbc-stat">
        <span className="pbc-stat__label">Claimed</span>
        <span className="pbc-stat__value mono">{formatMoney(claimed)}</span>
        <span className="pbc-stat__sub">issued claims · inc GST</span>
      </div>
      <div className="pbc-stat">
        <span className="pbc-stat__label">Received</span>
        <span className="pbc-stat__value mono">{formatMoney(received)}</span>
        <span className="pbc-stat__sub">actual receipts · inc GST</span>
      </div>
      <div className="pbc-stat">
        <span className="pbc-stat__label">Outstanding</span>
        <span className="pbc-stat__value mono">{formatMoney(outstanding)}</span>
        <span className="pbc-stat__sub">receivable · inc GST</span>
      </div>
    </div>
  )
}

function SeriesCards({ data }: { data: ProgressInvoiceDashboardDto }) {
  return (
    <div className="pbc-progress-series-grid">
      {data.items.map((item) => (
        <article key={item.id} className="pbc-card pbc-card--pad pbc-progress-series">
          <div className="pbc-progress-series__head">
            <div>
              <span className="pbc-progress-series__eyebrow">{sourceLabel(item.sourceType)}</span>
              <h2>{item.recipientCompany || item.recipientName}</h2>
              {item.recipientCompany ? <p>{item.recipientName}</p> : null}
            </div>
            <span className={`pbc-progress-badge pbc-progress-badge--${statusTone(item.status)}`}>
              {titleCaseStatus(item.status)}
            </span>
          </div>

          <p className="pbc-progress-series__site">{Icons.pin({ size: 15 })}{item.siteName}</p>

          <dl className="pbc-progress-series__money">
            <div>
              <dt>Claimed</dt>
              <dd>{formatMoney(item.claimedIncGst)}</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>{formatMoney(item.receivedIncGst)}</dd>
            </div>
            <div>
              <dt>Outstanding</dt>
              <dd>{formatMoney(item.outstandingReceivable)}</dd>
            </div>
            <div>
              <dt>Progress</dt>
              <dd>{new Decimal(item.cumulativePercentage).toFixed(2)}%</dd>
            </div>
          </dl>

          <div className="pbc-progress-series__foot">
            <div>
              <span className={`pbc-progress-badge pbc-progress-badge--${statusTone(item.paymentState)}`}>
                {titleCaseStatus(item.paymentState)}
              </span>
              <span className="pbc-progress-series__sync">
                {formatJobberFreshness(item.lastSuccessfulJobberSyncAt, item.lastJobberSyncErrorCode)}
              </span>
            </div>
            {item.quoteId ? (
              <IntentLink href={`/quotes/${item.quoteId}`} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
                Open quote
              </IntentLink>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  )
}

export function ProgressInvoiceDashboard({ result, filters }: ProgressInvoiceDashboardProps) {
  if (!result.ok) {
    return (
      <div className="pbc-progress-dashboard">
        <DashboardFilters filters={filters} />
        <div className="pbc-alert pbc-alert--danger pbc-alert--stack" role="alert">
          <strong>Progress invoice data could not be loaded.</strong>
          <span>Check the local database connection, then try again.</span>
          <IntentLink href={buildPageHref(filters, filters.page)} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
            Try again
          </IntentLink>
        </div>
      </div>
    )
  }

  const data = result.data
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))
  const currentPage = Math.min(data.page, totalPages)

  return (
    <div className="pbc-progress-dashboard">
      <DashboardFilters filters={filters} />
      <DashboardStats data={data} />

      {data.items.length === 0 ? (
        <div className="pbc-empty pbc-progress-empty">
          <strong>No progress invoice series match these filters.</strong>
          <span>Create a new series or clear the filters to see all records.</span>
          <div>
            <IntentLink href="/progress-invoices/new" className="pbc-btn pbc-btn--primary">
              {Icons.plus({ size: 15 })} New Progress Invoice
            </IntentLink>
            <IntentLink href="/progress-invoices" className="pbc-btn pbc-btn--ghost">
              Clear filters
            </IntentLink>
          </div>
        </div>
      ) : (
        <>
          <div className="pbc-progress-listhead">
            <div>
              <h2>Progress Invoice series</h2>
              <p>{data.total} total · showing {data.items.length} on this page</p>
            </div>
          </div>
          <SeriesCards data={data} />
        </>
      )}

      {data.total > 0 ? (
        <nav className="pbc-tablepager" aria-label="Progress Invoice pagination">
          <span>Page <b className="mono">{currentPage}</b> of <b className="mono">{totalPages}</b></span>
          <div>
            {currentPage > 1 ? (
              <IntentLink href={buildPageHref(filters, currentPage - 1)} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
                Previous
              </IntentLink>
            ) : <span className="pbc-progress-page-disabled">Previous</span>}
            {currentPage < totalPages ? (
              <IntentLink href={buildPageHref(filters, currentPage + 1)} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
                Next
              </IntentLink>
            ) : <span className="pbc-progress-page-disabled">Next</span>}
          </div>
        </nav>
      ) : null}
    </div>
  )
}
