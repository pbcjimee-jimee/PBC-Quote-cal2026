import { isAuthenticatedUserAllowed, AUTHENTICATION_REQUIRED_ERROR, USER_NOT_ALLOWED_ERROR } from './auth-policy'
import { createClient } from '@/lib/supabase/server'

export type AllowedUser = {
  id: string
  email: string | null
}

export type RequireAllowedUserResult =
  | { ok: true; user: AllowedUser }
  | { ok: false; error: string }

export async function requireAllowedUser(): Promise<RequireAllowedUserResult> {
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
    },
  }
}
