import { NextResponse } from 'next/server'
import { isDevNoAuthMode } from '@/lib/actions/types'
import { requireAiQuoteUser } from '@/lib/ai-quote/access'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { isSameOriginRequest } from '@/lib/security/request-origin'
import { createClient } from '@/lib/supabase/server'
import { isMicrosoftDisabledInPreview, MICROSOFT_DISABLED_MESSAGE } from '@/lib/microsoft/config'
import { deleteMicrosoftToken } from '@/lib/microsoft/tokens'

export async function POST(request: Request) {
  if (isMicrosoftDisabledInPreview() || isDevNoAuthMode()) {
    return NextResponse.json({ ok: false, error: isMicrosoftDisabledInPreview() ? MICROSOFT_DISABLED_MESSAGE : 'OneDrive requires authentication.' }, { status: 503 })
  }
  if (!isSameOriginRequest(request)) return NextResponse.json({ ok: false, error: 'A same-origin request is required.' }, { status: 403 })
  try {
    const auth = await requireAiQuoteUser()
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.error === AUTHENTICATION_REQUIRED_ERROR ? 401 : 403 })
    await deleteMicrosoftToken(await createClient(), auth.user.id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to disconnect OneDrive. Please try again.' }, { status: 500 })
  }
}
