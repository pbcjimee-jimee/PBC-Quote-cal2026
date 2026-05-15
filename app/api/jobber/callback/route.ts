import { NextRequest, NextResponse } from 'next/server'
import { getJobberConfig, getMissingOAuthConfigKeys } from '@/lib/jobber/config'
import { saveDevJobberToken } from '@/lib/jobber/dev-tokens'
import { exchangeAuthorizationCode, getTokenExpiresAt } from '@/lib/jobber/oauth'
import { encryptTokenValue } from '@/lib/jobber/token-encryption'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isDevNoAuthMode } from '@/lib/actions/types'

export async function GET(request: NextRequest) {
  const config = getJobberConfig()
  const missing = getMissingOAuthConfigKeys(config)
  if (missing.length > 0) {
    return NextResponse.json({
      ok: false,
      error: `Jobber OAuth is not configured: ${missing.join(', ')}`,
    }, { status: 503 })
  }

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const expectedState = request.cookies.get('jobber_oauth_state')?.value

  if (!code) {
    return NextResponse.json({ ok: false, error: 'Jobber authorization code is missing' }, { status: 400 })
  }

  if (!expectedState || !state || state !== expectedState) {
    return NextResponse.json({ ok: false, error: 'Invalid Jobber OAuth state' }, { status: 400 })
  }

  try {
    const token = await exchangeAuthorizationCode(code, config)
    const expiresAt = getTokenExpiresAt(token)

    if (isDevNoAuthMode()) {
      await saveDevJobberToken(token)
      const response = NextResponse.redirect(new URL('/settings?jobber=connected', request.url))
      response.cookies.delete('jobber_oauth_state')
      return response
    }

    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const service = await createServiceClient()
    const { error } = await service
      .from('jobber_tokens')
      .upsert({
        user_id: user.id,
        access_token: encryptTokenValue(token.accessToken),
        refresh_token: encryptTokenValue(token.refreshToken),
        token_type: token.tokenType,
        scope: token.scope,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) {
      return NextResponse.json({ ok: false, error: 'Unable to save Jobber connection' }, { status: 500 })
    }

    const response = NextResponse.redirect(new URL('/settings?jobber=connected', request.url))
    response.cookies.delete('jobber_oauth_state')
    return response
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to connect Jobber',
    }, { status: 502 })
  }
}
