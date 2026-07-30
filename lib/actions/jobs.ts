'use server'

import { z } from 'zod'
import { calculateFinancialSummaryFromAmounts, type DecimalFinancialSummary } from '@/lib/jobber/financial-summary'
import { fetchJobberJobDetail, listJobberJobs } from '@/lib/jobber/job-gateway'
import {
  getJobSnapshot,
  listJobSnapshots,
  saveJobSnapshots,
  type JobSnapshotPayload,
  type StoredJobSnapshot,
} from '@/lib/jobber/job-snapshots'
import type { JobberExpense, JobberJobDetail } from '@/lib/jobber/job-types'
import { requireRole, type AppUserProfile } from '@/lib/security/require-app-user'
import { createServiceClient } from '@/lib/supabase/server'
import type { ActionResult } from './types'

const REFRESH_COOLDOWN_MS = 30_000
const listJobsSchema = z.object({ supervisorProfileId: z.string().uuid().nullable().optional() }).strict()
const jobIdSchema = z.object({ jobberJobId: z.string().trim().min(1).max(300) }).strict()

export interface JobListItem {
  readonly id: string
  readonly jobNumber: string
  readonly title: string | null
  readonly jobStatus: string
  readonly total: string
  readonly jobberWebUri: string
  readonly financialSummary: DecimalFinancialSummary
  readonly refreshedAt: string
}

export interface JobListData {
  readonly jobs: readonly JobListItem[]
  readonly assignmentLinked: boolean
  readonly filteredJobberUserId: string | null
}

export interface JobDetailData extends JobListItem {
  readonly expenses: readonly JobberExpense[]
}

interface ResolvedJobberFilter {
  readonly jobberUserId: string | null
  readonly assignmentLinked: boolean
}

export async function listMyJobs(input: unknown = {}): Promise<ActionResult<JobListData>> {
  const parsed = listJobsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message, code: 'VALIDATION' }

  const appUser = await requireRole('any')
  if (!appUser.ok) return appUser

  try {
    const resolvedFilter = await resolveJobberFilter(appUser.profile, parsed.data.supervisorProfileId)
    if (!resolvedFilter.assignmentLinked) {
      return { ok: true, data: { jobs: [], assignmentLinked: false, filteredJobberUserId: null } }
    }
    const { jobberUserId } = resolvedFilter

    const snapshots = await listJobSnapshots()
    const cached = filterSnapshots(snapshots, jobberUserId)
    const visible = cached.length > 0
      ? cached
      : await refreshJobList(appUser.user.id, jobberUserId, snapshots)

    return {
      ok: true,
      data: {
        jobs: sortJobItems(visible.map(toListItem)),
        assignmentLinked: true,
        filteredJobberUserId: jobberUserId,
      },
    }
  } catch (error) {
    return jobberFailure(error)
  }
}

export async function refreshJobs(input: unknown = {}): Promise<ActionResult<JobListData>> {
  const parsed = listJobsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message, code: 'VALIDATION' }

  const appUser = await requireRole('any')
  if (!appUser.ok) return appUser

  try {
    const resolvedFilter = await resolveJobberFilter(appUser.profile, parsed.data.supervisorProfileId)
    if (!resolvedFilter.assignmentLinked) {
      return { ok: true, data: { jobs: [], assignmentLinked: false, filteredJobberUserId: null } }
    }
    const { jobberUserId } = resolvedFilter
    const snapshots = await listJobSnapshots()
    assertRefreshAllowed(filterSnapshots(snapshots, jobberUserId))
    const refreshed = await refreshJobList(appUser.user.id, jobberUserId, snapshots)
    return {
      ok: true,
      data: {
        jobs: sortJobItems(refreshed.map(toListItem)),
        assignmentLinked: true,
        filteredJobberUserId: jobberUserId,
      },
    }
  } catch (error) {
    return jobberFailure(error)
  }
}

export async function getJobDetail(input: unknown): Promise<ActionResult<JobDetailData>> {
  const parsed = jobIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message, code: 'VALIDATION' }

  const appUser = await requireRole('any')
  if (!appUser.ok) return appUser

  try {
    let snapshot = await getJobSnapshot(parsed.data.jobberJobId)
    if (snapshot && canAccessSnapshot(appUser.profile, snapshot)) {
      return { ok: true, data: toDetail(snapshot) }
    }
    snapshot = await fetchAuthorizedDetail(appUser.profile, appUser.user.id, parsed.data.jobberJobId, snapshot)
    return { ok: true, data: toDetail(snapshot) }
  } catch (error) {
    if (error instanceof JobAccessError) return { ok: false, error: error.message, code: 'FORBIDDEN' }
    return jobberFailure(error)
  }
}

export async function refreshJobDetail(input: unknown): Promise<ActionResult<JobDetailData>> {
  const parsed = jobIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message, code: 'VALIDATION' }

  const appUser = await requireRole('any')
  if (!appUser.ok) return appUser

  try {
    const existing = await getJobSnapshot(parsed.data.jobberJobId)
    if (existing) assertRefreshAllowed([existing])
    const refreshed = await fetchAuthorizedDetail(
      appUser.profile,
      appUser.user.id,
      parsed.data.jobberJobId,
      existing,
      true,
    )
    return { ok: true, data: toDetail(refreshed) }
  } catch (error) {
    if (error instanceof JobAccessError) return { ok: false, error: error.message, code: 'FORBIDDEN' }
    return jobberFailure(error)
  }
}

