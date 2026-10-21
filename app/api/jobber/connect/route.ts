import { NextRequest, NextResponse } from 'next/server'
import {
  buildJobberAuthorizationUrl,
  getJobberConfig,
  getMissingOAuthConfigKeys,
} from '@/lib/jobber/config'
import { isDevNoAuthMode } from '@/lib/actions/types'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { requireRole } from '@/lib/security/require-app-user'
import { isSameOriginGet } from '@/lib/security/request-origin'
import { createClient } from '@/lib/supabase/server'
import { isJobberDisabledInPreview, JOBBER_DISABLED_MESSAGE } from '@/lib/jobber/environment'

export async function GET(request: NextRequest) {
  if (isJobberDisabledInPreview()) {
    return NextResponse.json({ ok: false, error: JOBBER_DISABLED_MESSAGE }, { status: 503 })
  }
  if (!isDevNoAuthMode()) {
    const allowedUser = await requireRole('admin')
    if (!allowedUser.ok) {
      if (allowedUser.error !== AUTHENTICATION_REQUIRED_ERROR) {
        if (!isSameOriginGet(request)) {
          return NextResponse.redirect(new URL('/login/signout', request.url))
        }
        const supabase = await createClient()
        await supabase.auth.signOut()
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
