import { afterEach, describe, expect, it } from 'vitest'
import { isDevNoAuthMode } from '@/lib/actions/types'

const originalEnv = {
  NEXT_PUBLIC_DEV_NO_AUTH: process.env.NEXT_PUBLIC_DEV_NO_AUTH,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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

    expect(isDevNoAuthMode()).toBe(false)
  })

  it('uses dev in-memory actions when Supabase config is missing', () => {
    delete process.env.NEXT_PUBLIC_DEV_NO_AUTH
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    expect(isDevNoAuthMode()).toBe(true)
  })

  it('allows explicit dev in-memory mode even with Supabase config', () => {
    process.env.NEXT_PUBLIC_DEV_NO_AUTH = 'true'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    expect(isDevNoAuthMode()).toBe(true)
  })
})
