import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAllowedUser: vi.fn(),
  appHeader: vi.fn(() => <header>App header</header>),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
}))

vi.mock('@/lib/security/require-allowed-user', () => ({
  requireAllowedUser: mocks.requireAllowedUser,
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

vi.mock('@/components/layout/app-header', () => ({
  AppHeader: mocks.appHeader,
}))

import AppLayout from '@/app/(app)/layout'

describe('app layout auth guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ALLOWED_LOGIN_EMAILS
  })

  it('redirects to login when Supabase has no current user', async () => {
    mocks.requireAllowedUser.mockResolvedValueOnce({
      ok: false,
      error: 'Authentication required',
    })

    await expect(
      Promise.resolve().then(() => AppLayout({ children: <main>Protected content</main> }))
    ).rejects.toThrow('redirect:/login')

    expect(mocks.redirect).toHaveBeenCalledWith('/login')
  })

  it('renders protected content when Supabase verifies the current user', async () => {
    mocks.requireAllowedUser.mockResolvedValueOnce({
      ok: true,
      user: { id: 'user-1', email: 'user@example.com', userMetadata: { full_name: 'Mia Kang' } },
    })

    const result = await Promise.resolve().then(() =>
      AppLayout({ children: <main>Protected content</main> })
    )

    expect(result.props.children[1].props.children).toBe('Protected content')
    expect(result.props.children[0].props).toEqual({
      userProfile: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'Mia Kang',
      },
    })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('redirects disallowed authenticated users through sign-out when an email allowlist is configured', async () => {
    process.env.ALLOWED_LOGIN_EMAILS = 'owner@example.com'
    mocks.requireAllowedUser.mockResolvedValueOnce({
      ok: false,
      error: 'User is not allowed to access this app',
    })

    await expect(
      Promise.resolve().then(() => AppLayout({ children: <main>Protected content</main> }))
    ).rejects.toThrow('redirect:/api/auth/signout?reason=not_allowed')

    expect(mocks.redirect).toHaveBeenCalledWith('/api/auth/signout?reason=not_allowed')
  })
})
