import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequireAppUserResult } from '@/lib/security/require-app-user'

const mocks = vi.hoisted(() => ({ requireRole: vi.fn() }))
vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))

import { getAiQuoteAvailabilityForUser, requireAiQuoteUser } from '@/lib/ai-quote/access'

function admin(email: string | null, profileEmail = 'jimee@paintbuddyco.com.au'): RequireAppUserResult {
  return { ok: true, user: { id: 'admin-1', email }, profile: { id: 'admin-1', email: profileEmail,
    displayName: null, role: 'admin', jobberUserId: null, isActive: true } }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
  vi.stubEnv('NEXT_PUBLIC_DEV_NO_AUTH', 'false')
})
afterEach(() => vi.unstubAllEnvs())

describe('AI account access', () => {
  it.each(['jimee@paintbuddyco.com.au', ' JIMEE@PAINTBUDDYCO.COM.AU '])('allows the authenticated account %s', async email => {
    const auth = admin(email, 'other@paintbuddyco.com.au')
    mocks.requireRole.mockResolvedValue(auth)
    expect(await requireAiQuoteUser()).toEqual(auth)
    expect(mocks.requireRole).toHaveBeenCalledWith('admin')
  })

  it.each(['other@paintbuddyco.com.au', '', ' '])('rejects other auth emails even with an allowed profile: %s', async email => {
    mocks.requireRole.mockResolvedValue(admin(email))
    expect(await requireAiQuoteUser()).toEqual({ ok: false, error: 'AI quoting is not enabled for your account.' })
  })

  it('uses the profile email only when the auth email is null', async () => {
    const auth = admin(null)
    mocks.requireRole.mockResolvedValue(auth)
    expect(await requireAiQuoteUser()).toEqual(auth)
    mocks.requireRole.mockResolvedValue(admin(null, 'other@paintbuddyco.com.au'))
    expect(await requireAiQuoteUser()).toEqual({ ok: false, error: 'AI quoting is not enabled for your account.' })
  })

  it.each(['Authentication required', 'Admin access required'])('preserves the role failure: %s', async error => {
    const auth = { ok: false, error }
    mocks.requireRole.mockResolvedValue(auth)
    expect(await requireAiQuoteUser()).toEqual(auth)
  })
})

describe('AI availability for an account', () => {
  it('allows the configured account when the environment is enabled', () => {
    expect(getAiQuoteAvailabilityForUser(' JIMEE@PAINTBUDDYCO.COM.AU ')).toEqual({ enabled: true })
  })

  it.each([null, undefined, '', 'other@paintbuddyco.com.au'])('hides AI for %s', email => {
    expect(getAiQuoteAvailabilityForUser(email)).toEqual({ enabled: false, reason: 'not_allowed', message: 'AI quoting is not enabled for your account.' })
  })

  it.each([['VERCEL_ENV', 'preview', 'preview'], ['NEXT_PUBLIC_DEV_NO_AUTH', 'true', 'dev_no_auth'],
    ['ANTHROPIC_API_KEY', '', 'missing_key']])('preserves environment priority for %s', (name, value, reason) => {
    vi.stubEnv(name, value)
    expect(getAiQuoteAvailabilityForUser('other@paintbuddyco.com.au')).toMatchObject({ enabled: false, reason })
  })
})
