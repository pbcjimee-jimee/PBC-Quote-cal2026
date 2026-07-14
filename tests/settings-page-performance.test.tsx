import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'

const mocks = vi.hoisted(() => ({
  getPricingSettings: vi.fn(),
  listAreas: vi.fn(),
  listProducts: vi.fn(),
  listProductServices: vi.fn(),
  listQuoteLineTemplates: vi.fn(),
}))

vi.mock('@/lib/actions/settings', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/actions/settings')>(),
  getPricingSettings: mocks.getPricingSettings,
}))

vi.mock('@/lib/actions/areas', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/actions/areas')>(),
  listAreas: mocks.listAreas,
}))

vi.mock('@/lib/actions/products', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/actions/products')>(),
  listProducts: mocks.listProducts,
}))

vi.mock('@/lib/actions/product-services', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/actions/product-services')>(),
  listProductServices: mocks.listProductServices,
}))

vi.mock('@/lib/actions/quote-line-templates', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/actions/quote-line-templates')>(),
  listQuoteLineTemplates: mocks.listQuoteLineTemplates,
}))

import SettingsPage from '@/app/(app)/settings/page'

describe('Settings page initial performance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPricingSettings.mockResolvedValue({ ok: true, data: DEFAULT_PRICING_SETTINGS })
    mocks.listAreas.mockResolvedValue({ ok: true, data: [] })
    mocks.listProducts.mockResolvedValue({ ok: true, data: [] })
    mocks.listProductServices.mockResolvedValue({ ok: true, data: [] })
    mocks.listQuoteLineTemplates.mockResolvedValue({ ok: true, data: [] })
  })

  it('loads only pricing settings before rendering the initial Labour Rates tab', async () => {
    const markup = renderToStaticMarkup(await SettingsPage())

    expect(markup).toContain('Labour Rates')
    expect(mocks.getPricingSettings).toHaveBeenCalledTimes(1)
    expect(mocks.listProducts).not.toHaveBeenCalled()
    expect(mocks.listProductServices).not.toHaveBeenCalled()
    expect(mocks.listQuoteLineTemplates).not.toHaveBeenCalled()
    expect(mocks.listAreas).not.toHaveBeenCalled()
  })
})
