import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  exchangeAuthorizationCode: vi.fn(),
  getTokenExpiresAt: vi.fn(),
  saveDevJobberToken: vi.fn(),
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  requireAllowedUser: vi.fn(),
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

vi.mock('@/lib/security/require-allowed-user', () => ({
  requireAllowedUser: mocks.requireAllowedUser,
}))

import { GET as jobberCallback } from '@/app/api/jobber/callback/route'
import { GET as jobberConnect } from '@/app/api/jobber/connect/route'
import { AUTHENTICATION_REQUIRED_ERROR, USER_NOT_ALLOWED_ERROR } from '@/lib/security/auth-policy'

describe('jobber callback security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
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

  it('rejects OAuth callbacks that do not include the state cookie', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/jobber/callback?code=auth-code&state=state-from-url'
    )

    const response = await jobberCallback(request)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, error: 'Invalid Jobber OAuth state' })
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
    expect(await response.json()).toEqual({ ok: false, error: 'Jobber OAuth scopes must be read-only' })
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

  it('does not save Jobber tokens for authenticated users outside the login allowlist', async () => {
    process.env.ALLOWED_LOGIN_EMAILS = 'owner@example.com'
    mocks.exchangeAuthorizationCode.mockResolvedValueOnce({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: 'quotes:read jobs:read',
    })
    mocks.getTokenExpiresAt.mockReturnValueOnce('2026-05-15T00:00:00.000Z')
    mocks.createClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'user-2', email: 'intruder@example.com' } },
          error: null,
        })),
      },
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
    expect(response.headers.get('location')).toBe('http://localhost:3000/api/auth/signout?reason=not_allowed')
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })
})

describe('jobber connect security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAllowedUser.mockResolvedValue({
      ok: true,
      user: { id: 'user-1', email: 'owner@example.com' },
    })
    process.env.JOBBER_CLIENT_ID = 'client-id'
    process.env.JOBBER_CLIENT_SECRET = 'client-secret'
    process.env.JOBBER_REDIRECT_URI = 'http://localhost:3000/api/jobber/callback'
    process.env.NEXT_PUBLIC_DEV_NO_AUTH = 'false'
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
    const request = new NextRequest('http://localhost:3000/api/jobber/connect')

    try {
      const response = await jobberConnect(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/api/auth/signout?reason=not_allowed')
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
})
