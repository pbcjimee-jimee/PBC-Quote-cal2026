import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/supabase/types'
import type { AiDraftModelOutput } from '@/lib/ai-quote/draft-schema'
import type { QuoteExample } from '@/lib/ai-quote/data'

const mocks = vi.hoisted(() => ({
  loadActiveKnowledge: vi.fn(), loadDraftCatalog: vi.fn(), loadSimilarQuoteCandidates: vi.fn(), loadQuoteExamples: vi.fn(),
  startRun: vi.fn(), finishRun: vi.fn(), createAnthropicClient: vi.fn(), runStructuredClaudeRequest: vi.fn(),
}))
vi.mock('@/lib/ai-quote/data', () => ({
  loadActiveKnowledge: mocks.loadActiveKnowledge, loadDraftCatalog: mocks.loadDraftCatalog,
  loadSimilarQuoteCandidates: mocks.loadSimilarQuoteCandidates, loadQuoteExamples: mocks.loadQuoteExamples,
}))
vi.mock('@/lib/ai-quote/runs', () => ({ startRun: mocks.startRun, finishRun: mocks.finishRun }))
vi.mock('@/lib/ai-quote/anthropic', () => ({
  createAnthropicClient: mocks.createAnthropicClient, runStructuredClaudeRequest: mocks.runStructuredClaudeRequest,
}))

import { generateQuoteDraft } from '@/lib/ai-quote/draft-service'

const supabase = { client: 'session' } as unknown as SupabaseClient<Database>
const client = { client: 'injected' } as unknown as Anthropic
const usage = { inputTokens: 123, outputTokens: 45, cacheReadTokens: 20, cacheWriteTokens: 10 }
const output: AiDraftModelOutput = {
  summary: 'Paint walls', findings: [], questions: [], areas: [], workItems: [], formulaSelections: [],
  publicLines: [{ kind: 'line_item', productServiceId: 'missing-service', name: 'Painting', description: 'Prepare and paint',
    quantity: '1', priceSource: 'catalog', priceWeight: 100, areaName: null, rationale: 'Requested.' }],
}
const input = () => ({ kind: 'quote_draft' as const, memo: 'Paint walls', jobberContext: null, client })
const success = () => ({ ok: true, data: output, usage, model: 'actual-model' })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.loadActiveKnowledge.mockResolvedValue({ id: 'guide-1', version: 1, styleGuide: 'PBC style', pricingGuide: 'Use approved pricing' })
  mocks.startRun.mockResolvedValue('run-1')
  mocks.finishRun.mockResolvedValue(undefined)
  mocks.loadDraftCatalog.mockResolvedValue({ productServices: [], products: [] })
  mocks.loadSimilarQuoteCandidates.mockResolvedValue([])
  mocks.loadQuoteExamples.mockResolvedValue([])
  mocks.createAnthropicClient.mockReturnValue(client)
  mocks.runStructuredClaudeRequest.mockResolvedValue(success())
})

