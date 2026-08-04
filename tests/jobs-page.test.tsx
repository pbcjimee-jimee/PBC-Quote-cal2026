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

import JobsPage, { JobsContent } from '@/app/(app)/jobs/page'
import JobsLoading from '@/app/(app)/jobs/loading'
import JobDetailPage from '@/app/(app)/jobs/[jobberJobId]/page'

const refreshWarning = '1 of 12 Jobber job details could not be refreshed.'

describe('Jobs page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
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

  it('renders the authenticated jobs shell without waiting for Jobber', async () => {
    mocks.listMyJobs.mockReturnValueOnce(new Promise(() => undefined))

    const outcome = await Promise.race([
      JobsPage({ searchParams: Promise.resolve({ month: '2026-08' }) }).then(() => 'shell'),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 25)),
    ])

    expect(outcome).toBe('shell')
  })

  it('renders a calendar-shaped mobile loading state instead of a blank block', () => {
    const markup = renderToStaticMarkup(<JobsLoading />)

    expect(markup).toContain('aria-label="Loading job calendar"')
    expect(markup).toContain('pbc-jobcalendar-loading')
    expect(markup.match(/pbc-jobcalendar-loading__day/g)).toHaveLength(42)
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

    const markup = renderToStaticMarkup(await JobsContent({
      query: {},
      role: 'admin',
      supervisorProfileId: null,
    }))

    expect(markup).toContain(refreshWarning)
    expect(markup).toContain('pbc-alert--warning')
    expect(markup).toContain('role="status"')
  })

  it('loads admin jobs for the displayed calendar month', async () => {
    mocks.listMyJobs.mockImplementationOnce(async (input: unknown) => {
      const hasMonth = typeof input === 'object' && input !== null
        && 'month' in input && input.month === '2026-08'
      return hasMonth
        ? { ok: true, data: { jobs: [], assignmentLinked: true, filteredJobberUserId: null } }
        : { ok: false, error: 'Calendar month was not forwarded' }
    })

    const markup = renderToStaticMarkup(await JobsContent({
      query: { month: '2026-08' },
      role: 'admin',
      supervisorProfileId: null,
    }))

    expect(markup).toContain('August 2026 job calendar')
    expect(markup).not.toContain('Calendar month was not forwarded')
  })

  it('explains that supervisor access depends on an official Jobber name match', async () => {
    mocks.requireRole.mockResolvedValueOnce({
      ok: true,
      user: { id: 'supervisor-1', email: 'eric@example.com' },
      profile: {
        id: 'supervisor-1',
        email: 'eric@example.com',
        displayName: 'Eric',
        role: 'supervisor',
        jobberUserId: null,
        isActive: true,
      },
    })
    mocks.listMyJobs.mockResolvedValueOnce({
      ok: true,
      data: { jobs: [], assignmentLinked: false, filteredJobberUserId: null },
    })

    const markup = renderToStaticMarkup(await JobsContent({
      query: {},
      role: 'supervisor',
      supervisorProfileId: null,
    }))

    expect(markup).toContain('could not be matched to an official Jobber supervisor')
    expect(markup).not.toContain('not linked to a Jobber user')
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
