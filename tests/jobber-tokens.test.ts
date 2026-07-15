import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobberConfig } from '@/lib/jobber/config'

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  refreshAccessToken: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: mocks.createServiceClient,
}))

vi.mock('@/lib/jobber/oauth', () => ({
  refreshAccessToken: mocks.refreshAccessToken,
  getTokenExpiresAt: () => '2026-05-14T01:00:00.000Z',
}))

import {
  getSharedJobberConnectionToken,
  getUsableSharedJobberConnectionToken,
  refreshSharedJobberConnectionToken,
} from '@/lib/jobber/tokens'
import { encryptTokenValue } from '@/lib/jobber/token-encryption'

const config: JobberConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://example.com/api/jobber/callback',
  graphqlVersion: '2025-04-16',
  accessToken: '',
}

interface JobberTokenRow {
  user_id: string
  access_token: string
  refresh_token: string
  scope: string | null
  expires_at: string | null
}

function createSelectBuilder(currentUserRow: JobberTokenRow, latestRow: JobberTokenRow) {
  let filteredByUser = false
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => {
      filteredByUser = true
      return builder
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data: filteredByUser ? currentUserRow : latestRow,
      error: null,
    })),
  }
  return builder
}

function createUpdateBuilder() {
  const builder = {
    update: vi.fn(() => builder),
    eq: vi.fn(async () => ({ error: null })),
  }
  return builder
}

