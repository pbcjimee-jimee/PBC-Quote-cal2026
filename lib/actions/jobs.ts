'use server'

import { z } from 'zod'
import { calculateFinancialSummaryFromAmounts, type DecimalFinancialSummary } from '@/lib/jobber/financial-summary'
import { fetchJobberJobDetail, listJobberJobs, listJobberTeamUsers } from '@/lib/jobber/job-gateway'
import {
  getJobSnapshot,
  listJobSnapshots,
  saveJobSnapshots,
  synchronizeJobSnapshotScope,
  type JobSnapshotPayload,
  type StoredJobSnapshot,
} from '@/lib/jobber/job-snapshots'
import type {
  JobberExpense,
  JobberJobDetail,
  JobberJobSummary,
  JobberJobVisit,
  JobberVisitRange,
} from '@/lib/jobber/job-types'
import { requireRole, type AppUserProfile } from '@/lib/security/require-app-user'
import { createServiceClient } from '@/lib/supabase/server'
import type { ActionResult } from './types'

const REFRESH_COOLDOWN_MS = 30_000
const DETAIL_FETCH_CONCURRENCY = 5
const OFFICIAL_SUPERVISOR_NAMES = new Set(['eric', 'edgar', 'steve'])
const calendarMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const listJobsSchema = z.object({
  supervisorProfileId: z.string().uuid().nullable().optional(),
  month: calendarMonthSchema.optional(),
}).strict()
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
  readonly supervisorIdentity: SupervisorIdentity | null
  readonly assignmentLinked: boolean
  readonly assignedJobs?: Promise<readonly JobberJobSummary[]>
}

interface SupervisorIdentity {
  readonly jobberUserId: string
  readonly normalizedName: string
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
    const visitRange = resolveJobCalendarRange(parsed.data.month)
    const resolvedFilter = await resolveJobberFilter(
      appUser.profile,
      parsed.data.supervisorProfileId,
      visitRange,
    )
    if (!resolvedFilter.assignmentLinked) {
      return { ok: true, data: { jobs: [], assignmentLinked: false, filteredJobberUserId: null } }
    }
    const jobberUserId = resolvedFilter.supervisorIdentity?.jobberUserId ?? null

    const loaded = resolvedFilter.supervisorIdentity === null
      ? await loadAdminJobList(appUser.user.id, visitRange)
      : await loadAssignedJobList(
          appUser.user.id,
          resolvedFilter.supervisorIdentity,
          listJobSnapshots(),
          false,
          visitRange,
          resolvedFilter.assignedJobs,
        )

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
    const jobberUserId = resolvedFilter.supervisorIdentity?.jobberUserId ?? null
    const snapshots = await listJobSnapshots()
    assertRefreshAllowed(filterSnapshots(snapshots, jobberUserId))
    const refreshed = resolvedFilter.supervisorIdentity === null
      ? await refreshJobList(
          appUser.user.id,
          null,
          snapshots,
          resolveJobCalendarRange(parsed.data.month),
        )
      : await loadAssignedJobList(
          appUser.user.id,
          resolvedFilter.supervisorIdentity,
          snapshots,
          true,
          resolveJobCalendarRange(parsed.data.month),
        )
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
  visitRange?: JobberVisitRange,
): Promise<ResolvedJobberFilter> {
  if (profile.role === 'supervisor') {
    return resolveSupervisorListIdentity(profile.jobberUserId, profile.displayName, visitRange)
  }
  if (!supervisorProfileId) return { supervisorIdentity: null, assignmentLinked: true }

  const service = await createServiceClient()
  const { data, error } = await service
    .from('user_profiles')
    .select('display_name, jobber_user_id')
    .eq('id', supervisorProfileId)
    .eq('role', 'supervisor')
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error('Unable to read supervisor profile')
  return resolveSupervisorListIdentity(
    data?.jobber_user_id ?? null,
    data?.display_name ?? null,
    visitRange,
  )
}

