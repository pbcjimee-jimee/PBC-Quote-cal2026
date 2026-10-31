import { NextResponse } from 'next/server'
import { getAiMonthlyBudgetStatus } from '@/lib/ai-quote/budget'
import { safeErrorMessage } from '@/lib/actions/action-error'
import { getPricingSettings } from '@/lib/actions/settings'
import { AI_QUOTE_LIMITS, getAiQuoteAvailability } from '@/lib/ai-quote/config'
import { loadEvalCase, loadEvalReference, saveEvalResult } from '@/lib/ai-quote/data'
import { generateQuoteDraft } from '@/lib/ai-quote/draft-service'
import { compareDraftWithQuote } from '@/lib/ai-quote/eval-metrics'
import { redactContactDetails } from '@/lib/ai-quote/pii'
import { countRecentRuns } from '@/lib/ai-quote/runs'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { requireRole } from '@/lib/security/require-app-user'
import { isSameOriginRequest } from '@/lib/security/request-origin'
import { createClient } from '@/lib/supabase/server'
import { aiEvalRunRequestSchema } from '@/lib/validators'

export const maxDuration = 300

function errorResponse(error: unknown, status: number, message: string) {
  return NextResponse.json({ ok: false, error: safeErrorMessage(error, 'ai.eval.run', message) }, { status })
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
    const parsed = aiEvalRunRequestSchema.safeParse(body)
    if (!parsed.success) return errorResponse(null, 400, 'Check the comparison case.')

    const supabase = await createClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    if (await countRecentRuns(supabase, auth.user.id, 'eval_draft', since) >= AI_QUOTE_LIMITS.evalDraftsPerDay) {
      return errorResponse(null, 429, 'Daily comparison draft limit reached. Try again later.')
    }
    const budget = await getAiMonthlyBudgetStatus(supabase)
    if (budget.reached) {
      return errorResponse(null, 429, `Monthly AI budget reached ($${budget.spentUsd} of $${budget.budgetUsd}). Change it in Settings > AI.`)
    }
    request.signal.throwIfAborted()
    const evalCase = await loadEvalCase(supabase, parsed.data.caseId)
    if (!evalCase) return errorResponse(null, 404, 'Comparison case not found.')
    const reference = await loadEvalReference(supabase, evalCase.quote_id)
    if (!reference) return errorResponse(null, 404, 'Reference quote not found.')
    const settings = await getPricingSettings()
    if (!settings.ok) return errorResponse(null, 502, 'Unable to load pricing settings. Please try again.')
    request.signal.throwIfAborted()
    const result = await generateQuoteDraft(supabase, {
      kind: 'eval_draft', memo: redactContactDetails(evalCase.memo), jobberContext: null,
      excludeQuoteIds: [evalCase.quote_id], signal: request.signal,
    })
    request.signal.throwIfAborted()
    if (!result.ok) {
      const code = result.errorCode
      const status = code === 'no_knowledge' ? 409 : code === 'refusal' ? 422
        : code === 'rate_limited' ? 429 : code === 'timeout' ? 504 : 502
      return errorResponse(null, status, code === 'no_knowledge'
        ? 'Approve an AI guide in Settings before running comparisons.'
        : 'Unable to create the comparison draft. Please try again.')
    }
    const metrics = compareDraftWithQuote({ draft: result.draft, settings: settings.data, reference })
    await saveEvalResult(supabase, evalCase.id, { runId: result.runId, metrics })
    request.signal.throwIfAborted()
    return NextResponse.json({ ok: true, data: { runId: result.runId, metrics } })
  } catch (error) {
    return errorResponse(error, request.signal.aborted ? 504 : 502, 'Unable to run the comparison. Please try again.')
  }
}
