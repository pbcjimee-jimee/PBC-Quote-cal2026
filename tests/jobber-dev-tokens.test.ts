import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobberConfig } from '@/lib/jobber/config'
import { decryptTokenValue, encryptTokenValue } from '@/lib/jobber/token-encryption'

const mocks = vi.hoisted(() => ({
  isDevNoAuthMode: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  refreshAccessToken: vi.fn(),
}))

vi.mock('@/lib/actions/types', () => ({
  isDevNoAuthMode: mocks.isDevNoAuthMode,
}))

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
}))

vi.mock('@/lib/jobber/oauth', () => ({
  getTokenExpiresAt: () => '2026-05-15T01:00:00.000Z',
  refreshAccessToken: mocks.refreshAccessToken,
}))

import { getUsableDevJobberToken, saveDevJobberToken } from '@/lib/jobber/dev-tokens'

const config: JobberConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://example.com/api/jobber/callback',
  graphqlVersion: '2025-04-16',
  accessToken: '',
}

describe('jobber dev tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete globalThis.__pbcJobberDevToken
    mocks.isDevNoAuthMode.mockReturnValue(true)
    mocks.readFile.mockRejectedValue(new Error('missing dev token file'))
    vi.stubEnv('JOBBER_TOKEN_ENCRYPTION_KEY', 'dev-test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete globalThis.__pbcJobberDevToken
  })

  it('persists read-only scope metadata for local dev Jobber tokens', async () => {
    const token = await saveDevJobberToken({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: 'quotes:read',
    })

    expect(token.scope).toBe('quotes:read')
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.jobber.local.json'),
      expect.stringContaining('"scope": "quotes:read"'),
      { mode: 0o600 }
    )
  })

  it('does not persist local dev Jobber tokens with write scopes', async () => {
    await expect(saveDevJobberToken({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: 'quotes:read jobs:write',
    })).rejects.toThrow('Jobber OAuth scopes must be read-only')

    expect(mocks.writeFile).not.toHaveBeenCalled()
    expect(globalThis.__pbcJobberDevToken).toBeUndefined()
  })

  it('rejects local dev Jobber tokens loaded from disk with write scopes', async () => {
    mocks.readFile.mockResolvedValueOnce(JSON.stringify({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      scope: 'quotes:read jobs:write',
      expiresAt: '2099-05-15T00:00:00.000Z',
    }))

    await expect(getUsableDevJobberToken(config)).rejects.toThrow('Jobber OAuth scopes must be read-only')
  })

  it('writes encrypted tokens while keeping usable plaintext only in memory', async () => {
    await saveDevJobberToken({ accessToken: 'local-access-secret', refreshToken: 'local-refresh-secret',
      expiresIn: 3600, tokenType: 'Bearer', scope: 'quotes:read' })
    const content: string = mocks.writeFile.mock.calls[0][1]
    const saved = JSON.parse(content) as { accessToken: string; refreshToken: string }
    expect(content).not.toContain('local-access-secret')
    expect(content).not.toContain('local-refresh-secret')
    expect(saved.accessToken).toMatch(/^enc:v1:/)
    expect(decryptTokenValue(saved.accessToken)).toBe('local-access-secret')
    expect(decryptTokenValue(saved.refreshToken)).toBe('local-refresh-secret')
    expect(globalThis.__pbcJobberDevToken?.accessToken).toBe('local-access-secret')
  })

  it('refuses writes and memory replacement without an encryption key', async () => {
    vi.stubEnv('JOBBER_TOKEN_ENCRYPTION_KEY', '')
    await expect(saveDevJobberToken({ accessToken: 'access', refreshToken: 'refresh',
      expiresIn: 3600, tokenType: 'Bearer', scope: 'quotes:read' }))
      .rejects.toThrow('JOBBER_TOKEN_ENCRYPTION_KEY is required')
    expect(mocks.writeFile).not.toHaveBeenCalled()
    expect(globalThis.__pbcJobberDevToken).toBeUndefined()
  })

  it.each([false, true])('reads existing local token files (encrypted: %s)', async (encrypted) => {
    mocks.readFile.mockResolvedValueOnce(JSON.stringify({
      accessToken: encrypted ? encryptTokenValue('disk-access') : 'disk-access',
      refreshToken: encrypted ? encryptTokenValue('disk-refresh') : 'disk-refresh',
      scope: 'quotes:read', expiresAt: '2099-05-15T00:00:00.000Z',
    }))
    if (!encrypted) vi.stubEnv('JOBBER_TOKEN_ENCRYPTION_KEY', '')
    expect(await getUsableDevJobberToken(config)).toMatchObject({ accessToken: 'disk-access', refreshToken: 'disk-refresh' })
  })

  it('surfaces a missing key when reading an encrypted local file', async () => {
    const accessToken = encryptTokenValue('disk-access')
    mocks.readFile.mockResolvedValueOnce(JSON.stringify({ accessToken, refreshToken: accessToken,
      scope: 'quotes:read', expiresAt: '2099-05-15T00:00:00.000Z' }))
    vi.stubEnv('JOBBER_TOKEN_ENCRYPTION_KEY', '')
    await expect(getUsableDevJobberToken(config)).rejects.toThrow('JOBBER_TOKEN_ENCRYPTION_KEY is required')
  })
})
