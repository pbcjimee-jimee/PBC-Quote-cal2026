import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPricingSettings: vi.fn(),
  listAreas: vi.fn(),
  listProductServices: vi.fn(),
  listQuoteLineTemplates: vi.fn(),
  quoteForm: vi.fn(() => null),
}))

vi.mock('@/lib/actions/settings', () => ({ getPricingSettings: mocks.getPricingSettings }))
vi.mock('@/lib/actions/areas', () => ({ listAreas: mocks.listAreas }))
vi.mock('@/lib/actions/product-services', () => ({ listProductServices: mocks.listProductServices }))
vi.mock('@/lib/actions/quote-line-templates', () => ({ listQuoteLineTemplates: mocks.listQuoteLineTemplates }))
vi.mock('@/components/quote-form/quote-form', () => ({ QuoteForm: mocks.quoteForm }))

import QuoteNewPage from '@/app/(app)/quotes/new/page'

describe('new quote initial load', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPricingSettings.mockResolvedValue({ ok: false, error: 'fallback' })
    mocks.listAreas.mockResolvedValue({ ok: true, data: [] })
    mocks.listProductServices.mockResolvedValue({ ok: true, data: [] })
    mocks.listQuoteLineTemplates.mockResolvedValue({ ok: true, data: [] })
  })

  it('does not preload the full Product and Service catalogue', async () => {
    await QuoteNewPage()

    expect(mocks.listProductServices).not.toHaveBeenCalled()
  })
})
