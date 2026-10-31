import { NextResponse } from 'next/server'
import { getAiMonthlyBudgetStatus } from '@/lib/ai-quote/budget'
import { safeErrorMessage } from '@/lib/actions/action-error'
import { AI_QUOTE_LIMITS, getAiQuoteAvailability } from '@/lib/ai-quote/config'
import { generateQuoteDraft } from '@/lib/ai-quote/draft-service'
import { countRecentRuns } from '@/lib/ai-quote/runs'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { requireRole } from '@/lib/security/require-app-user'
import { isSameOriginRequest } from '@/lib/security/request-origin'
import { createClient } from '@/lib/supabase/server'
import { aiQuoteDraftRequestSchema } from '@/lib/validators'

export const maxDuration = 300

function errorResponse(error: unknown, status: number, message: string) {
  return NextResponse.json({
    ok: false,
    error: safeErrorMessage(error, 'ai.quote-draft.generate', message),
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

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse(null, 400, 'Enter valid notes for your draft.')
    }
    const parsed = aiQuoteDraftRequestSchema.safeParse(body)
    if (!parsed.success) return errorResponse(null, 400, 'Check your notes and try again.')

    const supabase = await createClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    if (await countRecentRuns(supabase, auth.user.id, 'quote_draft', since) >= AI_QUOTE_LIMITS.draftsPerDay) {
      return errorResponse(null, 429, 'Daily draft limit reached. Try again later.')
    }
    const budget = await getAiMonthlyBudgetStatus(supabase)
    if (budget.reached) {
      return errorResponse(null, 429, `Monthly AI budget reached ($${budget.spentUsd} of $${budget.budgetUsd}). Change it in Settings > AI.`)
    }
    const result = await generateQuoteDraft(supabase, { ...parsed.data, kind: 'quote_draft', signal: request.signal })
    if (result.ok) return NextResponse.json({ ok: true, data: { runId: result.runId, draft: result.draft } })
    const code = result.errorCode
    const status = code === 'no_knowledge' ? 409 : code === 'refusal' ? 422
      : code === 'rate_limited' ? 429 : code === 'timeout' ? 504 : 502
    const message = code === 'no_knowledge' ? 'Approve an AI guide in Settings before creating drafts.'
      : code === 'refusal' ? 'AI could not complete this draft. Try rewording your notes.'
      : code === 'rate_limited' ? 'AI is busy. Try again later.'
      : 'Unable to create the draft. Please try again.'
    return errorResponse(null, status, message)
  } catch (error) {
    return errorResponse(error, request.signal.aborted ? 504 : 502, 'Unable to create the draft. Please try again.')
  }
}