async function resolveJobberFilter(
  profile: AppUserProfile,
  supervisorProfileId?: string | null,
): Promise<ResolvedJobberFilter> {
  if (profile.role === 'supervisor') {
    return { jobberUserId: profile.jobberUserId, assignmentLinked: profile.jobberUserId !== null }
  }
  if (!supervisorProfileId) return { jobberUserId: null, assignmentLinked: true }

  const service = await createServiceClient()
  const { data, error } = await service
    .from('user_profiles')
    .select('jobber_user_id')
    .eq('id', supervisorProfileId)
    .eq('role', 'supervisor')
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error('Unable to read supervisor profile')
  const jobberUserId = data?.jobber_user_id ?? null
  return { jobberUserId, assignmentLinked: jobberUserId !== null }
}

async function refreshJobList(
  actorId: string,
  jobberUserId: string | null,
  existingSnapshots: readonly StoredJobSnapshot[],
): Promise<readonly StoredJobSnapshot[]> {
  const jobs = await listJobberJobs(jobberUserId)
  const existingById = new Map(existingSnapshots.map((snapshot) => [snapshot.job.id, snapshot]))
  const details = await Promise.all(jobs.map((job) => fetchJobberJobDetail(job.id)))
  const payloads = details.map((detail) => buildPayload(detail, jobberUserId, existingById.get(detail.id)))
  return saveJobSnapshots(payloads, actorId)
}

async function fetchAuthorizedDetail(
  profile: AppUserProfile,
  actorId: string,
  jobberJobId: string,
  existing: StoredJobSnapshot | null,
  forceFetch = false,
): Promise<StoredJobSnapshot> {
  let jobberUserId: string | null = null
  if (profile.role === 'supervisor') {
    jobberUserId = profile.jobberUserId
    if (!jobberUserId) throw new JobAccessError('Link a Jobber user before viewing jobs')
    if (!existing || !existing.scopeJobberUserIds.includes(jobberUserId)) {
      const assignedJobs = await listJobberJobs(jobberUserId)
      if (!assignedJobs.some((job) => job.id === jobberJobId)) {
        throw new JobAccessError('This job is not assigned to the current supervisor')
      }
    }
  } else if (existing && !forceFetch) {
    return existing
  }

  const detail = await fetchJobberJobDetail(jobberJobId)
  const [saved] = await saveJobSnapshots([buildPayload(detail, jobberUserId, existing)], actorId)
  if (!saved) throw new Error('Unable to save Jobber job snapshot')
  return saved
}

function buildPayload(
  detail: JobberJobDetail,
  jobberUserId: string | null,
  existing?: StoredJobSnapshot | null,
): JobSnapshotPayload {
  const scopeJobberUserIds = new Set(existing?.scopeJobberUserIds ?? [])
  if (jobberUserId) scopeJobberUserIds.add(jobberUserId)
  const { expenses, ...job } = detail
  return {
    job,
    expenses,
    financialSummary: calculateFinancialSummaryFromAmounts(job.total, expenses.map((expense) => expense.total)),
    scopeJobberUserIds: [...scopeJobberUserIds].sort(),
    refreshedForAll: existing?.refreshedForAll === true || jobberUserId === null,
  }
}

function filterSnapshots(
  snapshots: readonly StoredJobSnapshot[],
  jobberUserId: string | null,
): readonly StoredJobSnapshot[] {
  return snapshots.filter((snapshot) => jobberUserId === null
    ? snapshot.refreshedForAll
    : snapshot.scopeJobberUserIds.includes(jobberUserId))
}

function canAccessSnapshot(profile: AppUserProfile, snapshot: StoredJobSnapshot): boolean {
  return profile.role === 'admin' || (
    profile.jobberUserId !== null && snapshot.scopeJobberUserIds.includes(profile.jobberUserId)
  )
}

function toListItem(snapshot: StoredJobSnapshot): JobListItem {
  return { ...snapshot.job, financialSummary: snapshot.financialSummary, refreshedAt: snapshot.refreshedAt }
}

function toDetail(snapshot: StoredJobSnapshot): JobDetailData {
  return { ...toListItem(snapshot), expenses: snapshot.expenses }
}

function sortJobItems(items: readonly JobListItem[]): readonly JobListItem[] {
  return [...items].sort((left, right) => right.jobNumber.localeCompare(left.jobNumber, undefined, { numeric: true }))
}

function assertRefreshAllowed(snapshots: readonly StoredJobSnapshot[], now = Date.now()): void {
  const latest = snapshots.reduce((value, snapshot) => Math.max(value, Date.parse(snapshot.refreshedAt)), 0)
  if (latest > 0 && now - latest < REFRESH_COOLDOWN_MS) {
    throw new Error('Jobs were refreshed recently. Try again in 30 seconds.')
  }
}

function jobberFailure(error: unknown): ActionResult<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Unable to load Jobber jobs',
    code: 'JOBBER_ERROR',
  }
}

class JobAccessError extends Error {}
