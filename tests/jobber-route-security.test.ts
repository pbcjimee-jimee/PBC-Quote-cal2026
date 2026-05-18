import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  exchangeAuthorizationCode: vi.fn(),
  getTokenExpiresAt: vi.fn(),
  saveDevJobberToken: vi.fn(),
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
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

import { GET as jobberCallback } from '@/app/api/jobber/callback/route'

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
