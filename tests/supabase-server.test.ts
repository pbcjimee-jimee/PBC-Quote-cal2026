import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { createServiceClient } from '@/lib/supabase/server'

describe('supabase server clients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    mocks.createServiceRoleClient.mockReturnValue({ kind: 'service-role-client' })
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
})
