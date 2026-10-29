import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildKnowledgeStats } from '@/lib/ai-quote/knowledge-stats'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), requireRole: vi.fn(), isDevNoAuthMode: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/actions/types', () => ({ isDevNoAuthMode: mocks.isDevNoAuthMode }))

import { activateAiQuoteKnowledge, listAiQuoteKnowledge, updateAiQuoteKnowledgeDraft } from '@/lib/actions/ai-quote'

const id = '00000000-0000-4000-8000-000000000001'
const row = {
  id, version: 2, status: 'draft', style_guide: 'Use short descriptions.', pricing_guide: 'Use the median.',
  stats: buildKnowledgeStats([]), source_counts: { quotes: 3, publicLines: 12, items: 8 },
  created_at: '2026-10-30T00:00:00Z', approved_at: null,
}
const input = { id, styleGuide: 'Updated style.', pricingGuide: 'Updated pricing.' }

function setup(response: { data: unknown; error: unknown } = { data: row, error: null }) {
  const builder = {
    select: vi.fn(() => builder), update: vi.fn(() => builder), eq: vi.fn(() => builder),
    order: vi.fn(() => builder), limit: vi.fn(() => builder), maybeSingle: vi.fn(async () => response),
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
  mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'admin-1' } })
})
afterEach(() => vi.restoreAllMocks())

const actions = [
  ['list', () => listAiQuoteKnowledge()],
  ['update', () => updateAiQuoteKnowledgeDraft(input)],
  ['activate', () => activateAiQuoteKnowledge({ id })],
] as const

describe('AI knowledge actions', () => {
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
