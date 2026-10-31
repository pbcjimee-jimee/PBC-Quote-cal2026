import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAnthropicClient, runStructuredClaudeRequest, type AiErrorCode } from '@/lib/ai-quote/anthropic'
import { AI_QUOTE_LIMITS, AI_QUOTE_MODELS, AI_QUOTE_PROMPT_VERSIONS } from '@/lib/ai-quote/config'
import { loadActiveKnowledge, loadDraftCatalog, loadQuoteExamples, loadSimilarQuoteCandidates } from '@/lib/ai-quote/data'
import { buildQuoteDraftPrompt } from '@/lib/ai-quote/draft-prompt'
import { aiDraftModelOutputSchema } from '@/lib/ai-quote/draft-schema'
import { validateAiQuoteDraft } from '@/lib/ai-quote/draft-validation'
import { redactContactDetails } from '@/lib/ai-quote/pii'
import { finishRun, startRun } from '@/lib/ai-quote/runs'
import { rankSimilarQuotes } from '@/lib/ai-quote/similar-quotes'
import type { AiQuoteDraft, DraftJobberContext } from '@/lib/ai-quote/types'
import type { Database } from '@/lib/supabase/types'

export async function generateQuoteDraft(supabase: SupabaseClient<Database>, input: {
  kind: 'quote_draft' | 'eval_draft'
  memo: string
  jobberContext: DraftJobberContext | null
  excludeQuoteIds?: string[]
  signal?: AbortSignal
  client?: Anthropic
}): Promise<
  | { ok: true; runId: string; draft: AiQuoteDraft }
  | { ok: false; runId: string | null; errorCode: AiErrorCode | 'no_knowledge' }
> {
  let runId: string | null = null
  try {
    const memo = redactContactDetails(input.memo)
    input.signal?.throwIfAborted()
    const knowledge = await loadActiveKnowledge(supabase)
    if (!knowledge) return { ok: false, runId: null, errorCode: 'no_knowledge' }
    input.signal?.throwIfAborted()
    runId = await startRun(supabase, {
      kind: input.kind, memo, knowledgeId: knowledge.id, jobberQuoteId: input.jobberContext?.jobberQuoteId ?? null,
      promptVersion: AI_QUOTE_PROMPT_VERSIONS.draft, model: AI_QUOTE_MODELS.draft,
    })
    let outcome: Parameters<typeof finishRun>[2] = { status: 'failed', errorCode: 'api_error' }
    try {
      input.signal?.throwIfAborted()
      const [catalog, candidates] = await Promise.all([
        loadDraftCatalog(supabase), loadSimilarQuoteCandidates(supabase, 200, input.excludeQuoteIds ?? []),
      ])
      input.signal?.throwIfAborted()
      const ids = rankSimilarQuotes({
        memo, workType: input.jobberContext?.workType ?? '', customerType: input.jobberContext?.customerType ?? '',
        existingLineNames: input.jobberContext?.existingLines.map(line => line.name) ?? [],
      }, candidates, 4).map(candidate => candidate.id)
      const loadedExamples = await loadQuoteExamples(supabase, ids)
      const examplesById = new Map(loadedExamples.map(example => [example.id, example]))
      const examples = ids.flatMap(id => {
        const example = examplesById.get(id)
        return example ? [example] : []
      })
      const prompt = buildQuoteDraftPrompt({ knowledge, catalog, examples, jobberContext: input.jobberContext, memo })
      input.signal?.throwIfAborted()
      const result = await runStructuredClaudeRequest(input.client ?? createAnthropicClient(), {
        ...prompt, model: AI_QUOTE_MODELS.draft, schema: aiDraftModelOutputSchema, maxTokens: AI_QUOTE_LIMITS.draftMaxTokens, signal: input.signal,
      })
      outcome = { ...outcome, model: result.model ?? AI_QUOTE_MODELS.draft, usage: result.usage ?? undefined }
      input.signal?.throwIfAborted()
      if (!result.ok) {
        outcome.status = result.errorCode === 'refusal' ? 'refused' : 'failed'
        outcome.errorCode = result.errorCode === 'max_tokens' || result.errorCode === 'invalid_output'
          ? 'validation' : result.errorCode
        return { ok: false, runId, errorCode: result.errorCode }
      }
      const draft = validateAiQuoteDraft(result.data, catalog)
      input.signal?.throwIfAborted()
      outcome = { status: 'succeeded', model: result.model, usage: result.usage, output: draft }
      return { ok: true, runId, draft }
    } catch {
      const errorCode = input.signal?.aborted ? 'timeout' : 'api_error'
      outcome.status = 'failed'
      outcome.errorCode = errorCode
      return { ok: false, runId, errorCode }
    } finally {
      await finishRun(supabase, runId, outcome)
    }
  } catch {
    return { ok: false, runId, errorCode: input.signal?.aborted ? 'timeout' : 'api_error' }
  }
}
