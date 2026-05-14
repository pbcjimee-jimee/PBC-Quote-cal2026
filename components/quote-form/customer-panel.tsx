import type {
  JobberQuoteDraft,
  JobberQuoteDraftExpense,
  JobberQuoteDraftJobExpenses,
  JobberQuoteDraftLineItem,
} from '@/lib/jobber/mapper'

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
  onWorkTypeChange: (value: string) => void
  isFetchingJobberQuote: boolean
  jobberFetchError: string | null
  jobberQuoteDraft: JobberQuoteDraft | null
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
    <li className="border-t border-gray-100 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{item.name}</span>
            <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
              {formatCategory(item.category)}
            </span>
          </div>
          {item.linkedName && item.linkedName !== item.name ? (
            <p className="mt-1 text-xs text-gray-500">{item.linkedName}</p>
          ) : null}
          {item.description.trim() ? (
            <p className="mt-2 whitespace-pre-line text-xs leading-5 text-gray-600">{item.description}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right text-xs text-gray-500">
          <div>Qty {item.quantity}</div>
          <div className="font-mono text-gray-900">{formatMoney(item.totalPrice)}</div>
        </div>
      </div>
    </li>
  )
}

function ExpenseRow({ expense }: { expense: JobberQuoteDraftExpense }) {
  return (
    <li className="border-t border-gray-100 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{expense.title}</span>
            <span className="text-xs text-gray-500">{formatDate(expense.date)}</span>
          </div>
          {expense.description.trim() ? (
            <p className="mt-2 whitespace-pre-line text-xs leading-5 text-gray-600">{expense.description}</p>
          ) : null}
          <p className="mt-2 text-xs text-gray-500">
            Entered by {expense.enteredBy ?? '-'} | Paid by {expense.paidBy ?? '-'}
            {expense.reimbursableTo ? ` | Reimburse to ${expense.reimbursableTo}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right text-xs font-mono text-gray-900">
          {formatOptionalMoney(expense.total)}
        </div>
      </div>
    </li>
  )
}

function JobExpensesGroup({ job }: { job: JobberQuoteDraftJobExpenses }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            Job #{job.jobNumber}{job.jobTitle ? ` - ${job.jobTitle}` : ''}
          </p>
          <p className="mt-1 text-xs text-gray-500">{formatStatus(job.jobStatus)}</p>
        </div>
        {job.jobUrl ? (
          <a href={job.jobUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:text-blue-700">
            Open job
          </a>
        ) : null}
      </div>
      {job.expenses.length > 0 ? (
        <ul className="mt-3 border-t border-gray-100">
          {job.expenses.map((expense) => (
            <ExpenseRow key={expense.id} expense={expense} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
          No expenses found for this Jobber job.
        </p>
      )}
    </div>
  )
}

function JobberQuoteSummary({ quote }: { quote: JobberQuoteDraft }) {
  const sourceLabel = quote.sourceType === 'job' ? 'Jobber job' : 'Jobber quote'

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{sourceLabel}</p>
          <p className="mt-1 font-mono text-sm text-gray-900">{quote.quoteNumber}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Created date</p>
          <p className="mt-1 text-sm text-gray-900">{formatDate(quote.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Address</p>
          <p className="mt-1 text-sm text-gray-900">{quote.customerAddress || '-'}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Work type</p>
          <p className="mt-1 text-sm text-gray-900">{quote.workType || '-'}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Customer type</p>
          <p className="mt-1 text-sm text-gray-900">{quote.customerType || '-'}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Product / Service</p>
        {quote.productsAndServices.length > 0 ? (
          <ul className="mt-3 max-h-80 overflow-y-auto rounded-md border border-gray-200 bg-white p-3">
            {quote.productsAndServices.map((item) => (
              <ProductServiceRow key={item.id} item={item} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">
            No product or service line items found.
          </p>
        )}
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Job Expenses</p>
        {quote.jobExpensesError ? (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <p>{quote.jobExpensesError}</p>
            {quote.jobExpensesError.includes('Reconnect Jobber') ? (
              <a href="/api/jobber/connect" className="mt-2 inline-flex font-medium text-amber-800 underline underline-offset-2">
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
          <p className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">
            No converted Jobber job expenses found.
          </p>
        )}
      </div>
    </div>
  )
}

export function CustomerPanel(props: CustomerPanelProps) {
  const lookupLabel = props.jobberLookupType === 'job'
    ? 'Jobber Job Number or URL'
    : 'Jobber Quote Number or URL'

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Customer Info</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-gray-700">
          Customer
          <input value={props.customerName} onChange={(event) => props.onCustomerNameChange(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1 text-sm font-medium text-gray-700">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{lookupLabel}</span>
            <span className="inline-flex rounded-md border border-gray-300 bg-gray-50 p-0.5">
              {(['quote', 'job'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => props.onJobberLookupTypeChange(type)}
                  className={`rounded px-2 py-1 text-xs font-medium ${props.jobberLookupType === type ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {type === 'quote' ? 'Quote' : 'Job'}
                </button>
              ))}
            </span>
          </span>
          <div className="flex gap-2">
            <input value={props.jobberQuoteId} onChange={(event) => props.onJobberQuoteIdChange(event.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <button type="button" onClick={props.onFetchJobberQuote} disabled={props.isFetchingJobberQuote} className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {props.isFetchingJobberQuote ? 'Loading' : 'Fetch'}
            </button>
          </div>
          {props.jobberFetchError ? <span className="block text-xs font-normal text-red-600">{props.jobberFetchError}</span> : null}
        </label>
      </div>
      <label className="block space-y-1 text-sm font-medium text-gray-700">
        Address
        <input value={props.customerAddress} onChange={(event) => props.onCustomerAddressChange(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>
      {props.jobberQuoteDraft ? <JobberQuoteSummary quote={props.jobberQuoteDraft} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-gray-700">
          Work Type
          <input value={props.workType} onChange={(event) => props.onWorkTypeChange(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Interior, exterior..." />
        </label>
        <label className="space-y-1 text-sm font-medium text-gray-700">
          Customer Type
          <input value={props.customerType} readOnly className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700" />
        </label>
      </div>
    </section>
  )
}
