import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireSupabaseBrowserConfig } from './env'
import type { Database } from './types'
import { assertPreviewEnvironment } from '@/lib/deployment/preview-environment'

export async function createClient() {
  assertPreviewEnvironment()
  const cookieStore = await cookies()
  const { url, key } = requireSupabaseBrowserConfig()

  return createServerClient<Database>(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component에서 호출 시 무시 (읽기 전용)
          }
        },
      },
    }
  )
}

export async function createServiceClient() {
  assertPreviewEnvironment()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase service configuration is missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    )
  }

  return createSupabaseClient<Database>(
    url,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    }
  )
}
