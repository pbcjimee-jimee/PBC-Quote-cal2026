import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import type { QuoteRecord } from '@/lib/dev-data'
import { installTestDom, type TestElement } from './helpers/test-dom'

const mocks = vi.hoisted(() => ({
  getPricingSettings: vi.fn(),
  listAreas: vi.fn(),
  listQuoteLineTemplates: vi.fn(),
  getQuote: vi.fn(),
  refresh: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

vi.mock('@/lib/actions/settings', () => ({ getPricingSettings: mocks.getPricingSettings }))
vi.mock('@/lib/actions/areas', () => ({ listAreas: mocks.listAreas, createArea: vi.fn() }))
vi.mock('@/lib/actions/quote-line-templates', () => ({ listQuoteLineTemplates: mocks.listQuoteLineTemplates }))
vi.mock('@/lib/actions/quotes', () => ({ getQuote: mocks.getQuote, createQuote: vi.fn(), updateQuote: vi.fn() }))
vi.mock('@/lib/actions/product-services', () => ({ listProductServices: vi.fn(async () => ({ ok: true, data: [] })) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), prefetch: vi.fn() }),
  notFound: mocks.notFound,
}))
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

import QuoteNewPage from '@/app/(app)/quotes/new/page'
import QuoteEditPage from '@/app/(app)/quotes/[id]/edit/page'

const savedQuote: QuoteRecord = {
  id: 'saved-quote', version: 1, customerName: 'Saved customer', customerAddress: null,
  jobberQuoteId: null, jobberSnapshot: null, jobberSaveMode: null, jobberSyncStatus: 'not_synced',
  jobberLastSyncedAt: null, jobberSyncError: null, jobberSnapshotRefreshedAt: null,
  jobberSnapshotChangeStatus: 'unknown', jobberSnapshotChangeSummary: [], jobberSnapshotRefreshError: null,
  areaSqft: null, workType: 'Interior', workingDays: '1', labourPerDay: '1',
  formula1Total: '735', formula2Total: '0', formula3Total: '0', formula4Total: '0', formula5Total: '0',
  selectedMin: 1, selectedMax: 1, interiorSelectedMin: 1, interiorSelectedMax: 1,
  subtotal: '735', finalTotal: '808.50',
  pricingSettingsSnapshot: { ...DEFAULT_PRICING_SETTINGS, f1LabourRate: 735 },
  createdAt: '2026-09-17T00:00:00Z', createdBy: 'admin', createdByName: null, createdByEmail: null,
  items: [{
    id: 'saved-item', quoteId: 'saved-quote', productId: null, productNameSnapshot: 'Labour',
    marketPriceSnapshot: '0', actualPriceSnapshot: '0', quantity: '1', workingDays: '1', labourPerDay: '1',
    areaId: null, areaNameSnapshot: 'Interior', areaScopeSnapshot: 'interior', isCustom: true, position: 0,
  }],
  jobberQuoteLines: [], options: [], memos: [], priceRevisions: [],
}

let dom: ReturnType<typeof installTestDom> | undefined
let root: Root | undefined
let container: TestElement

