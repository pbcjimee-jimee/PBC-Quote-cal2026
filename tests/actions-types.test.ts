import { afterEach, describe, expect, it } from 'vitest'
import { isDevNoAuthMode, type ActionResult } from '@/lib/actions/types'

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

  it('supports retained role application error codes', () => {
    const errors: readonly ActionResult<never>[] = [
      { ok: false, error: 'Invalid input', code: 'VALIDATION' },
      { ok: false, error: 'Insufficient role', code: 'FORBIDDEN' },
      { ok: false, error: 'Jobber unavailable', code: 'JOBBER_ERROR' },
    ]

    expect(errors).toEqual([
      { ok: false, error: 'Invalid input', code: 'VALIDATION' },
      { ok: false, error: 'Insufficient role', code: 'FORBIDDEN' },
      { ok: false, error: 'Jobber unavailable', code: 'JOBBER_ERROR' },
    ])
  })
})
