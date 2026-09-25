import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createBrowserAwareServerClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  cookies: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createBrowserAwareServerClient,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createServiceRoleClient,
}))

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
}))

import { createClient, createServiceClient } from '@/lib/supabase/server'

describe('supabase server clients', () => {
  afterEach(() => vi.unstubAllEnvs())
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    mocks.cookies.mockResolvedValue({
      getAll: vi.fn(() => []),
      set: vi.fn(),
    })
    mocks.createBrowserAwareServerClient.mockReturnValue({ kind: 'cookie-client' })
    mocks.createServiceRoleClient.mockReturnValue({ kind: 'service-role-client' })
  })

  it('creates the request cookie client with the current publishable key', async () => {
    const client = await createClient()

    expect(client).toEqual({ kind: 'cookie-client' })
    expect(mocks.createBrowserAwareServerClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'sb_publishable_test',
      expect.objectContaining({
        cookies: expect.any(Object),
      })
    )
  })

  it('creates the service-role client without attaching request cookies', async () => {
    const client = await createServiceClient()

    expect(client).toEqual({ kind: 'service-role-client' })
    expect(mocks.cookies).not.toHaveBeenCalled()
    expect(mocks.createBrowserAwareServerClient).not.toHaveBeenCalled()
    expect(mocks.createServiceRoleClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role-key',
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      }
    )
  })

  it.each([createClient, createServiceClient])('blocks an unsafe Preview client before contacting Supabase', async (create) => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    await expect(create()).rejects.toThrow(/Preview/)
    expect(mocks.createBrowserAwareServerClient).not.toHaveBeenCalled()
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled()
  })
})
