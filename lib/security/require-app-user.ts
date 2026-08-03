import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  AUTHENTICATION_REQUIRED_ERROR,
  isAuthenticatedUserAllowed,
  USER_NOT_ALLOWED_ERROR,
} from './auth-policy'

export type AppRole = 'admin' | 'supervisor'
export type RequiredAppRole = AppRole | 'any'

export type AppUser = {
  id: string
  email: string | null
  userMetadata?: unknown
  appMetadata?: unknown
}

export type AppUserProfile = {
  id: string
  email: string
  displayName: string | null
  role: AppRole
  jobberUserId: string | null
  isActive: boolean
}

export type RequireAppUserResult =
  | { ok: true; user: AppUser; profile: AppUserProfile }
  | { ok: false; error: string }

type UserProfileRow = {
  id: string
  email: string
  display_name: string | null
  role: AppRole
  jobber_user_id: string | null
  is_active: boolean
}

const getAppUserForRequest = cache(async (): Promise<RequireAppUserResult> => {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData.user) {
    return { ok: false, error: AUTHENTICATION_REQUIRED_ERROR }
  }

  if (!isAuthenticatedUserAllowed(authData.user)) {
    return { ok: false, error: USER_NOT_ALLOWED_ERROR }
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, display_name, role, jobber_user_id, is_active')
    .eq('id', authData.user.id)
    .maybeSingle()
  const profile = data as UserProfileRow | null

  if (error || !profile || !profile.is_active) {
    return { ok: false, error: USER_NOT_ALLOWED_ERROR }
  }

  return {
    ok: true,
    user: {
      id: authData.user.id,
      email: authData.user.email ?? null,
      userMetadata: authData.user.user_metadata,
      appMetadata: authData.user.app_metadata,
    },
    profile: {
      id: profile.id,
      email: profile.email,
      displayName: profile.display_name,
      role: profile.role,
      jobberUserId: profile.jobber_user_id,
      isActive: profile.is_active,
    },
  }
})

export async function requireAppUser(): Promise<RequireAppUserResult> {
  return getAppUserForRequest()
}

export async function requireRole(requiredRole: RequiredAppRole): Promise<RequireAppUserResult> {
  const result = await requireAppUser()
  if (!result.ok) return result

  if (requiredRole !== 'any' && result.profile.role !== requiredRole) {
    return { ok: false, error: `${requiredRole === 'admin' ? 'Admin' : 'Supervisor'} access required` }
  }

  return result
}