describe('quote pages require trustworthy calculation data', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getPricingSettings.mockResolvedValue({ ok: true, data: DEFAULT_PRICING_SETTINGS })
    mocks.listAreas.mockResolvedValue({ ok: true, data: [] })
    mocks.listQuoteLineTemplates.mockResolvedValue({ ok: true, data: [] })
    mocks.getQuote.mockResolvedValue({ ok: true, data: savedQuote })
    mocks.notFound.mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
  })

  afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    root = undefined
    dom?.cleanup()
    dom = undefined
  })

  for (const mode of ['new', 'edit'] as const) {
    const loadPage = () => mode === 'new'
      ? QuoteNewPage()
      : QuoteEditPage({ params: Promise.resolve({ id: savedQuote.id }) })

    for (const source of ['pricing', 'areas'] as const) {
      for (const failure of ['result', 'rejection'] as const) {
        it(`${mode}: blocks calculations and both save paths on ${source} ${failure} failure`, async () => {
          const action = source === 'pricing' ? mocks.getPricingSettings : mocks.listAreas
          if (failure === 'result') action.mockResolvedValue({ ok: false, error: 'private database detail' })
          else action.mockRejectedValue(new Error('private database detail'))

          const html = renderToStaticMarkup(await loadPage())

          expect(html).toContain('role="alert"')
          expect(html).toContain(source === 'pricing' ? 'Pricing settings' : 'Areas')
          expect(html).toContain('Retry')
          expect(html).not.toContain('Formula Results')
          expect(html).not.toContain('Final subtotal')
          expect(html).not.toContain('Save quote')
          expect(html).not.toContain('Save changes')
          expect(html).not.toContain('Save &amp; Sync')
          expect(html).not.toContain('private database detail')
        })
      }
    }

    for (const failure of ['result', 'rejection'] as const) {
      it(`${mode}: keeps manual editing available when optional templates have a ${failure} failure`, async () => {
        if (failure === 'result') mocks.listQuoteLineTemplates.mockResolvedValue({ ok: false, error: 'private template detail' })
        else mocks.listQuoteLineTemplates.mockRejectedValue(new Error('private template detail'))

        const html = renderToStaticMarkup(await loadPage())

        expect(html).toContain('Templates are unavailable')
        expect(html).toContain(mode === 'new' ? 'Save quote' : 'Save changes')
        expect(html).toContain('Final subtotal')
        expect(html).not.toContain('private template detail')
      })
    }

    it(`${mode}: treats a successfully loaded empty Area list as valid`, async () => {
      const html = renderToStaticMarkup(await loadPage())
      expect(html).toContain(mode === 'new' ? 'Save quote' : 'Save changes')
      expect(html).not.toContain('Unable to open')
    })

    it(`${mode}: reports both required dependencies when both fail`, async () => {
      mocks.getPricingSettings.mockResolvedValue({ ok: false, error: 'private pricing failure' })
      mocks.listAreas.mockRejectedValue(new Error('private area failure'))
      const html = renderToStaticMarkup(await loadPage())
      expect(html).toContain('Pricing settings and Areas')
      expect(html).not.toContain('Final subtotal')
    })

    for (const source of ['pricing', 'areas'] as const) {
      it(`${mode}: Retry requests fresh route data and only ${source} recovery restores the form`, async () => {
        const action = source === 'pricing' ? mocks.getPricingSettings : mocks.listAreas
        action.mockResolvedValue({ ok: false, error: 'private failure' })
        const failedPage = await loadPage()
        expect(renderToStaticMarkup(failedPage)).toContain('Retry')
        dom = installTestDom()
        container = dom.document.createElement('div')
        dom.document.body.appendChild(container)
        root = createRoot(container as unknown as HTMLElement)
        await act(async () => root!.render(failedPage))
        const retry = container.querySelectorAll('button').find((button) => button.textContent === 'Retry')
        expect(retry).toBeDefined()
        await act(async () => retry!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
        expect(mocks.refresh).toHaveBeenCalledTimes(1)

        expect(renderToStaticMarkup(await loadPage())).not.toContain('Final subtotal')
        action.mockResolvedValue({ ok: true, data: source === 'pricing' ? DEFAULT_PRICING_SETTINGS : [] })
        expect(renderToStaticMarkup(await loadPage())).toContain(mode === 'new' ? 'Save quote' : 'Save changes')
      })
    }
  }

  it('preserves historical pricing on Edit instead of replacing it with current settings', async () => {
    const html = renderToStaticMarkup(await QuoteEditPage({ params: Promise.resolve({ id: savedQuote.id }) }))
    expect(html).toContain('735.00')
    expect(html).toContain('808.50')
  })

  it('does not turn a failed quote lookup into a missing quote', async () => {
    mocks.getQuote.mockResolvedValue({ ok: false, error: 'private quote detail' })
    const html = renderToStaticMarkup(await QuoteEditPage({ params: Promise.resolve({ id: savedQuote.id }) }))
    expect(html).toContain('Retry')
    expect(html).not.toContain('private quote detail')
    expect(mocks.notFound).not.toHaveBeenCalled()
  })

  it('retains the not-found response for a successful lookup without a quote', async () => {
    mocks.getQuote.mockResolvedValue({ ok: true, data: null })
    await expect(QuoteEditPage({ params: Promise.resolve({ id: savedQuote.id }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('offers Retry after a rejected quote lookup instead of exposing the exception', async () => {
    mocks.getQuote.mockRejectedValue(new Error('private quote exception'))
    const html = renderToStaticMarkup(await QuoteEditPage({ params: Promise.resolve({ id: savedQuote.id }) }))
    expect(html).toContain('Retry')
    expect(html).not.toContain('private quote exception')
    expect(mocks.notFound).not.toHaveBeenCalled()
  })
})
