import { NextRequest, NextResponse } from 'next/server'
import { assertJobberReadOnlyScopes, getJobberConfig, getMissingOAuthConfigKeys } from '@/lib/jobber/config'
import { saveDevJobberToken } from '@/lib/jobber/dev-tokens'
import { exchangeAuthorizationCode, getTokenExpiresAt } from '@/lib/jobber/oauth'
import { encryptTokenValue, getMissingJobberTokenStorageConfigKeys } from '@/lib/jobber/token-encryption'
import { requireRole } from '@/lib/security/require-app-user'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isDevNoAuthMode } from '@/lib/actions/types'
import { isJobberDisabledInPreview, JOBBER_DISABLED_MESSAGE } from '@/lib/jobber/environment'

export async function GET(request: NextRequest) {
  if (isJobberDisabledInPreview()) {
    return NextResponse.json({ ok: false, error: JOBBER_DISABLED_MESSAGE }, { status: 503 })
  }
  const config = getJobberConfig()
  const isDevTokenStorage = isDevNoAuthMode()
  const missing = [
    ...getMissingOAuthConfigKeys(config),
    ...getMissingJobberTokenStorageConfigKeys(),
  ]
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

  let stage = 'authorization'
  try {
    const allowedUser = isDevTokenStorage ? null : await requireRole('admin')
    if (allowedUser && !allowedUser.ok) {
      if (allowedUser.error !== AUTHENTICATION_REQUIRED_ERROR) {
        const supabase = await createClient()
        await supabase.auth.signOut()
      }
      return NextResponse.redirect(new URL('/login', request.url))
    }

    stage = 'token exchange'
    const token = await exchangeAuthorizationCode(code, config)
    stage = 'scope validation'
    assertJobberReadOnlyScopes(token.scope)
    const expiresAt = getTokenExpiresAt(token)

    stage = 'token storage'
    if (isDevTokenStorage) {
      await saveDevJobberToken(token)
      const response = NextResponse.redirect(new URL('/settings?jobber=connected', request.url))
      response.cookies.delete('jobber_oauth_state')
      return response
    }

    if (!allowedUser?.ok) throw new Error('Admin authorization required')

    const service = await createServiceClient()
    const { error } = await service
      .from('jobber_tokens')
      .upsert({
        user_id: allowedUser.user.id,
        access_token: encryptTokenValue(token.accessToken),
        refresh_token: encryptTokenValue(token.refreshToken),
        token_type: token.tokenType,
        scope: token.scope,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) {
      console.error('Jobber OAuth callback failed', { stage })
      return NextResponse.json({ ok: false, error: 'Unable to save Jobber connection' }, { status: 500 })
    }

    const response = NextResponse.redirect(new URL('/settings?jobber=connected', request.url))
    response.cookies.delete('jobber_oauth_state')
    return response
  } catch (error) {
    const status = error instanceof Error
      ? /^Jobber token exchange failed with status (\d{3})$/.exec(error.message)?.[1]
      : undefined
    console.error('Jobber OAuth callback failed', { stage, status })
    return NextResponse.json({
      ok: false,
      error: 'Unable to connect Jobber. Please try again.',
    }, { status: 502 })
  }
}
