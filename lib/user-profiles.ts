import { unstable_cache } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

export interface UserProfile {
  id: string
  email: string | null
  displayName: string
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

export function getAuthUserProfile(user: AuthUserLike): UserProfile {
  const email = typeof user.email === 'string' && user.email.trim() ? user.email.trim() : null
  const displayName =
    readDisplayName(user.app_metadata) ??
    readDisplayName(user.user_metadata) ??
    email ??
    'Unknown user'

  return {
    id: user.id,
    email,
    displayName,
  }
}

// Each lookup is an Auth Admin REST round trip and profiles are effectively
// static, so cache per user id across requests. Errors (including a missing
// service key) are thrown, never cached, and handled by the caller.
const getCachedAuthUserProfileById = unstable_cache(
  async (userId: string): Promise<UserProfile | null> => {
    const supabase = await createServiceClient()
    const { data, error } = await supabase.auth.admin.getUserById(userId)
    if (error) throw new Error(error.message)
    return data.user ? getAuthUserProfile(data.user) : null
  },
  ['auth-user-profile'],
  { revalidate: 3600, tags: ['user-profiles'] }
)

export async function getAuthUserProfilesById(userIds: string[]): Promise<Map<string, UserProfile>> {
  const uniqueIds = [...new Set(userIds.filter((id) => id.trim()))]
  const profiles = new Map<string, UserProfile>()
  if (uniqueIds.length === 0) return profiles

  await Promise.all(uniqueIds.map(async (userId) => {
    try {
      const profile = await getCachedAuthUserProfileById(userId)
      if (profile) profiles.set(userId, profile)
    } catch {
      // Missing service config or a transient Auth API failure: skip this
      // profile without caching the failure; callers show a fallback name.
    }
  }))

  return profiles
}
