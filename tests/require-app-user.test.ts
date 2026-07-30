import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

import { requireAppUser, requireRole } from '@/lib/security/require-app-user'

function createSupabaseMock(options: {
  user?: { id: string; email?: string; user_metadata?: unknown; app_metadata?: unknown } | null
  profile?: {
    id: string
    email: string
    display_name: string | null
    role: 'admin' | 'supervisor'
    jobber_user_id: string | null
    is_active: boolean
  } | null
  authError?: Error | null
  profileError?: Error | null
}) {
  const maybeSingle = vi.fn(async () => ({
    data: options.profile ?? null,
    error: options.profileError ?? null,
  }))
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options.user ?? null },
        error: options.authError ?? null,
      })),
    },
    from: vi.fn(() => ({ select })),
  }
}

describe('app role guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ALLOWED_LOGIN_EMAILS
  })

  it('rejects missing authenticated users', async () => {
    mocks.createClient.mockResolvedValueOnce(createSupabaseMock({ user: null }))

    await expect(requireAppUser()).resolves.toEqual({
      ok: false,
      error: 'Authentication required',
    })
  })

  it('rejects missing and inactive profiles', async () => {
    const user = { id: 'user-1', email: 'owner@example.com' }
    mocks.createClient
      .mockResolvedValueOnce(createSupabaseMock({ user, profile: null }))
      .mockResolvedValueOnce(createSupabaseMock({
        user,
        profile: {
          id: 'user-1',
          email: 'owner@example.com',
          display_name: null,
          role: 'admin',
          jobber_user_id: null,
          is_active: false,
        },
      }))

    await expect(requireAppUser()).resolves.toEqual({
      ok: false,
      error: 'User is not allowed to access this app',
    })
    await expect(requireAppUser()).resolves.toEqual({
      ok: false,
      error: 'User is not allowed to access this app',
    })
  })

  it('uses the database profile and display name as the session role source', async () => {
    mocks.createClient.mockResolvedValueOnce(createSupabaseMock({
      user: {
        id: 'user-1',
        email: 'OWNER@example.com',
        user_metadata: { display_name: 'Auth name' },
      },
      profile: {
        id: 'user-1',
        email: 'owner@example.com',
        display_name: 'Database name',
        role: 'admin',
        jobber_user_id: 'jobber-1',
        is_active: true,
      },
    }))

    await expect(requireAppUser()).resolves.toEqual({
      ok: true,
      user: {
        id: 'user-1',
        email: 'OWNER@example.com',
        userMetadata: { display_name: 'Auth name' },
        appMetadata: undefined,
      },
      profile: {
        id: 'user-1',
        email: 'owner@example.com',
        displayName: 'Database name',
        role: 'admin',
        jobberUserId: 'jobber-1',
        isActive: true,
      },
    })
  })

  it('allows both roles through any and blocks supervisors from admin', async () => {
    const supervisorClient = () => createSupabaseMock({
      user: { id: 'supervisor-1', email: 'staff@example.com' },
      profile: {
        id: 'supervisor-1',
        email: 'staff@example.com',
        display_name: 'Staff',
        role: 'supervisor',
        jobber_user_id: 'jobber-2',
        is_active: true,
      },
    })
    mocks.createClient
      .mockResolvedValueOnce(supervisorClient())
      .mockResolvedValueOnce(supervisorClient())

    await expect(requireRole('any')).resolves.toMatchObject({ ok: true })
    await expect(requireRole('admin')).resolves.toEqual({
      ok: false,
      error: 'Admin access required',
    })
  })
})
