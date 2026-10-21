'use server'

import { revalidatePath } from 'next/cache'
import { safeErrorMessage } from './action-error'
import { z } from 'zod'
import { isJobberDisabledInPreview, JOBBER_DISABLED_MESSAGE } from '@/lib/jobber/environment'
import { requireRole, type AppRole } from '@/lib/security/require-app-user'
import { createServiceClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import type { ActionResult } from './types'

type UserProfileRow = Database['public']['Tables']['user_profiles']['Row']

export type ManagedUser = {
  id: string
  email: string
  displayName: string | null
  role: AppRole
  jobberUserId: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const userIdSchema = z.string().uuid()
const roleSchema = z.enum(['admin', 'supervisor'])
const temporaryPasswordSchema = z.string().min(12).max(128)

const createUserSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  temporaryPassword: temporaryPasswordSchema,
  displayName: z.string().trim().min(1).max(120),
  role: roleSchema,
})

const updateRoleSchema = z.object({ id: userIdSchema, role: roleSchema })
const setActiveSchema = z.object({ id: userIdSchema, active: z.boolean() })
const resetPasswordSchema = z.object({ id: userIdSchema, temporaryPassword: temporaryPasswordSchema })
const linkJobberSchema = z.object({
  id: userIdSchema,
  jobberUserId: z.string().trim().max(200).nullable(),
})
const listUsersSchema = z.object({}).strict()

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  const message = safeErrorMessage(error, 'users.failure', fallback)
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    if (error.message.includes('LAST_ACTIVE_ADMIN_REQUIRED')) {
      return { ok: false, error: 'At least one active admin is required' }
    }
  }
  return { ok: false, error: message }
}

async function findProfile(service: Awaited<ReturnType<typeof createServiceClient>>, id: string): Promise<ActionResult<UserProfileRow>> {
  const { data, error } = await service.from('user_profiles')
    .select('id, email, display_name, role, jobber_user_id, is_active, created_at, updated_at')
    .eq('id', id).maybeSingle()
  if (error) return failure(error, 'Unable to load user')
  if (!data) return { ok: false, error: 'User not found' }
  return { ok: true, data }
}

function rowToManagedUser(row: UserProfileRow): ManagedUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    jobberUserId: row.jobber_user_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function authorizeAdmin() {
  return requireRole('admin')
}

export async function listUsers(input: unknown = {}): Promise<ActionResult<ManagedUser[]>> {
  try {
    const parsed = listUsersSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.message }

    const admin = await authorizeAdmin()
    if (!admin.ok) return admin

    const service = await createServiceClient()
    const { data, error } = await service
      .from('user_profiles')
      .select('id, email, display_name, role, jobber_user_id, is_active, created_at, updated_at')
      .order('email', { ascending: true })

    if (error) return failure(error, 'Unable to load users')
    return { ok: true, data: data.map(rowToManagedUser) }
  } catch (error) {
    return failure(error, 'Unable to load users')
  }
}

export async function createUser(input: unknown): Promise<ActionResult<ManagedUser>> {
  try {
    const parsed = createUserSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.message }

    const admin = await authorizeAdmin()
    if (!admin.ok) return admin

    const service = await createServiceClient()
    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.temporaryPassword,
      email_confirm: true,
      user_metadata: { display_name: parsed.data.displayName },
    })

    if (authError || !authData.user) {
      return failure(authError, 'Unable to create user')
    }

    const { data, error } = await service
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        email: parsed.data.email,
        display_name: parsed.data.displayName,
        role: parsed.data.role,
        is_active: true,
      })
      .select('id, email, display_name, role, jobber_user_id, is_active, created_at, updated_at')
      .single()

    if (error || !data) {
      // This ID belongs only to the Auth user created by this request.
      const { error: cleanupError } = await service.auth.admin.deleteUser(authData.user.id)
      if (cleanupError) return failure(cleanupError, 'Unable to create app profile. Contact an administrator before retrying.')
      return failure(error, 'Unable to create app profile')
    }

    revalidatePath('/settings/users')
    return { ok: true, data: rowToManagedUser(data) }
  } catch (error) {
    return failure(error, 'Unable to create user')
  }
}

