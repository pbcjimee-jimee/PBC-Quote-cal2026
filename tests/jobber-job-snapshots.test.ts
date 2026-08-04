import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: mocks.createServiceClient }))

import {
  getJobSnapshot,
  listJobSnapshots,
  saveJobSnapshots,
  synchronizeJobSnapshotScope,
} from '@/lib/jobber/job-snapshots'

const payload = {
  job: {
    id: 'job-1', jobNumber: '3103', title: 'Belrose', jobStatus: 'today', total: '1000', jobberWebUri: 'url',
    startAt: null, endAt: null,
    visits: [],
  },
  expenses: [{
    id: 'expense-1', title: 'paint', description: null, date: '2026-07-30', total: '100',
    enteredByName: null, paidByName: null, reimbursableToName: null,
  }],
  financialSummary: { revenue: '1000', expensesTotal: '100', profit: '900', profitMarginPercent: '90' },
  labourEstimate: { assignmentCount: 14, ratePerAssignment: '450', total: '6300' },
  scopeJobberUserIds: ['user-1'],
  refreshedForAll: false,
}
const row = {
  payload,
  refreshed_at: '2026-07-31T00:00:00.000Z',
  refreshed_by: 'actor-1',
}

describe('Jobber job snapshot repository', () => {
  beforeEach(() => vi.clearAllMocks())

  it('parses service-role snapshot rows', async () => {
    const order = vi.fn(async () => ({ data: [row], error: null }))
    mocks.createServiceClient.mockResolvedValue({
      from: vi.fn(() => ({ select: vi.fn(() => ({ order })) })),
    })

    await expect(listJobSnapshots()).resolves.toEqual([{
      ...payload,
      refreshedAt: row.refreshed_at,
      refreshedBy: row.refreshed_by,
    }])
  })

  it('loads legacy snapshots without schedule fields as unscheduled', async () => {
    const legacyPayload = {
      ...payload,
      job: {
        id: 'job-1', jobNumber: '3103', title: 'Belrose', jobStatus: 'today', total: '1000', jobberWebUri: 'url',
      },
    }
    const order = vi.fn(async () => ({ data: [{ ...row, payload: legacyPayload }], error: null }))
    mocks.createServiceClient.mockResolvedValue({
      from: vi.fn(() => ({ select: vi.fn(() => ({ order })) })),
    })

    const snapshots = await listJobSnapshots()

    expect(snapshots[0]?.job.startAt).toBeNull()
    expect(snapshots[0]?.job.endAt).toBeNull()
  })

  it('loads legacy snapshots without a labour estimate as incomplete', async () => {
    const { labourEstimate, ...legacyPayload } = payload
    void labourEstimate
    const order = vi.fn(async () => ({
      data: [{ ...row, payload: legacyPayload }],
      error: null,
    }))
    mocks.createServiceClient.mockResolvedValue({
      from: vi.fn(() => ({ select: vi.fn(() => ({ order })) })),
    })

    const snapshots = await listJobSnapshots()

    expect(snapshots[0]?.labourEstimate).toBeNull()
  })

  it('rejects malformed cached payloads', async () => {
    const maybeSingle = vi.fn(async () => ({
      data: { ...row, payload: { job: { id: 'job-1' } } },
      error: null,
    }))
    const builder = { eq: vi.fn(() => ({ maybeSingle })) }
    mocks.createServiceClient.mockResolvedValue({
      from: vi.fn(() => ({ select: vi.fn(() => builder) })),
    })

    await expect(getJobSnapshot('job-1')).rejects.toThrow('Invalid Jobber job snapshot payload')
  })

  it('upserts normalized snapshots with actor and refresh metadata', async () => {
    const select = vi.fn(async () => ({ data: [row], error: null }))
    const upsert = vi.fn(() => ({ select }))
    mocks.createServiceClient.mockResolvedValue({ from: vi.fn(() => ({ upsert })) })

    const result = await saveJobSnapshots([payload], 'actor-1', row.refreshed_at)

    expect(upsert).toHaveBeenCalledWith([{
      jobber_job_id: 'job-1', payload, refreshed_at: row.refreshed_at, refreshed_by: 'actor-1',
    }], { onConflict: 'jobber_job_id' })
    expect(result[0]?.job.id).toBe('job-1')
  })

  it('replaces one Jobber user scope atomically and returns the currently assigned snapshots', async () => {
    const rpc = vi.fn(async () => ({ data: [row], error: null }))
    mocks.createServiceClient.mockResolvedValue({ rpc })

    const result = await synchronizeJobSnapshotScope('user-1', ['job-1'])

    expect(rpc).toHaveBeenCalledWith('synchronize_jobber_job_snapshot_scope', {
      p_jobber_user_id: 'user-1',
      p_assigned_job_ids: ['job-1'],
    })
    expect(result).toEqual([{
      ...payload,
      refreshedAt: row.refreshed_at,
      refreshedBy: row.refreshed_by,
    }])
  })
})
