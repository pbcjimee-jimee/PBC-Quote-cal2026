import 'server-only'

import Decimal from 'decimal.js'
import { JOBBER_GRAPHQL_URL } from './config'
import type { JobberConnectionPage, JobberPageRequest } from './pagination'
import type {
  JobberExpense,
  JobberJobClientOptions,
  JobberJobExpensesPage,
  JobberJobVisit,
  JobberJobsPage,
  JobberJobSummary,
  JobberTeamUser,
} from './job-types'

const TEAM_USERS_QUERY = `query PbcTeamUsers($first: Int!, $after: String) {
  users(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id name { full } status isAccountAdmin isAccountOwner }
  }
}`
const USER_JOBS_QUERY = `query PbcUserJobs($userId: EncodedId!, $first: Int!, $after: String) {
  jobs(first: $first, after: $after, filter: { visitsAssignedToUserId: $userId }) {
    pageInfo { hasNextPage endCursor }
    totalCount
    nodes { id jobNumber title jobStatus total jobberWebUri startAt endAt
      visits(first: 10) { nodes { id startAt endAt } }
    }
  }
}`
const ALL_JOBS_QUERY = `query PbcAllJobs($first: Int!, $after: String) {
  jobs(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    totalCount
    nodes { id jobNumber title jobStatus total jobberWebUri startAt endAt
      visits(first: 10) { nodes { id startAt endAt } }
    }
  }
}`
const JOB_EXPENSES_QUERY = `query PbcJobExpenses($id: EncodedId!, $first: Int!, $after: String) {
  job(id: $id) {
    id jobNumber title jobStatus total jobberWebUri startAt endAt
    expenses(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id title description date total
        enteredBy { name { full } } paidBy { name { full } } reimbursableTo { name { full } } }
    }
  }
}`
const MAX_THROTTLE_RETRIES = 5

export class JobberJobApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'JobberJobApiError'
  }
}

export async function fetchJobberTeamUsersPage(
  page: JobberPageRequest,
  options: JobberJobClientOptions,
): Promise<JobberConnectionPage<JobberTeamUser>> {
  const data = await request(TEAM_USERS_QUERY, { first: page.first, after: page.after }, options)
  return parseConnection(data.users, 'Invalid Jobber team users', parseTeamUser)
}

export async function fetchJobberJobsPage(
  userId: string | null,
  page: JobberPageRequest,
  options: JobberJobClientOptions,
): Promise<JobberJobsPage> {
  const query = userId === null ? ALL_JOBS_QUERY : USER_JOBS_QUERY
  const variables = userId === null
    ? { first: page.first, after: page.after }
    : { userId, first: page.first, after: page.after }
  const data = await request(query, variables, options)
  const jobs = objectValue(data.jobs, 'Invalid Jobber jobs connection')
  if (!Number.isInteger(jobs.totalCount) || Number(jobs.totalCount) < 0) {
    throw new JobberJobApiError('Invalid Jobber jobs connection', 502)
  }
  return {
    ...parseConnection(jobs, 'Invalid Jobber jobs connection', parseJob),
    totalCount: Number(jobs.totalCount),
  }
}

export async function fetchJobberJobExpensesPage(
  jobId: string,
  page: JobberPageRequest,
  options: JobberJobClientOptions,
): Promise<JobberJobExpensesPage | null> {
  const data = await request(
    JOB_EXPENSES_QUERY,
    { id: jobId, first: page.first, after: page.after },
    options,
  )
  if (data.job === null) return null
  const job = objectValue(data.job, 'Invalid Jobber job expenses')
  const parsedJob = parseJob(job)
  if (parsedJob.id !== jobId) throw new JobberJobApiError('Jobber job response did not match the requested ID', 502)
  return {
    job: parsedJob,
    ...parseConnection(job.expenses, 'Invalid Jobber job expenses', parseExpense),
  }
}

async function request(
  query: string,
  variables: Readonly<Record<string, unknown>>,
  options: JobberJobClientOptions,
): Promise<Record<string, unknown>> {
  const maxRetries = options.maxThrottleRetries ?? 2
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > MAX_THROTTLE_RETRIES) {
    throw new Error(`maxThrottleRetries must be an integer between 0 and ${MAX_THROTTLE_RETRIES}`)
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(JOBBER_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        'Content-Type': 'application/json',
        'X-JOBBER-GRAPHQL-VERSION': options.graphqlVersion,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    })

    if (response.status === 429) {
      if (attempt === maxRetries) throw new JobberJobApiError('Jobber rate limit exceeded', 429)
      await delay(options.retryDelayMs ?? 25)
      continue
    }
    if (!response.ok) throw new JobberJobApiError(`Jobber job request failed with status ${response.status}`, response.status)

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new JobberJobApiError('Invalid Jobber GraphQL response', 502)
    }
    const envelope = objectValue(body, 'Invalid Jobber GraphQL response')
    assertResponseVersion(envelope.extensions, options.graphqlVersion)
    if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
      const throttled = envelope.errors.some((error) => (
        isObject(error) && isObject(error.extensions) && error.extensions.code === 'THROTTLED'
      ))
      if (throttled && attempt < maxRetries) {
        await delay(options.retryDelayMs ?? 25)
        continue
      }
      throw new JobberJobApiError(throttled ? 'Jobber rate limit exceeded' : 'Jobber returned a GraphQL error', throttled ? 429 : 502)
    }
    return objectValue(envelope.data, 'Invalid Jobber GraphQL data')
  }

  throw new JobberJobApiError('Jobber rate limit exceeded', 429)
}

