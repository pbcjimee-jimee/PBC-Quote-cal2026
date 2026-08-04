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
  startAt: '2026-07-01T08:00:00+10:00', endAt: '2026-08-31T17:00:00+10:00',
  visits: [{ id: 'visit-1', startAt: '2026-08-03T08:00:00+10:00', endAt: '2026-08-05T17:00:00+10:00' }],
  financialSummary: {
    revenue: '12437.02', expensesTotal: '1493.89', profit: '10943.13', profitMarginPercent: '87.988361',
  },
  labourEstimate: { assignmentCount: 14, ratePerAssignment: '450', total: '6300' },
  refreshedAt: '2026-07-31T00:00:00.000Z',
}

describe('jobs UI', () => {
  it('lays a multi-day job across the month without rendering unscheduled jobs', () => {
    const unscheduled = {
      ...job,
      id: 'job-2',
      jobNumber: '3104',
      title: 'Manly',
      startAt: '2026-08-10T08:00:00+10:00',
      endAt: '2026-08-12T17:00:00+10:00',
      visits: [],
    }
    const markup = renderToStaticMarkup(createElement(JobsList, {
      jobs: [job, unscheduled],
      month: '2026-08',
      today: '2026-08-03',
    }))

    expect(markup).toContain('aria-label="August 2026 job calendar"')
    expect(markup).toContain('pbc-jobcalendar__day--today')
    expect(markup.match(/href="\/jobs\/job-1"/g)).toHaveLength(3)
    expect(markup).not.toContain('Unscheduled')
    expect(markup).not.toContain('href="/jobs/job-2"')
  })

  it('marks dates before today as past without marking today', () => {
    const pastJob = {
      ...job,
      id: 'job-past',
      jobNumber: '3102',
      title: 'Past schedule',
      visits: [{ id: 'visit-past', startAt: '2026-08-02T08:00:00+10:00', endAt: '2026-08-02T17:00:00+10:00' }],
    }
    const markup = renderToStaticMarkup(createElement(JobsList, {
      jobs: [pastJob, job],
      month: '2026-08',
      today: '2026-08-03',
    }))

    expect(markup).toContain('pbc-jobcalendar__job--past')
    expect(markup).toContain('#3102 · Past')
    expect(markup).toContain('#3103 · requires invoicing')
  })

  it('renders a compact job number label for narrow calendar cells', () => {
    const markup = renderToStaticMarkup(createElement(JobsList, {
      jobs: [job],
      month: '2026-08',
      today: '2026-08-03',
    }))

    expect(markup).toContain('class="pbc-jobcalendar__mobilelabel" aria-hidden="true">#3103</span>')
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
    expect(markup).toContain('Estimate labour')
    expect(markup).toContain('$6,300.00')
    expect(markup).toContain('14 scheduled assignments × $450.00')
    expect(markup.indexOf('Job revenue')).toBeLessThan(markup.indexOf('Estimate labour'))
    expect(markup.indexOf('Estimate labour')).toBeLessThan(markup.indexOf('Expenses total'))
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
    const markup = renderToStaticMarkup(createElement(JobFinancials, {
      summary: job.financialSummary,
      labourEstimate: job.labourEstimate,
    }))

    expect(markup).toContain('pbc-jobfinancial__row--revenue')
    expect(markup).toContain('pbc-jobfinancial__row--labour')
    expect(markup).toContain('pbc-jobfinancial__row--expenses')
    expect(markup).toContain('pbc-jobfinancial__row--profit')
  })

  it('keeps estimated labour out of compact job cards', () => {
    const markup = renderToStaticMarkup(createElement(JobFinancials, {
      summary: job.financialSummary,
      labourEstimate: job.labourEstimate,
      compact: true,
    }))

    expect(markup).not.toContain('Estimate labour')
    expect(markup).not.toContain('$6,300.00')
  })

  it('uses the dedicated detail progress bar color treatment', () => {
    const markup = renderToStaticMarkup(createElement(JobFinancials, { summary: job.financialSummary }))

    expect(markup).toContain('pbc-jobfinancial__bar')
  })
})
