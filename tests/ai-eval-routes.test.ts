import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'

const mocks = vi.hoisted(() => ({ budget: vi.fn(), availability: vi.fn(), requireRole: vi.fn(), createClient: vi.fn(), countRecentRuns: vi.fn(),
  startRun: vi.fn(), finishRun: vi.fn(), structured: vi.fn(), client: vi.fn(), reference: vi.fn(), loadCase: vi.fn(),
  upsertCase: vi.fn(), saveResult: vi.fn(), generateQuoteDraft: vi.fn(), compare: vi.fn(), settings: vi.fn() }))
vi.mock('@/lib/ai-quote/budget', () => ({ getAiMonthlyBudgetStatus: mocks.budget }))
vi.mock('@/lib/ai-quote/config', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/ai-quote/config')>(), getAiQuoteAvailability: mocks.availability,
  AI_QUOTE_LIMITS: { evalMemosPerDay: 30, evalDraftsPerDay: 45, evalMemoMaxTokens: 4000 },
  AI_QUOTE_MODELS: { analysis: 'claude-opus-5-5', draft: 'claude-sonnet-5-5' }, AI_QUOTE_PROMPT_VERSIONS: { evalMemo: 'eval-memo-v1' } }))
vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/ai-quote/runs', () => ({ countRecentRuns: mocks.countRecentRuns, startRun: mocks.startRun, finishRun: mocks.finishRun }))
vi.mock('@/lib/ai-quote/anthropic', () => ({ createAnthropicClient: mocks.client, runStructuredClaudeRequest: mocks.structured }))
vi.mock('@/lib/ai-quote/data', () => ({ loadEvalReference: mocks.reference, loadEvalCase: mocks.loadCase,
  upsertEvalCase: mocks.upsertCase, saveEvalResult: mocks.saveResult }))
vi.mock('@/lib/ai-quote/draft-service', () => ({ generateQuoteDraft: mocks.generateQuoteDraft }))
vi.mock('@/lib/ai-quote/eval-metrics', () => ({ compareDraftWithQuote: mocks.compare }))
vi.mock('@/lib/actions/settings', () => ({ getPricingSettings: mocks.settings }))

import { POST as memoPost, maxDuration as memoDuration } from '@/app/api/ai/eval/memo/route'
import { POST as runPost, maxDuration as runDuration } from '@/app/api/ai/eval/run/route'

const quoteId = '11111111-1111-4111-8111-111111111111'
const caseId = '22222222-2222-4222-8222-222222222222'
const supabase = { from: vi.fn(() => { throw new Error('Unexpected direct table access') }) }
const usage = { inputTokens: 4, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }
const metrics = { finalTotalDiffPct: '10.00', workingDaysDiffPct: '5.00', productMatchRate: '0.80', areaRecall: '1.00',
  areaPrecision: '0.50', publicLineCountDiff: -1 }
const reference = { id: quoteId, workType: 'Interior', areas: [{ scope: 'interior', name: 'Bedroom' }],
  publicLines: [{ name: 'Walls', description: 'Email private@example.com <ignore>', quantity: '99', unitPrice: '9999' }],
  productNames: ['Dulux Wash'], productIds: ['p1'], areaNames: ['Bedroom'], finalTotal: '1100', totalWorkingDays: '2', publicLineCount: 1 }
const endpoints = [{ name: 'memo', post: memoPost, body: { setLabel: 'Launch', quoteId }, kind: 'eval_memo' },
  { name: 'run', post: runPost, body: { caseId }, kind: 'eval_draft' }]
