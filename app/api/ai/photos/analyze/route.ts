import { NextResponse } from 'next/server'
import { safeErrorMessage } from '@/lib/actions/action-error'
import { requireAiQuoteUser } from '@/lib/ai-quote/access'
import { getAiMonthlyBudgetStatus } from '@/lib/ai-quote/budget'
import { AI_QUOTE_LIMITS, getAiQuoteAvailability } from '@/lib/ai-quote/config'
import { analyzeQuotePhotos } from '@/lib/ai-quote/photo-analysis-service'
import { countRecentRuns } from '@/lib/ai-quote/runs'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { isSameOriginRequest } from '@/lib/security/request-origin'
import { createClient } from '@/lib/supabase/server'
import { aiPhotoAnalysisRequestSchema } from '@/lib/validators'

export const maxDuration = 300

function errorResponse(error: unknown, status: number, message: string) {
  return NextResponse.json({ ok: false, error: safeErrorMessage(error, 'ai.photos.analyze', message) }, { status })
}

export async function POST(request: Request) {
  const availability = getAiQuoteAvailability()
  if (!availability.enabled) return errorResponse(null, 503, availability.message)

  try {
    const auth = await requireAiQuoteUser()
    if (!auth.ok) return errorResponse(null, auth.error === AUTHENTICATION_REQUIRED_ERROR ? 401 : 403, auth.error)
    if (!isSameOriginRequest(request)) return errorResponse(null, 403, 'A same-origin request is required.')

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse(null, 400, 'Enter valid photo analysis details.')
    }
    const parsed = aiPhotoAnalysisRequestSchema.safeParse(body)
    if (!parsed.success) return errorResponse(null, 400, 'Check your photo folder and notes and try again.')

    const supabase = await createClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    if (await countRecentRuns(supabase, auth.user.id, 'photo_analysis', since) >= AI_QUOTE_LIMITS.photoAnalysesPerDay) {
      return errorResponse(null, 429, 'Daily photo analysis limit reached. Try again later.')
    }
    const budget = await getAiMonthlyBudgetStatus(supabase)
    if (budget.reached) {
      return errorResponse(null, 429, `Monthly AI budget reached ($${budget.spentUsd} of $${budget.budgetUsd}). Change it in Settings > AI.`)
    }
    const result = await analyzeQuotePhotos(supabase, { ...parsed.data, userId: auth.user.id, signal: request.signal })
    if (result.ok) {
      return NextResponse.json({ ok: true, data: { runId: result.runId, findings: result.findings,
        photoCount: result.photoCount, skippedCount: result.skippedCount, photoLabels: result.photoLabels } })
    }
    const code = result.errorCode
    const status = code === 'reconnect_required' || code === 'not_connected' || code === 'no_knowledge' ? 409
      : code === 'no_photos' || code === 'refusal' ? 422 : code === 'rate_limited' ? 429 : code === 'timeout' ? 504 : 502
    const message = code === 'reconnect_required' ? 'Reconnect OneDrive in Settings > AI'
      : code === 'not_connected' ? 'Connect OneDrive in Settings > AI'
      : code === 'no_knowledge' ? 'Approve an AI guide in Settings before analysing photos.'
      : code === 'no_photos' ? 'No photos in this folder'
      : code === 'refusal' ? 'AI could not analyse these photos. Try different photos or notes.'
      : code === 'rate_limited' ? 'AI is busy. Try again later.'
      : "Photos couldn't be analysed. Please try again."
    return errorResponse(null, status, message)
  } catch (error) {
    return errorResponse(error, request.signal.aborted ? 504 : 502, "Photos couldn't be analysed. Please try again.")
  }
}
