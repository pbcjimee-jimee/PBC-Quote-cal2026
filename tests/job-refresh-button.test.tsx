import { act, createElement } from 'react'
import type { Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestDom } from '@/tests/helpers/test-dom'

const mocks = vi.hoisted(() => ({
  refreshJobDetail: vi.fn(),
  refreshJobs: vi.fn(),
  routerRefresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.routerRefresh }),
}))

vi.mock('@/lib/actions/jobs', () => ({
  refreshJobDetail: mocks.refreshJobDetail,
  refreshJobs: mocks.refreshJobs,
}))

import { JobRefreshButton } from '@/components/jobs/job-refresh-button'

const refreshWarning = '1 of 12 Jobber job details could not be refreshed.'

describe('JobRefreshButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a partial refresh warning after a successful manual jobs refresh', async () => {
    mocks.refreshJobs.mockImplementation(async (input: unknown) => {
      const hasMonth = typeof input === 'object' && input !== null
        && 'month' in input && input.month === '2026-08'
      return hasMonth
        ? {
            ok: true,
            data: {
              jobs: [],
              assignmentLinked: true,
              filteredJobberUserId: null,
              refreshWarning,
            },
          }
        : { ok: false, error: 'Calendar month was not forwarded' }
    })
    const { cleanup } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = document.createElement('div')
      root = createRoot(container)

      await act(async () => {
        root!.render(createElement(JobRefreshButton, { supervisorProfileId: null, month: '2026-08' }))
      })

      await act(async () => {
        container.querySelectorAll('button')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      const status = Array.from(container.querySelectorAll('p'))
        .find((element) => element.getAttribute('role') === 'status')
      expect(status).toBeDefined()
      expect(status?.textContent).toContain(refreshWarning)
      expect(status?.getAttribute('class')).toContain('pbc-alert--warning')
      expect(mocks.routerRefresh).toHaveBeenCalledTimes(1)
    } finally {
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        cleanup()
      }
    }
  })
})
