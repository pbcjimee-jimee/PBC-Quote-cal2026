import 'server-only'

import { getJobberConfig } from './config'
import {
  fetchJobberJobExpensesPage,
  fetchJobberJobsPage,
  fetchJobberTeamUsersPage,
  JobberJobApiError,
} from './job-client'
import type { JobberJobClientOptions, JobberJobDetail, JobberJobSummary, JobberTeamUser } from './job-types'
import { fetchAllJobberPages } from './pagination'
import {
  getUsableSharedJobberConnectionToken,
  refreshSharedJobberConnectionToken,
  requireSharedJobberConnectionOwnerId,
  type StoredJobberToken,
} from './tokens'

const PAGE_SIZE = 50
const JOB_LIST_PAGE_SIZE = 10

export async function listJobberTeamUsers(): Promise<readonly JobberTeamUser[]> {
  return withRestartableToken((options) => fetchAllJobberPages((after) => (
    fetchJobberTeamUsersPage({ first: PAGE_SIZE, after }, options)
  )))
}

export async function listJobberJobs(jobberUserId: string | null): Promise<readonly JobberJobSummary[]> {
  return withRestartableToken((options) => fetchAllJobberPages((after) => (
    fetchJobberJobsPage(jobberUserId, { first: JOB_LIST_PAGE_SIZE, after }, options)
  )))
}

export async function fetchJobberJobDetail(jobberJobId: string): Promise<JobberJobDetail> {
  return withRestartableToken(async (options) => {
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
  })
}

async function withRestartableToken<T>(
  operation: (options: JobberJobClientOptions) => Promise<T>,
): Promise<T> {
  const config = getJobberConfig()
  let token = await getUsableSharedJobberConnectionToken(config)
  if (!token) throw new Error('Jobber is not connected. Connect Jobber first.')

  try {
    return await operation(clientOptions(token, config.graphqlVersion))
  } catch (error) {
    if (!(error instanceof JobberJobApiError) || error.status !== 401) throw error
  }

  token = await refreshSharedJobberConnectionToken(
    token.refreshToken,
    config,
    requireSharedJobberConnectionOwnerId(token),
  )
  return operation(clientOptions(token, config.graphqlVersion))
}

function clientOptions(token: StoredJobberToken, graphqlVersion: string): JobberJobClientOptions {
  return { accessToken: token.accessToken, graphqlVersion }
}
