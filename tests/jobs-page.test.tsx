import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listMyJobs: vi.fn(),
  listUsers: vi.fn(),
  requireRole: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/lib/actions/jobs', () => ({
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
})
