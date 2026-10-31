import { NextResponse } from 'next/server'
import { safeErrorMessage } from '@/lib/actions/action-error'
import { requireAiQuoteUser } from '@/lib/ai-quote/access'
import { getAiQuoteAvailability } from '@/lib/ai-quote/config'
import { matchPhotoFolders } from '@/lib/ai-quote/photo-folders'
import { getMicrosoftConfig } from '@/lib/microsoft/config'
import { listFolderImages, listQuotePhotoFolders, MicrosoftAuthError } from '@/lib/microsoft/graph'
import { getUsableMicrosoftAccessToken } from '@/lib/microsoft/tokens'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { isSameOriginRequest } from '@/lib/security/request-origin'
import { createClient } from '@/lib/supabase/server'
import { aiPhotoFoldersRequestSchema } from '@/lib/validators'

function errorResponse(error: unknown, status: number, message: string) {
  return NextResponse.json({ ok: false, error: safeErrorMessage(error, 'ai.photos.folders', message) }, { status })
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
      return errorResponse(null, 400, 'Enter a valid quote number and address.')
    }
    const parsed = aiPhotoFoldersRequestSchema.safeParse(body)
    if (!parsed.success) return errorResponse(null, 400, 'Check the quote number and address and try again.')

    const supabase = await createClient()
    const token = await getUsableMicrosoftAccessToken(supabase, auth.user.id, getMicrosoftConfig())
    if (!token.ok) {
      return token.reason === 'not_connected'
        ? NextResponse.json({ ok: true, data: { connected: false, selected: null, candidates: [], photoCount: null } })
        : errorResponse(null, 409, 'Reconnect OneDrive in Settings > AI')
    }
    const folders = await listQuotePhotoFolders(token.accessToken)
    const match = matchPhotoFolders(folders, parsed.data)
    const photoCount = match.selected ? (await listFolderImages(token.accessToken, match.selected.id)).length : null
    return NextResponse.json({ ok: true, data: { connected: true, ...match, photoCount } })
  } catch (error) {
    if (error instanceof MicrosoftAuthError) return errorResponse(null, 409, 'Reconnect OneDrive in Settings > AI')
    return errorResponse(error, request.signal.aborted ? 504 : 502, 'Unable to find photo folders. Please try again.')
  }
}