describe('jobber tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.JOBBER_TOKEN_ENCRYPTION_KEY = ''
  })

  afterEach(() => {
    delete process.env.JOBBER_TOKEN_ENCRYPTION_KEY
  })

  it('uses the most recently updated Jobber connection for every logged-in app user', async () => {
    const currentUserRow = {
      user_id: 'current-user',
      access_token: 'stale-access-token',
      refresh_token: 'stale-refresh-token',
      scope: 'quotes:read',
      expires_at: '2026-05-14T00:30:00.000Z',
    }
    const latestRow = {
      user_id: 'jobber-owner',
      access_token: 'latest-access-token',
      refresh_token: 'latest-refresh-token',
      scope: 'quotes:read',
      expires_at: '2026-05-14T00:30:00.000Z',
    }
    const selectBuilder = createSelectBuilder(currentUserRow, latestRow)

    mocks.createServiceClient.mockResolvedValueOnce({
      from: vi.fn(() => selectBuilder),
    })

    const token = await getSharedJobberConnectionToken()

    expect(token).toEqual({
      ownerUserId: 'jobber-owner',
      accessToken: 'latest-access-token',
      refreshToken: 'latest-refresh-token',
      scope: 'quotes:read',
      expiresAt: '2026-05-14T00:30:00.000Z',
    })
    expect(selectBuilder.eq).not.toHaveBeenCalled()
    expect(selectBuilder.order).toHaveBeenCalledWith('updated_at', { ascending: false })
    expect(selectBuilder.limit).toHaveBeenCalledWith(1)
  })

  it('decrypts the shared latest Jobber connection before returning it', async () => {
    process.env.JOBBER_TOKEN_ENCRYPTION_KEY = 'test-encryption-key'
    const currentUserRow = {
      user_id: 'current-user',
      access_token: 'stale-access-token',
      refresh_token: 'stale-refresh-token',
      scope: 'quotes:read',
      expires_at: '2026-05-14T00:30:00.000Z',
    }
    const latestRow = {
      user_id: 'jobber-owner',
      access_token: encryptTokenValue('latest-access-token'),
      refresh_token: encryptTokenValue('latest-refresh-token'),
      scope: 'quotes:read',
      expires_at: '2026-05-14T00:30:00.000Z',
    }
    const selectBuilder = createSelectBuilder(currentUserRow, latestRow)

    mocks.createServiceClient.mockResolvedValueOnce({
      from: vi.fn(() => selectBuilder),
    })

    const token = await getSharedJobberConnectionToken()

    expect(token).toMatchObject({
      ownerUserId: 'jobber-owner',
      accessToken: 'latest-access-token',
      refreshToken: 'latest-refresh-token',
      scope: 'quotes:read',
    })
  })

  it('refreshes the owner row for the shared Jobber connection', async () => {
    const latestRow = {
      user_id: 'jobber-owner',
      access_token: 'expired-access-token',
      refresh_token: 'owner-refresh-token',
      scope: 'quotes:read',
      expires_at: '2026-05-14T00:00:00.000Z',
    }
    const selectBuilder = createSelectBuilder(latestRow, latestRow)
    const updateBuilder = createUpdateBuilder()
    const from = vi.fn((table: string) => {
      expect(table).toBe('jobber_tokens')
      return from.mock.calls.length === 1 ? selectBuilder : updateBuilder
    })

    mocks.createServiceClient.mockResolvedValue({
      from,
    })
    mocks.refreshAccessToken.mockResolvedValueOnce({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: 'quotes:read',
    })

    const token = await getUsableSharedJobberConnectionToken(config)

    expect(token).toMatchObject({
      ownerUserId: 'jobber-owner',
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      scope: 'quotes:read',
    })
    expect(updateBuilder.eq).toHaveBeenCalledWith('user_id', 'jobber-owner')
  })

  it('recovers from a refresh 401 when another request already saved a newer shared token', async () => {
    const expiredRow = {
      user_id: 'jobber-owner',
      access_token: 'expired-access-token',
      refresh_token: 'old-refresh-token',
      scope: 'quotes:read',
      expires_at: '2026-05-14T00:00:00.000Z',
    }
    const refreshedRow = {
      user_id: 'jobber-owner',
      access_token: 'already-refreshed-access-token',
      refresh_token: 'already-refreshed-refresh-token',
      scope: 'quotes:read',
      expires_at: '2099-05-14T00:00:00.000Z',
    }
    const firstSelectBuilder = createSelectBuilder(expiredRow, expiredRow)
    const secondSelectBuilder = createSelectBuilder(refreshedRow, refreshedRow)

    mocks.createServiceClient
      .mockResolvedValueOnce({
        from: vi.fn(() => firstSelectBuilder),
      })
      .mockResolvedValueOnce({
        from: vi.fn(() => secondSelectBuilder),
      })
    mocks.refreshAccessToken.mockRejectedValueOnce(new Error('Jobber token refresh failed with status 401'))

    const token = await getUsableSharedJobberConnectionToken(config)

    expect(token).toEqual({
      ownerUserId: 'jobber-owner',
      accessToken: 'already-refreshed-access-token',
      refreshToken: 'already-refreshed-refresh-token',
      scope: 'quotes:read',
      expiresAt: '2099-05-14T00:00:00.000Z',
    })
  })

  it('rejects a missing invoice scope before consuming an expired refresh token', async () => {
    const expiredRow = {
      user_id: 'jobber-owner',
      access_token: 'expired-access-token',
      refresh_token: 'owner-refresh-token',
      scope: 'read_clients read_jobs read_invoices',
      expires_at: '2026-05-14T00:00:00.000Z',
    }
    const selectBuilder = createSelectBuilder(expiredRow, expiredRow)
    mocks.createServiceClient.mockResolvedValueOnce({
      from: vi.fn(() => selectBuilder),
    })

    await expect(getUsableSharedJobberConnectionToken(config, {
      requiredScopes: ['read_clients', 'read_jobs', 'read_invoices', 'read_jobber_payments'],
    })).rejects.toThrow('Jobber connection is missing required read scopes: read_jobber_payments')

    expect(mocks.refreshAccessToken).not.toHaveBeenCalled()
  })

  it('preserves the stored scope when a refresh response omits scope', async () => {
    const requiredScopes = ['read_clients', 'read_jobs', 'read_invoices', 'read_jobber_payments'] as const
    const storedScope = requiredScopes.join(' ')
    const expiredRow = {
      user_id: 'jobber-owner',
      access_token: 'expired-access-token',
      refresh_token: 'owner-refresh-token',
      scope: storedScope,
      expires_at: '2026-05-14T00:00:00.000Z',
    }
    const selectBuilder = createSelectBuilder(expiredRow, expiredRow)
    const updateBuilder = createUpdateBuilder()
    const from = vi.fn(() => from.mock.calls.length === 1 ? selectBuilder : updateBuilder)
    mocks.createServiceClient
      .mockResolvedValueOnce({ from })
      .mockResolvedValueOnce({ from })
    mocks.refreshAccessToken.mockResolvedValueOnce({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: null,
    })

    const token = await getUsableSharedJobberConnectionToken(config, { requiredScopes })

    expect(token).not.toBeNull()
    if (!token) throw new Error('Expected a refreshed Jobber token')
    expect(token.scope).toBe(storedScope)
    expect(updateBuilder.update).toHaveBeenCalledWith(expect.objectContaining({ scope: storedScope }))
  })

  it('asks for a Jobber reconnect when the stored refresh token is already invalid', async () => {
    const expiredRow = {
      user_id: 'jobber-owner',
      access_token: 'expired-access-token',
      refresh_token: 'old-refresh-token',
      scope: 'quotes:read',
      expires_at: '2026-05-14T00:00:00.000Z',
    }
    const firstSelectBuilder = createSelectBuilder(expiredRow, expiredRow)
    const secondSelectBuilder = createSelectBuilder(expiredRow, expiredRow)

    mocks.createServiceClient
      .mockResolvedValueOnce({
        from: vi.fn(() => firstSelectBuilder),
      })
      .mockResolvedValueOnce({
        from: vi.fn(() => secondSelectBuilder),
      })
    mocks.refreshAccessToken.mockRejectedValueOnce(new Error('Jobber token refresh failed with status 401'))

    await expect(getUsableSharedJobberConnectionToken(config))
      .rejects.toThrow('Jobber connection expired. Reconnect Jobber from Settings.')
  })

  it('does not consume Jobber refresh tokens when production token storage is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('JOBBER_TOKEN_ENCRYPTION_KEY', '')

    try {
      await expect(refreshSharedJobberConnectionToken(
        'owner-refresh-token',
        config,
        'jobber-owner',
        { storedScope: null },
      )).rejects.toThrow('JOBBER_TOKEN_ENCRYPTION_KEY is required before storing Jobber tokens')
    } finally {
      vi.unstubAllEnvs()
    }

    expect(mocks.refreshAccessToken).not.toHaveBeenCalled()
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it('does not save refreshed Jobber tokens when the refresh response gains write scopes', async () => {
    mocks.refreshAccessToken.mockResolvedValueOnce({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: 'read_invoices jobs:write',
    })

    await expect(refreshSharedJobberConnectionToken(
      'owner-refresh-token',
      config,
      'jobber-owner',
      { storedScope: null },
    )).rejects.toThrow('Jobber OAuth scopes must be read-only')

    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it('does not save a changed refresh scope that drops an invoice requirement', async () => {
    const requiredScopes = ['read_clients', 'read_jobs', 'read_invoices', 'read_jobber_payments'] as const
    const expiredRow = {
      user_id: 'jobber-owner',
      access_token: 'expired-access-token',
      refresh_token: 'owner-refresh-token',
      scope: requiredScopes.join(' '),
      expires_at: '2026-05-14T00:00:00.000Z',
    }
    const selectBuilder = createSelectBuilder(expiredRow, expiredRow)
    mocks.createServiceClient.mockResolvedValueOnce({
      from: vi.fn(() => selectBuilder),
    })
    mocks.refreshAccessToken.mockResolvedValueOnce({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: 'read_clients read_jobs read_invoices',
    })

    await expect(getUsableSharedJobberConnectionToken(config, { requiredScopes }))
      .rejects.toThrow('Jobber connection is missing required read scopes: read_jobber_payments')

    expect(mocks.createServiceClient).toHaveBeenCalledTimes(1)
  })

  it('rejects stored Jobber tokens whose saved scope is no longer read-only', async () => {
    const storedRow = {
      user_id: 'jobber-owner',
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      scope: 'quotes:read jobs:write',
      expires_at: '2099-05-14T00:00:00.000Z',
    }
    const selectBuilder = createSelectBuilder(storedRow, storedRow)

    mocks.createServiceClient.mockResolvedValueOnce({
      from: vi.fn(() => selectBuilder),
    })

    await expect(getSharedJobberConnectionToken()).rejects.toThrow('Jobber OAuth scopes must be read-only')
  })
})
