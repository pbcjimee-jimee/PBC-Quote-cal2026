import { existsSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgressInvoiceDashboardDto } from '@/lib/progress-invoices/series-service'

const mocks = vi.hoisted(() => ({
  listProgressInvoiceSeries: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}))

vi.mock('@/lib/actions/progress-invoice-series', () => ({
  listProgressInvoiceSeries: mocks.listProgressInvoiceSeries,
}))

import ProgressInvoicesPage, {
  parseProgressInvoiceDashboardSearchParams,
} from '@/app/(app)/progress-invoices/page'
import ProgressInvoicesLoading from '@/app/(app)/progress-invoices/loading'
import NewProgressInvoicePage from '@/app/(app)/progress-invoices/new/page'
import { ProgressInvoiceDashboard } from '@/components/progress-invoices/progress-invoice-dashboard'

const QUOTE_ID = 'd57d1809-25c4-4b2c-9f8c-22152b8ee73e'

const dashboardData: ProgressInvoiceDashboardDto = {
  items: [
    {
      id: '736dbf7e-2dc4-4e2a-a34f-5982b25138c0',
      sourceType: 'jobber_invoice',
      quoteId: QUOTE_ID,
      recipientName: 'Alex Builder',
      recipientCompany: 'Timbaworx',
      siteName: '4 Curra Close, Frenchs Forest',
      status: 'active',
      adjustedContractExGst: '1000.00',
      claimedIncGst: '550.00',
      receivedIncGst: '300.00',
      outstandingReceivable: '250.00',
      unclaimedIncGst: '550.00',
      cumulativePercentage: '50.00',
      paymentState: 'part_paid',
      lastSuccessfulJobberSyncAt: '2026-07-16T03:30:00.000Z',
      lastJobberSyncErrorCode: null,
      version: 3,
    },
  ],
  page: 2,
  pageSize: 20,
  total: 21,
}

describe('Progress Invoice dashboard foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    'app/(app)/progress-invoices/page.tsx',
    'app/(app)/progress-invoices/loading.tsx',
    'app/(app)/progress-invoices/new/page.tsx',
    'components/progress-invoices/progress-invoice-dashboard.tsx',
  ])('provides %s', (path) => {
    expect(existsSync(path)).toBe(true)
  })

  it('normalizes bounded query, status, quote, and page filters before calling the action', async () => {
    const filters = parseProgressInvoiceDashboardSearchParams({
      q: '  Timbaworx  ',
      status: ['active', 'paid', 'not-a-status'],
      page: '2',
      quoteId: QUOTE_ID,
    })

    expect(filters).toEqual({
      query: 'Timbaworx',
      statuses: ['active', 'paid'],
      page: 2,
      pageSize: 20,
      quoteId: QUOTE_ID,
    })

    mocks.listProgressInvoiceSeries.mockResolvedValueOnce({ ok: true, data: dashboardData })
    await ProgressInvoicesPage({
      searchParams: Promise.resolve({
        q: '  Timbaworx  ',
        status: ['active', 'paid', 'not-a-status'],
        page: '2',
        quoteId: QUOTE_ID,
      }),
    })

    expect(mocks.listProgressInvoiceSeries).toHaveBeenCalledWith(filters)
  })

  it('falls back safely for oversized or malformed filters', () => {
    expect(parseProgressInvoiceDashboardSearchParams({
      q: 'x'.repeat(161),
      status: ['overdue', 'unknown'],
      page: '-9',
      quoteId: 'not-a-uuid',
    })).toEqual({
      query: '',
      statuses: ['overdue'],
      page: 1,
      pageSize: 20,
      quoteId: null,
    })
  })

  it('accepts the PostgreSQL integer page boundary and rejects larger values', () => {
    expect(parseProgressInvoiceDashboardSearchParams({
      page: '2147483647',
    }).page).toBe(2147483647)

    expect(parseProgressInvoiceDashboardSearchParams({
      page: '2147483648',
    }).page).toBe(1)
  })

  it('renders Claimed and Received as separate financial facts', () => {
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceDashboard, {
      result: { ok: true, data: dashboardData },
      filters: {
        query: 'Timbaworx',
        statuses: ['active'],
        page: 2,
        pageSize: 20,
        quoteId: QUOTE_ID,
      },
    }))

    expect(markup).toContain('Adjusted contract')
    expect(markup).toContain('Claimed')
    expect(markup).toContain('Received')
    expect(markup).toContain('Outstanding')
    expect(markup).not.toContain('Claimed / Received')
    expect(markup).toContain('$1,000.00')
    expect(markup).toContain('$550.00')
    expect(markup).toContain('$300.00')
    expect(markup).toContain('$250.00')
    expect(markup).toContain('Timbaworx')
    expect(markup).toContain('Alex Builder')
    expect(markup).toContain('4 Curra Close, Frenchs Forest')
    expect(markup).toContain('Part paid')
    expect(markup).toContain('50.00%')
  })

  it('renders usable search, status filters, and pagination', () => {
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceDashboard, {
      result: { ok: true, data: dashboardData },
      filters: {
        query: 'Timbaworx',
        statuses: ['active'],
        page: 2,
        pageSize: 20,
        quoteId: QUOTE_ID,
      },
    }))

    expect(markup).toContain('name="q"')
    expect(markup).toContain('builder, recipient, site, quote or Jobber invoice')
    expect(markup).toContain('name="status"')
    for (const label of [
      'Draft',
      'Active',
      'Completed',
      'Reconciliation required',
      'Overdue',
      'Part paid',
      'Paid',
      'Void',
    ]) {
      expect(markup).toContain(label)
    }
    expect(markup).toContain('Page <b class="mono">2</b> of <b class="mono">2</b>')
    expect(markup).toContain('href="/progress-invoices?')
  })

  it('renders safe empty and error states without exposing raw error details', () => {
    const filters = {
      query: '',
      statuses: [],
      page: 1,
      pageSize: 20,
      quoteId: null,
    }
    const emptyMarkup = renderToStaticMarkup(createElement(ProgressInvoiceDashboard, {
      result: {
        ok: true,
        data: { items: [], page: 1, pageSize: 20, total: 0 },
      },
      filters,
    }))
    const errorMarkup = renderToStaticMarkup(createElement(ProgressInvoiceDashboard, {
      result: { ok: false, error: 'raw database detail must stay hidden' },
      filters,
    }))

    expect(emptyMarkup).toContain('No progress invoice series match these filters')
    expect(emptyMarkup).toContain('href="/progress-invoices/new"')
    expect(errorMarkup).toContain('Progress invoice data could not be loaded')
    expect(errorMarkup).not.toContain('raw database detail')
  })

  it('provides loading and guided non-404 creation landing states', () => {
    const loadingMarkup = renderToStaticMarkup(createElement(ProgressInvoicesLoading))
    const newMarkup = renderToStaticMarkup(createElement(NewProgressInvoicePage))

    expect(loadingMarkup).toContain('aria-busy="true"')
    expect(loadingMarkup).toContain('Loading progress invoices')
    expect(newMarkup).toContain('Start a Progress Invoice series')
    expect(newMarkup).toContain('Existing PBC Quote')
    expect(newMarkup).toContain('Standalone')
    expect(newMarkup).toContain('href="/quotes"')
    expect(newMarkup).toContain('href="/progress-invoices"')
  })
})
