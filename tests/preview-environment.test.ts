import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertPreviewEnvironment } from '@/lib/deployment/preview-environment'

const previewRef = 'wzntbkdkessgbgoyekir'
const jwt = (ref: string, role: string) =>
  `header.${Buffer.from(JSON.stringify({ ref, role })).toString('base64url')}.signature`
const isolated = () => ({
  VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SUPABASE_URL: `https://${previewRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt(previewRef, 'anon'),
  SUPABASE_SERVICE_ROLE_KEY: jwt(previewRef, 'service_role'),
  NEXT_PUBLIC_DEV_NO_AUTH: 'false',
})

afterEach(() => vi.unstubAllEnvs())

describe('Preview deployment safety', () => {
  it.each(['production', 'development', undefined])('leaves %s configuration unchanged', (environment) => {
    expect(() => assertPreviewEnvironment({ VERCEL_ENV: environment })).not.toThrow()
  })

  it('accepts the isolated test database with matching keys', () => {
    expect(() => assertPreviewEnvironment(isolated())).not.toThrow()
  })

  it.each([
    ['NEXT_PUBLIC_SUPABASE_URL', 'https://ojcrfgguhbxhtlgdflzp.supabase.co'],
    ['NEXT_PUBLIC_SUPABASE_URL', `https://${previewRef}.supabase.co.evil.example`],
    ['NEXT_PUBLIC_SUPABASE_URL', `https://${previewRef}.supabase.co/path`],
    ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', jwt('ojcrfgguhbxhtlgdflzp', 'anon')],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', jwt('ojcrfgguhbxhtlgdflzp', 'anon')],
    ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', jwt(previewRef, 'service_role')],
    ['SUPABASE_SERVICE_ROLE_KEY', jwt('ojcrfgguhbxhtlgdflzp', 'service_role')],
    ['SUPABASE_SERVICE_ROLE_KEY', ''],
    ['SUPABASE_SERVICE_ROLE_KEY', 'invalid'],
    ['NEXT_PUBLIC_DEV_NO_AUTH', 'true'],
    ['JOBBER_CLIENT_ID', 'configured-id'],
    ['JOBBER_CLIENT_SECRET', 'configured-secret'],
    ['JOBBER_REDIRECT_URI', 'https://production.example/api/jobber/callback'],
    ['JOBBER_CALLBACK_URL', 'https://production.example/api/jobber/callback'],
    ['JOBBER_TOKEN_ENCRYPTION_KEY', 'configured-key'],
    ['JOBBER_ACCESS_TOKEN', 'configured-token'],
  ])('rejects unsafe %s before deployment', (key, value) => {
    expect(() => assertPreviewEnvironment({ ...isolated(), [key]: value })).toThrow(/Preview/)
  })

  it('rejects a Preview build pointed at production before creating browser bundles', async () => {
    vi.resetModules()
    for (const [key, value] of Object.entries(isolated())) vi.stubEnv(key, value)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://ojcrfgguhbxhtlgdflzp.supabase.co')
    await expect(import('@/next.config')).rejects.toThrow(/Preview/)
  })

  it('blocks Preview browser connections outside the isolated test DB', async () => {
    vi.resetModules()
    for (const [key, value] of Object.entries(isolated())) vi.stubEnv(key, value)
    const { default: config } = await import('@/next.config')
    const headers = await config.headers?.()
    const policy = headers?.find(route => route.source === '/(.*)')?.headers.find(header => header.key === 'Content-Security-Policy')?.value
    expect(policy).toContain("connect-src 'self' https://wzntbkdkessgbgoyekir.supabase.co;")
    expect(policy).not.toContain('https://*.supabase.co')
    expect(policy).not.toContain('https://api.getjobber.com')
  })
})
