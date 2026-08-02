import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getJobDetail: vi.fn(),
  listMyJobs: vi.fn(),
  listUsers: vi.fn(),
  requireRole: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/lib/actions/jobs', () => ({
  getJobDetail: mocks.getJobDetail,
  listMyJobs: mocks.listMyJobs,
  refreshJobDetail: vi.fn(),
  refreshJobs: vi.fn(),
}))

vi.mock('@/lib/actions/users', () => ({
  listUsers: mocks.listUsers,
}))

vi.mock('@/lib/security/require-app-user', () => ({
  requireRole: mocks.requireRole,
}))

import JobsPage from '@/app/(app)/jobs/page'
import JobDetailPage from '@/app/(app)/jobs/[jobberJobId]/page'

const refreshWarning = '1 of 12 Jobber job details could not be refreshed.'

describe('Jobs page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRole.mockResolvedValue({
      ok: true,
      user: { id: 'admin-1', email: 'admin@example.com' },
      profile: {
        id: 'admin-1',
        email: 'admin@example.com',
        displayName: 'Admin',
        role: 'admin',
        jobberUserId: null,
        isActive: true,
      },
    })
    mocks.listUsers.mockResolvedValue({ ok: true, data: [] })
  })

  it('shows a partial refresh warning returned during the initial jobs load', async () => {
    mocks.listMyJobs.mockResolvedValue({
      ok: true,
      data: {
        jobs: [],
        assignmentLinked: true,
        filteredJobberUserId: null,
        refreshWarning,
      },
    })

    const markup = renderToStaticMarkup(await JobsPage({ searchParams: Promise.resolve({}) }))

    expect(markup).toContain(refreshWarning)
    expect(markup).toContain('pbc-alert--warning')
    expect(markup).toContain('role="status"')
  })

  it('decodes the URL-safe Jobber ID before loading a job detail', async () => {
    const jobberJobId = 'Z2lkOi8vSm9iYmVyL0pvYi8xNTAzNjYxODU='
    mocks.getJobDetail.mockImplementation(async (input: unknown) => {
      const decoded = typeof input === 'object' && input !== null
        && 'jobberJobId' in input && input.jobberJobId === jobberJobId
      return decoded
        ? {
            ok: true,
            data: {
              id: jobberJobId,
              jobNumber: '3103',
              title: 'Belrose',
              jobStatus: 'upcoming',
              total: '12437.02',
              jobberWebUri: 'https://secure.getjobber.com/jobs/job-1',
              financialSummary: {
                revenue: '12437.02',
                expensesTotal: '2383.89',
                profit: '10053.13',
                profitMarginPercent: '80.835492',
              },
              refreshedAt: '2026-08-02T02:30:09.555Z',
              expenses: [],
            },
          }
        : { ok: false, error: 'Encoded Jobber ID was not decoded' }
    })

    const markup = renderToStaticMarkup(await JobDetailPage({
      params: Promise.resolve({ jobberJobId: encodeURIComponent(jobberJobId) }),
    }))

    expect(markup).toContain('Job #3103')
    expect(markup).not.toContain('Encoded Jobber ID was not decoded')
  })
})
