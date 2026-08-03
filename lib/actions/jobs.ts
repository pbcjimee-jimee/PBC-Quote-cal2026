'use server'

import { z } from 'zod'
import { calculateFinancialSummaryFromAmounts, type DecimalFinancialSummary } from '@/lib/jobber/financial-summary'
import { fetchJobberJobDetail, listJobberJobs } from '@/lib/jobber/job-gateway'
import {
  getJobSnapshot,
  listJobSnapshots,
  saveJobSnapshots,
  synchronizeJobSnapshotScope,
  type JobSnapshotPayload,
  type StoredJobSnapshot,
} from '@/lib/jobber/job-snapshots'
import type { JobberExpense, JobberJobDetail, JobberJobSummary, JobberJobVisit } from '@/lib/jobber/job-types'
import { requireRole, type AppUserProfile } from '@/lib/security/require-app-user'
import { createServiceClient } from '@/lib/supabase/server'
import type { ActionResult } from './types'

const REFRESH_COOLDOWN_MS = 30_000
const DETAIL_FETCH_CONCURRENCY = 5
const listJobsSchema = z.object({ supervisorProfileId: z.string().uuid().nullable().optional() }).strict()
const jobIdSchema = z.object({ jobberJobId: z.string().trim().min(1).max(300) }).strict()

export interface JobListItem {
  readonly id: string
  readonly jobNumber: string
  readonly title: string | null
  readonly jobStatus: string
  readonly total: string
  readonly jobberWebUri: string
  readonly startAt: string | null
  readonly endAt: string | null
  readonly visits: readonly JobberJobVisit[]
  readonly financialSummary: DecimalFinancialSummary
  readonly refreshedAt: string
}

export interface JobListData {
  readonly jobs: readonly JobListItem[]
  readonly assignmentLinked: boolean
  readonly filteredJobberUserId: string | null
  readonly refreshWarning?: string
}

export interface JobDetailData extends JobListItem {
  readonly expenses: readonly JobberExpense[]
}

interface ResolvedJobberFilter {
  readonly jobberUserId: string | null
  readonly assignmentLinked: boolean
}

interface LoadedJobSnapshots {
  readonly snapshots: readonly StoredJobSnapshot[]
  readonly summaries: readonly JobberJobSummary[]
  readonly refreshWarning?: string
}

interface FetchedJobSnapshots {
  readonly snapshots: readonly StoredJobSnapshot[]
  readonly refreshWarning?: string
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
    const loaded = jobberUserId === null
      ? await loadAdminJobList(appUser.user.id, snapshots)
      : await loadAssignedJobList(appUser.user.id, jobberUserId, snapshots, false)

