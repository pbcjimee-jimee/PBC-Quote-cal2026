'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
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

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return fallback
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
  const parsed = listUsersSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  const admin = await authorizeAdmin()
  if (!admin.ok) return admin

  const service = await createServiceClient()
  const { data, error } = await service
    .from('user_profiles')
    .select('id, email, display_name, role, jobber_user_id, is_active, created_at, updated_at')
    .order('email', { ascending: true })

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data.map(rowToManagedUser) }
}

export async function createUser(input: unknown): Promise<ActionResult<ManagedUser>> {
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
    return { ok: false, error: errorMessage(authError, 'Unable to create Auth user') }
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
    await service.auth.admin.deleteUser(authData.user.id)
    return { ok: false, error: errorMessage(error, 'Unable to create app profile') }
  }

  revalidatePath('/settings/users')
  return { ok: true, data: rowToManagedUser(data) }
}

export async function updateUserRole(input: unknown): Promise<ActionResult<ManagedUser>> {
  const parsed = updateRoleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  const admin = await authorizeAdmin()
  if (!admin.ok) return admin

  const service = await createServiceClient()
  const { data, error } = await service
    .from('user_profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.id)
    .select('id, email, display_name, role, jobber_user_id, is_active, created_at, updated_at')
    .single()

  if (error || !data) return { ok: false, error: errorMessage(error, 'Unable to update user role') }
  revalidatePath('/settings/users')
  return { ok: true, data: rowToManagedUser(data) }
}

export async function setUserActive(input: unknown): Promise<ActionResult<ManagedUser>> {
  const parsed = setActiveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  const admin = await authorizeAdmin()
  if (!admin.ok) return admin
  if (admin.user.id === parsed.data.id && !parsed.data.active) {
    return { ok: false, error: 'You cannot deactivate your own account' }
  }

  const service = await createServiceClient()
  const banDuration = parsed.data.active ? 'none' : '876000h'
  const { error: authError } = await service.auth.admin.updateUserById(parsed.data.id, {
    ban_duration: banDuration,
  })
  if (authError) return { ok: false, error: authError.message }

  const { data, error } = await service
    .from('user_profiles')
    .update({ is_active: parsed.data.active })
    .eq('id', parsed.data.id)
    .select('id, email, display_name, role, jobber_user_id, is_active, created_at, updated_at')
    .single()

  if (error || !data) {
    await service.auth.admin.updateUserById(parsed.data.id, {
      ban_duration: parsed.data.active ? '876000h' : 'none',
    })
    return { ok: false, error: errorMessage(error, 'Unable to update user status') }
  }

  revalidatePath('/settings/users')
  return { ok: true, data: rowToManagedUser(data) }
}

export async function resetUserPassword(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = resetPasswordSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  const admin = await authorizeAdmin()
  if (!admin.ok) return admin

  const service = await createServiceClient()
  const { error } = await service.auth.admin.updateUserById(parsed.data.id, {
    password: parsed.data.temporaryPassword,
  })
  if (error) return { ok: false, error: error.message }

  return { ok: true, data: { id: parsed.data.id } }
}

export async function linkJobberUser(input: unknown): Promise<ActionResult<ManagedUser>> {
  const parsed = linkJobberSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  const admin = await authorizeAdmin()
  if (!admin.ok) return admin

  const service = await createServiceClient()
  const { data, error } = await service
    .from('user_profiles')
    .update({ jobber_user_id: parsed.data.jobberUserId || null })
    .eq('id', parsed.data.id)
    .select('id, email, display_name, role, jobber_user_id, is_active, created_at, updated_at')
    .single()

  if (error || !data) return { ok: false, error: errorMessage(error, 'Unable to link Jobber user') }
  revalidatePath('/settings/users')
  return { ok: true, data: rowToManagedUser(data) }
}
