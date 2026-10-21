import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  exchangeAuthorizationCode: vi.fn(),
  getTokenExpiresAt: vi.fn(),
  saveDevJobberToken: vi.fn(),
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  requireAllowedUser: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/lib/jobber/oauth', () => ({
  exchangeAuthorizationCode: mocks.exchangeAuthorizationCode,
  getTokenExpiresAt: mocks.getTokenExpiresAt,
}))

vi.mock('@/lib/jobber/dev-tokens', () => ({
  saveDevJobberToken: mocks.saveDevJobberToken,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
  createServiceClient: mocks.createServiceClient,
}))

vi.mock('@/lib/security/require-app-user', () => ({
  requireRole: mocks.requireAllowedUser,
}))

import { GET as jobberCallback } from '@/app/api/jobber/callback/route'
import { GET as jobberConnect } from '@/app/api/jobber/connect/route'
import { AUTHENTICATION_REQUIRED_ERROR, USER_NOT_ALLOWED_ERROR } from '@/lib/security/auth-policy'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('jobber callback security', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('JOBBER_TOKEN_ENCRYPTION_KEY', 'callback-test-key')
    mocks.requireAllowedUser.mockResolvedValue({
      ok: true,
      user: { id: 'user-1', email: 'owner@example.com' },
      profile: { role: 'admin' },
    })
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
        signOut: mocks.signOut,
      },
    })
    mocks.createServiceClient.mockResolvedValue({
      from: vi.fn(() => ({
        upsert: vi.fn(async () => ({ error: null })),
      })),
    })
    process.env.JOBBER_CLIENT_ID = 'client-id'
    process.env.JOBBER_CLIENT_SECRET = 'client-secret'
    process.env.JOBBER_REDIRECT_URI = 'http://localhost:3000/api/jobber/callback'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-key'
    process.env.NEXT_PUBLIC_DEV_NO_AUTH = 'false'
    delete process.env.ALLOWED_LOGIN_EMAILS
  })

  it('returns 503 in Vercel Preview before exchanging or saving an OAuth token', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const request = new NextRequest(
      'http://localhost:3000/api/jobber/callback?code=auth-code&state=state-from-url',
      { headers: { cookie: 'jobber_oauth_state=state-from-url' } }
    )

    try {
      const response = await jobberCallback(request)
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        ok: false,
        error: 'Jobber is disabled in this preview environment.',
      })
    } finally {
      vi.unstubAllEnvs()
    }

    expect(mocks.exchangeAuthorizationCode).not.toHaveBeenCalled()
    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it('rejects OAuth callbacks that do not include the state cookie', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/jobber/callback?code=auth-code&state=state-from-url'
    )

    const response = await jobberCallback(request)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, error: 'Invalid Jobber OAuth state' })
    expect(mocks.exchangeAuthorizationCode).not.toHaveBeenCalled()
    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('does not sign out a user or exchange a code when callback state does not match', async () => {
    const response = await jobberCallback(new NextRequest(
      'http://localhost:3000/api/jobber/callback?code=auth-code&state=wrong',
      { headers: { cookie: 'jobber_oauth_state=expected', 'sec-fetch-site': 'cross-site' } }
    ))
    expect(response.status).toBe(400)
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(mocks.exchangeAuthorizationCode).not.toHaveBeenCalled()
  })

  it('rejects Jobber OAuth tokens that include write scopes', async () => {
    mocks.exchangeAuthorizationCode.mockResolvedValueOnce({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: 'quotes:read jobs:write',
    })
    mocks.getTokenExpiresAt.mockReturnValueOnce('2026-05-15T00:00:00.000Z')
    const request = new NextRequest(
      'http://localhost:3000/api/jobber/callback?code=auth-code&state=state-from-url',
      {
        headers: {
          cookie: 'jobber_oauth_state=state-from-url',
        },
      }
    )

    const response = await jobberCallback(request)

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ ok: false, error: 'Unable to connect Jobber. Please try again.' })
    expect(mocks.saveDevJobberToken).not.toHaveBeenCalled()
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it('does not exchange OAuth codes in production when token storage encryption is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('JOBBER_TOKEN_ENCRYPTION_KEY', '')
    const request = new NextRequest(
      'http://localhost:3000/api/jobber/callback?code=auth-code&state=state-from-url',
      {
        headers: {
          cookie: 'jobber_oauth_state=state-from-url',
        },
      }
    )

    try {
      const response = await jobberCallback(request)

      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        ok: false,
        error: 'Jobber OAuth is not configured: JOBBER_TOKEN_ENCRYPTION_KEY',
      })
    } finally {
      vi.unstubAllEnvs()
    }

    expect(mocks.exchangeAuthorizationCode).not.toHaveBeenCalled()
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it('does not save Jobber tokens for authenticated users without the admin role', async () => {
    mocks.exchangeAuthorizationCode.mockResolvedValueOnce({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: 'quotes:read jobs:read',
    })
    mocks.getTokenExpiresAt.mockReturnValueOnce('2026-05-15T00:00:00.000Z')
    mocks.requireAllowedUser.mockResolvedValueOnce({
      ok: false,
      error: 'Admin access required',
    })
    const request = new NextRequest(
      'http://localhost:3000/api/jobber/callback?code=auth-code&state=state-from-url',
      {
        headers: {
          cookie: 'jobber_oauth_state=state-from-url',
        },
      }
    )

    const response = await jobberCallback(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/login')
    expect(mocks.exchangeAuthorizationCode).not.toHaveBeenCalled()
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it('requires admin authorization before exchanging a valid OAuth code', async () => {
    mocks.exchangeAuthorizationCode.mockResolvedValueOnce({ accessToken: 'access-token', refreshToken: 'refresh-token',
      expiresIn: 3600, tokenType: 'Bearer', scope: 'quotes:read' })
    const response = await jobberCallback(new NextRequest(
      'http://localhost:3000/api/jobber/callback?code=auth-code&state=valid',
      { headers: { cookie: 'jobber_oauth_state=valid' } }
    ))
    expect(response.headers.get('location')).toBe('http://localhost:3000/settings?jobber=connected')
    expect(mocks.requireAllowedUser).toHaveBeenCalledWith('admin')
    expect(mocks.requireAllowedUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.exchangeAuthorizationCode.mock.invocationCallOrder[0])
    expect(response.cookies.get('jobber_oauth_state')?.value).toBe('')
  })

  it('does not disclose callback error details or log secrets', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.exchangeAuthorizationCode.mockRejectedValueOnce(new Error('auth-code client-secret access-token private details'))
    const response = await jobberCallback(new NextRequest(
      'http://localhost:3000/api/jobber/callback?code=auth-code&state=valid',
      { headers: { cookie: 'jobber_oauth_state=valid' } }
    ))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ ok: false, error: 'Unable to connect Jobber. Please try again.' })
    expect(log).toHaveBeenCalled()
    const logged = JSON.stringify(log.mock.calls)
    for (const secret of ['auth-code', 'client-secret', 'access-token', 'private details']) expect(logged).not.toContain(secret)
  })

  it('rejects keyless local dev callbacks before consuming an OAuth code', async () => {
    vi.stubEnv('JOBBER_TOKEN_ENCRYPTION_KEY', '')
    vi.stubEnv('NEXT_PUBLIC_DEV_NO_AUTH', 'true')
    const response = await jobberCallback(new NextRequest(
      'http://localhost:3000/api/jobber/callback?code=auth-code&state=valid',
      { headers: { cookie: 'jobber_oauth_state=valid' } }
    ))
    expect(response.status).toBe(503)
    expect(mocks.exchangeAuthorizationCode).not.toHaveBeenCalled()
    expect(mocks.saveDevJobberToken).not.toHaveBeenCalled()
  })
})

