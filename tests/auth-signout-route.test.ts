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

import { GET as signOutRoute, POST as postSignOut } from '@/app/api/auth/signout/route'

describe('auth signout route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clears the Supabase session and redirects to login', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/signout?reason=not_allowed', {
      headers: { 'sec-fetch-site': 'same-origin' },
    })

    const response = await signOutRoute(request)

    expect(mocks.signOut).toHaveBeenCalled()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/login')
  })

  it.each(['cross-site', 'same-site', 'invalid'])('does not change a session for %s GETs, even with a same-origin Referer', async (site) => {
    const response = await signOutRoute(new NextRequest('https://app.example.test/api/auth/signout', {
      headers: { 'sec-fetch-site': site, referer: 'https://app.example.test/quotes' },
    }))

    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe('https://app.example.test/login/signout')
  })

  it.each<Record<string, string>>([
    { 'sec-fetch-site': 'none' },
    { referer: 'https://app.example.test/quotes' },
    { origin: 'https://app.example.test' },
  ])('allows direct navigation or same-origin legacy GETs: %j', async (headers) => {
    const response = await signOutRoute(new NextRequest('https://app.example.test/api/auth/signout', { headers }))
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(response.headers.get('location')).toBe('https://app.example.test/login')
  })

  it.each<Record<string, string>>([
    {},
    { referer: 'https://attacker.example.test/quotes' },
    { referer: 'not-a-url' },
    { origin: 'https://attacker.example.test', referer: 'https://app.example.test/quotes' },
  ])('requires same-origin evidence when Fetch Metadata is absent: %j', async (headers) => {
    const response = await signOutRoute(new NextRequest('https://app.example.test/api/auth/signout', { headers }))
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe('https://app.example.test/login/signout')
  })

  it.each([undefined, 'null', 'https://attacker.example.test', 'https://app.example.test.evil.test'])('rejects POST Origin %s without changing the session', async (origin) => {
    const response = await postSignOut(new NextRequest('https://app.example.test/api/auth/signout', {
      method: 'POST', headers: origin ? { origin } : {},
    }))
    expect(response.status).toBe(403)
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('signs out a same-origin POST and follows it with a GET login redirect', async () => {
    const response = await postSignOut(new NextRequest('https://app.example.test/api/auth/signout', {
      method: 'POST', headers: { origin: 'https://app.example.test' },
    }))
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://app.example.test/login')
  })
})
