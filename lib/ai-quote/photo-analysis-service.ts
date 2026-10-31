import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAnthropicClient, runStructuredClaudeRequest, type AiErrorCode } from '@/lib/ai-quote/anthropic'
import { AI_QUOTE_LIMITS, AI_QUOTE_MODELS, AI_QUOTE_PROMPT_VERSIONS } from '@/lib/ai-quote/config'
import { loadActiveKnowledge } from '@/lib/ai-quote/data'
import { buildPhotoAnalysisPrompt } from '@/lib/ai-quote/photo-analysis-prompt'
import { photoAnalysisOutputSchema } from '@/lib/ai-quote/photo-analysis-schema'
import { validatePhotoFindings } from '@/lib/ai-quote/photo-findings'
import { redactContactDetails } from '@/lib/ai-quote/pii'
import { finishRun, startRun } from '@/lib/ai-quote/runs'
import type { AiPhotoFinding, DraftJobberContext } from '@/lib/ai-quote/types'
import { getMicrosoftConfig } from '@/lib/microsoft/config'
import { fetchPhotoThumbnail, listFolderImages, MicrosoftAuthError } from '@/lib/microsoft/graph'
import type { MicrosoftFetcher } from '@/lib/microsoft/oauth'
import { getUsableMicrosoftAccessToken } from '@/lib/microsoft/tokens'
import type { Database } from '@/lib/supabase/types'

type PhotoAnalysisError = AiErrorCode | 'reconnect_required' | 'not_connected' | 'no_photos' | 'no_knowledge'
type CollectedPhoto = NonNullable<Awaited<ReturnType<typeof fetchPhotoThumbnail>>> & { id: string; name: string }

async function collectPhotos(accessToken: string, folderId: string, fetcher: MicrosoftFetcher = fetch, signal?: AbortSignal): Promise<{
  photos: CollectedPhoto[]; skippedCount: number
}> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('Photo collection timed out', 'TimeoutError')), AI_QUOTE_LIMITS.photoCollectMs)
  const collectSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  const scopedFetch: MicrosoftFetcher = (url, init) => fetcher(url, {
    ...init, signal: init.signal ? AbortSignal.any([init.signal, collectSignal]) : collectSignal,
  })
  let onAbort: () => void = () => {}
  try {
    collectSignal.throwIfAborted()
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(collectSignal.reason)
      collectSignal.addEventListener('abort', onAbort, { once: true })
    })
    const collect = async () => {
      const images = (await listFolderImages(accessToken, folderId, scopedFetch))
        .sort((a, b) => a.name.localeCompare(b.name)).slice(0, AI_QUOTE_LIMITS.photoMax)
      collectSignal.throwIfAborted()
      const photos: Array<CollectedPhoto | null> = images.map(() => null)
      let next = 0
      await Promise.all(Array.from({ length: Math.min(images.length, AI_QUOTE_LIMITS.photoConcurrency) }, async () => {
        while (next < images.length) {
          collectSignal.throwIfAborted()
          const index = next++
          const image = images[index]
          const thumbnail = await fetchPhotoThumbnail(accessToken, image.id, scopedFetch)
          collectSignal.throwIfAborted()
          if (thumbnail) photos[index] = { ...image, ...thumbnail }
        }
      }))
      const collected = photos.filter((photo): photo is CollectedPhoto => photo !== null)
      return { photos: collected, skippedCount: images.length - collected.length }
    }
    return await Promise.race([collect(), aborted])
  } finally {
    clearTimeout(timer)
    collectSignal.removeEventListener('abort', onAbort)
    // Stop sibling downloads when one Graph call fails authentication.
    controller.abort()
  }
}

export async function analyzeQuotePhotos(supabase: SupabaseClient<Database>, input: {
  userId: string
  folderId: string
  memo: string
  jobberContext: DraftJobberContext | null
  signal?: AbortSignal
  client?: Anthropic
  fetcher?: MicrosoftFetcher
}): Promise<
  | { ok: true; runId: string; findings: AiPhotoFinding[]; photoCount: number; skippedCount: number; photoLabels: Array<{ ref: number; name: string }> }
  | { ok: false; runId: string | null; errorCode: PhotoAnalysisError }
> {
  let runId: string | null = null
  const errorCodeFor = (error: unknown): PhotoAnalysisError => input.signal?.aborted ? 'timeout'
    : error instanceof MicrosoftAuthError ? 'reconnect_required'
    : error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'timeout' : 'api_error'
  try {
    input.signal?.throwIfAborted()
    const token = await getUsableMicrosoftAccessToken(supabase, input.userId, getMicrosoftConfig(), input.fetcher)
    if (!token.ok) return { ok: false, runId: null, errorCode: token.reason }
    const knowledge = await loadActiveKnowledge(supabase)
    if (!knowledge) return { ok: false, runId: null, errorCode: 'no_knowledge' }
    input.signal?.throwIfAborted()
    const memo = redactContactDetails(input.memo)
    runId = await startRun(supabase, {
      kind: 'photo_analysis', model: AI_QUOTE_MODELS.analysis, promptVersion: AI_QUOTE_PROMPT_VERSIONS.photoAnalysis,
      knowledgeId: knowledge.id, jobberQuoteId: input.jobberContext?.jobberQuoteId ?? null, memo,
    })
    let outcome: Parameters<typeof finishRun>[2] = { status: 'failed', errorCode: 'api_error' }
    try {
      const { photos, skippedCount } = await collectPhotos(token.accessToken, input.folderId, input.fetcher, input.signal)
      if (!photos.length) {
        outcome.errorCode = 'no_photos'
        return { ok: false, runId, errorCode: 'no_photos' }
      }
      input.signal?.throwIfAborted()
      const prompt = buildPhotoAnalysisPrompt({ knowledge, memo, jobberContext: input.jobberContext, photos })
      const result = await runStructuredClaudeRequest(input.client ?? createAnthropicClient(), {
        ...prompt, model: AI_QUOTE_MODELS.analysis, schema: photoAnalysisOutputSchema,
        maxTokens: AI_QUOTE_LIMITS.photoAnalysisMaxTokens, signal: input.signal,
      })
      outcome = { ...outcome, model: result.model ?? AI_QUOTE_MODELS.analysis, usage: result.usage ?? undefined }
      input.signal?.throwIfAborted()
      if (!result.ok) {
        outcome.status = result.errorCode === 'refusal' ? 'refused' : 'failed'
        outcome.errorCode = result.errorCode === 'max_tokens' || result.errorCode === 'invalid_output' ? 'validation' : result.errorCode
        return { ok: false, runId, errorCode: result.errorCode }
      }
      const findings = validatePhotoFindings(result.data.findings, photos.length)
      outcome = { status: 'succeeded', model: result.model, usage: result.usage,
        output: { findings, photoCount: photos.length, photoItemIds: photos.map(photo => photo.id) } }
      return { ok: true, runId, findings, photoCount: photos.length, skippedCount,
        photoLabels: photos.map((photo, index) => ({ ref: index + 1, name: photo.name })) }
    } catch (error) {
      const errorCode = errorCodeFor(error)
      outcome.status = 'failed'
      outcome.errorCode = errorCode
      return { ok: false, runId, errorCode }
    } finally {
      await finishRun(supabase, runId, outcome)
    }
  } catch (error) {
    return { ok: false, runId, errorCode: errorCodeFor(error) }
  }
}