describe('jobber connect security', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.createClient.mockResolvedValue({ auth: { signOut: mocks.signOut } })
    mocks.requireAllowedUser.mockResolvedValue({
      ok: true,
      user: { id: 'user-1', email: 'owner@example.com' },
    })
    process.env.JOBBER_CLIENT_ID = 'client-id'
    process.env.JOBBER_CLIENT_SECRET = 'client-secret'
    process.env.JOBBER_REDIRECT_URI = 'http://localhost:3000/api/jobber/callback'
    process.env.NEXT_PUBLIC_DEV_NO_AUTH = 'false'
  })

  it('returns 503 in Vercel Preview before auth or OAuth state generation', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
    const request = new NextRequest('http://localhost:3000/api/jobber/connect', { headers: { 'sec-fetch-site': 'same-origin' } })

    try {
      const response = await jobberConnect(request)
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        ok: false,
        error: 'Jobber is disabled in this preview environment.',
      })
    } finally {
      randomUUID.mockRestore()
      vi.unstubAllEnvs()
    }

    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
  })

  it('redirects unauthenticated users to login before generating OAuth state', async () => {
    mocks.requireAllowedUser.mockResolvedValueOnce({
      ok: false,
      error: AUTHENTICATION_REQUIRED_ERROR,
    })
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
    const request = new NextRequest('http://localhost:3000/api/jobber/connect')

    try {
      const response = await jobberConnect(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/login')
      expect(randomUUID).not.toHaveBeenCalled()
    } finally {
      randomUUID.mockRestore()
    }
  })

  it('signs out authenticated users outside the allowlist before generating OAuth state', async () => {
    mocks.requireAllowedUser.mockResolvedValueOnce({
      ok: false,
      error: USER_NOT_ALLOWED_ERROR,
    })
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
    const request = new NextRequest('http://localhost:3000/api/jobber/connect', {
      headers: { 'sec-fetch-site': 'same-origin' },
    })

    try {
      const response = await jobberConnect(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/login')
      expect(mocks.signOut).toHaveBeenCalledOnce()
      expect(randomUUID).not.toHaveBeenCalled()
    } finally {
      randomUUID.mockRestore()
    }
  })

  it('generates OAuth state only after the user is allowed', async () => {
    const request = new NextRequest('http://localhost:3000/api/jobber/connect')

    const response = await jobberConnect(request)

    expect(mocks.requireAllowedUser).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('https://api.getjobber.com/api/oauth/authorize')
    expect(response.headers.get('set-cookie')).toContain('jobber_oauth_state=')
  })

  it('skips the auth gate and starts OAuth in dev no-auth mode', async () => {
    process.env.NEXT_PUBLIC_DEV_NO_AUTH = 'true'
    const request = new NextRequest('http://localhost:3000/api/jobber/connect')

    const response = await jobberConnect(request)
    const location = response.headers.get('location')
    const state = location ? new URL(location).searchParams.get('state') : null

    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(response.status).toBe(307)
    expect(location).toContain('https://api.getjobber.com/api/oauth/authorize')
    expect(state).toEqual(expect.any(String))
    expect(response.headers.get('set-cookie')).toContain(`jobber_oauth_state=${state}`)
  })

  it('keeps the auth gate in production even if dev no-auth is set', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_DEV_NO_AUTH', 'true')
    mocks.requireAllowedUser.mockResolvedValueOnce({
      ok: false,
      error: AUTHENTICATION_REQUIRED_ERROR,
    })
    const request = new NextRequest('http://localhost:3000/api/jobber/connect')

    try {
      const response = await jobberConnect(request)

      expect(mocks.requireAllowedUser).toHaveBeenCalledOnce()
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/login')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('does not turn a cross-site connect GET into a logout CSRF path', async () => {
    mocks.requireAllowedUser.mockResolvedValueOnce({ ok: false, error: USER_NOT_ALLOWED_ERROR })
    const response = await jobberConnect(new NextRequest('http://localhost:3000/api/jobber/connect', {
      headers: { 'sec-fetch-site': 'cross-site' },
    }))
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe('http://localhost:3000/login/signout')
  })
})