describe('generate quote draft', () => {
  it('uses the evaluation model for both the run and Claude request', async () => {
    await generateQuoteDraft(supabase, { ...input(), kind: 'eval_draft', model: 'claude-opus-5-5' })
    expect(mocks.startRun).toHaveBeenCalledWith(supabase, expect.objectContaining({ model: 'claude-opus-5-5' }))
    expect(mocks.runStructuredClaudeRequest).toHaveBeenCalledWith(client, expect.objectContaining({ model: 'claude-opus-5-5' }))
  })

  it('uses stored findings in the prompt and saves them with the capped draft', async () => {
    const photoFindings = [{ area: 'Stairwell', kind: 'access' as const, issue: 'High walls',
      suggestedTreatment: 'Use access equipment', photoRefs: [1], confidence: 'high' as const }]
    mocks.loadDraftCatalog.mockResolvedValue({ productServices: [], products: [{ id: 'paint', name: 'Paint',
      manufacturer: null, type: null, unit: 'tin', marketPrice: '100', actualPrice: '50', colorCode: null, active: true }] })
    mocks.runStructuredClaudeRequest.mockResolvedValue({ ...success(), data: { ...output,
      workItems: [{ productId: 'paint', areaScope: 'interior', areaName: 'Stairwell', quantity: '1',
        workingDays: '2', labourPerDay: '1', rationale: 'Painting',
        photoAdjustment: { workingDays: '4', labourPerDay: '5', reason: 'Photo 1 high walls', photoRefs: [1, 2] } }],
    } })
    const result = await generateQuoteDraft(supabase, { ...input(), photoFindings, photoCount: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected success')
    expect(result.draft.photoFindings).toEqual(photoFindings)
    expect(result.draft.workItems[0].photoAdjustment).toEqual({ workingDays: '3', labourPerDay: '3',
      reason: 'Photo 1 high walls', photoRefs: [1] })
    const text = mocks.runStructuredClaudeRequest.mock.calls[0][1].messages[0].content
    expect(text).toContain('<photo_findings>')
    expect(text).toContain('High walls')
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', {
      status: 'succeeded', output: result.draft, usage, model: 'actual-model',
    })
  })

  it('returns no_knowledge before starting a run or calling Claude', async () => {
    mocks.loadActiveKnowledge.mockResolvedValue(null)
    expect(await generateQuoteDraft(supabase, input())).toEqual({ ok: false, runId: null, errorCode: 'no_knowledge' })
    expect(mocks.startRun).not.toHaveBeenCalled()
    expect(mocks.runStructuredClaudeRequest).not.toHaveBeenCalled()
    expect(mocks.finishRun).not.toHaveBeenCalled()
  })

  it('records the requested kind, knowledge, version and redacted memo only', async () => {
    const memo = 'call 0412 345 678 or paint@example.com about walls'
    await generateQuoteDraft(supabase, { ...input(), kind: 'eval_draft', memo })
    expect(mocks.startRun).toHaveBeenCalledExactlyOnceWith(supabase, {
      kind: 'eval_draft', memo: 'call [phone] or [email] about walls', knowledgeId: 'guide-1',
      jobberQuoteId: null, promptVersion: 'quote-draft-v4', model: 'claude-sonnet-5-5',
    })
    const request = mocks.runStructuredClaudeRequest.mock.calls[0][1]
    expect(JSON.stringify(request)).not.toMatch(/0412|paint@example.com/)
    expect(JSON.stringify(request)).toContain('[phone]')
  })

  it('excludes supplied quote ids and passes the four best examples to the prompt in ranked order', async () => {
    mocks.loadSimilarQuoteCandidates.mockResolvedValue(Array.from({ length: 6 }, (_, i) => ({
      id: `quote-${i}`, workType: 'Interior', customerType: 'Residential', areaKeys: ['Bedroom'],
      lineNames: ['Bedroom walls'], createdAt: `2026-10-${20 + i}T00:00:00Z`,
    })))
    const example = (id: string): QuoteExample => ({ id, workType: 'Interior', publicLines: [], items: [], formulaSelections: {} })
    mocks.loadQuoteExamples.mockResolvedValue(['quote-2', 'quote-3', 'quote-4', 'quote-5'].map(example))
    await generateQuoteDraft(supabase, { ...input(), excludeQuoteIds: ['reference-quote'], jobberContext: {
      jobberQuoteId: 'jobber-1', workType: 'Interior', customerType: 'Residential', areaSqft: null, existingLines: [],
    } })
    expect(mocks.loadSimilarQuoteCandidates).toHaveBeenCalledWith(supabase, 200, ['reference-quote'])
    expect(mocks.loadQuoteExamples).toHaveBeenCalledWith(supabase, ['quote-5', 'quote-4', 'quote-3', 'quote-2'])
    const text: string = mocks.runStructuredClaudeRequest.mock.calls[0][1].messages[0].content
    expect(text.indexOf('quote-5')).toBeLessThan(text.indexOf('quote-4'))
    expect(text.indexOf('quote-4')).toBeLessThan(text.indexOf('quote-3'))
    expect(text).not.toContain('quote-1')
    expect(mocks.startRun).toHaveBeenCalledWith(supabase, expect.objectContaining({ jobberQuoteId: 'jobber-1' }))
  })

  it('returns and stores the validated draft with usage exactly once', async () => {
    const signal = new AbortController().signal
    const result = await generateQuoteDraft(supabase, { ...input(), signal })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected success')
    expect(result.draft.publicLines[0]).toMatchObject({ kind: 'text', productServiceId: null, priceSource: 'none', priceWeight: 0, catalogUnitPrice: null, taxable: false })
    expect(result.draft.warnings.length).toBeGreaterThan(0)
    expect(result.draft.photoFindings).toEqual([])
    expect(mocks.runStructuredClaudeRequest.mock.calls[0][1].messages[0].content).not.toContain('<photo_findings>')
    expect(mocks.runStructuredClaudeRequest).toHaveBeenCalledWith(client, expect.objectContaining({ model: 'claude-sonnet-5-5', maxTokens: 32000, signal }))
    expect(mocks.createAnthropicClient).not.toHaveBeenCalled()
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', {
      status: 'succeeded', output: result.draft, usage, model: 'actual-model',
    })
  })

  it('creates a client only when none was injected', async () => {
    await generateQuoteDraft(supabase, { kind: 'quote_draft', memo: 'Walls', jobberContext: null })
    expect(mocks.createAnthropicClient).toHaveBeenCalledTimes(1)
    expect(mocks.runStructuredClaudeRequest.mock.calls[0][0]).toBe(client)
  })

  it.each([
    ['refusal', 'refused', 'refusal'], ['max_tokens', 'failed', 'validation'],
    ['invalid_output', 'failed', 'validation'], ['rate_limited', 'failed', 'rate_limited'],
    ['timeout', 'failed', 'timeout'], ['api_error', 'failed', 'api_error'],
  ])('records %s as %s and returns no partial draft', async (errorCode, status, storedCode) => {
    mocks.runStructuredClaudeRequest.mockResolvedValue({ ok: false, errorCode, usage, model: 'actual-model' })
    expect(await generateQuoteDraft(supabase, input())).toEqual({ ok: false, runId: 'run-1', errorCode })
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', {
      status, errorCode: storedCode, usage, model: 'actual-model',
    })
  })

  it.each(['loadDraftCatalog', 'loadSimilarQuoteCandidates', 'loadQuoteExamples', 'runStructuredClaudeRequest'] as const)
    ('finishes the run when %s throws', async stage => {
      mocks[stage].mockRejectedValue(new Error('Private customer@example.com'))
      expect(await generateQuoteDraft(supabase, input())).toEqual({ ok: false, runId: 'run-1', errorCode: 'api_error' })
      expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', expect.objectContaining({ status: 'failed', errorCode: 'api_error' }))
    })

  it('does not finish a run that failed to start', async () => {
    mocks.startRun.mockRejectedValue(new Error('Database failed'))
    expect(await generateQuoteDraft(supabase, input())).toEqual({ ok: false, runId: null, errorCode: 'api_error' })
    expect(mocks.finishRun).not.toHaveBeenCalled()
  })

  it('does not retry finalization if finishRun fails', async () => {
    mocks.finishRun.mockRejectedValue(new Error('Database failed'))
    expect(await generateQuoteDraft(supabase, input())).toEqual({ ok: false, runId: 'run-1', errorCode: 'api_error' })
    expect(mocks.finishRun).toHaveBeenCalledTimes(1)
  })

  it('marks a client abort failed even if Claude returns success and preserves usage', async () => {
    const controller = new AbortController()
    mocks.runStructuredClaudeRequest.mockImplementation(async () => {
      controller.abort()
      return success()
    })
    expect(await generateQuoteDraft(supabase, { ...input(), signal: controller.signal }))
      .toEqual({ ok: false, runId: 'run-1', errorCode: 'timeout' })
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', {
      status: 'failed', errorCode: 'timeout', usage, model: 'actual-model',
    })
  })

  it('finishes an abort during data loading without calling Claude', async () => {
    const controller = new AbortController()
    mocks.loadDraftCatalog.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    expect(await generateQuoteDraft(supabase, { ...input(), signal: controller.signal }))
      .toEqual({ ok: false, runId: 'run-1', errorCode: 'timeout' })
    expect(mocks.runStructuredClaudeRequest).not.toHaveBeenCalled()
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', { status: 'failed', errorCode: 'timeout' })
  })
})
