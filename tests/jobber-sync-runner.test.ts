import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => {
  class MockJobberApiError extends Error {
    constructor(message: string, readonly status: number) { super(message) }
  }
  return {
    getConfig: vi.fn(),
    getMissingKeys: vi.fn(),
    getToken: vi.fn(),
    refreshToken: vi.fn(),
    requireOwner: vi.fn(() => 'owner-1'),
    sync: vi.fn(),
    read: vi.fn(),
    JobberApiError: MockJobberApiError,
  }
})

vi.mock('@/lib/jobber/config', () => ({
  getJobberConfig: mocks.getConfig,
  getMissingGraphqlConfigKeys: mocks.getMissingKeys,
}))
vi.mock('@/lib/jobber/tokens', () => ({
  getUsableSharedJobberConnectionToken: mocks.getToken,
  refreshSharedJobberConnectionToken: mocks.refreshToken,
  requireSharedJobberConnectionOwnerId: mocks.requireOwner,
}))
vi.mock('@/lib/jobber/client', () => ({
  syncJobberQuoteLineItems: mocks.sync,
  fetchDurableJobberQuoteLineItems: mocks.read,
  JobberApiError: mocks.JobberApiError,
}))

import { createDurableJobberTransport } from '@/lib/jobber/sync-runner'

const input = {
  saveMode: 'priced_line_items' as const,
  finalTotal: 110,
  finalTotalIncludesGst: true,
  lines: [],
  deletedJobberLineItemIds: [],
}

describe('durable Jobber runner transport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getConfig.mockReturnValue({ graphqlVersion: '2025-04-16', accessToken: '' })
    mocks.getMissingKeys.mockReturnValue([])
    mocks.getToken.mockResolvedValue({
      accessToken: 'access-1', refreshToken: 'refresh-1', ownerUserId: 'owner-1', expiresAt: null,
    })
    mocks.refreshToken.mockResolvedValue({
      accessToken: 'access-2', refreshToken: 'refresh-2', ownerUserId: 'owner-1', expiresAt: null,
    })
    mocks.sync.mockResolvedValue({
      deletedLineItemIds: [], createdLineItemIds: [], editedLineItemIds: [], syncedLineItems: [], expectedLineItems: [],
    })
    mocks.read.mockResolvedValue([])
  })

  it('acquires credentials lazily only after an operation has been claimed', async () => {
    const transport = createDurableJobberTransport()
    expect(mocks.getConfig).not.toHaveBeenCalled()
    expect(mocks.getToken).not.toHaveBeenCalled()

    const journal = { beforeMutation: vi.fn(), afterMutation: vi.fn() }
    await transport.sync('remote-1', input, journal)

    expect(mocks.getToken).toHaveBeenCalledTimes(1)
    expect(mocks.sync).toHaveBeenCalledWith('remote-1', input, {
      accessToken: 'access-1',
      graphqlVersion: '2025-04-16',
      journal,
    })
  })

  it('never retries the durable mutation workflow after a 401', async () => {
    const unauthorized = new mocks.JobberApiError('expired', 401)
    mocks.sync.mockRejectedValueOnce(unauthorized)

    await expect(createDurableJobberTransport().sync(
      'remote-1', input, { beforeMutation: vi.fn(), afterMutation: vi.fn() },
    )).rejects.toBe(unauthorized)
    expect(mocks.sync).toHaveBeenCalledTimes(1)
    expect(mocks.refreshToken).not.toHaveBeenCalled()
  })

  it('may refresh once for read-only reconciliation', async () => {
    mocks.read
      .mockRejectedValueOnce(new mocks.JobberApiError('expired', 401))
      .mockResolvedValueOnce([])

    await expect(createDurableJobberTransport().read('remote-1')).resolves.toEqual([])
    expect(mocks.refreshToken).toHaveBeenCalledWith('refresh-1', expect.any(Object), 'owner-1')
    expect(mocks.read).toHaveBeenNthCalledWith(2, 'remote-1', {
      accessToken: 'access-2', graphqlVersion: '2025-04-16',
    })
  })
})
