import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { aiQuoteDraftRequestSchema } from '@/lib/validators'

const mocks = vi.hoisted(() => ({
  availability: vi.fn(), requireRole: vi.fn(), createClient: vi.fn(), countRecentRuns: vi.fn(), generateQuoteDraft: vi.fn(),
}))
vi.mock('@/lib/ai-quote/config', () => ({
  getAiQuoteAvailability: mocks.availability, AI_QUOTE_LIMITS: { draftsPerDay: 20 },
}))
vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/ai-quote/runs', () => ({ countRecentRuns: mocks.countRecentRuns }))
vi.mock('@/lib/ai-quote/draft-service', () => ({ generateQuoteDraft: mocks.generateQuoteDraft }))

import { POST, maxDuration } from '@/app/api/ai/quote-draft/route'

const supabase = { client: 'session' }
const draft = { summary: 'Paint walls', publicLines: [], workItems: [] }
const context = { jobberQuoteId: null, workType: 'Interior', customerType: 'Residential', areaSqft: null,
  existingLines: [{ name: 'Walls', description: 'Prepare and paint', quantity: 1, unitPrice: 100 }] }
function request(body: unknown = { memo: 'Paint walls', jobberContext: null }, signal?: AbortSignal, site = 'same-origin') {
  return new Request('https://pbc.example/api/ai/quote-draft', {
    method: 'POST', headers: { 'sec-fetch-site': site, 'content-type': 'application/json' }, signal, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.availability.mockReturnValue({ enabled: true })
  mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'admin-1' } })
  mocks.createClient.mockResolvedValue(supabase)
  mocks.countRecentRuns.mockResolvedValue(0)
  mocks.generateQuoteDraft.mockResolvedValue({ ok: true, runId: 'run-1', draft })
})
afterEach(() => vi.restoreAllMocks())

describe('POST quote draft', () => {
  it('returns 503 before authentication when unavailable', async () => {
    mocks.availability.mockReturnValue({ enabled: false, reason: 'preview', message: 'AI unavailable in Preview.' })
    expect((await POST(request())).status).toBe(503)
    expect(mocks.requireRole).not.toHaveBeenCalled()
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })

  it.each([[AUTHENTICATION_REQUIRED_ERROR, 401], ['Admin access required', 403]])('rejects %s with %s', async (error, status) => {
    mocks.requireRole.mockResolvedValue({ ok: false, error })
    expect((await POST(request())).status).toBe(status)
    expect(mocks.requireRole).toHaveBeenCalledWith('admin')
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })

  it.each(['cross-site', 'same-site', 'none'])('rejects %s before input validation and daily limits', async site => {
    expect((await POST(request({}, undefined, site))).status).toBe(403)
    expect(mocks.countRecentRuns).not.toHaveBeenCalled()
  })

  it.each(['', '  ', 'x'.repeat(8001)])('returns 400 for an invalid memo of length %s', async memo => {
    expect((await POST(request({ memo, jobberContext: null }))).status).toBe(400)
    expect(mocks.countRecentRuns).not.toHaveBeenCalled()
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed JSON', async () => {
    const req = new Request('https://pbc.example/api/ai/quote-draft', {
      method: 'POST', headers: { 'sec-fetch-site': 'same-origin' }, body: '{',
    })
    expect((await POST(req)).status).toBe(400)
    expect(mocks.countRecentRuns).not.toHaveBeenCalled()
  })

  it('limits Jobber context to 60 lines and validates field types', async () => {
    expect((await POST(request({ memo: 'Paint', jobberContext: { ...context,
      existingLines: Array.from({ length: 61 }, () => context.existingLines[0]) } }))).status).toBe(400)
    expect(aiQuoteDraftRequestSchema.safeParse({ memo: 'Paint', jobberContext: { ...context, areaSqft: 'bad' } }).success).toBe(false)
  })

  it('returns 429 after 20 drafts in a rolling 24h window', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-10-30T12:00:00Z'))
      mocks.countRecentRuns.mockResolvedValue(20)
      expect((await POST(request())).status).toBe(429)
      expect(mocks.countRecentRuns).toHaveBeenCalledWith(supabase, 'admin-1', 'quote_draft', new Date('2026-10-29T12:00:00Z'))
      expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('strips customer identity and unknown keys and passes the request signal', async () => {
    const req = request({ memo: ' Paint walls ', customerName: 'Private', jobberContext: { ...context,
      customerName: 'Private', customerAddress: '123 Private Street',
      existingLines: [{ ...context.existingLines[0], customerEmail: 'private@example.com' }],
    } })
    const response = await POST(req)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, data: { runId: 'run-1', draft } })
    expect(mocks.generateQuoteDraft).toHaveBeenCalledExactlyOnceWith(supabase, {
      kind: 'quote_draft', memo: 'Paint walls', jobberContext: context, signal: req.signal,
    })
  })

  it.each([
    ['no_knowledge', 409, 'Approve an AI guide in Settings before creating drafts.'],
    ['refusal', 422, 'AI could not complete this draft. Try rewording your notes.'],
    ['rate_limited', 429, 'Try again later.'], ['timeout', 504, 'Please try again.'],
    ['max_tokens', 502, 'Please try again.'], ['invalid_output', 502, 'Please try again.'], ['api_error', 502, 'Please try again.'],
  ])('maps %s to %s with a friendly safe error', async (errorCode, status, message) => {
    mocks.generateQuoteDraft.mockResolvedValue({ ok: false, runId: null, errorCode })
    const response = await POST(request())
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ ok: false, error: expect.stringContaining(message) })
  })

  it('maps unexpected errors without leaking details', async () => {
    mocks.generateQuoteDraft.mockRejectedValue(new Error('secret private@example.com'))
    const response = await POST(request())
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toContain('private@example.com')
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private@example.com')
  })

  it('returns 504 when an aborted request throws', async () => {
    const controller = new AbortController()
    mocks.generateQuoteDraft.mockImplementation(async () => { controller.abort(); throw new Error('Abort') })
    expect((await POST(request(undefined, controller.signal))).status).toBe(504)
  })

  it('exports maxDuration = 300', () => expect(maxDuration).toBe(300))
})
