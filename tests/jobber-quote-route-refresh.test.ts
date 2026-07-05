import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => {
  class MockJobberApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message)
      this.name = 'JobberApiError'
    }
  }

  return {
    fetchJobberQuote: vi.fn(),
    fetchJobberQuoteJobs: vi.fn(),
    refreshSharedJobberConnectionToken: vi.fn(),
    requireSharedJobberConnectionOwnerId: vi.fn((token: { ownerUserId?: string }) => {
      if (!token.ownerUserId) throw new Error('Unable to identify Jobber connection owner')
      return token.ownerUserId
    }),
    getUsableSharedJobberConnectionToken: vi.fn(),
    createClient: vi.fn(),
    mapJobberQuoteToDraft: vi.fn(),
    JobberApiError: MockJobberApiError,
  }
})

vi.mock('@/lib/jobber/client', () => ({
  fetchJobberJob: vi.fn(),
  fetchJobberQuote: mocks.fetchJobberQuote,
  fetchJobberQuoteJobs: mocks.fetchJobberQuoteJobs,
  searchJobberJob: vi.fn(),
  searchJobberQuote: vi.fn(),
  JobberApiError: mocks.JobberApiError,
  JobberPermissionError: class JobberPermissionError extends Error {},
}))

vi.mock('@/lib/jobber/tokens', () => ({
  getUsableSharedJobberConnectionToken: mocks.getUsableSharedJobberConnectionToken,
  refreshSharedJobberConnectionToken: mocks.refreshSharedJobberConnectionToken,
  requireSharedJobberConnectionOwnerId: mocks.requireSharedJobberConnectionOwnerId,
}))

vi.mock('@/lib/jobber/dev-tokens', () => ({
  getUsableDevJobberToken: vi.fn(),
  refreshDevJobberToken: vi.fn(),
}))

vi.mock('@/lib/jobber/mapper', () => ({
  mapJobberJobToDraft: vi.fn(),
  mapJobberQuoteToDraft: mocks.mapJobberQuoteToDraft,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

import { GET as jobberQuoteRoute } from '@/app/api/jobber/quote/[quoteId]/route'

describe('jobber quote route token refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEV_NO_AUTH = 'false'
    process.env.JOBBER_GRAPHQL_VERSION = '2025-04-16'

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    })
    mocks.getUsableSharedJobberConnectionToken.mockResolvedValue({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: '2099-01-01T00:00:00.000Z',
      ownerUserId: 'jobber-owner',
    })
    mocks.refreshSharedJobberConnectionToken.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt: '2099-01-01T01:00:00.000Z',
      ownerUserId: 'jobber-owner',
    })
    mocks.fetchJobberQuote
      .mockRejectedValueOnce(new mocks.JobberApiError('expired access token', 401))
      .mockResolvedValueOnce({
        id: 'Z2lkOi8vSm9iYmVyL1F1b3RlLzE=',
        jobs: { nodes: [] },
      })
    mocks.fetchJobberQuoteJobs.mockResolvedValue([])
    mocks.mapJobberQuoteToDraft.mockReturnValue({
      jobberQuoteId: 'Z2lkOi8vSm9iYmVyL1F1b3RlLzE=',
    })
  })

  it('uses the refreshed access token for quote job expenses after quote fetch refreshes', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/jobber/quote/Z2lkOi8vSm9iYmVyL1F1b3RlLzE='
    )

    const response = await jobberQuoteRoute(request, {
      params: Promise.resolve({ quoteId: 'Z2lkOi8vSm9iYmVyL1F1b3RlLzE=' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.refreshSharedJobberConnectionToken).toHaveBeenCalledTimes(1)
    expect(mocks.refreshSharedJobberConnectionToken).toHaveBeenCalledWith(
      'old-refresh',
      expect.objectContaining({ graphqlVersion: '2025-04-16' }),
      'jobber-owner'
    )
    expect(mocks.fetchJobberQuote).toHaveBeenNthCalledWith(1, 'Z2lkOi8vSm9iYmVyL1F1b3RlLzE=', {
      accessToken: 'old-access',
      graphqlVersion: '2025-04-16',
    })
    expect(mocks.fetchJobberQuote).toHaveBeenNthCalledWith(2, 'Z2lkOi8vSm9iYmVyL1F1b3RlLzE=', {
      accessToken: 'new-access',
      graphqlVersion: '2025-04-16',
    })
    expect(mocks.fetchJobberQuoteJobs).toHaveBeenCalledWith('Z2lkOi8vSm9iYmVyL1F1b3RlLzE=', {
      accessToken: 'new-access',
      graphqlVersion: '2025-04-16',
    })
  })

  it('does not call Jobber GraphQL when the stored token scope is not read-only', async () => {
    mocks.getUsableSharedJobberConnectionToken.mockRejectedValueOnce(new Error('Jobber OAuth scopes must be read-only'))
    const request = new NextRequest(
      'http://localhost:3000/api/jobber/quote/Z2lkOi8vSm9iYmVyL1F1b3RlLzE='
    )

    const response = await jobberQuoteRoute(request, {
      params: Promise.resolve({ quoteId: 'Z2lkOi8vSm9iYmVyL1F1b3RlLzE=' }),
    })

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ ok: false, error: 'Jobber OAuth scopes must be read-only' })
    expect(mocks.fetchJobberQuote).not.toHaveBeenCalled()
    expect(mocks.fetchJobberQuoteJobs).not.toHaveBeenCalled()
  })

  it('fails clearly instead of refreshing a shared token without an owner row', async () => {
    mocks.getUsableSharedJobberConnectionToken.mockResolvedValueOnce({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: '2099-01-01T00:00:00.000Z',
    })
    const request = new NextRequest(
      'http://localhost:3000/api/jobber/quote/Z2lkOi8vSm9iYmVyL1F1b3RlLzE='
    )

    const response = await jobberQuoteRoute(request, {
      params: Promise.resolve({ quoteId: 'Z2lkOi8vSm9iYmVyL1F1b3RlLzE=' }),
    })

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ ok: false, error: 'Unable to identify Jobber connection owner' })
    expect(mocks.refreshSharedJobberConnectionToken).not.toHaveBeenCalled()
  })
})
