import { NextResponse } from 'next/server'
import { safeErrorMessage } from '@/lib/actions/action-error'
import { createAnthropicClient, runStructuredClaudeRequest } from '@/lib/ai-quote/anthropic'
import { AI_QUOTE_LIMITS, AI_QUOTE_MODEL, AI_QUOTE_PROMPT_VERSIONS, getAiQuoteAvailability } from '@/lib/ai-quote/config'
import { loadEvalReference, upsertEvalCase } from '@/lib/ai-quote/data'
import { buildEvalMemoPrompt, detectEvalMemoLeaks, evalMemoOutputSchema } from '@/lib/ai-quote/eval-memo'
import { redactContactDetails } from '@/lib/ai-quote/pii'
import { countRecentRuns, finishRun, startRun } from '@/lib/ai-quote/runs'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { requireRole } from '@/lib/security/require-app-user'
import { isSameOriginRequest } from '@/lib/security/request-origin'
import { createClient } from '@/lib/supabase/server'
import { aiEvalMemoRequestSchema } from '@/lib/validators'

export const maxDuration = 300

function errorResponse(error: unknown, status: number, message: string) {
  return NextResponse.json({ ok: false, error: safeErrorMessage(error, 'ai.eval.memo', message) }, { status })
}

export async function POST(request: Request) {
  const availability = getAiQuoteAvailability()
  if (!availability.enabled) return errorResponse(null, 503, availability.message)

  try {
    const auth = await requireRole('admin')
    if (!auth.ok) return errorResponse(null, auth.error === AUTHENTICATION_REQUIRED_ERROR ? 401 : 403, auth.error)
    if (!isSameOriginRequest(request)) return errorResponse(null, 403, 'A same-origin request is required.')

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse(null, 400, 'Enter a valid comparison case.')
    }
    const parsed = aiEvalMemoRequestSchema.safeParse(body)
    if (!parsed.success) return errorResponse(null, 400, 'Check the comparison set and quote.')

    const supabase = await createClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    if (await countRecentRuns(supabase, auth.user.id, 'eval_memo', since) >= AI_QUOTE_LIMITS.evalMemosPerDay) {
      return errorResponse(null, 429, 'Daily comparison memo limit reached. Try again later.')
    }
    request.signal.throwIfAborted()
    const reference = await loadEvalReference(supabase, parsed.data.quoteId)
    if (!reference) return errorResponse(null, 404, 'Reference quote not found.')
    request.signal.throwIfAborted()
    const runId = await startRun(supabase, {
      kind: 'eval_memo', promptVersion: AI_QUOTE_PROMPT_VERSIONS.evalMemo, model: AI_QUOTE_MODEL,
    })
    let outcome: Parameters<typeof finishRun>[2] = { status: 'failed', errorCode: 'api_error' }
    try {
      request.signal.throwIfAborted()
      const prompt = buildEvalMemoPrompt({
        workType: reference.workType, areas: reference.areas,
        publicLines: reference.publicLines.map(line => ({ name: line.name, description: line.description })),
      })
      const result = await runStructuredClaudeRequest(createAnthropicClient(), {
        ...prompt, schema: evalMemoOutputSchema, maxTokens: AI_QUOTE_LIMITS.evalMemoMaxTokens, signal: request.signal,
      })
      outcome = { ...outcome, model: result.model ?? AI_QUOTE_MODEL, usage: result.usage ?? undefined }
      request.signal.throwIfAborted()
      if (!result.ok) {
        const code = result.errorCode
        outcome.status = code === 'refusal' ? 'refused' : 'failed'
        outcome.errorCode = code === 'max_tokens' || code === 'invalid_output' ? 'validation' : code
        const status = code === 'refusal' ? 422 : code === 'rate_limited' ? 429 : code === 'timeout' ? 504 : 502
        return errorResponse(null, status, 'Unable to create the comparison memo. Please try again.')
      }
      const memo = redactContactDetails(result.data.memo)
      const leaks = detectEvalMemoLeaks(memo, reference.productNames)
      const caseId = await upsertEvalCase(supabase, { ...parsed.data, memo, memoRunId: runId })
      request.signal.throwIfAborted()
      outcome = { status: 'succeeded', model: result.model, usage: result.usage, output: { memo, leaks } }
      return NextResponse.json({ ok: true, data: { caseId, memo, leaks } })
    } catch (error) {
      outcome.status = 'failed'
      outcome.errorCode = request.signal.aborted ? 'timeout' : 'api_error'
      return errorResponse(error, request.signal.aborted ? 504 : 502, 'Unable to create the comparison memo. Please try again.')
    } finally {
      await finishRun(supabase, runId, outcome)
    }
  } catch (error) {
    return errorResponse(error, request.signal.aborted ? 504 : 502, 'Unable to create the comparison memo. Please try again.')
  }
}
