import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getJobberConfig: vi.fn(() => ({ graphqlVersion: '2025-04-16' })),
  getToken: vi.fn(),
  refreshToken: vi.fn(),
  requireOwner: vi.fn(() => 'owner-1'),
  teamPage: vi.fn(),
  jobsPage: vi.fn(),
  expensesPage: vi.fn(),
  assignmentVisitsPage: vi.fn(),
}))

vi.mock('@/lib/jobber/config', () => ({ getJobberConfig: mocks.getJobberConfig }))
vi.mock('@/lib/jobber/tokens', () => ({
  getUsableSharedJobberConnectionToken: mocks.getToken,
  refreshSharedJobberConnectionToken: mocks.refreshToken,
  requireSharedJobberConnectionOwnerId: mocks.requireOwner,
}))
vi.mock('@/lib/jobber/job-client', async () => {
  class JobberJobApiError extends Error {
    constructor(message: string, readonly status: number) { super(message) }
  }
  return {
    JobberJobApiError,
    fetchJobberTeamUsersPage: mocks.teamPage,
    fetchJobberJobsPage: mocks.jobsPage,
    fetchJobberJobExpensesPage: mocks.expensesPage,
    fetchJobberJobAssignmentVisitsPage: mocks.assignmentVisitsPage,
  }
})

import {
  fetchJobberJobAssignmentVisits,
  fetchJobberJobDetail,
  listJobberJobs,
  listJobberTeamUsers,
} from '@/lib/jobber/job-gateway'
import { JobberJobApiError } from '@/lib/jobber/job-client'

const token = {
  accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: null,
  ownerUserId: 'owner-1', scope: 'jobs:read users:read',
}

describe('Jobber job gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getToken.mockResolvedValue(token)
    mocks.refreshToken.mockResolvedValue({ ...token, accessToken: 'access-2' })
  })

  it('paginates team users and assigned jobs with the shared helper', async () => {
    const visitRange = { after: '2026-07-26T00:00:00.000Z', before: '2026-09-07T00:00:00.000Z' }
    mocks.teamPage
      .mockResolvedValueOnce({ nodes: [{ id: 'u1' }], pageInfo: { hasNextPage: true, endCursor: 'u-next' } })
      .mockResolvedValueOnce({ nodes: [{ id: 'u2' }], pageInfo: { hasNextPage: false, endCursor: null } })
    mocks.jobsPage
      .mockResolvedValueOnce({ nodes: [{ id: 'j1' }], totalCount: 2, pageInfo: { hasNextPage: true, endCursor: 'j-next' } })
      .mockResolvedValueOnce({ nodes: [{ id: 'j2' }], totalCount: 2, pageInfo: { hasNextPage: false, endCursor: null } })

    await expect(listJobberTeamUsers()).resolves.toEqual([{ id: 'u1' }, { id: 'u2' }])
    await expect(listJobberJobs('u1', visitRange)).resolves.toEqual([{ id: 'j1' }, { id: 'j2' }])
    expect(mocks.jobsPage).toHaveBeenNthCalledWith(
      1, 'u1', { first: 10, after: null }, expect.objectContaining({ accessToken: 'access-1' }), visitRange,
    )
    expect(mocks.jobsPage).toHaveBeenNthCalledWith(
      2, 'u1', { first: 10, after: 'j-next' }, expect.any(Object), visitRange,
    )
  })

  it('paginates every expense and returns one normalized job detail', async () => {
    const job = { id: 'j1', jobNumber: '3103', title: 'Belrose', jobStatus: 'today', total: '1000', jobberWebUri: 'url' }
    mocks.expensesPage
      .mockResolvedValueOnce({ job, nodes: [{ id: 'e1' }], pageInfo: { hasNextPage: true, endCursor: 'next' } })
      .mockResolvedValueOnce({ job, nodes: [{ id: 'e2' }], pageInfo: { hasNextPage: false, endCursor: null } })

    await expect(fetchJobberJobDetail('j1')).resolves.toEqual({ ...job, expenses: [{ id: 'e1' }, { id: 'e2' }] })
  })

  it('paginates every assignment visit with the lower query-cost page size', async () => {
    mocks.assignmentVisitsPage
      .mockResolvedValueOnce({
        jobId: 'j1',
        nodes: [{ id: 'visit-1', assignedUsers: [] }],
        pageInfo: { hasNextPage: true, endCursor: 'next' },
      })
      .mockResolvedValueOnce({
        jobId: 'j1',
        nodes: [{ id: 'visit-2', assignedUsers: [] }],
        pageInfo: { hasNextPage: false, endCursor: null },
      })

    await expect(fetchJobberJobAssignmentVisits('j1')).resolves.toEqual([
      { id: 'visit-1', assignedUsers: [] },
      { id: 'visit-2', assignedUsers: [] },
    ])
    expect(mocks.assignmentVisitsPage).toHaveBeenNthCalledWith(
      1,
      'j1',
      { first: 10, after: null },
      expect.objectContaining({ accessToken: 'access-1' }),
    )
    expect(mocks.assignmentVisitsPage).toHaveBeenNthCalledWith(
      2,
      'j1',
      { first: 10, after: 'next' },
      expect.objectContaining({ accessToken: 'access-1' }),
    )
  })

  it('refreshes once after a 401 and restarts the operation', async () => {
    mocks.jobsPage
      .mockRejectedValueOnce(new JobberJobApiError('unauthorized', 401))
      .mockResolvedValueOnce({ nodes: [], totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null } })

    await expect(listJobberJobs(null)).resolves.toEqual([])

    expect(mocks.refreshToken).toHaveBeenCalledWith(
      'refresh-1', expect.any(Object), 'owner-1',
    )
    expect(mocks.jobsPage).toHaveBeenLastCalledWith(
      null, expect.any(Object), expect.objectContaining({ accessToken: 'access-2' }), null,
    )
  })
})
