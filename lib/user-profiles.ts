import { createServiceClient } from '@/lib/supabase/server'
import type { AppRole } from '@/lib/security/require-app-user'

export interface UserProfile {
  id: string
  email: string | null
  displayName: string
  role: AppRole
}

type AuthUserLike = {
  id: string
  email?: string | null
  user_metadata?: unknown
  app_metadata?: unknown
}

const displayNameKeys = ['profile_name', 'display_name', 'full_name', 'name'] as const

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function readDisplayName(metadata: unknown): string | null {
  const record = asRecord(metadata)

  for (const key of displayNameKeys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return null
}

export function getAuthUserProfile(
  user: AuthUserLike,
  appProfile?: { email: string; displayName: string | null; role: AppRole }
): UserProfile {
  const authEmail = typeof user.email === 'string' && user.email.trim() ? user.email.trim() : null
  const email = appProfile?.email?.trim() || authEmail
  const databaseDisplayName = appProfile?.displayName?.trim() || null
  const displayName =
    databaseDisplayName ??
    readDisplayName(user.app_metadata) ??
    readDisplayName(user.user_metadata) ??
    email ??
    'Unknown user'

  return {
    id: user.id,
    email,
    displayName,
    role: appProfile?.role ?? 'admin',
  }
}

export async function getAuthUserProfilesById(userIds: string[]): Promise<Map<string, UserProfile>> {
  const uniqueIds = [...new Set(userIds.filter((id) => id.trim()))]
  const profiles = new Map<string, UserProfile>()
  if (uniqueIds.length === 0) return profiles

  let supabase: Awaited<ReturnType<typeof createServiceClient>>

  try {
    supabase = await createServiceClient()
  } catch {
    return profiles
  }

  await Promise.all(uniqueIds.map(async (userId) => {
    const { data, error } = await supabase.auth.admin.getUserById(userId)
    if (!error && data.user) profiles.set(userId, getAuthUserProfile(data.user))
  }))

  return profiles
}
