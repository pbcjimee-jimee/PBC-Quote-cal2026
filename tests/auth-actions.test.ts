import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  headers: vi.fn(async () => new Headers({
    'x-forwarded-for': '203.0.113.10',
  })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}))

import { signIn, signOut } from '@/lib/actions/auth'
import { initialAuthState } from '@/lib/actions/auth-state'
import { resetLoginRateLimitsForTests } from '@/lib/security/auth-policy'

describe('auth actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetLoginRateLimitsForTests()
    delete process.env.ALLOWED_LOGIN_EMAILS
  })

  it('rejects missing credentials before calling Supabase', async () => {
    const formData = new FormData()

    const result = await signIn(initialAuthState, formData)

    expect(result.error).toBe('Enter a valid email and password')
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })

  it('returns a readable error when Supabase rejects the credentials', async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ error: new Error('Invalid login credentials') })
    const formData = new FormData()
    formData.set('email', 'user@example.com')
    formData.set('password', 'wrong-password')

    const result = await signIn(initialAuthState, formData)

    expect(result.error).toBe('Invalid email or password')
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'wrong-password',
    })
  })

  it('rejects emails outside the configured login allowlist before calling Supabase', async () => {
    process.env.ALLOWED_LOGIN_EMAILS = 'owner@example.com, staff@example.com'
    const formData = new FormData()
    formData.set('email', 'intruder@example.com')
    formData.set('password', 'correct-password')

    const result = await signIn(initialAuthState, formData)

    expect(result.error).toBe('Invalid email or password')
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })

  it('locks repeated failed login attempts for the same email and request fingerprint', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') })
    const formData = new FormData()
    formData.set('email', 'user@example.com')
    formData.set('password', 'wrong-password')

    for (let index = 0; index < 5; index += 1) {
      await signIn(initialAuthState, formData)
    }

    const result = await signIn(initialAuthState, formData)

    expect(result.error).toBe('Too many login attempts. Try again later.')
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(5)
  })

  it('redirects to quotes after successful sign in', async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ error: null })
    const formData = new FormData()
    formData.set('email', 'user@example.com')
    formData.set('password', 'correct-password')

    await expect(signIn(initialAuthState, formData)).rejects.toThrow('redirect:/quotes')

    expect(mocks.redirect).toHaveBeenCalledWith('/quotes')
  })

  it('signs out and redirects to login', async () => {
    mocks.signOut.mockResolvedValueOnce({ error: null })

    await expect(signOut()).rejects.toThrow('redirect:/login')

    expect(mocks.signOut).toHaveBeenCalled()
    expect(mocks.redirect).toHaveBeenCalledWith('/login')
  })
})
