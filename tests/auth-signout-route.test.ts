import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signOut: mocks.signOut,
    },
  })),
}))

import { GET as signOutRoute } from '@/app/api/auth/signout/route'

describe('auth signout route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clears the Supabase session and redirects to login', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/signout?reason=not_allowed')

    const response = await signOutRoute(request)

    expect(mocks.signOut).toHaveBeenCalled()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/login')
  })
})
