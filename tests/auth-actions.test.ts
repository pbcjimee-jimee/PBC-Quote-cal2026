import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
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

import { signIn, signOut } from '@/lib/actions/auth'
import { initialAuthState } from '@/lib/actions/auth-state'

describe('auth actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
