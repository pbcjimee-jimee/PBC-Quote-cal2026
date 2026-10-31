import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { buildKnowledgeStats } from '@/lib/ai-quote/knowledge-stats'
import { countRecentRuns, finishRun, insertKnowledgeDraft, startRun, enforceAiReviewGate, linkRunAndConfirmReview, hasPendingAiReview, type AiRunKind } from '@/lib/ai-quote/runs'

function database(responses: Array<{ data: unknown; error: unknown; count?: number | null }>) {
  const chains: Array<ReturnType<typeof chainFor>> = []
  function chainFor(response: (typeof responses)[number]) {
    return {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(), single: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve),
    }
  }
  const from = vi.fn(() => {
    const chain = chainFor(responses[chains.length])
    chains.push(chain)
    return chain
  })
  return { client: { from } as unknown as SupabaseClient<Database>, from, chains }
}

describe('AI run bookkeeping', () => {
  it.each<AiRunKind>(['knowledge_build', 'quote_draft', 'eval_memo', 'eval_draft'])('counts %s for only the user and time window', async kind => {
    const db = database([{ data: null, error: null, count: 7 }])
    expect(await countRecentRuns(db.client, 'user-1', kind, new Date('2026-10-29T00:00:00Z'))).toBe(7)
    expect(db.from).toHaveBeenCalledWith('ai_quote_runs')
    expect(db.chains[0].select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(db.chains[0].eq).toHaveBeenCalledWith('created_by', 'user-1')
    expect(db.chains[0].eq).toHaveBeenCalledWith('kind', kind)
    expect(db.chains[0].gte).toHaveBeenCalledWith('created_at', '2026-10-29T00:00:00.000Z')
  })

  it('defaults a missing count to zero', async () => {
    const db = database([{ data: null, error: null, count: null }])
    expect(await countRecentRuns(db.client, 'user-1', 'quote_draft', new Date())).toBe(0)
  })

  it('starts a running audit record using database actor defaults', async () => {
    const db = database([{ data: { id: 'run-1' }, error: null }])
    expect(await startRun(db.client, { kind: 'quote_draft', promptVersion: 'quote-draft-v1', model: 'claude-opus-5-5',
      knowledgeId: 'knowledge-1', jobberQuoteId: 'jobber-1', memo: 'Masked memo' })).toBe('run-1')
    expect(db.chains[0].insert).toHaveBeenCalledWith({
      kind: 'quote_draft', status: 'running', prompt_version: 'quote-draft-v1', model: 'claude-opus-5-5',
      knowledge_id: 'knowledge-1', jobber_quote_id: 'jobber-1', memo: 'Masked memo',
    })
    expect(db.chains[0].insert.mock.calls[0][0]).not.toHaveProperty('created_by')
  })

  it('starts runs with null optional metadata', async () => {
    const db = database([{ data: { id: 'run-1' }, error: null }])
    await startRun(db.client, { kind: 'eval_memo', promptVersion: 'eval-memo-v1', model: 'claude-opus-5-5' })
    expect(db.chains[0].insert.mock.calls[0][0]).toMatchObject({ knowledge_id: null, jobber_quote_id: null, memo: null })
  })

  it('records all usage, estimated cost, actual model and completion timestamp', async () => {
    const db = database([{ data: null, error: null }])
    await finishRun(db.client, 'run-1', { status: 'succeeded', model: 'response-model', output: { findings: [] },
      usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 1000, cacheWriteTokens: 200 } })
    expect(db.chains[0].update).toHaveBeenCalledWith({
      status: 'succeeded', model: 'response-model', output: { findings: [] }, error_code: null,
      input_tokens: 1000, output_tokens: 100, cache_read_tokens: 1000, cache_write_tokens: 200,
      cost_usd: '0.0072', completed_at: expect.any(String),
    })
    expect(db.chains[0].eq).toHaveBeenCalledWith('id', 'run-1')
    expect(Number.isNaN(Date.parse(db.chains[0].update.mock.calls[0][0].completed_at))).toBe(false)
  })

  it.each(['failed', 'refused'] as const)('finishes %s runs without usage and preserves the initial model', async status => {
    const db = database([{ data: null, error: null }])
    await finishRun(db.client, 'run-1', { status, errorCode: 'refusal' })
    expect(db.chains[0].update.mock.calls[0][0]).toMatchObject({
      status, error_code: 'refusal', cost_usd: '0.0000', input_tokens: 0, output_tokens: 0,
      cache_read_tokens: 0, cache_write_tokens: 0,
    })
    expect(db.chains[0].update.mock.calls[0][0]).not.toHaveProperty('model')
  })

  it.each([null, { version: 6 }])('increments the highest knowledge version from %j', async previous => {
    const version = previous ? 7 : 1
    const db = database([{ data: previous, error: null }, { data: { id: 'knowledge-1', version }, error: null }])
    const stats = buildKnowledgeStats([])
    const sourceCounts = { quotes: 0, publicLines: 0, items: 0 }
    expect(await insertKnowledgeDraft(db.client, { runId: 'run-1', styleGuide: 'Style', pricingGuide: 'Pricing',
      stats, sourceCounts })).toEqual({ id: 'knowledge-1', version })
    expect(db.chains[0].order).toHaveBeenCalledWith('version', { ascending: false })
    expect(db.chains[0].limit).toHaveBeenCalledWith(1)
    expect(db.chains[1].insert).toHaveBeenCalledWith({ version, status: 'draft', run_id: 'run-1',
      style_guide: 'Style', pricing_guide: 'Pricing', stats, source_counts: sourceCounts })
    expect(db.chains[1].insert.mock.calls[0][0]).not.toHaveProperty('created_by')
  })

  it.each(['count', 'start', 'finish', 'version', 'insert'])('throws original database errors for %s', async kind => {
    const error = { code: '42501', message: 'denied' }
    const failure = { data: null, error }
    const db = database(kind === 'insert' ? [{ data: null, error: null }, failure] : [failure])
    const operation = {
      count: () => countRecentRuns(db.client, 'user-1', 'quote_draft', new Date()),
      start: () => startRun(db.client, { kind: 'quote_draft', promptVersion: 'v1', model: 'model' }),
      finish: () => finishRun(db.client, 'run-1', { status: 'failed' }),
      version: () => insertKnowledgeDraft(db.client, { runId: 'run-1', styleGuide: 'Style', pricingGuide: 'Pricing',
        stats: buildKnowledgeStats([]), sourceCounts: { quotes: 0, publicLines: 0, items: 0 } }),
      insert: () => insertKnowledgeDraft(db.client, { runId: 'run-1', styleGuide: 'Style', pricingGuide: 'Pricing',
        stats: buildKnowledgeStats([]), sourceCounts: { quotes: 0, publicLines: 0, items: 0 } }),
    }[kind]!
    await expect(operation()).rejects.toBe(error)
  })
})

