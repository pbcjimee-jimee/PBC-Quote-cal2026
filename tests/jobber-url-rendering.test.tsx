import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { JobDetail } from '@/components/jobs/job-detail'
import { JobberQuoteSummary } from '@/components/quote-form/customer-panel'
import type { JobberQuoteDraft } from '@/lib/jobber/mapper'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/actions/jobs', () => ({ refreshJobDetail: vi.fn() }))

const quote: JobberQuoteDraft = {
  jobberQuoteId: 'q1', sourceType: 'quote', quoteNumber: '123', createdAt: '2026-10-21',
  customerName: 'Customer', customerAddress: 'Address', workType: 'Painting', areaSqft: null,
  customerType: 'Residential', sourceUrl: '', productsAndServices: [], jobExpensesError: null, jobExpenses: [],
  financialSummary: { quoteTotal: 100, expensesTotal: 0, profit: 100, profitMarginPercent: 100 },
}
const job = {
  id: 'job-1', jobNumber: '123', title: 'Job title', jobStatus: 'active', total: '100',
  jobberWebUri: '', startAt: null, endAt: null, visits: [], expenses: [], refreshedAt: '2026-10-21',
  financialSummary: { revenue: '100', expensesTotal: '0', profit: '100', profitMarginPercent: '100' },
  labourEstimate: { assignmentCount: 0, ratePerAssignment: '450', total: '0' },
}

describe('Jobber source links', () => {
  it.each(['javascript:alert(1)', 'http://secure.getjobber.com/jobs/1', 'https://evil.test/1', ''])
  ('keeps job data visible without unsafe source links: %s', (url) => {
    const detail = renderToStaticMarkup(createElement(JobDetail, { job: { ...job, jobberWebUri: url } }))
    const summary = renderToStaticMarkup(createElement(JobberQuoteSummary, { quote: { ...quote,
      jobExpenses: [{ jobId: 'job-1', jobNumber: 123, jobTitle: 'Job title', jobStatus: 'active', jobUrl: url, expenses: [] }] } }))
    expect(detail).toContain('Job title')
    expect(summary).toContain('Job title')
    expect(detail).not.toContain('Open in Jobber')
    expect(summary).not.toContain('Open job</a>')
  })

  it('keeps valid HTTPS source links available in both views', () => {
    const url = 'https://secure.getjobber.com/jobs/1'
    const detail = renderToStaticMarkup(createElement(JobDetail, { job: { ...job, jobberWebUri: url } }))
    const summary = renderToStaticMarkup(createElement(JobberQuoteSummary, { quote: { ...quote,
      jobExpenses: [{ jobId: 'job-1', jobNumber: 123, jobTitle: '', jobStatus: 'active', jobUrl: url, expenses: [] }] } }))
    expect(detail).toContain(`href="${url}"`)
    expect(summary).toContain(`href="${url}"`)
  })
})
