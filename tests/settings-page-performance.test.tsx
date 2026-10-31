import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'

const mocks = vi.hoisted(() => ({
  getPricingSettings: vi.fn(),
  requireRole: vi.fn(),
  availability: vi.fn(),
  listAreas: vi.fn(),
  listProducts: vi.fn(),
  listProductServices: vi.fn(),
  listQuoteLineTemplates: vi.fn(),
}))

vi.mock('@/lib/actions/types', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/actions/types')>(), isDevNoAuthMode: () => false,
}))
vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/ai-quote/config', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/ai-quote/config')>(), getAiQuoteAvailability: mocks.availability,
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

vi.mock('@/lib/security/page-role-guard', () => ({
  requireAdminPage: vi.fn(async () => undefined),
}))

import SettingsPage from '@/app/(app)/settings/page'

describe('Settings page initial performance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'admin', email: 'jimee@paintbuddyco.com.au' }, profile: { email: 'jimee@paintbuddyco.com.au' } })
    mocks.availability.mockReturnValue({ enabled: true })
    mocks.getPricingSettings.mockResolvedValue({ ok: true, data: DEFAULT_PRICING_SETTINGS })
    mocks.listAreas.mockResolvedValue({ ok: true, data: [] })
    mocks.listProducts.mockResolvedValue({ ok: true, data: [] })
    mocks.listProductServices.mockResolvedValue({ ok: true, data: [] })
    mocks.listQuoteLineTemplates.mockResolvedValue({ ok: true, data: [] })
  })

  it('hides AI for another admin account', async () => {
    mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'other-admin', email: 'other@paintbuddyco.com.au' },
      profile: { email: 'jimee@paintbuddyco.com.au' } })
    const markup = renderToStaticMarkup(await SettingsPage())
    expect(markup).not.toContain('id="settings-section-ai"')
    expect(markup).toContain('Labour Rates')
  })

  it('keeps the AI tab for the allowed account', async () => {
    expect(renderToStaticMarkup(await SettingsPage())).toContain('id="settings-section-ai"')
  })

  it('loads only pricing settings before rendering the initial Labour Rates tab', async () => {
    const markup = renderToStaticMarkup(await SettingsPage())

    expect(markup).toContain('Labour Rates')
    expect(markup).toContain('href="/settings/users"')
    expect(markup).toContain('href="/quotes/new"')
    expect(markup).not.toContain('href="/inventory"')
    expect(mocks.getPricingSettings).toHaveBeenCalledTimes(1)
    expect(mocks.listProducts).not.toHaveBeenCalled()
    expect(mocks.listProductServices).not.toHaveBeenCalled()
    expect(mocks.listQuoteLineTemplates).not.toHaveBeenCalled()
    expect(mocks.listAreas).not.toHaveBeenCalled()
  })
})
