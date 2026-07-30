import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createServiceClient: vi.fn(),
  listSnapshots: vi.fn(),
  getSnapshot: vi.fn(),
  saveSnapshots: vi.fn(),
  listJobberJobs: vi.fn(),
  fetchJobberJobDetail: vi.fn(),
}))

vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: mocks.createServiceClient }))
vi.mock('@/lib/jobber/job-snapshots', () => ({
  listJobSnapshots: mocks.listSnapshots,
  getJobSnapshot: mocks.getSnapshot,
  saveJobSnapshots: mocks.saveSnapshots,
}))
vi.mock('@/lib/jobber/job-gateway', () => ({
  listJobberJobs: mocks.listJobberJobs,
  fetchJobberJobDetail: mocks.fetchJobberJobDetail,
}))

import { getJobDetail, listMyJobs, refreshJobDetail, refreshJobs } from '@/lib/actions/jobs'

const job = {
  id: 'job-1', jobNumber: '3103', title: 'Belrose', jobStatus: 'today',
  total: '12437.02', jobberWebUri: 'https://secure.getjobber.com/jobs/job-1',
}
const expense = {
  id: 'expense-1', title: 'paint', description: 'Dulux', date: '2026-07-30', total: '603.89',
  enteredByName: 'Sanggi', paidByName: null, reimbursableToName: null,
}
const snapshot = {
  job,
  expenses: [expense],
  financialSummary: {
    revenue: '12437.02', expensesTotal: '603.89', profit: '11833.13', profitMarginPercent: '95.144419',
  },
  scopeJobberUserIds: ['jobber-user-1'],
  refreshedForAll: false,
  refreshedAt: '2026-07-31T00:00:00.000Z',
  refreshedBy: 'admin-1',
}

function appUser(role: 'admin' | 'supervisor', jobberUserId: string | null) {
  return {
    ok: true,
    user: { id: role === 'admin' ? 'admin-1' : 'supervisor-1', email: `${role}@example.com` },
    profile: {
      id: `${role}-1`, email: `${role}@example.com`, displayName: role,
      role, jobberUserId, isActive: true,
    },
  }
}

