import { describe, expect, it } from 'vitest'
import nextConfig from '@/next.config'

describe('Next.js development origins', () => {
  it('allows the LAN host used for mobile development resources', () => {
    expect(nextConfig.allowedDevOrigins ?? []).toContain('192.168.1.167')
  })
})
