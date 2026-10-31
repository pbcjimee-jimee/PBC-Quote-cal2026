import { NextRequest, NextResponse } from 'next/server'
import { isDevNoAuthMode } from '@/lib/actions/types'
import { requireAiQuoteUser } from '@/lib/ai-quote/access'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { isSameOriginGet } from '@/lib/security/request-origin'
import { createClient } from '@/lib/supabase/server'
import { getMissingJobberTokenStorageConfigKeys } from '@/lib/jobber/token-encryption'
import { getMicrosoftConfig, getMissingMicrosoftConfigKeys, isMicrosoftDisabledInPreview, MICROSOFT_DISABLED_MESSAGE } from '@/lib/microsoft/config'
import { buildMicrosoftAuthorizationUrl, createPkcePair } from '@/lib/microsoft/oauth'

export async function GET(request: NextRequest) {
  if (isMicrosoftDisabledInPreview() || isDevNoAuthMode()) {
    return NextResponse.json({ ok: false, error: isMicrosoftDisabledInPreview() ? MICROSOFT_DISABLED_MESSAGE : 'OneDrive requires authentication.' }, { status: 503 })
  }
  const auth = await requireAiQuoteUser()
  if (!auth.ok) {
    if (auth.error !== AUTHENTICATION_REQUIRED_ERROR) {
      if (!isSameOriginGet(request)) return NextResponse.redirect(new URL('/login/signout', request.url))
      const supabase = await createClient()
      await supabase.auth.signOut()
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (!isSameOriginGet(request)) return NextResponse.json({ ok: false, error: 'A same-origin request is required.' }, { status: 403 })

  const config = getMicrosoftConfig()
  if ([...getMissingMicrosoftConfigKeys(config), ...getMissingJobberTokenStorageConfigKeys()].length) {
    return NextResponse.json({ ok: false, error: 'OneDrive is not configured.' }, { status: 503 })
  }
  const state = crypto.randomUUID()
  const { verifier, challenge } = createPkcePair()
  const response = NextResponse.redirect(buildMicrosoftAuthorizationUrl(config, state, challenge))
  const options = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 }
  response.cookies.set('ms_oauth_state', state, options)
  response.cookies.set('ms_oauth_verifier', verifier, options)
  return response
}
