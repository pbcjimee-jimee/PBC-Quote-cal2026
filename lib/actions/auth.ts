'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  createLoginRateLimitKey,
  isLoginEmailAllowed,
  LOGIN_LOCKED_ERROR,
  recordFailedLogin,
} from '@/lib/security/auth-policy'
import { createClient } from '@/lib/supabase/server'
import type { AuthState } from './auth-state'

const signInSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  password: z.string().min(1),
})

async function getRequestFingerprint(): Promise<string> {
  try {
    const requestHeaders = await headers()
    const forwardedFor = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
    return forwardedFor || requestHeaders.get('x-real-ip') || 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function signIn(
  _previousState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: 'Enter a valid email and password' }
  }

  const rateLimitKey = createLoginRateLimitKey(parsed.data.email, await getRequestFingerprint())
  const rateLimit = checkLoginRateLimit(rateLimitKey)
  if (!rateLimit.allowed) {
    return { error: LOGIN_LOCKED_ERROR }
  }

  if (!isLoginEmailAllowed(parsed.data.email)) {
    const failedLogin = recordFailedLogin(rateLimitKey)
    return { error: failedLogin.allowed ? 'Invalid email or password' : LOGIN_LOCKED_ERROR }
  }

  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch {
    return { error: 'Supabase login is not configured on this deployment' }
  }

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error || !data.user) {
    const failedLogin = recordFailedLogin(rateLimitKey)
    return { error: failedLogin.allowed ? 'Invalid email or password' : LOGIN_LOCKED_ERROR }
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('role, is_active')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profileError || !profile?.is_active) {
    await supabase.auth.signOut()
    return { error: 'User is not allowed to access this app' }
  }

  clearLoginRateLimit(rateLimitKey)
  redirect(profile.role === 'supervisor' ? '/jobs' : '/quotes')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
