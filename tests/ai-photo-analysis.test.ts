import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/supabase/types'
import { MicrosoftAuthError } from '@/lib/microsoft/graph'

const mocks = vi.hoisted(() => ({
  token: vi.fn(), images: vi.fn(), thumbnail: vi.fn(), knowledge: vi.fn(),
  startRun: vi.fn(), finishRun: vi.fn(), createClient: vi.fn(), claude: vi.fn(),
}))
vi.mock('@/lib/microsoft/tokens', () => ({ getUsableMicrosoftAccessToken: mocks.token }))
vi.mock('@/lib/microsoft/graph', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/microsoft/graph')>(),
  listFolderImages: mocks.images, fetchPhotoThumbnail: mocks.thumbnail,
}))
vi.mock('@/lib/ai-quote/data', () => ({ loadActiveKnowledge: mocks.knowledge }))
vi.mock('@/lib/ai-quote/runs', () => ({ startRun: mocks.startRun, finishRun: mocks.finishRun }))
vi.mock('@/lib/ai-quote/anthropic', () => ({ createAnthropicClient: mocks.createClient, runStructuredClaudeRequest: mocks.claude }))

import { analyzeQuotePhotos } from '@/lib/ai-quote/photo-analysis-service'
import { buildPhotoAnalysisPrompt } from '@/lib/ai-quote/photo-analysis-prompt'
import { photoAnalysisOutputSchema } from '@/lib/ai-quote/photo-analysis-schema'

const supabase = {} as SupabaseClient<Database>
const client = {} as Anthropic
const usage = { inputTokens: 123, outputTokens: 45, cacheReadTokens: 20, cacheWriteTokens: 10 }
const knowledge = { id: 'guide-1', version: 1, styleGuide: 'PBC style', pricingGuide: 'Prepare surfaces' }
const finding = { area: 'Stairwell', kind: 'access', issue: 'High walls', suggestedTreatment: 'Use access equipment',
  photoRefs: [1], confidence: 'high' }
const photo = { mediaType: 'image/png' as const, data: 'cGhvdG8=' }
const input = () => ({ userId: 'admin-1', folderId: 'folder-private', memo: 'Paint the Stairwell', jobberContext: null, client })
const success = () => ({ ok: true, data: { findings: [finding] }, usage, model: 'actual-model' })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.token.mockResolvedValue({ ok: true, accessToken: 'token' })
  mocks.images.mockResolvedValue([{ id: 'image-1', name: 'private-address.png' }, { id: 'image-2', name: 'z.png' }])
  mocks.thumbnail.mockResolvedValue(photo)
  mocks.knowledge.mockResolvedValue(knowledge)
  mocks.startRun.mockResolvedValue('run-1')
  mocks.finishRun.mockResolvedValue(undefined)
  mocks.createClient.mockReturnValue(client)
  mocks.claude.mockResolvedValue(success())
})
afterEach(() => vi.useRealTimers())

describe('photo analysis prompt', () => {
  it('sends numbered image blocks and safe context, never filenames, folder names, addresses or prices', () => {
    const photos = [{ ...photo, name: 'private-address.png', folderName: 'secret-folder' }, photo]
    const prompt = buildPhotoAnalysisPrompt({ knowledge, memo: 'Paint <walls> call 0412 345 678 or private@example.com',
      photos, jobberContext: { jobberQuoteId: 'secret-id', workType: 'Interior', customerType: 'Residential', areaSqft: 1500,
        existingLines: [{ name: 'Stairwell', description: '15 Private Street', quantity: 1, unitPrice: 4321 }] },
    })
    const serialized = JSON.stringify(prompt)
    expect(serialized).not.toMatch(/private-address|secret-folder|15 Private Street|secret-id|4321|0412|private@example.com/)
    expect(serialized).toContain('photo 01')
    expect(serialized).toContain('photo 02')
    expect(serialized).toContain('<memo>Paint &lt;walls&gt; call [phone] or [email]</memo>')
    expect(serialized).toContain('Stairwell')
    expect(serialized).toContain('Interior')
    expect(serialized).toContain('1500')
    const content = prompt.messages[0].content
    expect(Array.isArray(content) && content.filter(block => block.type === 'image')).toHaveLength(2)
  })

  it('leaves length and reference limits to server validation', () => {
    expect(photoAnalysisOutputSchema.safeParse({ findings: [{ ...finding, area: 'a'.repeat(100), photoRefs: [0, 31] }] }).success).toBe(true)
    expect(photoAnalysisOutputSchema.safeParse({ findings: [{ ...finding, kind: 'other' }] }).success).toBe(false)
  })
})