export async function updateUserRole(input: unknown): Promise<ActionResult<ManagedUser>> {
  try {
    const parsed = updateRoleSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.message }

    const admin = await authorizeAdmin()
    if (!admin.ok) return admin

    const service = await createServiceClient()
    const profile = await findProfile(service, parsed.data.id)
    if (!profile.ok) return profile
    const { data, error } = await service
      .from('user_profiles')
      .update({ role: parsed.data.role })
      .eq('id', parsed.data.id)
      .select('id, email, display_name, role, jobber_user_id, is_active, created_at, updated_at')
      .single()

    if (error || !data) return failure(error, 'Unable to update user role')
    revalidatePath('/settings/users')
    return { ok: true, data: rowToManagedUser(data) }
  } catch (error) {
    return failure(error, 'Unable to update user role')
  }
}

export async function setUserActive(input: unknown): Promise<ActionResult<ManagedUser>> {
  try {
    const parsed = setActiveSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.message }

    const admin = await authorizeAdmin()
    if (!admin.ok) return admin
    if (admin.user.id === parsed.data.id && !parsed.data.active) {
      return { ok: false, error: 'You cannot deactivate your own account' }
    }

    const service = await createServiceClient()
    const profile = await findProfile(service, parsed.data.id)
    if (!profile.ok) return profile
    const { data: authData, error: lookupError } = await service.auth.admin.getUserById(parsed.data.id)
    if (lookupError || !authData.user) return failure(lookupError, 'Unable to load user status')
    const bannedUntil = authData.user.banned_until ? Date.parse(authData.user.banned_until) : 0
    if (!Number.isFinite(bannedUntil)) return failure(null, 'Unable to load user status')
    const banDuration = parsed.data.active ? 'none' : '876000h'
    const { error: authError } = await service.auth.admin.updateUserById(parsed.data.id, {
      ban_duration: banDuration,
    })
    if (authError) return failure(authError, 'Unable to update user status')

    let data: UserProfileRow | null = null
    let error: unknown
    try {
      const result = await service
        .from('user_profiles')
        .update({ is_active: parsed.data.active })
        .eq('id', parsed.data.id)
        .select('id, email, display_name, role, jobber_user_id, is_active, created_at, updated_at')
        .single()
      data = result.data
      error = result.error
    } catch (cause) {
      error = cause
    }

    if (error || !data) {
      const remainingBan = Math.max(0, bannedUntil - Date.now())
      const { error: rollbackError } = await service.auth.admin.updateUserById(parsed.data.id, {
        ban_duration: remainingBan > 0 ? `${remainingBan}ms` : 'none',
      })
      if (rollbackError) return failure(rollbackError, 'Unable to restore user status. Contact an administrator before retrying.')
      return failure(error, 'Unable to update user status')
    }

    revalidatePath('/settings/users')
    return { ok: true, data: rowToManagedUser(data) }
  } catch (error) {
    return failure(error, 'Unable to update user status')
  }
}

export async function resetUserPassword(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = resetPasswordSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.message }

    const admin = await authorizeAdmin()
    if (!admin.ok) return admin

    const service = await createServiceClient()
    const profile = await findProfile(service, parsed.data.id)
    if (!profile.ok) return profile
    const { error } = await service.auth.admin.updateUserById(parsed.data.id, {
      password: parsed.data.temporaryPassword,
    })
    if (error) return failure(error, 'Unable to reset password')

    return { ok: true, data: { id: parsed.data.id } }
  } catch (error) {
    return failure(error, 'Unable to reset password')
  }
}

export async function linkJobberUser(input: unknown): Promise<ActionResult<ManagedUser>> {
  try {
    const parsed = linkJobberSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.message }
    if (isJobberDisabledInPreview()) {
      return { ok: false, error: JOBBER_DISABLED_MESSAGE }
    }

    const admin = await authorizeAdmin()
    if (!admin.ok) return admin

    const service = await createServiceClient()
    const profile = await findProfile(service, parsed.data.id)
    if (!profile.ok) return profile
    const { data, error } = await service
      .from('user_profiles')
      .update({ jobber_user_id: parsed.data.jobberUserId || null })
      .eq('id', parsed.data.id)
      .select('id, email, display_name, role, jobber_user_id, is_active, created_at, updated_at')
      .single()

    if (error || !data) return failure(error, 'Unable to link Jobber user')
    revalidatePath('/settings/users')
    return { ok: true, data: rowToManagedUser(data) }
  } catch (error) {
    return failure(error, 'Unable to link Jobber user')
  }
}
