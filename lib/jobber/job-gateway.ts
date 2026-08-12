import 'server-only'

import { getJobberConfig } from './config'
import {
  fetchJobberJobAssignmentVisitsPage,
  fetchJobberJobExpensesPage,
  fetchJobberJobsPage,
  fetchJobberTeamUsersPage,
  JobberJobApiError,
} from './job-client'
import type {
  JobberJobClientOptions,
  JobberJobAssignmentVisit,
  JobberJobDetail,
  JobberJobSummary,
  JobberTeamUser,
  JobberVisitRange,
} from './job-types'
import { fetchAllJobberPages } from './pagination'
import {
  getUsableSharedJobberConnectionToken,
  refreshSharedJobberConnectionToken,
  requireSharedJobberConnectionOwnerId,
  type StoredJobberToken,
} from './tokens'

const PAGE_SIZE = 50
const JOB_LIST_PAGE_SIZE = 10
const ASSIGNMENT_VISIT_PAGE_SIZE = 10

export interface JobberGateway {
  listTeamUsers(): Promise<readonly JobberTeamUser[]>
  listJobs(
    jobberUserId: string | null,
    visitRange?: JobberVisitRange | null,
  ): Promise<readonly JobberJobSummary[]>
  fetchJobDetail(jobberJobId: string): Promise<JobberJobDetail>
  fetchJobAssignmentVisits(jobberJobId: string): Promise<readonly JobberJobAssignmentVisit[]>
}

export async function createJobberGateway(): Promise<JobberGateway> {
  const config = getJobberConfig()
  const initialToken = await getUsableSharedJobberConnectionToken(config)
  if (!initialToken) throw new Error('Jobber is not connected. Connect Jobber first.')
  let token: StoredJobberToken = initialToken
  let refreshPromise: Promise<StoredJobberToken> | null = null

  async function withRestartableToken<T>(
    operation: (options: JobberJobClientOptions) => Promise<T>,
  ): Promise<T> {
    const operationToken = token
    try {
      return await operation(clientOptions(operationToken, config.graphqlVersion))
    } catch (error) {
      if (!(error instanceof JobberJobApiError) || error.status !== 401) throw error
    }

    if (token.accessToken === operationToken.accessToken) {
      refreshPromise ??= refreshSharedJobberConnectionToken(
        operationToken.refreshToken,
        config,
        requireSharedJobberConnectionOwnerId(operationToken),
      ).then((refreshedToken) => {
        token = refreshedToken
        return refreshedToken
      })
      token = await refreshPromise
    }
    return operation(clientOptions(token, config.graphqlVersion))
  }

  return {
    listTeamUsers: () => withRestartableToken((options) => fetchAllJobberPages((after) => (
      fetchJobberTeamUsersPage({ first: PAGE_SIZE, after }, options)
    ))),
    listJobs: (jobberUserId, visitRange = null) => withRestartableToken((options) => (
      fetchAllJobberPages((after) => fetchJobberJobsPage(
        jobberUserId,
        { first: JOB_LIST_PAGE_SIZE, after },
        options,
        visitRange,
      ))
    )),
    fetchJobDetail: (jobberJobId) => withRestartableToken(async (options) => {
      let job: JobberJobSummary | null = null
      const expenses = await fetchAllJobberPages(async (after) => {
        const page = await fetchJobberJobExpensesPage(jobberJobId, { first: PAGE_SIZE, after }, options)
        if (page === null) throw new Error('Jobber job was not found')
        if (job !== null && page.job.id !== job.id) throw new Error('Jobber job changed during pagination')
        job = page.job
        return page
      })
      if (job === null) throw new Error('Jobber job was not found')
      return { ...(job as JobberJobSummary), expenses }
    }),
    fetchJobAssignmentVisits: (jobberJobId) => withRestartableToken((options) => (
      fetchAllJobberPages(async (after) => {
        const page = await fetchJobberJobAssignmentVisitsPage(
          jobberJobId,
          { first: ASSIGNMENT_VISIT_PAGE_SIZE, after },
          options,
        )
        if (page === null) throw new Error('Jobber job was not found')
        return page
      })
    )),
  }
}

export async function listJobberTeamUsers(): Promise<readonly JobberTeamUser[]> {
  return (await createJobberGateway()).listTeamUsers()
}

export async function listJobberJobs(
  jobberUserId: string | null,
  visitRange: JobberVisitRange | null = null,
): Promise<readonly JobberJobSummary[]> {
  return (await createJobberGateway()).listJobs(jobberUserId, visitRange)
}

export async function fetchJobberJobDetail(jobberJobId: string): Promise<JobberJobDetail> {
  return (await createJobberGateway()).fetchJobDetail(jobberJobId)
}

export async function fetchJobberJobAssignmentVisits(
  jobberJobId: string,
): Promise<readonly JobberJobAssignmentVisit[]> {
  return (await createJobberGateway()).fetchJobAssignmentVisits(jobberJobId)
}

function clientOptions(token: StoredJobberToken, graphqlVersion: string): JobberJobClientOptions {
  return { accessToken: token.accessToken, graphqlVersion }
}
