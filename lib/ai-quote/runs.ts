import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { estimateCostUsd } from '@/lib/ai-quote/cost'
import type { KnowledgeStats } from '@/lib/ai-quote/knowledge-stats'
import type { AiUsage } from '@/lib/ai-quote/types'
import type { Database, Json } from '@/lib/supabase/types'
import type { ActionResult } from '@/lib/actions/types'
import { safeErrorMessage } from '@/lib/actions/action-error'

export type AiRunKind = 'knowledge_build' | 'quote_draft' | 'eval_memo' | 'eval_draft' | 'photo_analysis'

export async function hasPendingAiReview(supabase: SupabaseClient<Database>, quoteId: string): Promise<boolean> {
  const { count, error } = await supabase.from('ai_quote_runs').select('id', { count: 'exact', head: true })
    .eq('quote_id', quoteId).eq('kind', 'quote_draft').eq('status', 'succeeded').is('review_confirmed_at', null)
  if (error) throw error
  return (count ?? 0) > 0
}

export async function enforceAiReviewGate(supabase: SupabaseClient<Database>, input: {
  userId: string
  quoteId: string | null
  aiDraftRunId?: string
  aiReviewConfirmed?: boolean
  syncJobber: boolean
}): Promise<ActionResult<null>> {
  try {
    if (input.aiDraftRunId) {
      const { data: run, error } = await supabase.from('ai_quote_runs')
        .select('id, kind, status, created_by, quote_id').eq('id', input.aiDraftRunId).maybeSingle()
      if (error) throw error
      if (!run || run.kind !== 'quote_draft' || run.status !== 'succeeded' || run.created_by !== input.userId
        || (run.quote_id !== null && run.quote_id !== input.quoteId)) {
        return { ok: false, code: 'VALIDATION', error: 'The AI draft is invalid or unavailable. Create a new draft and try again.' }
      }
    }
    if (input.syncJobber && input.aiReviewConfirmed !== true
      && (input.aiDraftRunId || (input.quoteId && await hasPendingAiReview(supabase, input.quoteId)))) {
      return { ok: false, code: 'VALIDATION', error: 'Confirm the AI draft review before syncing to Jobber.' }
    }
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: safeErrorMessage(error, 'ai-quote.enforceAiReviewGate', 'Unable to verify the AI draft review. Please try again.') }
  }
}

export async function linkRunAndConfirmReview(supabase: SupabaseClient<Database>, input: {
  quoteId: string
  aiDraftRunId?: string
  confirm: boolean
  userId: string
}): Promise<void> {
  if (input.aiDraftRunId) {
    const { error } = await supabase.from('ai_quote_runs').update({ quote_id: input.quoteId })
      .eq('id', input.aiDraftRunId).eq('created_by', input.userId).eq('kind', 'quote_draft').eq('status', 'succeeded')
    if (error) throw error
  }
  if (input.confirm) {
    const { error } = await supabase.from('ai_quote_runs').update({ review_confirmed_at: new Date().toISOString() })
      .eq('quote_id', input.quoteId).eq('kind', 'quote_draft').eq('status', 'succeeded').is('review_confirmed_at', null)
    if (error) throw error
  }
}

export async function countRecentRuns(
  supabase: SupabaseClient<Database>, userId: string, kind: AiRunKind, since: Date,
): Promise<number> {
  const { count, error } = await supabase.from('ai_quote_runs').select('id', { count: 'exact', head: true })
    .eq('created_by', userId).eq('kind', kind).gte('created_at', since.toISOString())
  if (error) throw error
  return count ?? 0
}

export async function startRun(supabase: SupabaseClient<Database>, input: {
  kind: AiRunKind
  promptVersion: string
  model: string
  knowledgeId?: string | null
  jobberQuoteId?: string | null
  memo?: string | null
}): Promise<string> {
  const { data, error } = await supabase.from('ai_quote_runs').insert({
    kind: input.kind, status: 'running', prompt_version: input.promptVersion, model: input.model,
    knowledge_id: input.knowledgeId ?? null, jobber_quote_id: input.jobberQuoteId ?? null, memo: input.memo ?? null,
  }).select('id').single()
  if (error) throw error
  return data.id
}

export async function finishRun(supabase: SupabaseClient<Database>, runId: string, result: {
  status: 'succeeded' | 'failed' | 'refused'
  model?: string
  output?: unknown
  errorCode?: string | null
  usage?: AiUsage
}): Promise<void> {
  const usage = result.usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  let model = result.model
  if (model === undefined) {
    const { data, error } = await supabase.from('ai_quote_runs').select('model').eq('id', runId).single()
    if (error) throw error
    model = data.model
  }
  const { error } = await supabase.from('ai_quote_runs').update({
    status: result.status,
    ...(result.model === undefined ? {} : { model: result.model }),
    output: (result.output ?? null) as Json,
    error_code: result.errorCode ?? null,
    input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
    cache_read_tokens: usage.cacheReadTokens, cache_write_tokens: usage.cacheWriteTokens,
    cost_usd: estimateCostUsd(usage, model), completed_at: new Date().toISOString(),
  }).eq('id', runId)
  if (error) throw error
}

export async function insertKnowledgeDraft(supabase: SupabaseClient<Database>, input: {
  runId: string
  styleGuide: string
  pricingGuide: string
  stats: KnowledgeStats
  sourceCounts: { quotes: number; publicLines: number; items: number }
}): Promise<{ id: string; version: number }> {
  const latest = await supabase.from('ai_quote_knowledge').select('version')
    .order('version', { ascending: false }).limit(1).maybeSingle()
  if (latest.error) throw latest.error
  const { data, error } = await supabase.from('ai_quote_knowledge').insert({
    version: (latest.data?.version ?? 0) + 1,
    status: 'draft', run_id: input.runId,
    style_guide: input.styleGuide, pricing_guide: input.pricingGuide,
    stats: input.stats as unknown as Json, source_counts: input.sourceCounts,
  }).select('id, version').single()
  if (error) throw error
  return data
}
