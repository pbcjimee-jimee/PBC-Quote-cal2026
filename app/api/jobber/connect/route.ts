import { NextRequest, NextResponse } from 'next/server'
import {
  buildJobberAuthorizationUrl,
  getJobberConfig,
  getMissingOAuthConfigKeys,
} from '@/lib/jobber/config'
import { isDevNoAuthMode } from '@/lib/actions/types'
import { USER_NOT_ALLOWED_ERROR } from '@/lib/security/auth-policy'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'

export async function GET(request: NextRequest) {
  if (!isDevNoAuthMode()) {
    const allowedUser = await requireAllowedUser()
    if (!allowedUser.ok) {
      if (allowedUser.error === USER_NOT_ALLOWED_ERROR) {
        return NextResponse.redirect(new URL('/api/auth/signout?reason=not_allowed', request.url))
      }

      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  const config = getJobberConfig()
  const missing = getMissingOAuthConfigKeys(config)
  if (missing.length > 0) {
    return NextResponse.json({
      ok: false,
      error: `Jobber OAuth is not configured: ${missing.join(', ')}`,
    }, { status: 503 })
  }

  const state = crypto.randomUUID()
  const response = NextResponse.redirect(buildJobberAuthorizationUrl(config, state))
  response.cookies.set('jobber_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })
  return response
}
