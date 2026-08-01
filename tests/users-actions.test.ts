import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  }
  return builder
}

describe('admin user actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    expect(result).toEqual({ ok: false, error: 'duplicate email' })
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

    expect(result).toEqual({ ok: false, error: 'profile failed' })
    expect(deleteUser).toHaveBeenCalledWith(profileRow.id)
  })

  it('updates roles, Jobber links, and temporary passwords as admin', async () => {
    const builder = mutationBuilder({ data: { ...profileRow, role: 'admin' }, error: null })
    const updateUserById = vi.fn(async () => ({ data: {}, error: null }))
    mocks.createServiceClient.mockResolvedValue({
      auth: { admin: { updateUserById } },
      from: vi.fn(() => builder),
    })

    expect((await updateUserRole({ id: profileRow.id, role: 'admin' })).ok).toBe(true)
    expect((await linkJobberUser({ id: profileRow.id, jobberUserId: 'jobber-user-1' })).ok).toBe(true)
    expect((await resetUserPassword({ id: profileRow.id, temporaryPassword: 'Replacement!234' })).ok).toBe(true)

    expect(builder.update).toHaveBeenCalledWith({ role: 'admin' })
    expect(builder.update).toHaveBeenCalledWith({ jobber_user_id: 'jobber-user-1' })
    expect(updateUserById).toHaveBeenCalledWith(profileRow.id, { password: 'Replacement!234' })
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
      error: 'LAST_ACTIVE_ADMIN_REQUIRED',
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
      auth: { admin: { updateUserById } },
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
      auth: { admin: { updateUserById } },
      from: vi.fn(() => mutationBuilder({ data: null, error: new Error('profile update failed') })),
    })

    const result = await setUserActive({ id: profileRow.id, active: false })

    expect(result).toEqual({ ok: false, error: 'profile update failed' })
    expect(updateUserById).toHaveBeenNthCalledWith(1, profileRow.id, { ban_duration: '876000h' })
    expect(updateUserById).toHaveBeenNthCalledWith(2, profileRow.id, { ban_duration: 'none' })
  })

  it('surfaces the database last-admin error and restores Auth when deactivation is rejected', async () => {
    const updateUserById = vi.fn(async () => ({ data: {}, error: null }))
    mocks.createServiceClient.mockResolvedValue({
      auth: { admin: { updateUserById } },
      from: vi.fn(() => mutationBuilder({
        data: null,
        error: new Error('LAST_ACTIVE_ADMIN_REQUIRED'),
      })),
    })

    const result = await setUserActive({ id: profileRow.id, active: false })

    expect(result).toEqual({ ok: false, error: 'LAST_ACTIVE_ADMIN_REQUIRED' })
    expect(updateUserById).toHaveBeenNthCalledWith(1, profileRow.id, { ban_duration: '876000h' })
    expect(updateUserById).toHaveBeenNthCalledWith(2, profileRow.id, { ban_duration: 'none' })
  })

  it('returns service errors from password and Jobber link updates', async () => {
    const updateUserById = vi.fn(async () => ({ data: {}, error: new Error('password failed') }))
    mocks.createServiceClient.mockResolvedValue({
      auth: { admin: { updateUserById } },
      from: vi.fn(() => mutationBuilder({ data: null, error: new Error('link failed') })),
    })

    await expect(resetUserPassword({
      id: profileRow.id,
      temporaryPassword: 'Replacement!234',
    })).resolves.toEqual({ ok: false, error: 'password failed' })
    await expect(linkJobberUser({ id: profileRow.id, jobberUserId: 'jobber-1' }))
      .resolves.toEqual({ ok: false, error: 'link failed' })
  })

  it('rejects all mutations when the session is not admin', async () => {
    mocks.requireRole.mockResolvedValueOnce({ ok: false, error: 'Admin access required' })

    const result = await updateUserRole({ id: profileRow.id, role: 'admin' })

    expect(result).toEqual({ ok: false, error: 'Admin access required' })
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })
})