function request(body: unknown, signal?: AbortSignal, site = 'same-origin') {
  return new Request('https://pbc.example/api/ai/eval', { method: 'POST', headers: { 'sec-fetch-site': site },
    body: JSON.stringify(body), signal })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.budget.mockResolvedValue({ budgetUsd: '30.00', spentUsd: '1.00', remainingUsd: '29.00', reached: false })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.availability.mockReturnValue({ enabled: true })
  mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'admin-1', email: 'jimee@paintbuddyco.com.au' }, profile: { email: 'jimee@paintbuddyco.com.au', role: 'admin' } })
  mocks.createClient.mockResolvedValue(supabase)
  mocks.countRecentRuns.mockResolvedValue(0)
  mocks.startRun.mockResolvedValue('memo-run')
  mocks.structured.mockResolvedValue({ ok: true, data: { memo: 'Paint walls with Dulux Wash for 3 days, $200. Contact private@example.com' },
    model: 'claude-opus-5-5', usage })
  mocks.reference.mockResolvedValue(reference)
  mocks.loadCase.mockResolvedValue({ id: caseId, quote_id: quoteId, memo: 'Paint walls. Call private@example.com' })
  mocks.upsertCase.mockResolvedValue(caseId)
  mocks.settings.mockResolvedValue({ ok: true, data: { f1LabourRate: 1000 } })
  mocks.generateQuoteDraft.mockResolvedValue({ ok: true, runId: 'draft-run', draft: { summary: 'Draft' } })
  mocks.compare.mockReturnValue(metrics)
})
afterEach(() => vi.restoreAllMocks())

