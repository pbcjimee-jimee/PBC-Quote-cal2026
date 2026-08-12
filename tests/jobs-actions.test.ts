import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createServiceClient: vi.fn(),
  createJobberGateway: vi.fn(),
  listSnapshots: vi.fn(),
  listSnapshotsByIds: vi.fn(),
  getSnapshot: vi.fn(),
  saveSnapshots: vi.fn(),
  synchronizeSnapshotScope: vi.fn(),
  listJobberJobs: vi.fn(),
  listJobberTeamUsers: vi.fn(),
  fetchJobberJobDetail: vi.fn(),
  fetchJobberJobAssignmentVisits: vi.fn(),
}))

vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: mocks.createServiceClient }))
vi.mock('@/lib/jobber/job-snapshots', () => ({
  listJobSnapshots: mocks.listSnapshots,
  listJobSnapshotsByIds: mocks.listSnapshotsByIds,
  getJobSnapshot: mocks.getSnapshot,
  saveJobSnapshots: mocks.saveSnapshots,
  synchronizeJobSnapshotScope: mocks.synchronizeSnapshotScope,
}))
vi.mock('@/lib/jobber/job-gateway', () => ({
  createJobberGateway: mocks.createJobberGateway,
  listJobberJobs: mocks.listJobberJobs,
  listJobberTeamUsers: mocks.listJobberTeamUsers,
  fetchJobberJobDetail: mocks.fetchJobberJobDetail,
  fetchJobberJobAssignmentVisits: mocks.fetchJobberJobAssignmentVisits,
}))

import { getJobDetail, listMyJobs, refreshJobDetail, refreshJobs } from '@/lib/actions/jobs'

const job = {
  id: 'job-1', jobNumber: '3103', title: 'Belrose', jobStatus: 'today',
  total: '12437.02', jobberWebUri: 'https://secure.getjobber.com/jobs/job-1',
  startAt: '2026-08-03T08:00:00+10:00', endAt: '2026-08-05T17:00:00+10:00',
  visits: [{ id: 'visit-1', startAt: '2026-08-03T08:00:00+10:00', endAt: '2026-08-05T17:00:00+10:00' }],
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
  labourEstimate: { assignmentCount: 14, ratePerAssignment: '450', total: '6300' },
  scopeJobberUserIds: ['jobber-user-1'],
  refreshedForAll: false,
  refreshedAt: '2026-07-31T00:00:00.000Z',
  refreshedBy: 'admin-1',
}

function appUser(
  role: 'admin' | 'supervisor',
  jobberUserId: string | null,
  displayName = role === 'supervisor' ? 'Eric' : 'Admin',
) {
  return {
    ok: true,
    user: { id: role === 'admin' ? 'admin-1' : 'supervisor-1', email: `${role}@example.com` },
    profile: {
      id: `${role}-1`, email: `${role}@example.com`, displayName,
      role, jobberUserId, isActive: true,
    },
  }
}

