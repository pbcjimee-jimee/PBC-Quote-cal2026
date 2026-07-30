import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

import {
  fetchJobberJobExpensesPage,
  fetchJobberJobsPage,
  fetchJobberTeamUsersPage,
} from '@/lib/jobber/job-client'

const options = { accessToken: 'secret-token', graphqlVersion: '2025-04-16', retryDelayMs: 0 }

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({
    data,
    extensions: { versioning: { version: '2025-04-16' } },
  }), { status, headers: { 'Content-Type': 'application/json' } })
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

afterEach(() => vi.unstubAllGlobals())

describe('Jobber job query client', () => {
  it('uses the confirmed PbcTeamUsers contract and maps team members', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input
      void init
      return response({
      users: {
        nodes: [{
          id: 'user-1',
          name: { full: 'Sanggi' },
          status: 'ACTIVE',
          isAccountAdmin: false,
          isAccountOwner: false,
        }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const page = await fetchJobberTeamUsersPage({ first: 50, after: null }, options)

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { query: string; variables: unknown }
    expect(compact(request.query)).toContain(compact('query PbcTeamUsers($first: Int!, $after: String)'))
    expect(compact(request.query)).toContain(compact('nodes { id name { full } status isAccountAdmin isAccountOwner }'))
    expect(request.variables).toEqual({ first: 50, after: null })
    expect(page.nodes[0]).toEqual({
      id: 'user-1',
      fullName: 'Sanggi',
      status: 'ACTIVE',
      isAccountAdmin: false,
      isAccountOwner: false,
    })
  })

  it('uses assigned-visit filtering for supervisors and no filter for admins', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input
      void init
      return response({
      jobs: {
        totalCount: 1,
        nodes: [{
          id: 'job-1', jobNumber: 3103, title: 'Belrose', jobStatus: 'today',
          total: 12437.02, jobberWebUri: 'https://secure.getjobber.com/jobs/job-1',
        }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const assigned = await fetchJobberJobsPage('user-1', { first: 50, after: null }, options)
    await fetchJobberJobsPage(null, { first: 50, after: null }, options)

    const assignedBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { query: string; variables: unknown }
    const allBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { query: string; variables: unknown }
    expect(compact(assignedBody.query)).toContain('filter: { visitsAssignedToUserId: $userId }')
    expect(assignedBody.variables).toEqual({ userId: 'user-1', first: 50, after: null })
    expect(compact(allBody.query)).toContain('query PbcAllJobs($first: Int!, $after: String)')
    expect(compact(allBody.query)).not.toContain('visitsAssignedToUserId')
    expect(assigned.nodes[0]?.total).toBe('12437.02')
    expect(assigned.totalCount).toBe(1)
  })

  it('uses the confirmed PbcJobExpenses shape and preserves Decimal money strings', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input
      void init
      return response({
      job: {
        id: 'job-1', jobNumber: 3103, title: 'Belrose', jobStatus: 'today', total: '12437.02',
        jobberWebUri: 'https://secure.getjobber.com/jobs/job-1',
        expenses: {
          nodes: [{
            id: 'expense-1', title: 'paint', description: 'Dulux', date: '2026-07-30', total: 603.89,
            enteredBy: { name: { full: 'Sanggi' } }, paidBy: null, reimbursableTo: null,
          }],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
        },
      },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const page = await fetchJobberJobExpensesPage('job-1', { first: 50, after: null }, options)

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { query: string }
    expect(compact(request.query)).toContain(compact('query PbcJobExpenses($id: EncodedId!, $first: Int!, $after: String)'))
    expect(compact(request.query)).toContain(compact('enteredBy { name { full } } paidBy { name { full } } reimbursableTo { name { full } }'))
    expect(page?.job.total).toBe('12437.02')
    expect(page?.nodes[0]?.total).toBe('603.89')
    expect(page?.nodes[0]?.enteredByName).toBe('Sanggi')
    expect(page?.pageInfo).toEqual({ hasNextPage: true, endCursor: 'cursor-1' })
  })

  it('rejects malformed money instead of coercing it to native number', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({
      jobs: {
        totalCount: 1,
        nodes: [{ id: 'job-1', jobNumber: 1, title: null, jobStatus: 'today', total: 'NaN', jobberWebUri: 'url' }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    })))

    await expect(fetchJobberJobsPage(null, { first: 50, after: null }, options))
      .rejects.toThrow('Invalid Jobber job')
  })
})
