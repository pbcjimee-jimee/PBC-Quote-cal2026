import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isDevNoAuthMode, type ActionResult } from '@/lib/actions/types'

const actionTypesSource = readFileSync(
  join(process.cwd(), 'lib', 'actions', 'types.ts'),
  'utf8'
)

const originalEnv = {
  NEXT_PUBLIC_DEV_NO_AUTH: process.env.NEXT_PUBLIC_DEV_NO_AUTH,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

describe('action runtime mode', () => {
  afterEach(() => {
    restoreEnv()
  })

  it('uses Supabase-backed actions by default when Supabase config is present', () => {
    delete process.env.NEXT_PUBLIC_DEV_NO_AUTH
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    expect(isDevNoAuthMode()).toBe(false)
  })

  it('uses Supabase-backed actions when the current publishable key is present', () => {
    delete process.env.NEXT_PUBLIC_DEV_NO_AUTH
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    expect(isDevNoAuthMode()).toBe(false)
  })

  it('uses dev in-memory actions when Supabase config is missing', () => {
    delete process.env.NEXT_PUBLIC_DEV_NO_AUTH
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    expect(isDevNoAuthMode()).toBe(true)
  })

  it('allows explicit dev in-memory mode even with Supabase config', () => {
    process.env.NEXT_PUBLIC_DEV_NO_AUTH = 'true'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    expect(isDevNoAuthMode()).toBe(true)
  })
})

describe('ActionResult compatibility', () => {
  it('keeps existing success and error values assignable', () => {
    const success: ActionResult<{ id: string }> = {
      ok: true,
      data: { id: 'profile-1' },
    }
    const error: ActionResult<{ id: string }> = {
      ok: false,
      error: 'Could not save',
    }

    expect(success).toEqual({ ok: true, data: { id: 'profile-1' } })
    expect(error).toEqual({ ok: false, error: 'Could not save' })
  })

  it('supports the approved stable error codes and typed conflict data', () => {
    const conflict: ActionResult<{ id: string }, { id: string; version: number }> = {
      ok: false,
      error: 'PROGRESS_VERSION_CONFLICT',
      code: 'VERSION_CONFLICT',
      current: { id: 'profile-1', version: 2 },
    }

    expect(conflict).toEqual({
      ok: false,
      error: 'PROGRESS_VERSION_CONFLICT',
      code: 'VERSION_CONFLICT',
      current: { id: 'profile-1', version: 2 },
    })
    expect(actionTypesSource).toMatch(
      /export type ActionErrorCode\s*=\s*[\s\S]*'VALIDATION'[\s\S]*'AUTH_REQUIRED'[\s\S]*'FORBIDDEN'[\s\S]*'NOT_FOUND'[\s\S]*'VERSION_CONFLICT'[\s\S]*'RECONCILIATION_REQUIRED'[\s\S]*'JOBBER_ERROR'[\s\S]*'DOCUMENT_ERROR'[\s\S]*'STORAGE_ERROR'/
    )
    expect(actionTypesSource).toMatch(
      /export type ActionResult<T,\s*TCurrent\s*=\s*never>/
    )
  })
})
