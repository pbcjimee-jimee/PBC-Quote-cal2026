import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

import { requireAllowedUser } from '@/lib/security/require-allowed-user'

describe('requireAllowedUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ALLOWED_LOGIN_EMAILS
  })

  it('rejects missing authenticated users', async () => {
    mocks.createClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    })

    await expect(requireAllowedUser()).resolves.toEqual({
      ok: false,
      error: 'Authentication required',
    })
  })

  it('rejects authenticated users outside the login allowlist', async () => {
    process.env.ALLOWED_LOGIN_EMAILS = 'owner@example.com'
    mocks.createClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'user-1', email: 'intruder@example.com' } },
          error: null,
        })),
      },
    })

    await expect(requireAllowedUser()).resolves.toEqual({
      ok: false,
      error: 'User is not allowed to access this app',
    })
  })

  it('returns the allowed authenticated user id and email', async () => {
    process.env.ALLOWED_LOGIN_EMAILS = 'owner@example.com'
    mocks.createClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'user-1', email: 'OWNER@example.com' } },
          error: null,
        })),
      },
    })

    await expect(requireAllowedUser()).resolves.toEqual({
      ok: true,
      user: {
        id: 'user-1',
        email: 'OWNER@example.com',
        userMetadata: undefined,
        appMetadata: undefined,
      },
    })
  })
})
