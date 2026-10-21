import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createServiceClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: mocks.createServiceClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import {
  createUser,
  linkJobberUser,
  listUsers,
  resetUserPassword,
  setUserActive,
  updateUserRole,
} from '@/lib/actions/users'

const profileRow = {
  id: '00000000-0000-4000-8000-000000000101',
  email: 'staff@example.com',
  display_name: 'Site supervisor',
  role: 'supervisor',
  jobber_user_id: null,
  is_active: true,
  created_at: '2026-07-31T00:00:00.000Z',
  updated_at: '2026-07-31T00:00:00.000Z',
}

function mutationBuilder(response: unknown) {
  const builder = {
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(async () => response),
    maybeSingle: vi.fn(async (): Promise<{ data: typeof profileRow | null; error: Error | null }> => ({ data: profileRow, error: null })),
  }
  return builder
}

describe('admin user actions', () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.requireRole.mockResolvedValue({
      ok: true,
      user: { id: '00000000-0000-4000-8000-000000000001' },
      profile: { role: 'admin' },
    })
  })

  it('validates before authorization and service-role access', async () => {
    const result = await createUser({ email: 'invalid', temporaryPassword: 'short' })

    expect(result.ok).toBe(false)
    expect(mocks.requireRole).not.toHaveBeenCalled()
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it('creates an Auth user and matching app profile', async () => {
    const builder = mutationBuilder({ data: profileRow, error: null })
    const createAuthUser = vi.fn(async () => ({
      data: { user: { id: profileRow.id } },
      error: null,
    }))
    mocks.createServiceClient.mockResolvedValue({
      auth: { admin: { createUser: createAuthUser, deleteUser: vi.fn() } },
      from: vi.fn(() => builder),
    })

    const result = await createUser({
      email: 'STAFF@example.com',
      temporaryPassword: 'Temporary!234',
      displayName: 'Site supervisor',
      role: 'supervisor',
    })

    expect(result).toMatchObject({ ok: true, data: { id: profileRow.id, role: 'supervisor' } })
    expect(createAuthUser).toHaveBeenCalledWith({
      email: 'staff@example.com',
      password: 'Temporary!234',
      email_confirm: true,
      user_metadata: { display_name: 'Site supervisor' },
    })
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: profileRow.id,
      email: 'staff@example.com',
      role: 'supervisor',
    }))
  })

  it('lists app profiles for admins', async () => {
    const order = vi.fn(async () => ({ data: [profileRow], error: null }))
    mocks.createServiceClient.mockResolvedValue({
      from: vi.fn(() => ({ select: vi.fn(() => ({ order })) })),
    })

    const result = await listUsers({})

    expect(result).toMatchObject({ ok: true, data: [{ email: 'staff@example.com' }] })
    expect(order).toHaveBeenCalledWith('email', { ascending: true })
  })

  it('returns Auth creation errors without writing a profile', async () => {
    const from = vi.fn()
    mocks.createServiceClient.mockResolvedValue({
      auth: { admin: { createUser: vi.fn(async () => ({ data: { user: null }, error: new Error('duplicate email') })) } },
      from,
    })

    const result = await createUser({
      email: 'staff@example.com',
      temporaryPassword: 'Temporary!234',
      displayName: 'Site supervisor',
      role: 'supervisor',
    })

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/^Unable to create user \(Ref: [a-f0-9]{12}\)$/) })
    expect(from).not.toHaveBeenCalled()
  })

  it('removes a newly created Auth user if profile creation fails', async () => {
    const deleteUser = vi.fn(async () => ({ data: null, error: null }))
    mocks.createServiceClient.mockResolvedValue({
      auth: {
        admin: {
          createUser: vi.fn(async () => ({ data: { user: { id: profileRow.id } }, error: null })),
          deleteUser,
        },
      },
      from: vi.fn(() => mutationBuilder({ data: null, error: new Error('profile failed') })),
    })

    const result = await createUser({
      email: 'staff@example.com',
      temporaryPassword: 'Temporary!234',
      displayName: 'Site supervisor',
      role: 'supervisor',
    })

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/^Unable to create app profile \(Ref: [a-f0-9]{12}\)$/) })
    expect(deleteUser).toHaveBeenCalledWith(profileRow.id)
  })

  it('updates roles, Jobber links, and temporary passwords as admin', async () => {
    const builder = mutationBuilder({ data: { ...profileRow, role: 'admin' }, error: null })
    const updateUserById = vi.fn(async () => ({ data: {}, error: null }))
    mocks.createServiceClient.mockResolvedValue({
      auth: { admin: { updateUserById, getUserById: vi.fn(async () => ({ data: { user: { banned_until: null } }, error: null })) } },
      from: vi.fn(() => builder),
    })

    expect((await updateUserRole({ id: profileRow.id, role: 'admin' })).ok).toBe(true)
    expect((await linkJobberUser({ id: profileRow.id, jobberUserId: 'jobber-user-1' })).ok).toBe(true)
    expect((await resetUserPassword({ id: profileRow.id, temporaryPassword: 'Replacement!234' })).ok).toBe(true)

    expect(builder.update).toHaveBeenCalledWith({ role: 'admin' })
    expect(builder.update).toHaveBeenCalledWith({ jobber_user_id: 'jobber-user-1' })
    expect(updateUserById).toHaveBeenCalledWith(profileRow.id, { password: 'Replacement!234' })
  })

  it('blocks Jobber user linking in Vercel Preview before auth or database access', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')

    try {
      await expect(linkJobberUser({ id: profileRow.id, jobberUserId: 'jobber-user-1' }))
        .resolves.toEqual({
          ok: false,
          error: 'Jobber is disabled in this preview environment.',
        })
    } finally {
      vi.unstubAllEnvs()
    }

    expect(mocks.requireRole).not.toHaveBeenCalled()
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('surfaces the database last-admin error when an admin demotes themself', async () => {
    const selfId = '00000000-0000-4000-8000-000000000001'
    mocks.createServiceClient.mockResolvedValue({
      from: vi.fn(() => mutationBuilder({
        data: null,
        error: new Error('LAST_ACTIVE_ADMIN_REQUIRED'),
      })),
    })

    await expect(updateUserRole({ id: selfId, role: 'supervisor' })).resolves.toEqual({
      ok: false,
      error: 'At least one active admin is required',
    })
  })

  it('blocks self-deactivation and synchronizes other users with Auth ban state', async () => {
    const selfResult = await setUserActive({
      id: '00000000-0000-4000-8000-000000000001',
      active: false,
    })
    expect(selfResult).toEqual({ ok: false, error: 'You cannot deactivate your own account' })
    expect(mocks.createServiceClient).not.toHaveBeenCalled()

    const builder = mutationBuilder({ data: { ...profileRow, is_active: false }, error: null })
    const updateUserById = vi.fn(async () => ({ data: {}, error: null }))
    mocks.createServiceClient.mockResolvedValue({
      auth: { admin: { updateUserById, getUserById: vi.fn(async () => ({ data: { user: { banned_until: null } }, error: null })) } },
      from: vi.fn(() => builder),
    })

    const result = await setUserActive({ id: profileRow.id, active: false })

    expect(result.ok).toBe(true)
    expect(updateUserById).toHaveBeenCalledWith(profileRow.id, { ban_duration: '876000h' })
    expect(builder.update).toHaveBeenCalledWith({ is_active: false })
  })

  it('rolls Auth ban state back if the profile status update fails', async () => {
    const updateUserById = vi.fn(async () => ({ data: {}, error: null }))
    mocks.createServiceClient.mockResolvedValue({
      auth: { admin: { updateUserById, getUserById: vi.fn(async () => ({ data: { user: { banned_until: null } }, error: null })) } },
      from: vi.fn(() => mutationBuilder({ data: null, error: new Error('profile update failed') })),
    })

    const result = await setUserActive({ id: profileRow.id, active: false })

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/^Unable to update user status \(Ref: [a-f0-9]{12}\)$/) })
    expect(updateUserById).toHaveBeenNthCalledWith(1, profileRow.id, { ban_duration: '876000h' })
    expect(updateUserById).toHaveBeenNthCalledWith(2, profileRow.id, { ban_duration: 'none' })
  })

  it('surfaces the database last-admin error and restores Auth when deactivation is rejected', async () => {
    const updateUserById = vi.fn(async () => ({ data: {}, error: null }))
    mocks.createServiceClient.mockResolvedValue({
      auth: { admin: { updateUserById, getUserById: vi.fn(async () => ({ data: { user: { banned_until: null } }, error: null })) } },
      from: vi.fn(() => mutationBuilder({
        data: null,
        error: new Error('LAST_ACTIVE_ADMIN_REQUIRED'),
      })),
    })

    const result = await setUserActive({ id: profileRow.id, active: false })

    expect(result).toEqual({ ok: false, error: 'At least one active admin is required' })
    expect(updateUserById).toHaveBeenNthCalledWith(1, profileRow.id, { ban_duration: '876000h' })
    expect(updateUserById).toHaveBeenNthCalledWith(2, profileRow.id, { ban_duration: 'none' })
  })

  it('returns service errors from password and Jobber link updates', async () => {
    const updateUserById = vi.fn(async () => ({ data: {}, error: new Error('password failed') }))
    mocks.createServiceClient.mockResolvedValue({
      auth: { admin: { updateUserById, getUserById: vi.fn(async () => ({ data: { user: { banned_until: null } }, error: null })) } },
      from: vi.fn(() => mutationBuilder({ data: null, error: new Error('link failed') })),
    })

    await expect(resetUserPassword({
      id: profileRow.id,
      temporaryPassword: 'Replacement!234',
    })).resolves.toEqual({ ok: false, error: expect.stringMatching(/^Unable to reset password \(Ref: [a-f0-9]{12}\)$/) })
    await expect(linkJobberUser({ id: profileRow.id, jobberUserId: 'jobber-1' }))
      .resolves.toEqual({ ok: false, error: expect.stringMatching(/^Unable to link Jobber user \(Ref: [a-f0-9]{12}\)$/) })
  })

  it('rejects all mutations when the session is not admin', async () => {
    mocks.requireRole.mockResolvedValueOnce({ ok: false, error: 'Admin access required' })

    const result = await updateUserRole({ id: profileRow.id, role: 'admin' })

    expect(result).toEqual({ ok: false, error: 'Admin access required' })
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  const mutations = [
    () => setUserActive({ id: profileRow.id, active: true }),
    () => setUserActive({ id: profileRow.id, active: false }),
    () => resetUserPassword({ id: profileRow.id, temporaryPassword: 'Replacement!234' }),
    () => updateUserRole({ id: profileRow.id, role: 'admin' }),
    () => linkJobberUser({ id: profileRow.id, jobberUserId: 'jobber-1' }),
  ]

  it.each(mutations)('rejects a missing app profile without touching shared Auth %#', async (mutate) => {
    const builder = mutationBuilder({ data: null, error: null })
    builder.maybeSingle.mockResolvedValue({ data: null, error: null })
    const authAdmin = { getUserById: vi.fn(), updateUserById: vi.fn() }
    mocks.createServiceClient.mockResolvedValue({ from: vi.fn(() => builder), auth: { admin: authAdmin } })
    await expect(mutate()).resolves.toEqual({ ok: false, error: 'User not found' })
    expect(builder.eq).toHaveBeenCalledWith('id', profileRow.id)
    expect(builder.update).not.toHaveBeenCalled()
    expect(authAdmin.getUserById).not.toHaveBeenCalled()
    expect(authAdmin.updateUserById).not.toHaveBeenCalled()
  })

  it.each(mutations)('fails closed on a profile lookup error %#', async (mutate) => {
    const builder = mutationBuilder({ data: null, error: null })
    builder.maybeSingle.mockResolvedValue({ data: null, error: new Error('internal schema details') })
    const updateUserById = vi.fn()
    mocks.createServiceClient.mockResolvedValue({ from: vi.fn(() => builder), auth: { admin: { updateUserById } } })
    await expect(mutate()).resolves.toEqual({ ok: false, error: expect.stringMatching(/^Unable to load user \(Ref: [a-f0-9]{12}\)$/) })
    expect(updateUserById).not.toHaveBeenCalled()
    expect(builder.update).not.toHaveBeenCalled()
  })

  it.each([null, '2026-01-01T00:00:00.000Z', '2026-10-21T01:30:00.000Z'])(
    'restores the actual previous ban (%s) after a failed activation, regardless of profile status', async (bannedUntil) => {
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-21T01:00:00.000Z'))
      const builder = mutationBuilder({ data: null, error: new Error('profile update failed') })
      const updateUserById = vi.fn(async () => ({ error: null }))
      mocks.createServiceClient.mockResolvedValue({
        from: vi.fn(() => builder),
        auth: { admin: {
          getUserById: vi.fn(async () => ({ data: { user: { banned_until: bannedUntil } }, error: null })),
          updateUserById,
        } },
      })
      await expect(setUserActive({ id: profileRow.id, active: true })).resolves.toEqual({ ok: false, error: expect.stringMatching(/^Unable to update user status \(Ref: [a-f0-9]{12}\)$/) })
      expect(updateUserById).toHaveBeenNthCalledWith(1, profileRow.id, { ban_duration: 'none' })
      expect(updateUserById).toHaveBeenNthCalledWith(2, profileRow.id, {
        ban_duration: bannedUntil === '2026-10-21T01:30:00.000Z' ? '1800000ms' : 'none',
      })
      expect(updateUserById).not.toHaveBeenCalledWith(profileRow.id, { ban_duration: '876000h' })
    }
  )

  it('restores Auth after a rejected profile write and reports rollback failure safely', async () => {
    const builder = mutationBuilder({ data: null, error: null })
    builder.single.mockRejectedValue(new Error('network write failed'))
    const updateUserById = vi.fn().mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error('private rollback details') })
    mocks.createServiceClient.mockResolvedValue({
      from: vi.fn(() => builder),
      auth: { admin: {
        getUserById: vi.fn(async () => ({ data: { user: { banned_until: null } }, error: null })),
        updateUserById,
      } },
    })
    await expect(setUserActive({ id: profileRow.id, active: true })).resolves.toEqual({
      ok: false, error: expect.stringMatching(/^Unable to restore user status\. Contact an administrator before retrying\. \(Ref: [a-f0-9]{12}\)$/),
    })
    expect(updateUserById).toHaveBeenCalledTimes(2)
    expect(console.error).toHaveBeenCalled()
  })

  it('does not mutate status if the previous Auth state cannot be read', async () => {
    const builder = mutationBuilder({ data: profileRow, error: null })
    const updateUserById = vi.fn()
    mocks.createServiceClient.mockResolvedValue({
      from: vi.fn(() => builder),
      auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: null }, error: new Error('private Auth error') })), updateUserById } },
    })
    await expect(setUserActive({ id: profileRow.id, active: false })).resolves.toEqual({ ok: false, error: expect.stringMatching(/^Unable to load user status \(Ref: [a-f0-9]{12}\)$/) })
    expect(updateUserById).not.toHaveBeenCalled()
    expect(builder.update).not.toHaveBeenCalled()
  })

  it('returns a safe Result when a service operation throws', async () => {
    mocks.createServiceClient.mockRejectedValue(new Error('private service configuration'))
    await expect(listUsers()).resolves.toEqual({ ok: false, error: expect.stringMatching(/^Unable to load users \(Ref: [a-f0-9]{12}\)$/) })
  })
})
