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

import { getStoredJobberToken, getUsableJobberToken } from '@/lib/jobber/tokens'
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
      expires_at: '2026-05-14T00:30:00.000Z',
    }
    const latestRow = {
      user_id: 'jobber-owner',
      access_token: 'latest-access-token',
      refresh_token: 'latest-refresh-token',
      expires_at: '2026-05-14T00:30:00.000Z',
    }
    const selectBuilder = createSelectBuilder(currentUserRow, latestRow)

    mocks.createServiceClient.mockResolvedValueOnce({
      from: vi.fn(() => selectBuilder),
    })

    const token = await getStoredJobberToken('current-user')

    expect(token).toEqual({
      ownerUserId: 'jobber-owner',
      accessToken: 'latest-access-token',
      refreshToken: 'latest-refresh-token',
      expiresAt: '2026-05-14T00:30:00.000Z',
    })
    expect(selectBuilder.order).toHaveBeenCalledWith('updated_at', { ascending: false })
    expect(selectBuilder.limit).toHaveBeenCalledWith(1)
  })

  it('decrypts the shared latest Jobber connection before returning it', async () => {
    process.env.JOBBER_TOKEN_ENCRYPTION_KEY = 'test-encryption-key'
    const currentUserRow = {
      user_id: 'current-user',
      access_token: 'stale-access-token',
      refresh_token: 'stale-refresh-token',
      expires_at: '2026-05-14T00:30:00.000Z',
    }
    const latestRow = {
      user_id: 'jobber-owner',
      access_token: encryptTokenValue('latest-access-token'),
      refresh_token: encryptTokenValue('latest-refresh-token'),
      expires_at: '2026-05-14T00:30:00.000Z',
    }
    const selectBuilder = createSelectBuilder(currentUserRow, latestRow)

    mocks.createServiceClient.mockResolvedValueOnce({
      from: vi.fn(() => selectBuilder),
    })

    const token = await getStoredJobberToken('current-user')

    expect(token).toMatchObject({
      ownerUserId: 'jobber-owner',
      accessToken: 'latest-access-token',
      refreshToken: 'latest-refresh-token',
    })
  })

  it('refreshes the owner row for the shared Jobber connection', async () => {
    const latestRow = {
      user_id: 'jobber-owner',
      access_token: 'expired-access-token',
      refresh_token: 'owner-refresh-token',
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

    const token = await getUsableJobberToken('current-user', config)

    expect(token).toMatchObject({
      ownerUserId: 'jobber-owner',
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    })
    expect(updateBuilder.eq).toHaveBeenCalledWith('user_id', 'jobber-owner')
  })

  it('recovers from a refresh 401 when another request already saved a newer shared token', async () => {
    const expiredRow = {
      user_id: 'jobber-owner',
      access_token: 'expired-access-token',
      refresh_token: 'old-refresh-token',
      expires_at: '2026-05-14T00:00:00.000Z',
    }
    const refreshedRow = {
      user_id: 'jobber-owner',
      access_token: 'already-refreshed-access-token',
      refresh_token: 'already-refreshed-refresh-token',
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

    const token = await getUsableJobberToken('current-user', config)

    expect(token).toEqual({
      ownerUserId: 'jobber-owner',
      accessToken: 'already-refreshed-access-token',
      refreshToken: 'already-refreshed-refresh-token',
      expiresAt: '2099-05-14T00:00:00.000Z',
    })
  })
})
