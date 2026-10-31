import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), isDevNoAuthMode: vi.fn(), availability: vi.fn(), loadActiveKnowledge: vi.fn(), createClient: vi.fn(), hasPendingAiReview: vi.fn() }))
vi.mock('@/lib/ai-quote/runs', () => ({ hasPendingAiReview: mocks.hasPendingAiReview }))
vi.mock('@/lib/ai-quote/config', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/ai-quote/config')>(), getAiQuoteAvailability: mocks.availability }))
vi.mock('@/lib/ai-quote/data', () => ({ loadActiveKnowledge: mocks.loadActiveKnowledge }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
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
  QuoteForm: ({ userId, hasActiveAiKnowledge, aiAvailability, aiReviewPending }: { userId?: string; hasActiveAiKnowledge?: boolean; aiAvailability?: { enabled: boolean }; aiReviewPending?: boolean }) => <span>{userId ?? 'draft-disabled'} {hasActiveAiKnowledge ? 'guide-ready' : 'guide-needed'} {aiAvailability?.enabled ? 'ai-enabled' : 'ai-disabled'} {aiReviewPending ? 'review-pending' : 'no-pending-review'}</span>,
}))

import QuoteNewPage from '@/app/(app)/quotes/new/page'
import QuoteEditPage from '@/app/(app)/quotes/[id]/edit/page'

describe('server quote draft ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDevNoAuthMode.mockReturnValue(false)
    mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'session-user', email: 'jimee@paintbuddyco.com.au' }, profile: { email: 'jimee@paintbuddyco.com.au' } })
    mocks.availability.mockReturnValue({ enabled: true })
    mocks.createClient.mockResolvedValue({})
    mocks.loadActiveKnowledge.mockResolvedValue({ id: 'knowledge-1' })
    mocks.hasPendingAiReview.mockResolvedValue(false)
  })

  for (const mode of ['new', 'edit'] as const) {
    const loadPage = () => mode === 'new'
      ? QuoteNewPage()
      : QuoteEditPage({ params: Promise.resolve({ id: 'quote-1' }) })

    it(`${mode}: passes the session user's ID to QuoteForm`, async () => {
      expect(renderToStaticMarkup(await loadPage())).toContain('session-user')
      expect(mocks.requireRole).toHaveBeenCalledWith('admin')
    })

    it(`${mode}: passes AI availability and approved knowledge to the form`, async () => {
      expect(renderToStaticMarkup(await loadPage())).toContain('guide-ready ai-enabled')
      expect(mocks.loadActiveKnowledge).toHaveBeenCalledWith({})
    })

    it(`${mode}: does not load AI guides for another admin even when their profile has the allowed email`, async () => {
      mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'session-user', email: 'other@paintbuddyco.com.au' },
        profile: { email: 'jimee@paintbuddyco.com.au' } })
      expect(renderToStaticMarkup(await loadPage())).toContain('guide-needed ai-disabled')
      expect(mocks.loadActiveKnowledge).not.toHaveBeenCalled()
    })

    it(`${mode}: falls back to the profile only when the auth email is null`, async () => {
      mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'session-user', email: null },
        profile: { email: 'jimee@paintbuddyco.com.au' } })
      expect(renderToStaticMarkup(await loadPage())).toContain('guide-ready ai-enabled')
    })

    it(`${mode}: disables drafting when no guide is approved or loading fails`, async () => {
      mocks.loadActiveKnowledge.mockResolvedValueOnce(null)
      expect(renderToStaticMarkup(await loadPage())).toContain('guide-needed')
      mocks.loadActiveKnowledge.mockRejectedValueOnce(new Error('unavailable'))
      expect(renderToStaticMarkup(await loadPage())).toContain('guide-needed')
    })

    it(`${mode}: supports dev no-auth without consulting a session`, async () => {
      mocks.isDevNoAuthMode.mockReturnValue(true)
      expect(renderToStaticMarkup(await loadPage())).toContain('dev-no-auth')
      expect(mocks.requireRole).not.toHaveBeenCalled()
      expect(mocks.loadActiveKnowledge).not.toHaveBeenCalled()
      expect(mocks.hasPendingAiReview).not.toHaveBeenCalled()
    })

    it(`${mode}: disables persistence when a session owner cannot be verified`, async () => {
      mocks.requireRole.mockResolvedValue({ ok: false, error: 'Not allowed' })
      expect(renderToStaticMarkup(await loadPage())).toContain('draft-disabled')
    })
  }
  it('edit: loads pending reviews even if new AI drafting is disabled', async () => {
    mocks.availability.mockReturnValue({ enabled: false, reason: 'missing_key', message: 'AI is not configured.' })
    mocks.hasPendingAiReview.mockResolvedValue(true)
    const page = await QuoteEditPage({ params: Promise.resolve({ id: 'quote-1' }) })
    expect(renderToStaticMarkup(page)).toContain('review-pending')
    expect(mocks.hasPendingAiReview).toHaveBeenCalledWith({}, 'quote-1')
    expect(mocks.loadActiveKnowledge).not.toHaveBeenCalled()
  })
  it('edit: preserves the review requirement when its lookup fails', async () => {
    mocks.hasPendingAiReview.mockRejectedValue(new Error('unavailable'))
    expect(renderToStaticMarkup(await QuoteEditPage({ params: Promise.resolve({ id: 'quote-1' }) }))).toContain('review-pending')
  })
})
