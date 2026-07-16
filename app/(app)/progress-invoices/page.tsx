import { ProgressInvoiceDashboard, PROGRESS_INVOICE_STATUS_OPTIONS } from '@/components/progress-invoices/progress-invoice-dashboard'
import { IntentLink } from '@/components/navigation/intent-link'
import { Icons } from '@/components/ui/icons'
import { listProgressInvoiceSeries } from '@/lib/actions/progress-invoice-series'
import type { ActionResult } from '@/lib/actions/types'
import type {
  ProgressInvoiceDashboardDto,
  ProgressInvoiceListInput,
} from '@/lib/progress-invoices/series-service'
import {
  progressInvoiceListSchema,
  progressInvoiceSeriesIdSchema,
} from '@/lib/progress-invoices/validators'

const DASHBOARD_PAGE_SIZE = 20
const DEFAULT_FILTERS: ProgressInvoiceListInput = {
  query: '',
  statuses: [],
  page: 1,
  pageSize: DASHBOARD_PAGE_SIZE,
  quoteId: null,
}

type RawSearchParams = Record<string, string | string[] | undefined>

interface ProgressInvoicesPageProps {
  searchParams?: Promise<RawSearchParams>
}

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function statusValues(value: string | string[] | undefined): string[] {
  const rawValues = Array.isArray(value) ? value : value ? [value] : []
  const allowed = new Set(PROGRESS_INVOICE_STATUS_OPTIONS.map((option) => option.value))
  return [...new Set(
    rawValues
      .flatMap((entry) => entry.split(','))
      .map((entry) => entry.trim())
      .filter((entry) => allowed.has(entry as typeof PROGRESS_INVOICE_STATUS_OPTIONS[number]['value'])),
  )].slice(0, 10)
}

function safePage(value: string | string[] | undefined): number {
  const raw = firstValue(value)
  if (!/^[1-9]\d*$/.test(raw)) return 1
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) ? parsed : 1
}

export function parseProgressInvoiceDashboardSearchParams(
  params: RawSearchParams | undefined,
): ProgressInvoiceListInput {
  if (!params) return DEFAULT_FILTERS

  const rawQuery = firstValue(params.q).trim()
  const query = rawQuery.length <= 160 ? rawQuery : ''
  const rawQuoteId = firstValue(params.quoteId).trim()
  const quoteId = progressInvoiceSeriesIdSchema.safeParse(rawQuoteId).success
    ? rawQuoteId
    : null

  const candidate: ProgressInvoiceListInput = {
    query,
    statuses: statusValues(params.status),
    page: safePage(params.page),
    pageSize: DASHBOARD_PAGE_SIZE,
    quoteId,
  }
  const parsed = progressInvoiceListSchema.safeParse(candidate)
  return parsed.success ? parsed.data : DEFAULT_FILTERS
}

export default async function ProgressInvoicesPage({
  searchParams,
}: ProgressInvoicesPageProps) {
  const filters = parseProgressInvoiceDashboardSearchParams(await searchParams)
  let result: ActionResult<ProgressInvoiceDashboardDto>

  try {
    result = await listProgressInvoiceSeries(filters)
  } catch {
    result = { ok: false, error: 'PROGRESS_REQUEST_FAILED' }
  }

  return (
    <main>
      <header className="pbc-topbar">
        <div className="pbc-crumb">
          <span>Admin</span>
          {Icons.arrowDown({ size: 14 })}
          <b>Progress Invoices</b>
        </div>
        <div className="pbc-topbar__right">
          <IntentLink href="/progress-invoices/new" className="pbc-btn pbc-btn--primary">
            {Icons.plus({ size: 15 })} New Progress Invoice
          </IntentLink>
        </div>
      </header>

      <div className="pbc-page">
        <div className="pbc-pagehead">
          <h1>Progress Invoices</h1>
          <p>Track contract progress, issued claims and actual receipts without combining them.</p>
        </div>
        <ProgressInvoiceDashboard result={result} filters={filters} />
      </div>
    </main>
  )
}
