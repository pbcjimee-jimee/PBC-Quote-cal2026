import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), isDevNoAuthMode: vi.fn() }))
vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/actions/types', () => ({ isDevNoAuthMode: mocks.isDevNoAuthMode }))
vi.mock('@/lib/actions/settings', () => ({
  getPricingSettings: async () => ({ ok: true, data: DEFAULT_PRICING_SETTINGS }),
}))
vi.mock('@/lib/actions/areas', () => ({ listAreas: async () => ({ ok: true, data: [] }) }))
vi.mock('@/lib/actions/quote-line-templates', () => ({ listQuoteLineTemplates: async () => ({ ok: true, data: [] }) }))
vi.mock('@/lib/actions/quotes', () => ({
  getQuote: async () => ({ ok: true, data: { id: 'quote-1', createdBy: 'another-author' } }),
}))
vi.mock('@/components/quote-form/quote-form', () => ({
  QuoteForm: ({ userId }: { userId?: string }) => <span>{userId ?? 'draft-disabled'}</span>,
}))

import QuoteNewPage from '@/app/(app)/quotes/new/page'
import QuoteEditPage from '@/app/(app)/quotes/[id]/edit/page'

describe('server quote draft ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDevNoAuthMode.mockReturnValue(false)
    mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'session-user' } })
  })

  for (const mode of ['new', 'edit'] as const) {
    const loadPage = () => mode === 'new'
      ? QuoteNewPage()
      : QuoteEditPage({ params: Promise.resolve({ id: 'quote-1' }) })

    it(`${mode}: passes the session user's ID to QuoteForm`, async () => {
      expect(renderToStaticMarkup(await loadPage())).toContain('session-user')
      expect(mocks.requireRole).toHaveBeenCalledWith('admin')
    })

    it(`${mode}: supports dev no-auth without consulting a session`, async () => {
      mocks.isDevNoAuthMode.mockReturnValue(true)
      expect(renderToStaticMarkup(await loadPage())).toContain('dev-no-auth')
      expect(mocks.requireRole).not.toHaveBeenCalled()
    })

    it(`${mode}: disables persistence when a session owner cannot be verified`, async () => {
      mocks.requireRole.mockResolvedValue({ ok: false, error: 'Not allowed' })
      expect(renderToStaticMarkup(await loadPage())).toContain('draft-disabled')
    })
  }
})
