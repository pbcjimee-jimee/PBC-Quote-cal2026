import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
}))

vi.mock('@/lib/security/require-app-user', () => ({
  requireRole: mocks.requireRole,
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

import QuotesLayout from '@/app/(app)/quotes/layout'
import { requireAdminPage } from '@/lib/security/page-role-guard'

describe('admin page role guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects supervisors away from quotes', async () => {
    mocks.requireRole.mockResolvedValueOnce({ ok: false, error: 'Admin access required' })

    await expect(QuotesLayout({ children: <main>Admin only</main> })).rejects.toThrow('redirect:/jobs')
  })

  it('redirects unauthenticated users to login', async () => {
    mocks.requireRole.mockResolvedValueOnce({ ok: false, error: 'Authentication required' })

    await expect(requireAdminPage()).rejects.toThrow('redirect:/login')
  })

  it('allows admins to render protected routes', async () => {
    mocks.requireRole.mockResolvedValueOnce({ ok: true })

    const result = await QuotesLayout({ children: <main>Admin only</main> })

    expect(result.props.children.props.children).toBe('Admin only')
  })
})
