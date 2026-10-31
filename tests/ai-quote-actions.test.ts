import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildKnowledgeStats } from '@/lib/ai-quote/knowledge-stats'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), requireRole: vi.fn(), isDevNoAuthMode: vi.fn(),
  candidates: vi.fn(), cases: vi.fn(), evalCase: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/actions/types', () => ({ isDevNoAuthMode: mocks.isDevNoAuthMode }))
vi.mock('@/lib/ai-quote/data', () => ({ loadEvalCandidates: mocks.candidates, loadEvalCases: mocks.cases, loadEvalCase: mocks.evalCase }))

import { activateAiQuoteKnowledge, listAiQuoteKnowledge, updateAiQuoteKnowledgeDraft, reviseActiveAiQuoteKnowledge,
  proposeEvalSet, listEvalCases, updateEvalCaseMemo, removeEvalCase } from '@/lib/actions/ai-quote'

const id = '00000000-0000-4000-8000-000000000001'
const row = {
  id, version: 2, status: 'draft', style_guide: 'Use short descriptions.', pricing_guide: 'Use the median.',
  stats: buildKnowledgeStats([]), source_counts: { quotes: 3, publicLines: 12, items: 8 },
  created_at: '2026-10-30T00:00:00Z', approved_at: null,
}
const input = { id, styleGuide: 'Updated style.', pricingGuide: 'Updated pricing.' }

function setup(response: { data: unknown; error: unknown } = { data: row, error: null }) {
  const builder = {
    select: vi.fn(() => builder), update: vi.fn(() => builder), insert: vi.fn(() => builder), eq: vi.fn(() => builder),
    order: vi.fn(() => builder), limit: vi.fn(() => builder), maybeSingle: vi.fn(async () => response),
    single: vi.fn(async () => response),
    then: (resolve: (value: unknown) => unknown) => resolve(response),
  }
  const client = { from: vi.fn(() => builder), rpc: vi.fn(async () => ({ data: id, error: null as unknown })) }
  mocks.createClient.mockResolvedValue(client)
  return { builder, client }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.isDevNoAuthMode.mockReturnValue(false)
  mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'admin-1', email: 'jimee@paintbuddyco.com.au' }, profile: { role: 'admin', email: 'jimee@paintbuddyco.com.au' } })
})