describe('job actions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.requireRole.mockResolvedValue(appUser('supervisor', 'jobber-user-1'))
    mocks.listSnapshots.mockResolvedValue([])
    mocks.listSnapshotsByIds.mockResolvedValue([])
    mocks.getSnapshot.mockResolvedValue(null)
    mocks.listJobberTeamUsers.mockResolvedValue([{
      id: 'jobber-user-1', fullName: 'Eric', status: 'ACTIVE',
      isAccountAdmin: false, isAccountOwner: false,
    }])
    mocks.listJobberJobs.mockResolvedValue([job])
    mocks.fetchJobberJobDetail.mockResolvedValue({ ...job, expenses: [expense] })
    mocks.fetchJobberJobAssignmentVisits.mockResolvedValue(assignmentVisits(14))
    mocks.createJobberGateway.mockResolvedValue({
      listTeamUsers: mocks.listJobberTeamUsers,
      listJobs: mocks.listJobberJobs,
      fetchJobDetail: mocks.fetchJobberJobDetail,
      fetchJobAssignmentVisits: mocks.fetchJobberJobAssignmentVisits,
    })
    mocks.saveSnapshots.mockImplementation(async (payloads: typeof snapshot[], actorId: string) => (
      payloads.map((payload) => ({
        ...payload,
        refreshedAt: '2026-07-31T01:00:00.000Z',
        refreshedBy: actorId,
      }))
    ))
    mocks.synchronizeSnapshotScope.mockResolvedValue([])
  })

  it('validates inputs before reading the session', async () => {
    await expect(getJobDetail({ jobberJobId: '' })).resolves.toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(mocks.requireRole).not.toHaveBeenCalled()
  })

  it('resolves an official supervisor by unique Jobber team name when the saved link is empty', async () => {
    mocks.requireRole.mockResolvedValueOnce(appUser('supervisor', null))

    await expect(listMyJobs({})).resolves.toMatchObject({
      ok: true,
      data: {
        jobs: [{ id: 'job-1' }],
        assignmentLinked: true,
        filteredJobberUserId: 'jobber-user-1',
      },
    })
    expect(mocks.listJobberJobs).toHaveBeenCalledWith('jobber-user-1', expect.any(Object))
  })

  it('replaces a stale saved Jobber id with the unique team user matched by login name', async () => {
    mocks.requireRole.mockResolvedValueOnce(appUser('supervisor', 'stale-jobber-user'))

    await expect(listMyJobs({})).resolves.toMatchObject({
      ok: true,
      data: { assignmentLinked: true, filteredJobberUserId: 'jobber-user-1' },
    })
    expect(mocks.listJobberJobs).toHaveBeenCalledWith('jobber-user-1', expect.any(Object))
  })

  it('matches an official supervisor without depending on the Jobber status enum spelling', async () => {
    mocks.listJobberTeamUsers.mockResolvedValueOnce([{
      id: 'jobber-user-1', fullName: 'Eric', status: 'ACTIVATED',
      isAccountAdmin: false, isAccountOwner: false,
    }])

    await expect(listMyJobs({})).resolves.toMatchObject({
      ok: true,
      data: { assignmentLinked: true, filteredJobberUserId: 'jobber-user-1' },
    })
  })

  it('revalidates matching supervisor snapshots against live monthly Jobber assignments', async () => {
    mocks.listSnapshotsByIds.mockResolvedValueOnce([snapshot])
    mocks.synchronizeSnapshotScope.mockResolvedValueOnce([snapshot])

    const result = await listMyJobs({})

    expect(result).toMatchObject({
      ok: true,
      data: { jobs: [{ id: 'job-1', financialSummary: { expensesTotal: '603.89' } }] },
    })
    expect(mocks.listJobberJobs).toHaveBeenCalledWith('jobber-user-1', expect.any(Object))
    expect(mocks.synchronizeSnapshotScope).not.toHaveBeenCalled()
  })

  it('bounds the supervisor Jobber query to the requested calendar month', async () => {
    mocks.listJobberJobs.mockImplementationOnce(async (
      _jobberUserId: string | null,
      visitRange?: { after: string; before: string } | null,
    ) => {
      if (!visitRange) throw new Error('Supervisor jobs must be month-bounded')
      return [job]
    })

    await expect(listMyJobs({ month: '2026-08' })).resolves.toMatchObject({
      ok: true,
      data: { jobs: [{ id: 'job-1' }] },
    })
    expect(mocks.listJobberJobs).toHaveBeenCalledWith('jobber-user-1', {
      after: '2026-07-26T00:00:00.000Z',
      before: '2026-09-07T00:00:00.000Z',
    })
  })

  it('uses live monthly job ids without revoking cached scopes outside the month', async () => {
    mocks.listSnapshotsByIds.mockResolvedValueOnce([snapshot])
    mocks.synchronizeSnapshotScope.mockRejectedValueOnce(
      new Error('A partial month must not replace the complete assignment scope'),
    )

    await expect(listMyJobs({ month: '2026-08' })).resolves.toMatchObject({
      ok: true,
      data: {
        jobs: [{ id: 'job-1', financialSummary: { expensesTotal: '603.89' } }],
      },
    })
  })

  it('does not expose jobs when the linked Jobber team name differs from the login name', async () => {
    mocks.listJobberTeamUsers.mockResolvedValueOnce([{
      id: 'jobber-user-1', fullName: 'Edgar', status: 'ACTIVE',
      isAccountAdmin: false, isAccountOwner: false,
    }])

    await expect(listMyJobs({})).resolves.toEqual({
      ok: true,
      data: { jobs: [], assignmentLinked: false, filteredJobberUserId: null },
    })
  })

  it('shows no jobs for supervisor names outside Eric, Edgar, and Steve', async () => {
    const unofficialJob = {
      ...job,
      visits: [{
        ...job.visits[0],
        assignedUsers: [{ id: 'jobber-user-1', fullName: 'Fred' }],
      }],
    }
    mocks.requireRole.mockResolvedValueOnce(appUser('supervisor', 'jobber-user-1', 'Fred'))
    mocks.listJobberJobs.mockResolvedValueOnce([unofficialJob])

    await expect(listMyJobs({})).resolves.toEqual({
      ok: true,
      data: { jobs: [], assignmentLinked: false, filteredJobberUserId: null },
    })
    expect(mocks.listJobberJobs).not.toHaveBeenCalled()
  })

  it.each(['Eric', 'Edgar', 'Steve'])('recognizes official supervisor %s by matching team name', async (name) => {
    mocks.requireRole.mockResolvedValueOnce(appUser('supervisor', 'jobber-user-1', name))
    mocks.listJobberTeamUsers.mockResolvedValueOnce([{
      id: 'jobber-user-1', fullName: name, status: 'ACTIVE',
      isAccountAdmin: false, isAccountOwner: false,
    }])

    await expect(listMyJobs({})).resolves.toMatchObject({
      ok: true,
      data: { jobs: [{ id: 'job-1' }], assignmentLinked: true },
    })
  })

  it('uses live Jobber schedule dates with cached expense totals', async () => {
    const cached = {
      ...snapshot,
      job: { ...snapshot.job, startAt: null, endAt: null },
    }
    mocks.listSnapshotsByIds.mockResolvedValueOnce([cached])
    mocks.synchronizeSnapshotScope.mockResolvedValueOnce([cached])

    const result = await listMyJobs({})

    expect(result).toMatchObject({
      ok: true,
      data: {
        jobs: [{
          id: 'job-1',
          startAt: '2026-08-03T08:00:00+10:00',
          endAt: '2026-08-05T17:00:00+10:00',
          visits: [{ id: 'visit-1' }],
          financialSummary: { expensesTotal: '603.89' },
        }],
      },
    })
  })

  it('treats a live null schedule as unscheduled instead of using stale cached dates', async () => {
    const liveUnscheduled = { ...job, startAt: null, endAt: null }
    mocks.listSnapshotsByIds.mockResolvedValueOnce([snapshot])
    mocks.listJobberJobs.mockResolvedValueOnce([liveUnscheduled])
    mocks.synchronizeSnapshotScope.mockResolvedValueOnce([snapshot])

    const result = await listMyJobs({})

    expect(result).toMatchObject({
      ok: true,
      data: { jobs: [{ id: 'job-1', startAt: null, endAt: null }] },
    })
  })

  it('removes a reassigned job from the supervisor list instead of trusting cached scope', async () => {
    mocks.listSnapshotsByIds.mockResolvedValueOnce([snapshot])
    mocks.listJobberJobs.mockResolvedValueOnce([])
    mocks.synchronizeSnapshotScope.mockResolvedValueOnce([])

    await expect(listMyJobs({})).resolves.toMatchObject({
      ok: true,
      data: { jobs: [] },
    })
    expect(mocks.listJobberJobs).toHaveBeenCalledWith('jobber-user-1', expect.any(Object))
    expect(mocks.synchronizeSnapshotScope).not.toHaveBeenCalled()
    expect(mocks.fetchJobberJobDetail).not.toHaveBeenCalled()
  })

  it('fetches assigned jobs and every detail when the cache is empty', async () => {
    const result = await listMyJobs({})

    expect(result).toMatchObject({ ok: true, data: { jobs: [{ id: 'job-1' }] } })
    expect(mocks.listJobberJobs).toHaveBeenCalledWith('jobber-user-1', expect.any(Object))
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

    await listMyJobs({ month: '2026-08' })

    expect(mocks.listJobberJobs).toHaveBeenCalledWith(null, {
      after: '2026-07-26T00:00:00.000Z',
      before: '2026-09-07T00:00:00.000Z',
    })
    expect(mocks.saveSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({ refreshedForAll: true }),
    ], 'admin-1')
  })

  it('loads admin snapshots only for visible Jobber ids', async () => {
    const job2 = { ...job, id: 'job-2', jobNumber: '3104' }
    const adminSnapshot = { ...snapshot, refreshedForAll: true }
    const snapshot2 = { ...adminSnapshot, job: job2 }
    mocks.requireRole.mockResolvedValueOnce(appUser('admin', null))
    mocks.listJobberJobs.mockResolvedValueOnce([job, job2])
    mocks.listSnapshotsByIds.mockResolvedValueOnce([adminSnapshot, snapshot2])

    await expect(listMyJobs({ month: '2026-08' })).resolves.toMatchObject({
      ok: true,
      data: { jobs: [{ id: 'job-2' }, { id: 'job-1' }] },
    })

    expect(mocks.listSnapshotsByIds).toHaveBeenCalledWith(['job-1', 'job-2'])
    expect(mocks.listSnapshots).not.toHaveBeenCalled()
    expect(mocks.createJobberGateway).toHaveBeenCalledTimes(1)
  })

  it('loads the admin snapshot cache after the monthly Jobber schedule resolves', async () => {
    mocks.requireRole.mockResolvedValueOnce(appUser('admin', null))
    let resolveJobs!: (value: readonly [typeof job]) => void
    const pendingJobs = new Promise<readonly [typeof job]>((resolve) => {
      resolveJobs = resolve
    })
    mocks.listJobberJobs.mockReturnValueOnce(pendingJobs)

    const result = listMyJobs({ month: '2026-08' })

    await vi.waitFor(() => {
      expect(mocks.listJobberJobs).toHaveBeenCalled()
    })
    expect(mocks.listSnapshotsByIds).not.toHaveBeenCalled()
    resolveJobs([job])
    await expect(result).resolves.toMatchObject({ ok: true })
    expect(mocks.listSnapshotsByIds).toHaveBeenCalledWith(['job-1'])
  })

  it('loads the supervisor snapshot cache after the monthly Jobber schedule resolves', async () => {
    let resolveJobs!: (value: readonly [typeof job]) => void
    const pendingJobs = new Promise<readonly [typeof job]>((resolve) => {
      resolveJobs = resolve
    })
    mocks.listJobberJobs.mockReturnValueOnce(pendingJobs)

    const result = listMyJobs({ month: '2026-08' })

    await vi.waitFor(() => {
      expect(mocks.listJobberJobs).toHaveBeenCalled()
    })
    expect(mocks.listSnapshotsByIds).not.toHaveBeenCalled()
    resolveJobs([job])
    await expect(result).resolves.toMatchObject({ ok: true })
    expect(mocks.listSnapshotsByIds).toHaveBeenCalledWith(['job-1'])
  })

  it('starts the linked supervisor monthly schedule while validating the Jobber identity', async () => {
    const teamUsers = [{
      id: 'jobber-user-1', fullName: 'Eric', status: 'ACTIVE',
      isAccountAdmin: false, isAccountOwner: false,
    }] as const
    let resolveTeamUsers!: (value: typeof teamUsers) => void
    const pendingTeamUsers = new Promise<typeof teamUsers>((resolve) => {
      resolveTeamUsers = resolve
    })
    let signalJobsStarted!: () => void
    const jobsStarted = new Promise<void>((resolve) => {
      signalJobsStarted = resolve
    })
    mocks.listJobberTeamUsers.mockReturnValueOnce(pendingTeamUsers)
    mocks.listJobberJobs.mockImplementationOnce(async () => {
      signalJobsStarted()
      return [job]
    })

    const result = listMyJobs({ month: '2026-08' })
    const startedBeforeIdentity = await Promise.race([
      jobsStarted.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 25)),
    ])
    resolveTeamUsers(teamUsers)

    expect(startedBeforeIdentity).toBe(true)
    await expect(result).resolves.toMatchObject({
      ok: true,
      data: { jobs: [{ id: 'job-1' }], filteredJobberUserId: 'jobber-user-1' },
    })
  })

  it('resolves an admin supervisor filter through the service client', async () => {
    mocks.requireRole.mockResolvedValueOnce(appUser('admin', null))
    const maybeSingle = vi.fn(async () => ({
      data: { display_name: 'Edgar', jobber_user_id: 'jobber-user-2' },
      error: null,
    }))
    mocks.listJobberTeamUsers.mockResolvedValueOnce([{
      id: 'jobber-user-2', fullName: 'Edgar', status: 'ACTIVE',
      isAccountAdmin: false, isAccountOwner: false,
    }])
    const builder = { eq: vi.fn(() => builder), maybeSingle }
    mocks.createServiceClient.mockResolvedValue({
      from: vi.fn(() => ({ select: vi.fn(() => builder) })),
    })

    await listMyJobs({ supervisorProfileId: '00000000-0000-4000-8000-000000000102' })

    expect(mocks.listJobberJobs).toHaveBeenCalledWith('jobber-user-2', expect.any(Object))
  })

  it('does not turn an unlinked admin supervisor filter into all jobs', async () => {
    mocks.requireRole.mockResolvedValueOnce(appUser('admin', null))
    const maybeSingle = vi.fn(async () => ({
      data: { display_name: 'Edgar', jobber_user_id: null },
      error: null,
    }))
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

  it('blocks supervisor detail access when the assigned Jobber name does not match the login name', async () => {
    mocks.listJobberTeamUsers.mockResolvedValueOnce([{
      id: 'jobber-user-1', fullName: 'Edgar', status: 'ACTIVE',
      isAccountAdmin: false, isAccountOwner: false,
    }])

    await expect(getJobDetail({ jobberJobId: 'job-1' })).resolves.toEqual({
      ok: false,
      error: 'This job is not assigned to the current supervisor',
      code: 'FORBIDDEN',
    })
    expect(mocks.listJobberJobs).not.toHaveBeenCalled()
    expect(mocks.fetchJobberJobDetail).not.toHaveBeenCalled()
  })

  it('returns a currently assigned cached detail without fetching financials', async () => {
    mocks.getSnapshot.mockResolvedValueOnce(snapshot)
    mocks.synchronizeSnapshotScope.mockResolvedValueOnce([snapshot])

    const result = await getJobDetail({ jobberJobId: 'job-1' })

    expect(result).toMatchObject({ ok: true, data: { id: 'job-1', expenses: [{ id: 'expense-1' }] } })
    expect(mocks.listJobberJobs).toHaveBeenCalledWith('jobber-user-1')
    expect(mocks.fetchJobberJobDetail).not.toHaveBeenCalled()
    expect(mocks.fetchJobberJobAssignmentVisits).not.toHaveBeenCalled()
  })

  it('backfills a legacy admin detail snapshot before returning it', async () => {
    mocks.requireRole.mockResolvedValueOnce(appUser('admin', null))
    mocks.getSnapshot.mockResolvedValueOnce({
      ...snapshot,
      labourEstimate: null,
      refreshedForAll: true,
    })

    const result = await getJobDetail({ jobberJobId: 'job-1' })

    expect(result).toMatchObject({
      ok: true,
      data: {
        labourEstimate: { assignmentCount: 14, ratePerAssignment: '450', total: '6300' },
      },
    })
    expect(mocks.fetchJobberJobDetail).toHaveBeenCalledWith('job-1')
    expect(mocks.fetchJobberJobAssignmentVisits).toHaveBeenCalledWith('job-1')
  })

  it('denies cached detail after the supervisor assignment is revoked', async () => {
    mocks.getSnapshot.mockResolvedValueOnce(snapshot)
    mocks.listJobberJobs.mockResolvedValueOnce([])
    mocks.synchronizeSnapshotScope.mockResolvedValueOnce([])

    await expect(getJobDetail({ jobberJobId: 'job-1' })).resolves.toEqual({
      ok: false,
      error: 'This job is not assigned to the current supervisor',
      code: 'FORBIDDEN',
    })
    expect(mocks.synchronizeSnapshotScope).toHaveBeenCalledWith('jobber-user-1', [])
    expect(mocks.fetchJobberJobDetail).not.toHaveBeenCalled()
  })

  it('rate-limits manual list refreshes from recent snapshots', async () => {
    mocks.listSnapshotsByIds.mockResolvedValueOnce([{ ...snapshot, refreshedAt: new Date().toISOString() }])

    await expect(refreshJobs({})).resolves.toMatchObject({
      ok: false,
      error: 'Jobs were refreshed recently. Try again in 30 seconds.',
      code: 'JOBBER_ERROR',
    })
    expect(mocks.listJobberJobs).toHaveBeenCalledWith('jobber-user-1', expect.any(Object))
    expect(mocks.fetchJobberJobDetail).not.toHaveBeenCalled()
  })

  it('refreshes an authorized stale detail and preserves its scope', async () => {
    mocks.getSnapshot.mockResolvedValueOnce({ ...snapshot, refreshedAt: '2020-01-01T00:00:00.000Z' })
    mocks.synchronizeSnapshotScope.mockResolvedValueOnce([
      { ...snapshot, refreshedAt: '2020-01-01T00:00:00.000Z' },
    ])

    const result = await refreshJobDetail({ jobberJobId: 'job-1' })

    expect(result).toMatchObject({ ok: true, data: { id: 'job-1' } })
    expect(mocks.fetchJobberJobDetail).toHaveBeenCalledWith('job-1')
    expect(mocks.fetchJobberJobAssignmentVisits).toHaveBeenCalledWith('job-1')
    expect(mocks.saveSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({
        scopeJobberUserIds: ['jobber-user-1'],
        labourEstimate: { assignmentCount: 14, ratePerAssignment: '450', total: '6300' },
      }),
    ], 'supervisor-1')
  })

  it.each([
    { assignmentCount: 12, total: '5400' },
    { assignmentCount: 15, total: '6750' },
  ])('recalculates a stale detail with $assignmentCount assignments', async ({ assignmentCount, total }) => {
    const staleSnapshot = { ...snapshot, refreshedAt: '2020-01-01T00:00:00.000Z' }
    mocks.getSnapshot.mockResolvedValueOnce(staleSnapshot)
    mocks.synchronizeSnapshotScope.mockResolvedValueOnce([staleSnapshot])
    mocks.fetchJobberJobAssignmentVisits.mockResolvedValueOnce(assignmentVisits(assignmentCount))

    const result = await refreshJobDetail({ jobberJobId: 'job-1' })

    expect(result).toMatchObject({
      ok: true,
      data: { labourEstimate: { assignmentCount, ratePerAssignment: '450', total } },
    })
  })

  it('keeps the previous snapshot when assignment refresh fails', async () => {
    const staleSnapshot = { ...snapshot, refreshedAt: '2020-01-01T00:00:00.000Z' }
    mocks.getSnapshot.mockResolvedValueOnce(staleSnapshot)
    mocks.synchronizeSnapshotScope.mockResolvedValueOnce([staleSnapshot])
    mocks.fetchJobberJobAssignmentVisits.mockRejectedValueOnce(new Error('assignment detail unavailable'))

    await expect(refreshJobDetail({ jobberJobId: 'job-1' })).resolves.toEqual({
      ok: false,
      error: 'assignment detail unavailable',
      code: 'JOBBER_ERROR',
    })
    expect(mocks.saveSnapshots).not.toHaveBeenCalled()
  })

  it('preserves a cached labour estimate during list refresh without fetching assignments', async () => {
    mocks.requireRole.mockResolvedValueOnce(appUser('admin', null))
    const staleSnapshot = {
      ...snapshot,
      refreshedForAll: true,
      refreshedAt: '2020-01-01T00:00:00.000Z',
    }
    mocks.listSnapshotsByIds.mockResolvedValueOnce([staleSnapshot])

    await refreshJobs({})

    expect(mocks.saveSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({
        labourEstimate: { assignmentCount: 14, ratePerAssignment: '450', total: '6300' },
      }),
    ], 'admin-1')
    expect(mocks.fetchJobberJobAssignmentVisits).not.toHaveBeenCalled()
  })

  it('denies forced detail refresh after reassignment before fetching fresh financials', async () => {
    mocks.getSnapshot.mockResolvedValueOnce({ ...snapshot, refreshedAt: '2020-01-01T00:00:00.000Z' })
    mocks.listJobberJobs.mockResolvedValueOnce([])
    mocks.synchronizeSnapshotScope.mockResolvedValueOnce([])

    await expect(refreshJobDetail({ jobberJobId: 'job-1' })).resolves.toEqual({
      ok: false,
      error: 'This job is not assigned to the current supervisor',
      code: 'FORBIDDEN',
    })
    expect(mocks.fetchJobberJobDetail).not.toHaveBeenCalled()
  })

  it('bounds admin detail concurrency and persists successful batches after one detail fails', async () => {
    mocks.requireRole.mockResolvedValueOnce(appUser('admin', null))
    const jobs = Array.from({ length: 12 }, (_, index) => ({
      ...job,
      id: `job-${index + 1}`,
      jobNumber: `${3103 + index}`,
    }))
    let inFlight = 0
    let maxInFlight = 0
    mocks.listJobberJobs.mockResolvedValueOnce(jobs)
    mocks.fetchJobberJobDetail.mockImplementation(async (jobId: string) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      inFlight -= 1
      if (jobId === 'job-7') throw new Error('expense detail unavailable')
      const summary = jobs.find((candidate) => candidate.id === jobId)
      if (!summary) throw new Error('missing fixture job')
      return { ...summary, expenses: [expense] }
    })

    const result = await refreshJobs({})

    expect(maxInFlight).toBeLessThanOrEqual(5)
    expect(mocks.saveSnapshots).toHaveBeenCalledTimes(3)
    expect(mocks.saveSnapshots.mock.calls.flatMap(([payloads]) => payloads)).toHaveLength(11)
    expect(result).toMatchObject({
      ok: true,
      data: {
        jobs: expect.any(Array),
        refreshWarning: '1 of 12 Jobber job details could not be refreshed.',
      },
    })
    if (result.ok) expect(result.data.jobs).toHaveLength(11)
  })
})

function assignmentVisits(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `labour-visit-${index + 1}`,
    assignedUsers: [{ id: 'worker-1', fullName: 'Eric' }],
  }))
}
