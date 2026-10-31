import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'

const mocks = vi.hoisted(() => ({
  availability: vi.fn(), requireRole: vi.fn(), createClient: vi.fn(), loadKnowledgeSource: vi.fn(),
  loadDraftCatalog: vi.fn(), countRecentRuns: vi.fn(), startRun: vi.fn(), finishRun: vi.fn(),
  insertKnowledgeDraft: vi.fn(), createAnthropicClient: vi.fn(), runStructuredClaudeRequest: vi.fn(),
}))
vi.mock('@/lib/ai-quote/config', () => ({
  getAiQuoteAvailability: mocks.availability, AI_QUOTE_MODEL: 'claude-opus-5-5',
  AI_QUOTE_PROMPT_VERSIONS: { knowledge: 'knowledge-v1' }, AI_QUOTE_LIMITS: { knowledgeBuildsPerDay: 3, knowledgeMaxTokens: 64000 },
}))
vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/ai-quote/data', () => ({ loadKnowledgeSource: mocks.loadKnowledgeSource, loadDraftCatalog: mocks.loadDraftCatalog }))
vi.mock('@/lib/ai-quote/runs', () => ({
  countRecentRuns: mocks.countRecentRuns, startRun: mocks.startRun, finishRun: mocks.finishRun,
  insertKnowledgeDraft: mocks.insertKnowledgeDraft,
}))
vi.mock('@/lib/ai-quote/anthropic', () => ({
  createAnthropicClient: mocks.createAnthropicClient, runStructuredClaudeRequest: mocks.runStructuredClaudeRequest,
}))

import { POST, maxDuration } from '@/app/api/ai/knowledge/route'

const supabase = { client: 'session' }
const client = { client: 'anthropic' }
const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 }
const output = { styleGuide: 'Prepare and paint.', pricingGuide: 'Use the stats.', caveats: ['Low sample'] }
const request = (signal?: AbortSignal, site = 'same-origin') => new Request('https://pbc.example/api/ai/knowledge', {
  method: 'POST', headers: { 'sec-fetch-site': site }, signal,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.availability.mockReturnValue({ enabled: true })
  mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'admin-1' }, profile: { role: 'admin' } })
  mocks.createClient.mockResolvedValue(supabase)
  mocks.countRecentRuns.mockResolvedValue(0)
  mocks.startRun.mockResolvedValue('run-1')
  mocks.loadKnowledgeSource.mockResolvedValue({ quotes: [], counts: { quotes: 0, publicLines: 0, items: 0 } })
  mocks.loadDraftCatalog.mockResolvedValue({ productServices: [], products: [] })
  mocks.createAnthropicClient.mockReturnValue(client)
  mocks.runStructuredClaudeRequest.mockResolvedValue({ ok: true, data: output, usage, model: 'actual-model' })
  mocks.insertKnowledgeDraft.mockResolvedValue({ id: 'knowledge-1', version: 2 })
})
afterEach(() => vi.restoreAllMocks())

