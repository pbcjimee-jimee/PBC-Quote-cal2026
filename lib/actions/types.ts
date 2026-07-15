import { hasSupabaseBrowserConfig } from '@/lib/supabase/env'

export type ActionErrorCode =
  | 'VALIDATION'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'RECONCILIATION_REQUIRED'
  | 'JOBBER_ERROR'
  | 'DOCUMENT_ERROR'
  | 'STORAGE_ERROR'

export type ActionResult<T, TCurrent = never> =
  | { ok: true; data: T }
  | {
      ok: false
      error: string
      code?: ActionErrorCode
      current?: TCurrent
    }

export function isDevNoAuthMode(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  if (process.env.NEXT_PUBLIC_DEV_NO_AUTH === 'true') return true
  if (process.env.NEXT_PUBLIC_DEV_NO_AUTH === 'false') return false

  return !hasSupabaseBrowserConfig()
}
