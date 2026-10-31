import { NextResponse } from 'next/server'
import { getAiMonthlyBudgetStatus } from '@/lib/ai-quote/budget'
import { safeErrorMessage } from '@/lib/actions/action-error'
import { createAnthropicClient, runStructuredClaudeRequest } from '@/lib/ai-quote/anthropic'
import { AI_QUOTE_LIMITS, AI_QUOTE_MODEL, AI_QUOTE_PROMPT_VERSIONS, getAiQuoteAvailability } from '@/lib/ai-quote/config'
import { loadDraftCatalog, loadKnowledgeSource } from '@/lib/ai-quote/data'
import { buildKnowledgePrompt, knowledgeOutputSchema } from '@/lib/ai-quote/knowledge-prompt'
import { buildKnowledgeStats } from '@/lib/ai-quote/knowledge-stats'
import { countRecentRuns, finishRun, insertKnowledgeDraft, startRun } from '@/lib/ai-quote/runs'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { requireRole } from '@/lib/security/require-app-user'
import { isSameOriginRequest } from '@/lib/security/request-origin'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 300

function errorResponse(error: unknown, status: number, message: string) {
  return NextResponse.json({
    ok: false,
    error: safeErrorMessage(error, 'ai.knowledge.build', message),
  }, { status })
}

export async function POST(request: Request) {
  const availability = getAiQuoteAvailability()
  if (!availability.enabled) return errorResponse(null, 503, availability.message)

  try {
    const auth = await requireRole('admin')
    if (!auth.ok) {
      return errorResponse(null, auth.error === AUTHENTICATION_REQUIRED_ERROR ? 401 : 403, auth.error)
    }
    if (!isSameOriginRequest(request)) return errorResponse(null, 403, 'A same-origin request is required.')

    const supabase = await createClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    if (await countRecentRuns(supabase, auth.user.id, 'knowledge_build', since) >= AI_QUOTE_LIMITS.knowledgeBuildsPerDay) {
      return errorResponse(null, 429, 'Daily knowledge build limit reached. Try again later.')
    }
    const budget = await getAiMonthlyBudgetStatus(supabase)
    if (budget.reached) {
      return errorResponse(null, 429, `Monthly AI budget reached ($${budget.spentUsd} of $${budget.budgetUsd}). Change it in Settings > AI.`)
    }
    const runId = await startRun(supabase, {
      kind: 'knowledge_build', promptVersion: AI_QUOTE_PROMPT_VERSIONS.knowledge, model: AI_QUOTE_MODEL,
    })
    let outcome: Parameters<typeof finishRun>[2] = { status: 'failed', errorCode: 'api_error' }
    try {
      request.signal.throwIfAborted()
      const source = await loadKnowledgeSource(supabase)
      const catalog = await loadDraftCatalog(supabase)
      const stats = buildKnowledgeStats(source.quotes)
      const prompt = buildKnowledgePrompt({ stats, quotes: source.quotes, catalog })
      request.signal.throwIfAborted()
      const result = await runStructuredClaudeRequest(createAnthropicClient(), {
        ...prompt, schema: knowledgeOutputSchema, maxTokens: AI_QUOTE_LIMITS.knowledgeMaxTokens, signal: request.signal,
      })
      outcome = { ...outcome, model: result.model ?? AI_QUOTE_MODEL, usage: result.usage ?? undefined }
      request.signal.throwIfAborted()
      if (!result.ok) {
        const code = result.errorCode
        outcome.status = code === 'refusal' ? 'refused' : 'failed'
        outcome.errorCode = code === 'max_tokens' || code === 'invalid_output' ? 'validation' : code
        const status = code === 'refusal' ? 422 : code === 'rate_limited' ? 429 : code === 'timeout' ? 504 : 502
        return errorResponse(null, status, code === 'refusal'
          ? 'AI could not complete this knowledge guide.'
          : 'Unable to build the knowledge guide. Please try again.')
      }
      const knowledge = await insertKnowledgeDraft(supabase, {
        runId, styleGuide: result.data.styleGuide, pricingGuide: result.data.pricingGuide,
        stats, sourceCounts: source.counts,
      })
      request.signal.throwIfAborted()
      outcome = { status: 'succeeded', model: result.model, usage: result.usage, output: result.data }
      return NextResponse.json({ ok: true, data: { knowledgeId: knowledge.id, version: knowledge.version, runId } })
    } catch (error) {
      outcome.status = 'failed'
      outcome.errorCode = request.signal.aborted ? 'timeout' : 'api_error'
      return errorResponse(error, request.signal.aborted ? 504 : 502, 'Unable to build the knowledge guide. Please try again.')
    } finally {
      await finishRun(supabase, runId, outcome)
    }
  } catch (error) {
    return errorResponse(error, request.signal.aborted ? 504 : 502, 'Unable to build the knowledge guide. Please try again.')
  }
}
