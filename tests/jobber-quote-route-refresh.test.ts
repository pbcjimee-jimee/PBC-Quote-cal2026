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
    refreshStoredJobberToken: vi.fn(),
    getUsableJobberToken: vi.fn(),
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
  getUsableJobberToken: mocks.getUsableJobberToken,
  refreshStoredJobberToken: mocks.refreshStoredJobberToken,
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
    mocks.getUsableJobberToken.mockResolvedValue({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: '2099-01-01T00:00:00.000Z',
    })
    mocks.refreshStoredJobberToken.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt: '2099-01-01T01:00:00.000Z',
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
    expect(mocks.refreshStoredJobberToken).toHaveBeenCalledTimes(1)
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
})