function parseTeamUser(value: unknown): JobberTeamUser {
  const user = objectValue(value, 'Invalid Jobber team user')
  const name = objectValue(user.name, 'Invalid Jobber team user')
  if (typeof user.isAccountAdmin !== 'boolean' || typeof user.isAccountOwner !== 'boolean') {
    throw new JobberJobApiError('Invalid Jobber team user', 502)
  }
  return {
    id: stringField(user.id, 'Invalid Jobber team user'),
    fullName: stringField(name.full, 'Invalid Jobber team user'),
    status: stringField(user.status, 'Invalid Jobber team user'),
    isAccountAdmin: user.isAccountAdmin,
    isAccountOwner: user.isAccountOwner,
  }
}

function parseJob(value: unknown): JobberJobSummary {
  const job = objectValue(value, 'Invalid Jobber job')
  const jobNumber = job.jobNumber
  if (typeof jobNumber !== 'string' && typeof jobNumber !== 'number') {
    throw new JobberJobApiError('Invalid Jobber job', 502)
  }
  return {
    id: stringField(job.id, 'Invalid Jobber job'),
    jobNumber: String(jobNumber),
    title: nullableString(job.title, 'Invalid Jobber job'),
    jobStatus: stringField(job.jobStatus, 'Invalid Jobber job'),
    total: decimalField(job.total, 'Invalid Jobber job'),
    jobberWebUri: stringField(job.jobberWebUri, 'Invalid Jobber job'),
    startAt: nullableString(job.startAt, 'Invalid Jobber job'),
    endAt: nullableString(job.endAt, 'Invalid Jobber job'),
    visits: parseVisits(job.visits),
  }
}

function parseVisits(value: unknown): readonly JobberJobVisit[] {
  if (value === undefined) return []
  const visits = objectValue(value, 'Invalid Jobber job visits')
  if (!Array.isArray(visits.nodes)) throw new JobberJobApiError('Invalid Jobber job visits', 502)
  return Object.freeze(visits.nodes.map((node) => {
    const visit = objectValue(node, 'Invalid Jobber job visit')
    return {
      id: stringField(visit.id, 'Invalid Jobber job visit'),
      startAt: nullableString(visit.startAt, 'Invalid Jobber job visit'),
      endAt: nullableString(visit.endAt, 'Invalid Jobber job visit'),
    }
  }))
}

function parseExpense(value: unknown): JobberExpense {
  const expense = objectValue(value, 'Invalid Jobber expense')
  return {
    id: stringField(expense.id, 'Invalid Jobber expense'),
    title: stringField(expense.title, 'Invalid Jobber expense'),
    description: nullableString(expense.description, 'Invalid Jobber expense'),
    date: stringField(expense.date, 'Invalid Jobber expense'),
    total: decimalField(expense.total, 'Invalid Jobber expense'),
    enteredByName: personName(expense.enteredBy),
    paidByName: personName(expense.paidBy),
    reimbursableToName: personName(expense.reimbursableTo),
  }
}

function parseConnection<T extends { readonly id: string }>(
  value: unknown,
  message: string,
  parseNode: (value: unknown) => T,
): JobberConnectionPage<T> {
  const connection = objectValue(value, message)
  const pageInfo = objectValue(connection.pageInfo, message)
  if (
    !Array.isArray(connection.nodes) ||
    typeof pageInfo.hasNextPage !== 'boolean' ||
    !(pageInfo.endCursor === null || typeof pageInfo.endCursor === 'string')
  ) {
    throw new JobberJobApiError(message, 502)
  }
  return {
    nodes: Object.freeze(connection.nodes.map(parseNode)),
    pageInfo: { hasNextPage: pageInfo.hasNextPage, endCursor: pageInfo.endCursor },
  }
}

function assertResponseVersion(value: unknown, expected: string): void {
  if (value === undefined) return
  const extensions = objectValue(value, 'Jobber response version is missing')
  if (extensions.versioning === undefined) return
  const versioning = objectValue(extensions.versioning, 'Jobber response version is missing')
  if (versioning.version !== expected) {
    throw new JobberJobApiError('Jobber response version did not match the requested contract', 502)
  }
}

function personName(value: unknown): string | null {
  if (value === null) return null
  const person = objectValue(value, 'Invalid Jobber expense user')
  const name = objectValue(person.name, 'Invalid Jobber expense user')
  return nullableString(name.full, 'Invalid Jobber expense user')
}

function decimalField(value: unknown, message: string): string {
  if (typeof value !== 'number' && typeof value !== 'string') throw new JobberJobApiError(message, 502)
  try {
    const decimal = new Decimal(String(value))
    if (!decimal.isFinite()) throw new Error('Non-finite money')
    return decimal.toString()
  } catch {
    throw new JobberJobApiError(message, 502)
  }
}

function objectValue(value: unknown, message: string): Record<string, unknown> {
  if (!isObject(value)) throw new JobberJobApiError(message, 502)
  return value
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(value: unknown, message: string): string {
  if (typeof value !== 'string') throw new JobberJobApiError(message, 502)
  return value
}

function nullableString(value: unknown, message: string): string | null {
  if (value === null) return null
  return stringField(value, message)
}

function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))
}
