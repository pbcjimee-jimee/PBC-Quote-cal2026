import 'server-only'

import Decimal from 'decimal.js'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/types'
import type { EstimatedLabourSummary } from './estimated-labour'
import type { DecimalFinancialSummary } from './financial-summary'
import type { JobberExpense, JobberJobDetail } from './job-types'

export interface JobSnapshotPayload {
  readonly job: Omit<JobberJobDetail, 'expenses'>
  readonly expenses: readonly JobberExpense[]
  readonly financialSummary: DecimalFinancialSummary
  readonly labourEstimate: EstimatedLabourSummary | null
  readonly scopeJobberUserIds: readonly string[]
  readonly refreshedForAll: boolean
}

export interface StoredJobSnapshot extends JobSnapshotPayload {
  readonly refreshedAt: string
  readonly refreshedBy: string
}

const moneySchema = z.string().refine((value) => {
  try { return new Decimal(value).isFinite() } catch { return false }
}, 'Invalid money value')
const nullableNameSchema = z.string().nullable()
const visitSchema = z.object({
  id: z.string().min(1),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
})
const jobSchema = z.object({
  id: z.string().min(1),
  jobNumber: z.string().min(1),
  title: z.string().nullable(),
  jobStatus: z.string().min(1),
  total: moneySchema,
  jobberWebUri: z.string().min(1),
  startAt: z.string().nullable().default(null),
  endAt: z.string().nullable().default(null),
  visits: z.array(visitSchema).default([]),
})
const expenseSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string().nullable(),
  date: z.string(),
  total: moneySchema,
  enteredByName: nullableNameSchema,
  paidByName: nullableNameSchema,
  reimbursableToName: nullableNameSchema,
})
const financialSchema = z.object({
  revenue: moneySchema,
  expensesTotal: moneySchema,
  profit: moneySchema,
  profitMarginPercent: moneySchema.nullable(),
})
const labourEstimateSchema = z.object({
  assignmentCount: z.number().int().nonnegative(),
  ratePerAssignment: moneySchema,
  total: moneySchema,
})
const payloadSchema = z.object({
  job: jobSchema,
  expenses: z.array(expenseSchema),
  financialSummary: financialSchema,
  labourEstimate: labourEstimateSchema.nullable().default(null),
  scopeJobberUserIds: z.array(z.string().min(1)),
  refreshedForAll: z.boolean(),
})

export async function listJobSnapshots(): Promise<readonly StoredJobSnapshot[]> {
  const service = await createServiceClient()
  const { data, error } = await service
    .from('jobber_job_snapshots')
    .select('payload, refreshed_at, refreshed_by')
    .order('refreshed_at', { ascending: false })
  if (error) throw new Error('Unable to read Jobber job snapshots')

  return data.map((row) => parseStoredSnapshot(row.payload, row.refreshed_at, row.refreshed_by))
}

export async function getJobSnapshot(jobberJobId: string): Promise<StoredJobSnapshot | null> {
  const service = await createServiceClient()
  const { data, error } = await service
    .from('jobber_job_snapshots')
    .select('payload, refreshed_at, refreshed_by')
    .eq('jobber_job_id', jobberJobId)
    .maybeSingle()
  if (error) throw new Error('Unable to read Jobber job snapshot')
  return data === null ? null : parseStoredSnapshot(data.payload, data.refreshed_at, data.refreshed_by)
}

export async function saveJobSnapshots(
  payloads: readonly JobSnapshotPayload[],
  refreshedBy: string,
  refreshedAt = new Date().toISOString(),
): Promise<readonly StoredJobSnapshot[]> {
  if (payloads.length === 0) return []
  const service = await createServiceClient()
  const rows = payloads.map((payload) => ({
    jobber_job_id: payload.job.id,
    payload: payload as unknown as Json,
    refreshed_at: refreshedAt,
    refreshed_by: refreshedBy,
  }))
  const { data, error } = await service
    .from('jobber_job_snapshots')
    .upsert(rows, { onConflict: 'jobber_job_id' })
    .select('payload, refreshed_at, refreshed_by')
  if (error) throw new Error('Unable to save Jobber job snapshots')
  return data.map((row) => parseStoredSnapshot(row.payload, row.refreshed_at, row.refreshed_by))
}

export async function synchronizeJobSnapshotScope(
  jobberUserId: string,
  assignedJobIds: readonly string[],
): Promise<readonly StoredJobSnapshot[]> {
  const service = await createServiceClient()
  const { data, error } = await service.rpc('synchronize_jobber_job_snapshot_scope', {
    p_jobber_user_id: jobberUserId,
    p_assigned_job_ids: [...assignedJobIds],
  })
  if (error) throw new Error('Unable to synchronize Jobber job snapshot scope')
  return data.map((row) => parseStoredSnapshot(row.payload, row.refreshed_at, row.refreshed_by))
}

function parseStoredSnapshot(payload: Json, refreshedAt: string, refreshedBy: string): StoredJobSnapshot {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) throw new Error('Invalid Jobber job snapshot payload')
  return {
    ...parsed.data,
    refreshedAt,
    refreshedBy,
  }
}
