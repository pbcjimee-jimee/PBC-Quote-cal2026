import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
  createServiceClient: mocks.createServiceClient,
}))

import { getUserProfilesById } from '@/lib/user-profiles'

describe('getUserProfilesById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads unique active app profiles in one authenticated query', async () => {
    const profileQuery = {
      select: vi.fn(() => profileQuery),
      eq: vi.fn(() => profileQuery),
      in: vi.fn(async () => ({
        data: [
          { id: 'user-2', email: 'two@example.com', display_name: 'User Two', role: 'admin' },
          { id: 'user-3', email: 'three@example.com', display_name: null, role: 'supervisor' },
        ],
        error: null,
      })),
    }
    const from = vi.fn(() => profileQuery)
    mocks.createClient.mockResolvedValueOnce({ from })

    const profiles = await getUserProfilesById(['user-2', 'user-2', '', 'user-3'])

    expect(from).toHaveBeenCalledOnce()
    expect(from).toHaveBeenCalledWith('user_profiles')
    expect(profileQuery.select).toHaveBeenCalledWith('id, email, display_name, role')
    expect(profileQuery.eq).toHaveBeenCalledWith('is_active', true)
    expect(profileQuery.in).toHaveBeenCalledWith('id', ['user-2', 'user-3'])
    expect([...profiles.entries()]).toEqual([
      ['user-2', { id: 'user-2', email: 'two@example.com', displayName: 'User Two', role: 'admin' }],
      ['user-3', { id: 'user-3', email: 'three@example.com', displayName: 'three@example.com', role: 'supervisor' }],
    ])
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it('returns an empty map without creating a client for empty input', async () => {
    const profiles = await getUserProfilesById([])

    expect(profiles.size).toBe(0)
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })
})
