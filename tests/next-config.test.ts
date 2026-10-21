import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig from '@/next.config'

describe('Next.js development origins', () => {
  it('allows the LAN host used for mobile development resources', () => {
    expect(nextConfig.allowedDevOrigins ?? []).toContain('192.168.1.167')
  })
})

describe('browser connection policy', () => {
  afterEach(() => vi.unstubAllEnvs())

  async function policy(url: string | undefined) {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', url)
    const { default: config } = await import('@/next.config')
    const routes = await config.headers?.()
    return routes?.find(route => route.source === '/(.*)')?.headers
      .find(header => header.key === 'Content-Security-Policy')?.value
  }

  it('limits Supabase connections to the configured origin and omits unused browser APIs', async () => {
    const value = await policy('https://isolated.supabase.co/path')
    expect(value).toContain("connect-src 'self' https://isolated.supabase.co;")
    expect(value).not.toContain('https://*.supabase.co')
    expect(value).not.toContain('api.getjobber.com')
    expect(value).not.toContain('wss:')
  })

  it('retains the Supabase fallback when no URL is configured', async () => {
    expect(await policy(undefined)).toContain("connect-src 'self' https://*.supabase.co;")
  })
})
