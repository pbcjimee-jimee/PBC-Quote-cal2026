import { NextResponse } from 'next/server'
import {
  buildJobberAuthorizationUrl,
  getJobberConfig,
  getMissingOAuthConfigKeys,
} from '@/lib/jobber/config'

export async function GET() {
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