async function loadAdminJobList(
  actorId: string,
  visitRange: JobberVisitRange,
): Promise<LoadedJobSnapshots> {
  const [summaries, existingSnapshots] = await Promise.all([
    listJobberJobs(null, visitRange),
    listJobSnapshots(),
  ])
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
  supervisorIdentity: SupervisorIdentity,
  existingSnapshots: Promise<readonly StoredJobSnapshot[]> | readonly StoredJobSnapshot[],
  forceRefresh: boolean,
  visitRange: JobberVisitRange,
  preloadedAssignedJobs?: Promise<readonly JobberJobSummary[]>,
): Promise<LoadedJobSnapshots> {
  const { jobberUserId } = supervisorIdentity
  const [assignedJobs, cachedSnapshots] = await Promise.all([
    preloadedAssignedJobs ?? listJobberJobs(jobberUserId, visitRange),
    Promise.resolve(existingSnapshots),
  ])
  const assignedJobIds = new Set(assignedJobs.map((job) => job.id))
  const existingById = new Map(cachedSnapshots
    .filter((snapshot) => assignedJobIds.has(snapshot.job.id))
    .map((snapshot) => [snapshot.job.id, snapshot]))
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
  visitRange: JobberVisitRange | null = null,
): Promise<LoadedJobSnapshots> {
  const jobs = await listJobberJobs(jobberUserId, visitRange)
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
    const supervisorIdentity = await resolveSupervisorIdentity(profile.jobberUserId, profile.displayName)
    if (!supervisorIdentity) throw new JobAccessError('This job is not assigned to the current supervisor')
    jobberUserId = supervisorIdentity.jobberUserId
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

async function resolveSupervisorIdentity(
  jobberUserId: string | null,
  displayName: string | null,
): Promise<SupervisorIdentity | null> {
  if (!displayName) return null
  const normalizedName = normalizePersonName(displayName)
  if (!OFFICIAL_SUPERVISOR_NAMES.has(normalizedName)) return null
  const teamUsers = await listJobberTeamUsers()
  const nameMatches = teamUsers.filter((teamUser) => (
    normalizePersonName(teamUser.fullName) === normalizedName
  ))
  const linkedUser = nameMatches.find((teamUser) => teamUser.id === jobberUserId)
  const matchedUser = linkedUser ?? (nameMatches.length === 1 ? nameMatches[0] : null)
  return matchedUser ? { jobberUserId: matchedUser.id, normalizedName } : null
}

async function resolveSupervisorListIdentity(
  jobberUserId: string | null,
  displayName: string | null,
  visitRange?: JobberVisitRange,
): Promise<ResolvedJobberFilter> {
  if (!displayName || !OFFICIAL_SUPERVISOR_NAMES.has(normalizePersonName(displayName))) {
    return { supervisorIdentity: null, assignmentLinked: false }
  }
  const assignedJobs = jobberUserId && visitRange
    ? listJobberJobs(jobberUserId, visitRange)
    : undefined
  // A stale or mismatched link discards this speculative request, so handle that rejection here.
  void assignedJobs?.catch(() => undefined)

  const supervisorIdentity = await resolveSupervisorIdentity(jobberUserId, displayName)
  const canReuseAssignedJobs = supervisorIdentity?.jobberUserId === jobberUserId
  return {
    supervisorIdentity,
    assignmentLinked: supervisorIdentity !== null,
    ...(canReuseAssignedJobs && assignedJobs ? { assignedJobs } : {}),
  }
}

function normalizePersonName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-AU')
}

function resolveJobCalendarRange(month?: string): JobberVisitRange {
  const key = month ?? currentSydneyMonth()
  const [yearText, monthText] = key.split('-')
  const year = Number(yearText)
  const monthIndex = Number(monthText) - 1
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1))
  const mondayOffset = (firstOfMonth.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const calendarDays = Math.ceil((mondayOffset + daysInMonth) / 7) * 7
  const gridStart = new Date(firstOfMonth)
  gridStart.setUTCDate(firstOfMonth.getUTCDate() - mondayOffset)
  const after = new Date(gridStart)
  after.setUTCDate(gridStart.getUTCDate() - 1)
  const before = new Date(gridStart)
  before.setUTCDate(gridStart.getUTCDate() + calendarDays)
  return { after: after.toISOString(), before: before.toISOString() }
}

function currentSydneyMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value ?? now.getUTCFullYear().toString()
  const month = parts.find((part) => part.type === 'month')?.value ?? String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
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
