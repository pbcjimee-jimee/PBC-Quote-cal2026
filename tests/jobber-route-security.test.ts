import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  exchangeAuthorizationCode: vi.fn(),
  getTokenExpiresAt: vi.fn(),
}))

vi.mock('@/lib/jobber/oauth', () => ({
  exchangeAuthorizationCode: mocks.exchangeAuthorizationCode,
  getTokenExpiresAt: mocks.getTokenExpiresAt,
}))

vi.mock('@/lib/jobber/dev-tokens', () => ({
  saveDevJobberToken: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { GET as jobberCallback } from '@/app/api/jobber/callback/route'

describe('jobber callback security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.JOBBER_CLIENT_ID = 'client-id'
    process.env.JOBBER_CLIENT_SECRET = 'client-secret'
    process.env.JOBBER_REDIRECT_URI = 'http://localhost:3000/api/jobber/callback'
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
})
