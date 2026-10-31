import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { aiQuoteDraftRequestSchema } from '@/lib/validators'

const mocks = vi.hoisted(() => ({
  budget: vi.fn(), availability: vi.fn(), requireRole: vi.fn(), createClient: vi.fn(), countRecentRuns: vi.fn(), generateQuoteDraft: vi.fn(),
}))
vi.mock('@/lib/ai-quote/budget', () => ({ getAiMonthlyBudgetStatus: mocks.budget }))
vi.mock('@/lib/ai-quote/config', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/ai-quote/config')>(),
  getAiQuoteAvailability: mocks.availability,
}))
vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/ai-quote/runs', () => ({ countRecentRuns: mocks.countRecentRuns }))
vi.mock('@/lib/ai-quote/draft-service', () => ({ generateQuoteDraft: mocks.generateQuoteDraft }))

import { POST, maxDuration } from '@/app/api/ai/quote-draft/route'

const photoRuns: Array<Record<string, unknown>> = []
let lookupError: Error | null = null
const supabase = { client: 'session', from(table: string) {
  if (table !== 'ai_quote_runs') throw new Error(`Unexpected table ${table}`)
  let rows = [...photoRuns]
  const query = {
    select() { return query },
    eq(column: string, value: unknown) { rows = rows.filter(row => row[column] === value); return query },
    gte(column: string, value: string) { rows = rows.filter(row => String(row[column]) >= value); return query },
    async maybeSingle() { return { data: rows[0] ?? null, error: lookupError } },
  }
  return query
} }
const photoRunId = 'a0c33da7-d183-4f07-a260-3bb638863791'
const finding = { area: 'Stairwell', kind: 'access', issue: 'High walls', suggestedTreatment: 'Use access equipment',
  photoRefs: [1], confidence: 'high' }
function photoRun(overrides: Record<string, unknown> = {}) {
  return { id: photoRunId, kind: 'photo_analysis', status: 'succeeded', created_by: 'admin-1',
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), completed_at: new Date(Date.now() - 29 * 60 * 1000).toISOString(),
    output: { findings: [finding], photoCount: 2 }, ...overrides }
}
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
  photoRuns.length = 0
  lookupError = null
  mocks.budget.mockResolvedValue({ budgetUsd: '30.00', spentUsd: '1.00', remainingUsd: '29.00', reached: false })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.availability.mockReturnValue({ enabled: true })
  mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'admin-1', email: 'jimee@paintbuddyco.com.au' }, profile: { email: 'jimee@paintbuddyco.com.au', role: 'admin' } })
  mocks.createClient.mockResolvedValue(supabase)
  mocks.countRecentRuns.mockResolvedValue(0)
  mocks.generateQuoteDraft.mockResolvedValue({ ok: true, runId: 'run-1', draft })
})
afterEach(() => vi.restoreAllMocks())