describe('analyze quote photos', () => {
  it('validates findings against downloaded photos and stores only findings, count and item IDs', async () => {
    mocks.claude.mockResolvedValue({ ...success(), data: { findings: [
      { ...finding, photoRefs: [0, 2, 3, 31] }, { ...finding, photoRefs: [0, 31] }, { ...finding, kind: 'other' },
    ] } })
    const result = await analyzeQuotePhotos(supabase, { ...input(), memo: 'call private@example.com' })
    expect(result).toEqual({ ok: true, runId: 'run-1', findings: [{ ...finding, photoRefs: [2] }], photoCount: 2,
      skippedCount: 0, photoLabels: [{ ref: 1, name: 'private-address.png' }, { ref: 2, name: 'z.png' }] })
    expect(mocks.startRun).toHaveBeenCalledExactlyOnceWith(supabase, {
      kind: 'photo_analysis', model: 'claude-opus-5-5', promptVersion: 'photo-analysis-v1',
      knowledgeId: 'guide-1', jobberQuoteId: null, memo: 'call [email]',
    })
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', {
      status: 'succeeded', model: 'actual-model', usage,
      output: { findings: [{ ...finding, photoRefs: [2] }], photoCount: 2, photoItemIds: ['image-1', 'image-2'] },
    })
    expect(mocks.claude).toHaveBeenCalledWith(client, expect.objectContaining({ model: 'claude-opus-5-5', maxTokens: 8000 }))
    expect(JSON.stringify(mocks.claude.mock.calls)).not.toContain('private-address')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('skips missing thumbnails and renumbers the successful images', async () => {
    mocks.thumbnail.mockResolvedValueOnce(null).mockResolvedValueOnce(photo)
    const result = await analyzeQuotePhotos(supabase, input())
    expect(result).toMatchObject({ ok: true, photoCount: 1, skippedCount: 1, photoLabels: [{ ref: 1, name: 'z.png' }] })
    expect(mocks.finishRun.mock.calls[0][2].output.photoItemIds).toEqual(['image-2'])
  })

  it.each(['empty folder', 'all thumbnails failed'])('returns no_photos for %s without calling Claude', async scenario => {
    if (scenario === 'empty folder') mocks.images.mockResolvedValue([])
    else mocks.thumbnail.mockResolvedValue(null)
    expect(await analyzeQuotePhotos(supabase, input())).toMatchObject({ ok: false, errorCode: 'no_photos' })
    expect(mocks.claude).not.toHaveBeenCalled()
  })

  it.each(['not_connected', 'reconnect_required'])('returns %s without starting a run', async reason => {
    mocks.token.mockResolvedValue({ ok: false, reason })
    expect(await analyzeQuotePhotos(supabase, input())).toEqual({ ok: false, runId: null, errorCode: reason })
    expect(mocks.startRun).not.toHaveBeenCalled()
    expect(mocks.claude).not.toHaveBeenCalled()
  })

  it('requires active knowledge before starting analysis', async () => {
    mocks.knowledge.mockResolvedValue(null)
    expect(await analyzeQuotePhotos(supabase, input())).toEqual({ ok: false, runId: null, errorCode: 'no_knowledge' })
    expect(mocks.startRun).not.toHaveBeenCalled()
  })

  it.each(['images', 'thumbnail'] as const)('maps Graph auth errors during %s to reconnect_required', async stage => {
    mocks[stage].mockRejectedValue(new MicrosoftAuthError())
    expect(await analyzeQuotePhotos(supabase, input())).toMatchObject({ ok: false, errorCode: 'reconnect_required' })
    expect(mocks.claude).not.toHaveBeenCalled()
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', { status: 'failed', errorCode: 'reconnect_required' })
  })

  it('limits downloads to the first 30 filenames and six concurrent requests while preserving order', async () => {
    mocks.images.mockResolvedValue(Array.from({ length: 35 }, (_, i) => ({ id: `id-${i}`, name: `${String(i).padStart(2, '0')}.png` })).reverse())
    let active = 0
    let peak = 0
    mocks.thumbnail.mockImplementation(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 1))
      active--
      return photo
    })
    const result = await analyzeQuotePhotos(supabase, input())
    expect(result).toMatchObject({ ok: true, photoCount: 30, skippedCount: 0 })
    expect(peak).toBe(6)
    expect(mocks.thumbnail).toHaveBeenCalledTimes(30)
    expect(mocks.finishRun.mock.calls[0][2].output.photoItemIds).toEqual(Array.from({ length: 30 }, (_, i) => `id-${i}`))
  })

  it('aborts a stuck collection after 60 seconds and does not call Claude', async () => {
    vi.useFakeTimers()
    mocks.images.mockImplementation(() => new Promise(() => {}))
    const result = analyzeQuotePhotos(supabase, input())
    await vi.advanceTimersByTimeAsync(60000)
    expect(await result).toMatchObject({ ok: false, errorCode: 'timeout' })
    expect(mocks.claude).not.toHaveBeenCalled()
    expect(mocks.finishRun).toHaveBeenCalledTimes(1)
  })

  it('combines the collection deadline and client abort with the injected fetch signal', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal?.aborted).toBe(false)
      controller.abort()
      expect(init.signal?.aborted).toBe(true)
      init.signal?.throwIfAborted()
      return new Response()
    })
    mocks.images.mockImplementation(async (_token, _id, scopedFetch) => {
      await scopedFetch('https://graph.microsoft.com/v1.0/test', { signal: new AbortController().signal })
      return []
    })
    expect(await analyzeQuotePhotos(supabase, { ...input(), fetcher, signal: controller.signal }))
      .toMatchObject({ ok: false, errorCode: 'timeout' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(mocks.claude).not.toHaveBeenCalled()
  })

  it.each([
    ['refusal', 'refused', 'refusal'], ['max_tokens', 'failed', 'validation'], ['invalid_output', 'failed', 'validation'],
    ['rate_limited', 'failed', 'rate_limited'], ['timeout', 'failed', 'timeout'], ['api_error', 'failed', 'api_error'],
  ])('finalizes %s exactly once and preserves usage', async (errorCode, status, storedCode) => {
    mocks.claude.mockResolvedValue({ ok: false, errorCode, usage, model: 'actual-model' })
    expect(await analyzeQuotePhotos(supabase, input())).toEqual({ ok: false, runId: 'run-1', errorCode })
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', { status, errorCode: storedCode, usage, model: 'actual-model' })
  })

  it('records an abort after the model finishes as failed while preserving usage', async () => {
    const controller = new AbortController()
    mocks.claude.mockImplementation(async () => { controller.abort(); return success() })
    expect(await analyzeQuotePhotos(supabase, { ...input(), signal: controller.signal }))
      .toEqual({ ok: false, runId: 'run-1', errorCode: 'timeout' })
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(supabase, 'run-1', {
      status: 'failed', errorCode: 'timeout', model: 'actual-model', usage,
    })
  })

  it('does not retry failed finalization', async () => {
    mocks.finishRun.mockRejectedValue(new Error('Database unavailable'))
    expect(await analyzeQuotePhotos(supabase, input())).toEqual({ ok: false, runId: 'run-1', errorCode: 'api_error' })
    expect(mocks.finishRun).toHaveBeenCalledTimes(1)
  })
})