    return {
      ok: true,
      data: {
        jobs: sortJobItems(toListItems(loaded)),
        assignmentLinked: true,
        filteredJobberUserId: jobberUserId,
        ...(loaded.refreshWarning ? { refreshWarning: loaded.refreshWarning } : {}),
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
    const refreshed = jobberUserId === null
      ? await refreshJobList(appUser.user.id, null, snapshots)
      : await loadAssignedJobList(appUser.user.id, jobberUserId, snapshots, true)
    return {
      ok: true,
      data: {
        jobs: sortJobItems(toListItems(refreshed)),
        assignmentLinked: true,
        filteredJobberUserId: jobberUserId,
        ...(refreshed.refreshWarning ? { refreshWarning: refreshed.refreshWarning } : {}),
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
    if (snapshot && appUser.profile.role === 'admin') {
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

async function loadAdminJobList(
  actorId: string,
  existingSnapshots: readonly StoredJobSnapshot[],
): Promise<LoadedJobSnapshots> {
  const summaries = await listJobberJobs(null)
  const cached = filterSnapshots(existingSnapshots, null)
  const cachedById = new Map(cached.map((snapshot) => [snapshot.job.id, snapshot]))
  const missing = summaries.filter((job) => !cachedById.has(job.id))
  const refreshed = await fetchAndSaveJobDetails(missing, actorId, null, cachedById)
  const refreshedById = new Map(refreshed.snapshots.map((snapshot) => [snapshot.job.id, snapshot]))
  return {
    snapshots: summaries.flatMap((job) => {
      const snapshot = refreshedById.get(job.id) ?? cachedById.get(job.id)
      return snapshot ? [snapshot] : []
    }),
    summaries,
    ...(refreshed.refreshWarning ? { refreshWarning: refreshed.refreshWarning } : {}),
  }
}

async function loadAssignedJobList(
  actorId: string,
  jobberUserId: string,
  existingSnapshots: readonly StoredJobSnapshot[],
  forceRefresh: boolean,
): Promise<LoadedJobSnapshots> {
  const assignedJobs = await listJobberJobs(jobberUserId)
  const synchronized = await synchronizeJobSnapshotScope(
    jobberUserId,
    assignedJobs.map((job) => job.id),
  )
  const existingById = new Map(synchronized.map((snapshot) => [snapshot.job.id, snapshot]))
  const jobsToRefresh = forceRefresh
    ? assignedJobs
    : assignedJobs.filter((job) => !existingById.has(job.id))
  const refreshed = await fetchAndSaveJobDetails(jobsToRefresh, actorId, jobberUserId, existingById)
  const refreshedById = new Map(refreshed.snapshots.map((snapshot) => [snapshot.job.id, snapshot]))
  const visible = assignedJobs.flatMap((job) => {
    const snapshot = refreshedById.get(job.id) ?? existingById.get(job.id)
    return snapshot ? [snapshot] : []
  })
  return {
    snapshots: visible,
    summaries: assignedJobs,
    ...(refreshed.refreshWarning ? { refreshWarning: refreshed.refreshWarning } : {}),
  }
}

async function refreshJobList(
  actorId: string,
  jobberUserId: string | null,
  existingSnapshots: readonly StoredJobSnapshot[],
): Promise<LoadedJobSnapshots> {
  const jobs = await listJobberJobs(jobberUserId)
  const existingById = new Map(existingSnapshots.map((snapshot) => [snapshot.job.id, snapshot]))
  const refreshed = await fetchAndSaveJobDetails(jobs, actorId, jobberUserId, existingById)
  return { ...refreshed, summaries: jobs }
}

async function fetchAndSaveJobDetails(
  jobs: readonly { readonly id: string }[],
  actorId: string,
  jobberUserId: string | null,
  existingById: ReadonlyMap<string, StoredJobSnapshot>,
): Promise<FetchedJobSnapshots> {
  const snapshots: StoredJobSnapshot[] = []
  let failedCount = 0

  for (let offset = 0; offset < jobs.length; offset += DETAIL_FETCH_CONCURRENCY) {
    const batch = jobs.slice(offset, offset + DETAIL_FETCH_CONCURRENCY)
    const outcomes = await Promise.all(batch.map(async (job) => {
      try {
        return { detail: await fetchJobberJobDetail(job.id) }
      } catch {
        return { detail: null }
      }
    }))
    const payloads = outcomes.flatMap(({ detail }) => {
      if (detail === null) {
        failedCount += 1
        return []
      }
      return [buildPayload(detail, jobberUserId, existingById.get(detail.id))]
    })
    snapshots.push(...await saveJobSnapshots(payloads, actorId))
  }

  return {
    snapshots,
    ...(failedCount > 0
      ? { refreshWarning: `${failedCount} of ${jobs.length} Jobber job details could not be refreshed.` }
      : {}),
  }
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
    const assignedJobs = await listJobberJobs(jobberUserId)
    const synchronized = await synchronizeJobSnapshotScope(
      jobberUserId,
      assignedJobs.map((job) => job.id),
    )
    if (!assignedJobs.some((job) => job.id === jobberJobId)) {
      throw new JobAccessError('This job is not assigned to the current supervisor')
    }
    existing = synchronized.find((snapshot) => snapshot.job.id === jobberJobId) ?? null
  }
  if (existing && !forceFetch) {
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

function toListItems(loaded: LoadedJobSnapshots): readonly JobListItem[] {
  const summariesById = new Map(loaded.summaries.map((summary) => [summary.id, summary]))
  return loaded.snapshots.map((snapshot) => toListItem(snapshot, summariesById.get(snapshot.job.id)))
}

function toListItem(snapshot: StoredJobSnapshot, liveSummary?: JobberJobSummary): JobListItem {
  return {
    ...snapshot.job,
    startAt: liveSummary ? liveSummary.startAt : snapshot.job.startAt,
    endAt: liveSummary ? liveSummary.endAt : snapshot.job.endAt,
    visits: liveSummary ? liveSummary.visits : snapshot.job.visits,
    financialSummary: snapshot.financialSummary,
    refreshedAt: snapshot.refreshedAt,
  }
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
