import { renderToStaticMarkup } from 'react-dom/server'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { USER_NOT_ALLOWED_ERROR } from '@/lib/security/auth-policy'

const mocks = vi.hoisted(() => ({ requireAppUser: vi.fn(), signOut: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`) } }))
vi.mock('@/lib/security/require-app-user', () => ({ requireAppUser: mocks.requireAppUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { signOut: mocks.signOut } }) }))
vi.mock('@/components/layout/app-header', () => ({ AppHeader: () => null }))

import AppLayout from '@/app/(app)/layout'
import { GET, POST } from '@/app/api/auth/signout/route'
import { proxy } from '@/proxy'

describe('explicit signout after an untrusted navigation', () => {
  afterEach(() => vi.unstubAllEnvs())
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAppUser.mockResolvedValue({ ok: false, error: USER_NOT_ALLOWED_ERROR })
  })

  it('takes an inactive profile through a public confirmation page and origin-checked POST without a redirect loop', async () => {
    await expect(AppLayout({ children: <main>Protected</main> }))
      .rejects.toThrow('redirect:/api/auth/signout?reason=not_allowed')
    const response = await GET(new NextRequest('https://app.example.test/api/auth/signout?reason=not_allowed', {
      headers: { 'sec-fetch-site': 'cross-site' },
    }))
    expect(response.headers.get('location')).toBe('https://app.example.test/login/signout')
    expect(mocks.signOut).not.toHaveBeenCalled()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://local.supabase.co')
    const cookieHeaders: Record<string, string>[] = [{}, { cookie: 'sb-local-auth-token=stale' }]
    for (const headers of cookieHeaders) {
      const confirmation = await proxy(new NextRequest('https://app.example.test/login/signout', { headers }))
      expect(confirmation.headers.get('location')).toBeNull()
      expect(confirmation.headers.get('x-middleware-next')).toBe('1')
    }
    const { default: Confirmation } = await import('@/app/(auth)/login/signout/page')
    const markup = renderToStaticMarkup(<Confirmation />)
    expect(markup).toContain('action="/api/auth/signout"')
    expect(markup).toContain('method="post"')
    expect(markup).toContain('type="submit"')
    expect(markup).toContain('Sign out')
    expect(markup).not.toContain('<script')
    const result = await POST(new NextRequest('https://app.example.test/api/auth/signout', {
      method: 'POST', headers: { origin: 'https://app.example.test' },
    }))
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(result.status).toBe(303)
    expect(result.headers.get('location')).toBe('https://app.example.test/login')
  })
})
