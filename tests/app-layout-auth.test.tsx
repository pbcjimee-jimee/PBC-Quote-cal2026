import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mocks.getUser,
    },
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

vi.mock('@/components/layout/app-header', () => ({
  AppHeader: () => <header>App header</header>,
}))

import AppLayout from '@/app/(app)/layout'

describe('app layout auth guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ALLOWED_LOGIN_EMAILS
  })

  it('redirects to login when Supabase has no current user', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    })

    await expect(
      Promise.resolve().then(() => AppLayout({ children: <main>Protected content</main> }))
    ).rejects.toThrow('redirect:/login')

    expect(mocks.redirect).toHaveBeenCalledWith('/login')
  })

  it('renders protected content when Supabase verifies the current user', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: 'user@example.com' } },
      error: null,
    })

    const result = await Promise.resolve().then(() =>
      AppLayout({ children: <main>Protected content</main> })
    )

    expect(result.props.children[1].props.children).toBe('Protected content')
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('redirects disallowed authenticated users through sign-out when an email allowlist is configured', async () => {
    process.env.ALLOWED_LOGIN_EMAILS = 'owner@example.com'
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-2', email: 'intruder@example.com' } },
      error: null,
    })

    await expect(
      Promise.resolve().then(() => AppLayout({ children: <main>Protected content</main> }))
    ).rejects.toThrow('redirect:/api/auth/signout?reason=not_allowed')

    expect(mocks.redirect).toHaveBeenCalledWith('/api/auth/signout?reason=not_allowed')
  })
})