describe('AI eval actions', () => {
  const quoteId = '00000000-0000-4000-8000-000000000002'
  const evalActions = [
    ['propose', () => proposeEvalSet({ setLabel: 'Launch' })],
    ['list', () => listEvalCases({ setLabel: 'Launch' })],
    ['edit', () => updateEvalCaseMemo({ id, memo: 'Paint walls' })],
    ['remove', () => removeEvalCase({ id })],
  ] as const

  function evalSetup(data: unknown = [{ id: quoteId, work_type: 'Interior', quote_number: '3000',
    customer_name: 'PRIVATE CUSTOMER', quote_items: [{ product_name_snapshot: 'Dulux Wash' }] }]) {
    const response = { data, error: null as unknown }
    const builder = { select: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => response), then: (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve) }
    const client = { from: vi.fn().mockReturnValue(builder) }
    mocks.createClient.mockResolvedValue(client)
    mocks.candidates.mockResolvedValue([{ id: quoteId, createdAt: '2026-10-30Z', scopes: ['interior'], itemCount: 2,
      pricedLineCount: 1, finalTotal: '1100' }])
    mocks.cases.mockResolvedValue([{ id, quote_id: quoteId, memo: 'Paint with DULUX WASH for 3 days', last_metrics: null, leaks: [] }])
    mocks.evalCase.mockResolvedValue({ id, quote_id: quoteId })
    return { builder, client, response }
  }

  it.each(evalActions)('rejects another admin account for %s', async (_, action) => {
    mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'other-admin', email: 'other@paintbuddyco.com.au' },
      profile: { role: 'admin', email: 'jimee@paintbuddyco.com.au' } })
    expect(await action()).toEqual({ ok: false, error: 'AI quoting is not enabled for your account.' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it.each(evalActions)('requires admin for eval %s', async (_, action) => {
    mocks.requireRole.mockResolvedValue({ ok: false, error: 'Admin required' })
    expect(await action()).toMatchObject({ ok: false, error: 'Admin required' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it.each(evalActions)('requires authentication for eval %s', async (_, action) => {
    mocks.isDevNoAuthMode.mockReturnValue(true)
    expect(await action()).toMatchObject({ ok: false, code: 'AUTH_REQUIRED' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('proposes a set without saving and supplies identity-free labels before memo creation', async () => {
    const { builder } = evalSetup()
    expect(await proposeEvalSet({ setLabel: ' Launch ' })).toEqual({ ok: true, data: { setLabel: 'Launch',
      quoteIds: [quoteId], quotes: [{ quoteId, quoteLabel: '#3000 · Interior' }] } })
    expect(builder.update).not.toHaveBeenCalled()
    expect(builder.delete).not.toHaveBeenCalled()
    expect(builder.select.mock.calls[0][0]).not.toMatch(/customer|address|phone|email|\*/i)
  })

  it('limits proposed sets to twenty eligible quotes', async () => {
    evalSetup(Array.from({ length: 25 }, (_, i) => ({ id: `quote-${i}`, work_type: 'Interior', quote_number: String(3000 + i), quote_items: [] })))
    mocks.candidates.mockResolvedValue(Array.from({ length: 25 }, (_, i) => ({ id: `quote-${i}`, createdAt: '2026-10-30Z', scopes: ['interior'],
      itemCount: 2, pricedLineCount: 1, finalTotal: '1100' })))
    expect(await proposeEvalSet({ setLabel: 'Launch' })).toMatchObject({ ok: true, data: { quoteIds: expect.any(Array) } })
    const result = await proposeEvalSet({ setLabel: 'Launch' })
    if (result.ok) expect(result.data.quoteIds).toHaveLength(20)
  })

  it('lists saved notes, recomputes current leak flags and never exposes identity or product metadata', async () => {
    const { builder } = evalSetup()
    const result = await listEvalCases({ setLabel: 'Launch' })
    expect(result).toEqual({ ok: true, data: [{ id, quoteId, quoteLabel: '#3000 · Interior',
      memo: 'Paint with DULUX WASH for 3 days', leaks: ['days_or_litres', 'product'], lastMetrics: null }] })
    expect(JSON.stringify(result)).not.toContain('PRIVATE CUSTOMER')
    expect(builder.select.mock.calls[0][0]).not.toMatch(/customer|address|phone|email|\*/i)
  })

  it('redacts edited notes and clears stale results', async () => {
    const { builder } = evalSetup()
    const result = await updateEvalCaseMemo({ id, memo: ' Call private@example.com for 3 days ' })
    expect(result).toEqual({ ok: true, data: { id, memo: 'Call [email] for 3 days', leaks: ['days_or_litres'] } })
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ memo: 'Call [email] for 3 days', last_metrics: null, last_draft_run_id: null }))
    expect(builder.eq).toHaveBeenCalledWith('id', id)
  })

  it('removes only the comparison case', async () => {
    const { client, builder } = evalSetup()
    expect(await removeEvalCase({ id })).toEqual({ ok: true, data: { id } })
    expect(client.from).toHaveBeenCalledExactlyOnceWith('ai_quote_eval_cases')
    expect(builder.delete).toHaveBeenCalledTimes(1)
    expect(builder.eq).toHaveBeenCalledWith('id', id)
  })

  it.each([{}, { setLabel: ' ' }, { setLabel: 'x'.repeat(61) }])('validates set labels %j', async input => {
    expect(await proposeEvalSet(input)).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await listEvalCases(input)).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it.each([{ id: 'bad', memo: 'Paint' }, { id, memo: ' ' }, { id, memo: 'x'.repeat(8001) }])('validates memo edits %j', async input => {
    expect(await updateEvalCaseMemo(input)).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('handles missing cases and malformed removal IDs', async () => {
    evalSetup()
    mocks.evalCase.mockResolvedValue(null)
    expect(await updateEvalCaseMemo({ id, memo: 'Paint' })).toMatchObject({ ok: false })
    expect(await removeEvalCase({ id: 'bad' })).toMatchObject({ ok: false, code: 'VALIDATION' })
  })

  it.each(evalActions)('returns safe dependency failures for eval %s', async (_, action) => {
    mocks.createClient.mockRejectedValue(new Error('private@example.com'))
    const result = await action()
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('(Ref:') })
    expect(JSON.stringify(result)).not.toContain('private@example.com')
  })
})
afterEach(() => vi.restoreAllMocks())

const actions = [
  ['list', () => listAiQuoteKnowledge()],
  ['update', () => updateAiQuoteKnowledgeDraft(input)],
  ['activate', () => activateAiQuoteKnowledge({ id })],
  ['revise', () => reviseActiveAiQuoteKnowledge(input)],
] as const

describe('AI knowledge actions', () => {
  it.each(actions)('rejects another admin account for %s', async (_, action) => {
    mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'other-admin', email: 'other@paintbuddyco.com.au' },
      profile: { role: 'admin', email: 'jimee@paintbuddyco.com.au' } })
    expect(await action()).toEqual({ ok: false, error: 'AI quoting is not enabled for your account.' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it.each(actions)('requires admin to %s', async (_, action) => {
    mocks.requireRole.mockResolvedValue({ ok: false, error: 'Admin access required' })
    expect(await action()).toMatchObject({ ok: false, error: 'Admin access required' })
    expect(mocks.requireRole).toHaveBeenCalledWith('admin')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it.each(actions)('returns a clear unavailable result in dev no-auth for %s', async (_, action) => {
    mocks.isDevNoAuthMode.mockReturnValue(true)
    expect(await action()).toMatchObject({ ok: false, error: expect.stringMatching(/authentication/i) })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('lists only the latest 10 versions and maps persisted fields', async () => {
    const { builder, client } = setup({ data: [row], error: null })
    const result = await listAiQuoteKnowledge()
    expect(client.from).toHaveBeenCalledWith('ai_quote_knowledge')
    expect(builder.order).toHaveBeenCalledWith('version', { ascending: false })
    expect(builder.limit).toHaveBeenCalledWith(10)
    expect(result).toEqual({ ok: true, data: [{
      id, version: 2, status: 'draft', styleGuide: row.style_guide, pricingGuide: row.pricing_guide,
      stats: row.stats, sourceCounts: row.source_counts, createdAt: row.created_at, approvedAt: null,
    }] })
  })

  it.each(['active', 'archived'])('rejects editing a %s version through the draft predicate', async () => {
    const { builder } = setup({ data: null, error: null })
    expect(await updateAiQuoteKnowledgeDraft(input)).toEqual({ ok: false, code: 'VALIDATION', error: 'Only draft guides can be edited.' })
    expect(builder.eq).toHaveBeenCalledWith('status', 'draft')
  })

  it.each([
    { ...input, id: 'bad-id' }, { ...input, styleGuide: '' }, { ...input, pricingGuide: ' ' },
    { ...input, styleGuide: 'a'.repeat(40001) }, { ...input, pricingGuide: 'a'.repeat(40001) },
  ])('validates id and guide lengths before database access', async value => {
    expect(await updateAiQuoteKnowledgeDraft(value)).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('saves guide edits with an atomic draft-only predicate', async () => {
    const { builder } = setup({ data: { ...row, style_guide: input.styleGuide, pricing_guide: input.pricingGuide }, error: null })
    expect(await updateAiQuoteKnowledgeDraft(input)).toMatchObject({ ok: true, data: input })
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ style_guide: input.styleGuide, pricing_guide: input.pricingGuide }))
    expect(builder.eq).toHaveBeenCalledWith('id', id)
    expect(builder.eq).toHaveBeenCalledWith('status', 'draft')
  })

  it('calls the activation RPC with the validated id', async () => {
    const { client } = setup()
    expect(await activateAiQuoteKnowledge({ id })).toEqual({ ok: true, data: { id } })
    expect(client.rpc).toHaveBeenCalledWith('activate_ai_quote_knowledge', { p_id: id })
  })

  it.each([null, { ...row, status: 'draft' }, { ...row, status: 'archived' }])('rejects revising a missing or non-active guide', async data => {
    const { builder, client } = setup({ data, error: null })
    expect(await reviseActiveAiQuoteKnowledge(input)).toEqual({ ok: false, code: 'VALIDATION', error: 'This guide is no longer active. Refresh and try again.' })
    expect(builder.eq).toHaveBeenCalledWith('id', id)
    expect(builder.insert).not.toHaveBeenCalled()
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('rejects unchanged active guides without creating a version', async () => {
    const { builder } = setup({ data: { ...row, status: 'active' }, error: null })
    expect(await reviseActiveAiQuoteKnowledge({ id, styleGuide: row.style_guide, pricingGuide: row.pricing_guide }))
      .toEqual({ ok: false, code: 'VALIDATION', error: 'No changes to save.' })
    expect(builder.insert).not.toHaveBeenCalled()
  })

  it.each([{ ...input, id: 'bad' }, { ...input, styleGuide: ' ' }, { ...input, pricingGuide: 'x'.repeat(40001) }])('validates active guide revisions before database access', async value => {
    expect(await reviseActiveAiQuoteKnowledge(value)).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  function revisionSetup() {
    const nextId = '00000000-0000-4000-8000-000000000003'
    const active = { ...row, status: 'active', run_id: '00000000-0000-4000-8000-000000000004' }
    const revised = { ...row, id: nextId, version: 8, status: 'active', style_guide: input.styleGuide,
      pricing_guide: input.pricingGuide, approved_at: '2026-10-31T00:00:00Z' }
    const { builder, client } = setup()
    builder.maybeSingle.mockResolvedValueOnce({ data: active, error: null })
      .mockResolvedValueOnce({ data: { version: 7 }, error: null })
      .mockResolvedValueOnce({ data: revised, error: null })
    builder.single.mockResolvedValue({ data: { ...revised, status: 'draft', approved_at: null }, error: null })
    return { builder, client, active, nextId }
  }

  it('creates the next version with the active sources and activates only the new guide', async () => {
    const { builder, client, active, nextId } = revisionSetup()
    expect(await reviseActiveAiQuoteKnowledge(input)).toEqual({ ok: true, data: {
      id: nextId, version: 8, status: 'active', styleGuide: input.styleGuide, pricingGuide: input.pricingGuide,
      stats: row.stats, sourceCounts: row.source_counts, createdAt: row.created_at, approvedAt: '2026-10-31T00:00:00Z',
    } })
    expect(builder.insert).toHaveBeenCalledExactlyOnceWith({ version: 8, status: 'draft', run_id: active.run_id,
      style_guide: input.styleGuide, pricing_guide: input.pricingGuide, stats: row.stats, source_counts: row.source_counts })
    expect(builder.order).toHaveBeenCalledWith('version', { ascending: false })
    expect(builder.limit).toHaveBeenCalledWith(1)
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith('activate_ai_quote_knowledge', { p_id: nextId })
    expect(builder.update).not.toHaveBeenCalled()
  })

  it('returns a safe failure and retains the new draft when activation fails', async () => {
    const { builder, client } = revisionSetup()
    client.rpc.mockResolvedValue({ data: id, error: { message: 'private@example.com' } })
    const result = await reviseActiveAiQuoteKnowledge(input)
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('(Ref:') })
    expect(JSON.stringify(result)).not.toContain('private@example.com')
    expect(builder.insert).toHaveBeenCalledTimes(1)
    expect(builder.update).not.toHaveBeenCalled()
  })

  it('rejects invalid activation ids', async () => {
    expect(await activateAiQuoteKnowledge({ id: 'bad' })).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it.each(actions)('returns safe database errors for %s', async (_, action) => {
    const error = { message: 'secret customer@example.com', details: 'private' }
    const { client } = setup({ data: null, error })
    client.rpc.mockResolvedValue({ data: id, error })
    const result = await action()
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('(Ref:') })
    expect(JSON.stringify(result)).not.toContain('customer@example.com')
  })

  it.each(actions)('catches thrown infrastructure failures for %s', async (_, action) => {
    mocks.createClient.mockRejectedValue(new Error('secret token'))
    const result = await action()
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('(Ref:') })
    expect(JSON.stringify(result)).not.toContain('secret token')
  })
})