describe('POST knowledge', () => {
  it('returns 503 before authentication when AI is unavailable', async () => {
    mocks.availability.mockReturnValue({ enabled: false, reason: 'preview', message: 'AI unavailable in Preview.' })
    expect((await POST(request())).status).toBe(503)
    expect(mocks.requireRole).not.toHaveBeenCalled()
    expect(mocks.startRun).not.toHaveBeenCalled()
  })

  it.each([[AUTHENTICATION_REQUIRED_ERROR, 401], ['Admin access required', 403]])('rejects auth failure %s', async (error, status) => {
    mocks.requireRole.mockResolvedValue({ ok: false, error })
    expect((await POST(request())).status).toBe(status)
    expect(mocks.requireRole).toHaveBeenCalledWith('admin')
    expect(mocks.startRun).not.toHaveBeenCalled()
  })

  it.each(['cross-site', 'none', 'same-site'])('returns 403 for %s mutations', async site => {
    expect((await POST(request(undefined, site))).status).toBe(403)
    expect(mocks.countRecentRuns).not.toHaveBeenCalled()
  })

  it('returns 429 after 3 builds in a rolling 24h window', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-10-30T12:00:00Z'))
      mocks.countRecentRuns.mockResolvedValue(3)
      expect((await POST(request())).status).toBe(429)
      expect(mocks.countRecentRuns).toHaveBeenCalledWith(supabase, 'admin-1', 'knowledge_build', new Date('2026-10-29T12:00:00Z'))
      expect(mocks.startRun).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stores a draft knowledge version and finishes the run exactly once', async () => {
    const req = request()
    const response = await POST(req)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, data: { knowledgeId: 'knowledge-1', version: 2, runId: 'run-1' } })
    expect(mocks.startRun).toHaveBeenCalledWith(supabase, { kind: 'knowledge_build', promptVersion: 'knowledge-v1', model: 'claude-opus-5-5' })
    expect(mocks.runStructuredClaudeRequest).toHaveBeenCalledWith(client, expect.objectContaining({ maxTokens: 64000, signal: req.signal }))
    expect(mocks.insertKnowledgeDraft).toHaveBeenCalledWith(supabase, expect.objectContaining({ runId: 'run-1', styleGuide: output.styleGuide, pricingGuide: output.pricingGuide, sourceCounts: { quotes: 0, publicLines: 0, items: 0 } }))
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', expect.objectContaining({ status: 'succeeded', output, usage, model: 'actual-model' }))
  })

  it.each([
    ['refusal', 422, 'refused', 'refusal'], ['rate_limited', 429, 'failed', 'rate_limited'],
    ['timeout', 504, 'failed', 'timeout'], ['api_error', 502, 'failed', 'api_error'],
    ['max_tokens', 502, 'failed', 'validation'], ['invalid_output', 502, 'failed', 'validation'],
  ])('finishes %s exactly once and returns %s', async (errorCode, status, runStatus, storedCode) => {
    mocks.runStructuredClaudeRequest.mockResolvedValue({ ok: false, errorCode, usage, model: 'actual-model' })
    const response = await POST(request())
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining('(Ref:') })
    expect(mocks.insertKnowledgeDraft).not.toHaveBeenCalled()
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', expect.objectContaining({ status: runStatus, errorCode: storedCode, usage, model: 'actual-model' }))
  })

  it.each(['loadKnowledgeSource', 'loadDraftCatalog', 'runStructuredClaudeRequest', 'insertKnowledgeDraft'] as const)('finishes thrown %s errors without leaking details', async stage => {
    mocks[stage].mockRejectedValue(new Error('secret token customer@example.com'))
    const response = await POST(request())
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toContain('secret token')
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', expect.objectContaining({ status: 'failed', errorCode: 'api_error' }))
    if (stage === 'insertKnowledgeDraft') expect(mocks.finishRun).toHaveBeenCalledWith(supabase, 'run-1', expect.objectContaining({ usage, model: 'actual-model' }))
  })

  it('does not retry finishRun if finalization itself fails', async () => {
    mocks.finishRun.mockRejectedValue(new Error('database failed'))
    expect((await POST(request())).status).toBe(502)
    expect(mocks.finishRun).toHaveBeenCalledTimes(1)
  })

  it('does not finish a run that failed to start', async () => {
    mocks.startRun.mockRejectedValue(new Error('database failed'))
    expect((await POST(request())).status).toBe(502)
    expect(mocks.finishRun).not.toHaveBeenCalled()
  })

  it('marks an aborted request failed even if the model returns success', async () => {
    const controller = new AbortController()
    mocks.runStructuredClaudeRequest.mockImplementation(async () => {
      controller.abort()
      return { ok: true, data: output, usage, model: 'actual-model' }
    })
    expect((await POST(request(controller.signal))).status).toBe(504)
    expect(mocks.insertKnowledgeDraft).not.toHaveBeenCalled()
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', expect.objectContaining({ status: 'failed', errorCode: 'timeout' }))
  })

  it('finishes thrown aborts after startRun', async () => {
    const controller = new AbortController()
    mocks.loadKnowledgeSource.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    expect((await POST(request(controller.signal))).status).toBe(504)
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', expect.objectContaining({ status: 'failed', errorCode: 'timeout' }))
  })

  it('exports a 300 second maximum duration', () => expect(maxDuration).toBe(300))
})
