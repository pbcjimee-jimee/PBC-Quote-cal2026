import type { JobberConnectionPage } from './pagination'

export interface JobberJobClientOptions {
  readonly accessToken: string
  readonly graphqlVersion: string
  readonly maxThrottleRetries?: number
  readonly retryDelayMs?: number
}

export interface JobberTeamUser {
  readonly id: string
  readonly fullName: string
  readonly status: string
  readonly isAccountAdmin: boolean
  readonly isAccountOwner: boolean
}

export interface JobberJobVisit {
  readonly id: string
  readonly startAt: string | null
  readonly endAt: string | null
}

export interface JobberJobSummary {
  readonly id: string
  readonly jobNumber: string
  readonly title: string | null
  readonly jobStatus: string
  readonly total: string
  readonly jobberWebUri: string
  readonly startAt: string | null
  readonly endAt: string | null
  readonly visits: readonly JobberJobVisit[]
}

export interface JobberExpense {
  readonly id: string
  readonly title: string
  readonly description: string | null
  readonly date: string
  readonly total: string
  readonly enteredByName: string | null
  readonly paidByName: string | null
  readonly reimbursableToName: string | null
}

export interface JobberJobsPage extends JobberConnectionPage<JobberJobSummary> {
  readonly totalCount: number
}

export interface JobberJobExpensesPage extends JobberConnectionPage<JobberExpense> {
  readonly job: JobberJobSummary
}

export interface JobberJobDetail extends JobberJobSummary {
  readonly expenses: readonly JobberExpense[]
}