describe('job actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRole.mockResolvedValue(appUser('supervisor', 'jobber-user-1'))
    mocks.listSnapshots.mockResolvedValue([])
    mocks.getSnapshot.mockResolvedValue(null)
    mocks.listJobberJobs.mockResolvedValue([job])
    mocks.fetchJobberJobDetail.mockResolvedValue({ ...job, expenses: [expense] })
    mocks.saveSnapshots.mockImplementation(async (payloads: typeof snapshot[], actorId: string) => (
      payloads.map((payload) => ({
        ...payload,
        refreshedAt: '2026-07-31T01:00:00.000Z',
        refreshedBy: actorId,
      }))
    ))
  })

  it('validates inputs before reading the session', async () => {
    await expect(getJobDetail({ jobberJobId: '' })).resolves.toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(mocks.requireRole).not.toHaveBeenCalled()
  })

  it('returns an unlinked empty state without calling Jobber', async () => {
    mocks.requireRole.mockResolvedValueOnce(appUser('supervisor', null))

    await expect(listMyJobs({})).resolves.toEqual({
      ok: true,
      data: { jobs: [], assignmentLinked: false, filteredJobberUserId: null },
    })
    expect(mocks.listJobberJobs).not.toHaveBeenCalled()
  })

  it('returns matching supervisor snapshots before using live Jobber', async () => {
    mocks.listSnapshots.mockResolvedValueOnce([snapshot])

    const result = await listMyJobs({})

    expect(result).toMatchObject({
      ok: true,
      data: { jobs: [{ id: 'job-1', financialSummary: { expensesTotal: '603.89' } }] },
    })
    expect(mocks.listJobberJobs).not.toHaveBeenCalled()
  })

  it('fetches assigned jobs and every detail when the cache is empty', async () => {
    const result = await listMyJobs({})

    expect(result).toMatchObject({ ok: true, data: { jobs: [{ id: 'job-1' }] } })
    expect(mocks.listJobberJobs).toHaveBeenCalledWith('jobber-user-1')
    expect(mocks.fetchJobberJobDetail).toHaveBeenCalledWith('job-1')
    expect(mocks.saveSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({
        scopeJobberUserIds: ['jobber-user-1'],
        refreshedForAll: false,
        financialSummary: expect.objectContaining({ expensesTotal: '603.89' }),
      }),
    ], 'supervisor-1')
  })

  it('lets admins load all jobs and marks all-job snapshots', async () => {
    mocks.requireRole.mockResolvedValueOnce(appUser('admin', null))

    await listMyJobs({})

    expect(mocks.listJobberJobs).toHaveBeenCalledWith(null)
    expect(mocks.saveSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({ refreshedForAll: true }),
    ], 'admin-1')
  })

  it('resolves an admin supervisor filter through the service client', async () => {
    mocks.requireRole.mockResolvedValueOnce(appUser('admin', null))
    const maybeSingle = vi.fn(async () => ({ data: { jobber_user_id: 'jobber-user-2' }, error: null }))
    const builder = { eq: vi.fn(() => builder), maybeSingle }
    mocks.createServiceClient.mockResolvedValue({
      from: vi.fn(() => ({ select: vi.fn(() => builder) })),
    })

    await listMyJobs({ supervisorProfileId: '00000000-0000-4000-8000-000000000102' })

    expect(mocks.listJobberJobs).toHaveBeenCalledWith('jobber-user-2')
  })

  it('does not turn an unlinked admin supervisor filter into all jobs', async () => {
    mocks.requireRole.mockResolvedValueOnce(appUser('admin', null))
    const maybeSingle = vi.fn(async () => ({ data: { jobber_user_id: null }, error: null }))
    const builder = { eq: vi.fn(() => builder), maybeSingle }
    mocks.createServiceClient.mockResolvedValue({
      from: vi.fn(() => ({ select: vi.fn(() => builder) })),
    })

    await expect(listMyJobs({ supervisorProfileId: '00000000-0000-4000-8000-000000000102' }))
      .resolves.toEqual({
        ok: true,
        data: { jobs: [], assignmentLinked: false, filteredJobberUserId: null },
      })
    expect(mocks.listJobberJobs).not.toHaveBeenCalled()
  })

  it('blocks supervisor detail access when Jobber does not assign the job', async () => {
    mocks.listJobberJobs.mockResolvedValueOnce([])

    await expect(getJobDetail({ jobberJobId: 'job-2' })).resolves.toEqual({
      ok: false,
      error: 'This job is not assigned to the current supervisor',
      code: 'FORBIDDEN',
    })
    expect(mocks.fetchJobberJobDetail).not.toHaveBeenCalled()
  })

  it('returns an authorized cached detail without a live fetch', async () => {
    mocks.getSnapshot.mockResolvedValueOnce(snapshot)

    const result = await getJobDetail({ jobberJobId: 'job-1' })

    expect(result).toMatchObject({ ok: true, data: { id: 'job-1', expenses: [{ id: 'expense-1' }] } })
    expect(mocks.fetchJobberJobDetail).not.toHaveBeenCalled()
  })

  it('rate-limits manual list refreshes from recent snapshots', async () => {
    mocks.listSnapshots.mockResolvedValueOnce([{ ...snapshot, refreshedAt: new Date().toISOString() }])

    await expect(refreshJobs({})).resolves.toMatchObject({
      ok: false,
      error: 'Jobs were refreshed recently. Try again in 30 seconds.',
      code: 'JOBBER_ERROR',
    })
    expect(mocks.listJobberJobs).not.toHaveBeenCalled()
  })

  it('refreshes an authorized stale detail and preserves its scope', async () => {
    mocks.getSnapshot.mockResolvedValueOnce({ ...snapshot, refreshedAt: '2020-01-01T00:00:00.000Z' })

    const result = await refreshJobDetail({ jobberJobId: 'job-1' })

    expect(result).toMatchObject({ ok: true, data: { id: 'job-1' } })
    expect(mocks.fetchJobberJobDetail).toHaveBeenCalledWith('job-1')
    expect(mocks.saveSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({ scopeJobberUserIds: ['jobber-user-1'] }),
    ], 'supervisor-1')
  })
})
