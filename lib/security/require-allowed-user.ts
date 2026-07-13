import { isAuthenticatedUserAllowed, AUTHENTICATION_REQUIRED_ERROR, USER_NOT_ALLOWED_ERROR } from './auth-policy'
import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'

export type AllowedUser = {
  id: string
  email: string | null
  userMetadata?: unknown
  appMetadata?: unknown
}

export type RequireAllowedUserResult =
  | { ok: true; user: AllowedUser }
  | { ok: false; error: string }

const getAllowedUserForRequest = cache(async (): Promise<RequireAllowedUserResult> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    return { ok: false, error: AUTHENTICATION_REQUIRED_ERROR }
  }

  if (!isAuthenticatedUserAllowed(data.user)) {
    return { ok: false, error: USER_NOT_ALLOWED_ERROR }
  }

  return {
    ok: true,
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
      userMetadata: data.user.user_metadata,
      appMetadata: data.user.app_metadata,
    },
  }
})

export async function requireAllowedUser(): Promise<RequireAllowedUserResult> {
  return getAllowedUserForRequest()
}
