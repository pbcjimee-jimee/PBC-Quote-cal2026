import { createElement, forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import QuotesPage from '@/app/(app)/quotes/page'
import { QuoteDetailView } from '@/components/quote-detail/quote-detail-view'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import type { QuoteRecord } from '@/lib/dev-data'

const mocks = vi.hoisted(() => ({
  searchQuotes: vi.fn(),
}))

vi.mock('@/lib/actions/quotes', () => ({
  searchQuotes: mocks.searchQuotes,
  deleteQuote: vi.fn(),
  duplicateQuote: vi.fn(),
  refreshJobberQuoteSnapshot: vi.fn(),
  retryJobberQuoteSync: vi.fn(),
}))

vi.mock('@/lib/actions/jobber-sync', () => ({
  checkJobberQuoteSync: vi.fn(),
  getJobberSyncState: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/link', () => ({
  default: forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & {
    children?: ReactNode
    prefetch?: boolean
  }>(function MockLink({ children, prefetch, ...props }, ref) {
    void prefetch
    return createElement('a', { ...props, ref }, children)
  }),
  useLinkStatus: () => ({ pending: false }),
}))

const quote: QuoteRecord = {
  id: 'quote-overview-1',
  version: 1,
  customerName: 'Different totals customer',
  customerAddress: '10 Main St',
  jobberQuoteId: null,
  jobberSnapshot: null,
  jobberSaveMode: null,
  jobberSyncStatus: 'not_synced',
  jobberLastSyncedAt: null,
  jobberSyncError: null,
  jobberSnapshotRefreshedAt: null,
  jobberSnapshotChangeStatus: 'unknown',
  jobberSnapshotChangeSummary: [],
  jobberSnapshotRefreshError: null,
  areaSqft: null,
  workType: 'Interior',
  workingDays: '1.00',
  labourPerDay: '1.00',
  formula1Total: '600.00',
  formula2Total: '0.00',
  formula3Total: '0.00',
  formula4Total: '0.00',
  formula5Total: '0.00',
  selectedMin: 1,
  selectedMax: 1,
  interiorSelectedMin: 1,
  interiorSelectedMax: 1,
  subtotal: '1455.74',
  finalTotal: '1601.31',
  pricingSettingsSnapshot: DEFAULT_PRICING_SETTINGS,
  createdAt: '2026-09-20T00:00:00Z',
  createdBy: 'user-1',
  createdByName: 'Mia Kang',
  createdByEmail: 'mia@example.com',
  items: [{
    id: 'item-1',
    quoteId: 'quote-overview-1',
    productId: null,
    productNameSnapshot: 'Interior paint',
    marketPriceSnapshot: '100.00',
    actualPriceSnapshot: '80.00',
    quantity: '1.00',
    workingDays: '1.00',
    labourPerDay: '1.00',
    areaId: null,
    areaNameSnapshot: 'Interior',
    areaScopeSnapshot: 'interior',
    isCustom: true,
    position: 0,
  }],
  jobberQuoteLines: [],
  options: [{
    id: 'option-1',
    quoteId: 'quote-overview-1',
    title: 'Optional garage',
    workingDays: '0.00',
    labourPerDay: '0.00',
    materialMarket: '50.00',
    materialActual: '40.00',
    formula1Total: '50.00',
    formula2Total: '50.00',
    formula3Total: '71.43',
    formula4Total: '50.00',
    formula5Total: '71.43',
    selectedMin: 1,
    selectedMax: 1,
    subtotal: '50.00',
    finalTotal: '55.00',
    position: 0,
    items: [],
  }],
  memos: [],
  priceRevisions: [],
}

describe('quote overview and detail priorities', () => {
  it('puts quote finding before truthful loaded-range metrics and separates GST bases', async () => {
    mocks.searchQuotes.mockResolvedValueOnce({ ok: true, data: [quote] })

    const markup = renderToStaticMarkup(await QuotesPage({ searchParams: Promise.resolve({}) }))

    expect(markup.indexOf('Search by customer')).toBeLessThan(markup.indexOf('Loaded quotes'))
    expect(markup).toContain('pbc-overview-metrics')
    expect(markup).toContain('Latest up to 100 · current filters')
    expect(markup).not.toContain('all time')
    expect(markup).toContain('$1,601')
    expect(markup).toContain('$1455.74')
    expect(markup).toContain('ex GST')
  })

  it('shows the main subtotal, GST and GST-inclusive total before verbose detail sections', () => {
    const markup = renderToStaticMarkup(createElement(QuoteDetailView, { quote }))

    expect(markup).toContain('pbc-detailtotal')
    expect(markup).toContain('Final subtotal (Ex GST)')
    expect(markup).toContain('GST 10%')
    expect(markup).toContain('Total (Inc GST)')
    const primaryTotals = markup.slice(markup.indexOf('pbc-detailtotal__primary'), markup.indexOf('Options are excluded'))
    expect(primaryTotals).toContain('$600.00')
    expect(primaryTotals).toContain('$60.00')
    expect(primaryTotals).toContain('$660.00')
    expect(primaryTotals).not.toContain('$1455.74')
    expect(markup).toContain('Options are excluded from the main total')
    expect(markup.indexOf('pbc-detailtotal')).toBeLessThan(markup.indexOf('>Summary<'))
    expect(markup).toContain('Read-only')

    const compactMetadata = markup.slice(markup.indexOf('>Summary<'), markup.indexOf('Formula results'))
    expect(compactMetadata).toContain('Created by')
    expect(compactMetadata).toContain('<summary>Labour and material totals</summary>')
    expect(compactMetadata.indexOf('Labour and material totals')).toBeLessThan(compactMetadata.indexOf('Material total'))
  })
})
