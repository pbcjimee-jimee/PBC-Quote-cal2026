import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { JobDetail } from '@/components/jobs/job-detail'
import { JobFinancials } from '@/components/jobs/job-financials'
import { JobsList } from '@/components/jobs/jobs-list'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/actions/jobs', () => ({
  refreshJobDetail: vi.fn(),
  refreshJobs: vi.fn(),
}))

const job = {
  id: 'job-1', jobNumber: '3103', title: 'Belrose', jobStatus: 'requires_invoicing',
  total: '12437.02', jobberWebUri: 'https://secure.getjobber.com/jobs/job-1',
  financialSummary: {
    revenue: '12437.02', expensesTotal: '1493.89', profit: '10943.13', profitMarginPercent: '87.988361',
  },
  refreshedAt: '2026-07-31T00:00:00.000Z',
}

describe('jobs UI', () => {
  it('renders job revenue, expense, profit percentage, refresh time, and detail link', () => {
    const markup = renderToStaticMarkup(createElement(JobsList, { jobs: [job] }))

    expect(markup).toContain('#3103')
    expect(markup).toContain('requires invoicing')
    expect(markup).toContain('$12,437.02')
    expect(markup).toContain('$1,493.89')
    expect(markup).toContain('88.0%')
    expect(markup).toContain('href="/jobs/job-1"')
    expect(markup).toContain('bg-[var(--success)]')
  })

  it('renders the shared profit panel, expense lines, refresh, and Jobber source link', () => {
    const markup = renderToStaticMarkup(createElement(JobDetail, {
      job: {
        ...job,
        expenses: [{
          id: 'expense-1', title: 'paint', description: 'Dulux', date: '2026-07-30', total: '603.89',
          enteredByName: 'Sanggi', paidByName: null, reimbursableToName: null,
        }],
      },
    }))

    expect(markup).toContain('aria-label="Jobber profit"')
    expect(markup).toContain('Job revenue')
    expect(markup).toContain('Expenses total')
    expect(markup).toContain('paint')
    expect(markup).toContain('Dulux')
    expect(markup).toContain('Sanggi')
    expect(markup).toContain('$603.89')
    expect(markup).toContain('>Refresh</button>')
    expect(markup).toContain('target="_blank"')
  })

  it('renders expense dates as year, month, and day without a time', () => {
    const markup = renderToStaticMarkup(createElement(JobDetail, {
      job: {
        ...job,
        expenses: [{
          id: 'expense-1', title: 'paint', description: 'Dulux', date: '2026-07-30T23:45:13Z', total: '603.89',
          enteredByName: 'Sanggi', paidByName: null, reimbursableToName: null,
        }],
      },
    }))

    expect(markup).toContain('2026/07/30')
    expect(markup).not.toContain('23:45:13')
  })

  it('uses distinct revenue, expense, and profit color treatments', () => {
    const markup = renderToStaticMarkup(createElement(JobFinancials, { summary: job.financialSummary }))

    expect(markup).toContain('pbc-jobfinancial__row--revenue')
    expect(markup).toContain('pbc-jobfinancial__row--expenses')
    expect(markup).toContain('pbc-jobfinancial__row--profit')
  })
})
