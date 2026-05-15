import { describe, expect, it } from 'vitest'
import nextConfig from '@/next.config'

describe('security headers', () => {
  it('sets baseline browser security headers for every route', async () => {
    expect(nextConfig.headers).toBeTypeOf('function')
    const headers = await nextConfig.headers!()

    expect(headers).toEqual([
      expect.objectContaining({
        source: '/(.*)',
        headers: expect.arrayContaining([
          { key: 'Content-Security-Policy', value: expect.stringContaining("frame-ancestors 'none'") },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: expect.stringContaining('camera=()') },
        ]),
      }),
    ])
  })
})