describe('POST quote draft', () => {
  it('validates an optional photo analysis UUID and rejects client findings', () => {
    expect(aiQuoteDraftRequestSchema.safeParse({ memo: 'Paint', jobberContext: null, photoAnalysisRunId: 'not-a-uuid' }).success).toBe(false)
    expect(aiQuoteDraftRequestSchema.parse({ memo: 'Paint', jobberContext: null, photoAnalysisRunId: photoRunId,
      photoFindings: [finding], photoCount: 30 })).toEqual({ memo: 'Paint', jobberContext: null, photoAnalysisRunId: photoRunId })
  })

  it.each([
    ['another owner', { created_by: 'other-admin' }],
    ['two hours old', { created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }],
    ['failed', { status: 'failed' }], ['wrong kind', { kind: 'quote_draft' }],
    ['another id', { id: 'b0c33da7-d183-4f07-a260-3bb638863791' }],
  ])('rejects %s analysis records before calling the model', async (_label, overrides) => {
    photoRuns.push(photoRun(overrides))
    const response = await POST(request({ memo: 'Paint', jobberContext: null, photoAnalysisRunId: photoRunId }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, error: expect.stringContaining('Photo analysis expired. Create the draft again.') })
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
    expect(mocks.budget).not.toHaveBeenCalled()
  })

  it('rejects an unknown photo analysis record', async () => {
    const response = await POST(request({ memo: 'Paint', jobberContext: null, photoAnalysisRunId: photoRunId }))
    expect(response.status).toBe(400)
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })

  it('uses revalidated stored findings and lets the first draft after an analysis pass a reached monthly budget', async () => {
    photoRuns.push(photoRun({ output: { photoCount: 2, findings: [
      { ...finding, photoRefs: [0, 1, 2, 3, 31] }, { ...finding, photoRefs: [31] }, { ...finding, kind: 'unknown' },
    ] } }))
    mocks.budget.mockResolvedValue({ reached: true })
    const req = request({ memo: 'Paint', jobberContext: null, photoAnalysisRunId: photoRunId,
      photoFindings: [{ ...finding, issue: 'Forged finding' }], photoCount: 30 })
    const response = await POST(req)
    expect(response.status).toBe(200)
    expect(mocks.countRecentRuns).toHaveBeenLastCalledWith(supabase, 'admin-1', 'quote_draft', new Date(photoRuns[0].completed_at as string))
    expect(mocks.generateQuoteDraft).toHaveBeenCalledExactlyOnceWith(supabase, {
      kind: 'quote_draft', memo: 'Paint', jobberContext: null, signal: req.signal,
      photoFindings: [{ ...finding, photoRefs: [1, 2] }], photoCount: 2,
    })
  })

  it('re-applies the monthly budget when an analysis was already used for a draft', async () => {
    photoRuns.push(photoRun())
    mocks.budget.mockResolvedValue({ reached: true, spentUsd: '30.10', budgetUsd: '30.00' })
    mocks.countRecentRuns.mockResolvedValueOnce(0).mockResolvedValueOnce(1)
    const response = await POST(request({ memo: 'Paint', jobberContext: null, photoAnalysisRunId: photoRunId }))
    expect(response.status).toBe(429)
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })

  it('accepts an analysis exactly one hour old', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-10-31T12:00:00Z'))
      photoRuns.push(photoRun({ created_at: '2026-10-31T11:00:00.000Z' }))
      expect((await POST(request({ memo: 'Paint', jobberContext: null, photoAnalysisRunId: photoRunId }))).status).toBe(200)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the daily draft limit when using valid photo analysis', async () => {
    photoRuns.push(photoRun())
    mocks.countRecentRuns.mockResolvedValue(20)
    expect((await POST(request({ memo: 'Paint', jobberContext: null, photoAnalysisRunId: photoRunId }))).status).toBe(429)
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })

  it('fails safely when loading photo analysis fails', async () => {
    lookupError = new Error('Private photo data')
    photoRuns.push(photoRun())
    const response = await POST(request({ memo: 'Paint', jobberContext: null, photoAnalysisRunId: photoRunId }))
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toContain('Private photo data')
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })

  it('rejects another admin account before any AI or database access', async () => {
    mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'other-admin', email: 'other@paintbuddyco.com.au' },
      profile: { role: 'admin', email: 'jimee@paintbuddyco.com.au' } })
    const response = await POST(request())
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining('AI quoting is not enabled for your account.') })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })

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

  it('returns the monthly budget message before starting any AI call', async () => {
    mocks.budget.mockResolvedValue({ budgetUsd: '30.00', spentUsd: '30.01', remainingUsd: '0.00', reached: true })
    const response = await POST(request())
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining('Monthly AI budget reached ($30.01 of $30.00). Change it in Settings > AI.') })
    expect(mocks.budget).toHaveBeenCalledWith(supabase)
    expect(mocks.generateQuoteDraft).not.toHaveBeenCalled()
  })

  it('exports maxDuration = 300', () => expect(maxDuration).toBe(300))
})
