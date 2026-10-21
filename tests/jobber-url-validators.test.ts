import { describe, expect, it } from 'vitest'
import { jobberQuoteSnapshotSchema, quoteSchema } from '@/lib/validators'

const snapshot = {
  jobberQuoteId: 'quote-1', sourceType: 'quote', quoteNumber: '123', createdAt: '2026-10-21',
  customerName: 'Customer', customerAddress: 'Address', workType: 'Painting', areaSqft: null,
  customerType: 'Residential', sourceUrl: '', productsAndServices: [], jobExpensesError: null,
  jobExpenses: [{ jobId: 'job-1', jobNumber: 1, jobTitle: 'Job', jobStatus: 'active', jobUrl: '', expenses: [] }],
  financialSummary: { quoteTotal: 100, expensesTotal: 0, profit: 100, profitMarginPercent: 100 },
}

describe('Jobber URLs at the quote save boundary', () => {
  it.each(['javascript:alert(1)', 'http://secure.getjobber.com/jobs/1', 'https://evil.test/jobs/1',
    'https://getjobber.com.evil.test/1', 'https://evilgetjobber.com/1', '//secure.getjobber.com/1',
    'https://secure.getjobber.com@evil.test/1', 'https://user:password@secure.getjobber.com/1'])
  ('rejects unsafe URL %s in every client-supplied Jobber URL field', (url) => {
    expect(quoteSchema.shape.jobberSnapshot.safeParse({ ...snapshot, sourceUrl: url }).success).toBe(false)
    expect(quoteSchema.shape.jobberSnapshot.safeParse({ ...snapshot,
      jobExpenses: [{ ...snapshot.jobExpenses[0], jobUrl: url }] }).success).toBe(false)
  })

  it.each(['', 'https://getjobber.com/jobs/1', 'https://secure.getjobber.com/jobs/1', 'https://app.secure.getjobber.com/1'])
  ('accepts the existing empty value and HTTPS Jobber host %s', (url) => {
    expect(quoteSchema.shape.jobberSnapshot.safeParse({ ...snapshot, sourceUrl: url,
      jobExpenses: [{ ...snapshot.jobExpenses[0], jobUrl: url }] }).success).toBe(true)
  })

  it('keeps legacy saved snapshots readable for safe rendering', () => {
    const legacy = { ...snapshot, sourceUrl: 'http://legacy.invalid',
      jobExpenses: [{ ...snapshot.jobExpenses[0], jobUrl: 'javascript:alert(1)' }] }
    expect(jobberQuoteSnapshotSchema.safeParse(legacy).success).toBe(true)
    expect(quoteSchema.shape.jobberSnapshot.safeParse(legacy).success).toBe(false)
  })
})