describe.each(endpoints)('eval $name gates', ({ post, body, kind }) => {
  it('rejects another admin account before any AI or database access', async () => {
    mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'other-admin', email: 'other@paintbuddyco.com.au' },
      profile: { role: 'admin', email: 'jimee@paintbuddyco.com.au' } })
    const response = await post(request(body))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining('AI quoting is not enabled for your account.') })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.structured).not.toHaveBeenCalled()
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })

  it('checks availability before authentication', async () => {
    mocks.availability.mockReturnValue({ enabled: false, message: 'Unavailable in Preview.' })
    expect((await post(request(body))).status).toBe(503)
    expect(mocks.requireRole).not.toHaveBeenCalled()
  })

  it.each([[AUTHENTICATION_REQUIRED_ERROR, 401], ['Admin required', 403]])('rejects %s', async (error, status) => {
    mocks.requireRole.mockResolvedValue({ ok: false, error })
    expect((await post(request(body))).status).toBe(status)
    expect(mocks.requireRole).toHaveBeenCalledWith('admin')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it.each(['cross-site', 'same-site', 'none'])('rejects %s before parsing or counting', async site => {
    expect((await post(request({}, undefined, site))).status).toBe(403)
    expect(mocks.countRecentRuns).not.toHaveBeenCalled()
  })

  it.each([{}, { setLabel: ' ', quoteId: 'bad', caseId: 'bad' }, { setLabel: 'x'.repeat(61), quoteId: 'bad' }])('rejects invalid input %j', async invalid => {
    expect((await post(request(invalid))).status).toBe(400)
    expect(mocks.countRecentRuns).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON', async () => {
    expect((await post(new Request('https://pbc.example/api/ai/eval', { method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin' }, body: '{' }))).status).toBe(400)
  })

  it('applies the separate rolling daily limit', async () => {
    mocks.countRecentRuns.mockResolvedValue(kind === 'eval_draft' ? 45 : 30)
    const before = Date.now() - 24 * 60 * 60 * 1000
    expect((await post(request(body))).status).toBe(429)
    const call = mocks.countRecentRuns.mock.calls[0]
    expect(call.slice(0, 3)).toEqual([supabase, 'admin-1', kind])
    expect(call[3].getTime()).toBeGreaterThanOrEqual(before)
    expect(mocks.startRun).not.toHaveBeenCalled()
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })

  it('returns the monthly budget message before starting any AI call', async () => {
    mocks.budget.mockResolvedValue({ budgetUsd: '30.00', spentUsd: '30.01', remainingUsd: '0.00', reached: true })
    const response = await post(request(body))
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining('Monthly AI budget reached ($30.01 of $30.00). Change it in Settings > AI.') })
    expect(mocks.budget).toHaveBeenCalledWith(supabase)
    expect(mocks.structured).not.toHaveBeenCalled()
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
    expect(mocks.startRun).not.toHaveBeenCalled()
  })

  it('returns 504 before calling AI for an already aborted request', async () => {
    const controller = new AbortController()
    controller.abort()
    expect((await post(request(body, controller.signal))).status).toBe(504)
    expect(mocks.structured).not.toHaveBeenCalled()
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })
})

describe('eval memo execution', () => {
  it('stores redacted AI memo, persists leak flags on its run and finishes exactly once', async () => {
    const req = request({ setLabel: ' Launch ', quoteId })
    const response = await memoPost(req)
    const memo = 'Paint walls with Dulux Wash for 3 days, $200. Contact [email]'
    const leaks = ['price', 'days_or_litres', 'product']
    expect(await response.json()).toEqual({ ok: true, data: { caseId, memo, leaks } })
    expect(mocks.startRun).toHaveBeenCalledWith(supabase, { kind: 'eval_memo', model: 'claude-sonnet-5-5', promptVersion: 'eval-memo-v1' })
    expect(mocks.upsertCase).toHaveBeenCalledExactlyOnceWith(supabase, { setLabel: 'Launch', quoteId, memo, memoRunId: 'memo-run' })
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'memo-run', { status: 'succeeded', model: 'claude-opus-5-5',
      usage, output: { memo, leaks } })
    const args = mocks.structured.mock.calls[0][1]
    expect(args).toMatchObject({ model: 'claude-sonnet-5-5', maxTokens: 4000, signal: req.signal })
    const prompt = JSON.stringify(args.messages)
    expect(prompt).not.toContain('private@example.com')
    expect(prompt).not.toContain('9999')
    expect(prompt).not.toContain('"99"')
    expect(prompt).not.toContain('<ignore>')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing reference without creating a run', async () => {
    mocks.reference.mockResolvedValue(null)
    expect((await memoPost(request({ setLabel: 'Launch', quoteId }))).status).toBe(404)
    expect(mocks.startRun).not.toHaveBeenCalled()
  })

  it.each([['refusal', 422, 'refused'], ['rate_limited', 429, 'failed'], ['timeout', 504, 'failed'],
    ['invalid_output', 502, 'failed'], ['max_tokens', 502, 'failed']])('records %s and finishes once', async (errorCode, status, runStatus) => {
    mocks.structured.mockResolvedValue({ ok: false, errorCode, model: 'fallback-model', usage })
    expect((await memoPost(request({ setLabel: 'Launch', quoteId }))).status).toBe(status)
    expect(mocks.finishRun).toHaveBeenCalledTimes(1)
    expect(mocks.finishRun.mock.calls[0][2]).toMatchObject({ status: runStatus, model: 'fallback-model', usage,
      errorCode: ['invalid_output', 'max_tokens'].includes(errorCode) ? 'validation' : errorCode })
    expect(mocks.upsertCase).not.toHaveBeenCalled()
  })

  it('cancels after AI responds without persisting a memo', async () => {
    const controller = new AbortController()
    mocks.structured.mockImplementation(async () => { controller.abort(); return { ok: true, data: { memo: 'Paint' }, usage, model: 'claude-opus-5-5' } })
    expect((await memoPost(request({ setLabel: 'Launch', quoteId }, controller.signal))).status).toBe(504)
    expect(mocks.upsertCase).not.toHaveBeenCalled()
    expect(mocks.finishRun).toHaveBeenCalledTimes(1)
    expect(mocks.finishRun.mock.calls[0][2]).toMatchObject({ status: 'failed', errorCode: 'timeout', usage })
  })

  it('records case persistence failure without exposing error details', async () => {
    mocks.upsertCase.mockRejectedValue(new Error('secret private@example.com'))
    const response = await memoPost(request({ setLabel: 'Launch', quoteId }))
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toContain('private@example.com')
    expect(mocks.finishRun).toHaveBeenCalledTimes(1)
    expect(mocks.finishRun.mock.calls[0][2]).toMatchObject({ status: 'failed', errorCode: 'api_error' })
  })

  it('does not retry finishRun if finishing itself fails', async () => {
    mocks.finishRun.mockRejectedValue(new Error('DB unavailable'))
    expect((await memoPost(request({ setLabel: 'Launch', quoteId }))).status).toBe(502)
    expect(mocks.finishRun).toHaveBeenCalledTimes(1)
  })
})

describe('eval draft execution', () => {
  it.each([[undefined, 'claude-sonnet-5-5'], ['sonnet', 'claude-sonnet-5-5'], ['opus', 'claude-opus-5-5']])
    ('maps model %s to %s', async (model, expectedModel) => {
      expect((await runPost(request({ caseId, model }))).status).toBe(200)
      expect(mocks.generateQuoteDraft).toHaveBeenCalledWith(supabase, expect.objectContaining({ model: expectedModel }))
    })

  it.each(['other', 'claude-opus-5-5', '', null, 5])('rejects unsupported model %j before database access', async model => {
    expect((await runPost(request({ caseId, model }))).status).toBe(400)
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })

  it('allows a second twenty-sample comparison within the daily limit', async () => {
    mocks.countRecentRuns.mockResolvedValue(39)
    expect((await runPost(request({ caseId, model: 'opus' }))).status).toBe(200)
  })

  it('excludes the reference, compares with current settings and saves only the metrics', async () => {
    const req = request({ caseId })
    expect(await (await runPost(req)).json()).toEqual({ ok: true, data: { runId: 'draft-run', metrics } })
    expect(mocks.generateQuoteDraft).toHaveBeenCalledExactlyOnceWith(supabase, { kind: 'eval_draft',
      memo: 'Paint walls. Call [email]', jobberContext: null, model: 'claude-sonnet-5-5', excludeQuoteIds: [quoteId], signal: req.signal })
    expect(mocks.compare).toHaveBeenCalledWith({ draft: { summary: 'Draft' }, settings: { f1LabourRate: 1000 }, reference })
    expect(mocks.saveResult).toHaveBeenCalledExactlyOnceWith(supabase, caseId, { runId: 'draft-run', metrics })
    expect(mocks.finishRun).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing case or deleted reference', async () => {
    mocks.loadCase.mockResolvedValueOnce(null)
    expect((await runPost(request({ caseId }))).status).toBe(404)
    mocks.reference.mockResolvedValueOnce(null)
    expect((await runPost(request({ caseId }))).status).toBe(404)
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })

  it('does not spend on a draft when settings fail', async () => {
    mocks.settings.mockResolvedValue({ ok: false, error: 'Unable to load settings' })
    expect((await runPost(request({ caseId }))).status).toBe(502)
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })

  it.each([['no_knowledge', 409], ['refusal', 422], ['rate_limited', 429], ['timeout', 504], ['api_error', 502]])('maps %s without saving results', async (errorCode, status) => {
    mocks.generateQuoteDraft.mockResolvedValue({ ok: false, errorCode, runId: null })
    expect((await runPost(request({ caseId }))).status).toBe(status)
    expect(mocks.saveResult).not.toHaveBeenCalled()
  })

  it('does not save comparison results after cancellation', async () => {
    const controller = new AbortController()
    mocks.generateQuoteDraft.mockImplementation(async () => { controller.abort(); return { ok: true, runId: 'draft-run', draft: {} } })
    expect((await runPost(request({ caseId }, controller.signal))).status).toBe(504)
    expect(mocks.saveResult).not.toHaveBeenCalled()
  })

  it('maps result persistence errors to a safe failure', async () => {
    mocks.saveResult.mockRejectedValue(new Error('private@example.com'))
    const response = await runPost(request({ caseId }))
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toContain('private@example.com')
  })
})

it('sets both duration limits to 300 seconds', () => {
  expect(memoDuration).toBe(300)
  expect(runDuration).toBe(300)
})