describe('AI draft review gate', () => {
  const run = { id: 'run-1', kind: 'quote_draft', status: 'succeeded', created_by: 'user-1', quote_id: null }
  const input = { userId: 'user-1', quoteId: null, syncJobber: false, aiDraftRunId: 'run-1' }
  it.each([null, { ...run, created_by: 'someone-else' }, { ...run, status: 'failed' }, { ...run, kind: 'eval_draft' }, { ...run, quote_id: 'another-quote' }])('rejects invalid or reassigned runs: %j', async data => {
    const db = database([{ data, error: null }])
    expect(await enforceAiReviewGate(db.client, input)).toMatchObject({ ok: false, code: 'VALIDATION' })
  })
  it('blocks sync without confirmation and permits local save without it', async () => {
    const db = database([{ data: run, error: null }, { data: run, error: null }])
    expect(await enforceAiReviewGate(db.client, { ...input, syncJobber: true })).toEqual({ ok: false, code: 'VALIDATION', error: 'Confirm the AI draft review before syncing to Jobber.' })
    expect(await enforceAiReviewGate(db.client, input)).toEqual({ ok: true, data: null })
  })
  it('blocks saved-quote sync with a pending run even when the client omits its ID', async () => {
    const db = database([{ data: null, error: null, count: 1 }])
    expect(await enforceAiReviewGate(db.client, { userId: 'user-1', quoteId: 'quote-1', syncJobber: true })).toMatchObject({ ok: false, error: 'Confirm the AI draft review before syncing to Jobber.' })
    expect(db.chains[0].eq).toHaveBeenCalledWith('quote_id', 'quote-1')
    expect(db.chains[0].is).toHaveBeenCalledWith('review_confirmed_at', null)
  })
  it('allows confirmed sync and avoids AI access for a manual local save', async () => {
    const db = database([])
    expect(await enforceAiReviewGate(db.client, { userId: 'user-1', quoteId: null, syncJobber: true, aiReviewConfirmed: true })).toEqual({ ok: true, data: null })
    expect(await enforceAiReviewGate(db.client, { userId: 'user-1', quoteId: 'quote-1', syncJobber: false })).toEqual({ ok: true, data: null })
    await linkRunAndConfirmReview(db.client, { quoteId: 'quote-1', confirm: false, userId: 'user-1' })
    expect(db.from).not.toHaveBeenCalled()
  })
  it('links successful owned drafts then confirms every unreviewed linked draft using the DB actor guard', async () => {
    const db = database([{ data: null, error: null }, { data: null, error: null }])
    await linkRunAndConfirmReview(db.client, { quoteId: 'quote-1', aiDraftRunId: 'run-1', userId: 'user-1', confirm: true })
    expect(db.chains[0].update).toHaveBeenCalledWith({ quote_id: 'quote-1' })
    expect(db.chains[0].eq).toHaveBeenCalledWith('id', 'run-1')
    expect(db.chains[0].eq).toHaveBeenCalledWith('created_by', 'user-1')
    expect(db.chains[1].update).toHaveBeenCalledWith({ review_confirmed_at: expect.any(String) })
    expect(db.chains[1].eq).toHaveBeenCalledWith('quote_id', 'quote-1')
    expect(db.chains[1].is).toHaveBeenCalledWith('review_confirmed_at', null)
    expect(db.chains[1].eq).not.toHaveBeenCalledWith('created_by', 'user-1')
  })
  it('does not confirm runs on local save', async () => {
    const db = database([{ data: null, error: null }])
    await linkRunAndConfirmReview(db.client, { quoteId: 'quote-1', aiDraftRunId: 'run-1', userId: 'user-1', confirm: false })
    expect(db.chains).toHaveLength(1)
    expect(db.chains[0].update).toHaveBeenCalledWith({ quote_id: 'quote-1' })
  })
  it('surfaces pending-review query and link errors', async () => {
    const error = { code: '42501' }
    await expect(hasPendingAiReview(database([{ data: null, error }]).client, 'quote-1')).rejects.toBe(error)
    await expect(linkRunAndConfirmReview(database([{ data: null, error }]).client, { quoteId: 'quote-1', aiDraftRunId: 'run-1', confirm: false, userId: 'user-1' })).rejects.toBe(error)
  })
})
