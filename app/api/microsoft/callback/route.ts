import { NextRequest, NextResponse } from 'next/server'
import { isDevNoAuthMode } from '@/lib/actions/types'
import { requireAiQuoteUser } from '@/lib/ai-quote/access'
import { isAiQuoteUserAllowed } from '@/lib/ai-quote/config'
import { getMissingJobberTokenStorageConfigKeys } from '@/lib/jobber/token-encryption'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { createClient } from '@/lib/supabase/server'
import { getMicrosoftConfig, getMissingMicrosoftConfigKeys, isMicrosoftDisabledInPreview, MICROSOFT_DISABLED_MESSAGE } from '@/lib/microsoft/config'
import { exchangeMicrosoftCode } from '@/lib/microsoft/oauth'
import { getMicrosoftMe } from '@/lib/microsoft/graph'
import { saveMicrosoftToken } from '@/lib/microsoft/tokens'

function clearOAuthCookies(response: NextResponse): NextResponse {
  response.cookies.delete('ms_oauth_state')
  response.cookies.delete('ms_oauth_verifier')
  return response
}

export async function GET(request: NextRequest) {
  if (isMicrosoftDisabledInPreview() || isDevNoAuthMode()) {
    return clearOAuthCookies(NextResponse.json({ ok: false, error: isMicrosoftDisabledInPreview() ? MICROSOFT_DISABLED_MESSAGE : 'OneDrive requires authentication.' }, { status: 503 }))
  }
  const config = getMicrosoftConfig()
  if ([...getMissingMicrosoftConfigKeys(config), ...getMissingJobberTokenStorageConfigKeys()].length) {
    return clearOAuthCookies(NextResponse.json({ ok: false, error: 'OneDrive is not configured.' }, { status: 503 }))
  }
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const expectedState = request.cookies.get('ms_oauth_state')?.value
  const verifier = request.cookies.get('ms_oauth_verifier')?.value
  if (!code || !expectedState || !state || state !== expectedState || !verifier) {
    return clearOAuthCookies(NextResponse.json({ ok: false, error: 'Invalid Microsoft OAuth state or authorization code.' }, { status: 400 }))
  }
  try {
    // Microsoft returns cross-site; the validated state binds this callback to our connect request.
    const auth = await requireAiQuoteUser()
    if (!auth.ok) {
      if (auth.error !== AUTHENTICATION_REQUIRED_ERROR) {
        const supabase = await createClient()
        await supabase.auth.signOut()
      }
      return clearOAuthCookies(NextResponse.redirect(new URL('/login', request.url)))
    }
    const token = await exchangeMicrosoftCode(code, verifier, config)
    const { email } = await getMicrosoftMe(token.accessToken)
    if (!isAiQuoteUserAllowed(email)) {
      return clearOAuthCookies(NextResponse.redirect(new URL('/settings?tab=ai&onedrive=wrong_account', request.url)))
    }
    await saveMicrosoftToken(await createClient(), auth.user.id, email.trim().toLowerCase(), token)
    return clearOAuthCookies(NextResponse.redirect(new URL('/settings?tab=ai&onedrive=connected', request.url)))
  } catch {
    return clearOAuthCookies(NextResponse.json({ ok: false, error: 'Unable to connect OneDrive. Please try again.' }, { status: 502 }))
  }
}
