import { describe, expect, it, vi } from 'vitest'
import { fetchJobberJob, fetchJobberQuote, fetchJobberQuoteJobs, type JobberJobDetail, type JobberQuote } from '@/lib/jobber/client'
import { mapJobberJobToDraft, mapJobberQuoteToDraft } from '@/lib/jobber/mapper'
import { jobberQuoteSnapshotSchema } from '@/lib/validators'

const lineWarning = 'Only the first 100 line items were loaded from Jobber.'
const jobsWarning = 'Only the first 5 jobs were loaded from Jobber.'
const expensesWarning = 'Only the first 25 expenses were loaded for Job #42; totals may be incomplete.'
const quote: JobberQuote = {
  id: 'quote-1', quoteNumber: '123', title: null, message: null, createdAt: '2026-11-12',
  jobberWebUri: '', client: null, property: null, lineItems: { nodes: [] },
}
const job: JobberJobDetail = {
  id: 'job-1', jobNumber: 42, title: null, jobStatus: 'ACTIVE', jobberWebUri: '',
  createdAt: '2026-11-12', instructions: null, jobType: 'ONE_OFF', total: 100,
  client: null, property: null, quote: null, lineItems: { nodes: [] }, expenses: { nodes: [] },
}
const options = { accessToken: 'test-token', graphqlVersion: '2025-04-16' }

describe('Jobber truncated reads', () => {
  it.each([
    { input: { ...quote, lineItems: { nodes: [], pageInfo: { hasNextPage: true } } }, warnings: [lineWarning] },
    { input: { ...quote, jobs: { nodes: [], pageInfo: { hasNextPage: true } } }, warnings: [jobsWarning] },
    { input: { ...quote, jobs: { nodes: [{ ...job, expenses: { nodes: [], pageInfo: { hasNextPage: true } } }] } }, warnings: [expensesWarning] },
  ])('maps quote truncation to $warnings', ({ input, warnings }) => {
    expect(mapJobberQuoteToDraft(input).loadWarnings).toEqual(warnings)
  })

  it('includes each truncated job expense warning alongside quote limits', () => {
    const input = { ...quote, lineItems: { nodes: [], pageInfo: { hasNextPage: true } },
      jobs: { pageInfo: { hasNextPage: true }, nodes: [42, 43].map(jobNumber => ({ ...job, jobNumber,
        expenses: { nodes: [], pageInfo: { hasNextPage: true } } })) } }
    expect(mapJobberQuoteToDraft(input).loadWarnings).toEqual([
      lineWarning, jobsWarning, expensesWarning,
      'Only the first 25 expenses were loaded for Job #43; totals may be incomplete.',
    ])
  })

  it('maps job line and expense limits to warnings', () => {
    expect(mapJobberJobToDraft({ ...job, lineItems: { nodes: [], pageInfo: { hasNextPage: true } },
      expenses: { nodes: [], pageInfo: { hasNextPage: true } } }).loadWarnings).toEqual([lineWarning, expensesWarning])
  })

  it.each([undefined, { hasNextPage: false }])('omits loadWarnings when connections are not truncated: %s', pageInfo => {
    expect(mapJobberQuoteToDraft({ ...quote, lineItems: { nodes: [], pageInfo }, jobs: { nodes: [], pageInfo } })).not.toHaveProperty('loadWarnings')
    expect(mapJobberJobToDraft({ ...job, lineItems: { nodes: [], pageInfo }, expenses: { nodes: [], pageInfo } })).not.toHaveProperty('loadWarnings')
  })

  it.each([{ loadWarnings: undefined }, { loadWarnings: [] }, { loadWarnings: [lineWarning, jobsWarning, expensesWarning] }])('accepts and preserves optional snapshot warnings: $loadWarnings', ({ loadWarnings }) => {
    const input = { ...mapJobberQuoteToDraft(quote), ...(loadWarnings ? { loadWarnings } : {}) }
    expect(jobberQuoteSnapshotSchema.parse(input)).toEqual(input)
  })

  it.each([{ loadWarnings: [1] }, { loadWarnings: ['x'.repeat(201)] }, { loadWarnings: Array.from({ length: 9 }, () => 'warning') }])('rejects malformed or excessive warnings: $loadWarnings', ({ loadWarnings }) => {
    expect(jobberQuoteSnapshotSchema.safeParse({ ...mapJobberQuoteToDraft(quote), loadWarnings }).success).toBe(false)
  })

  it.each([false, true])('requests and retains quote line pageInfo with full query=%s', async preferFullQuoteQuery => {
    const fetcher = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ data: {
      quote: { ...quote, lineItems: { nodes: [], pageInfo: { hasNextPage: true } } },
    } })))
    const result = await fetchJobberQuote(quote.id, { ...options, fetcher, preferFullQuoteQuery })
    expect(fetcher.mock.calls[0][1].body).toContain('pageInfo { hasNextPage }')
    expect(mapJobberQuoteToDraft(result).loadWarnings).toEqual([lineWarning])
  })

  it('returns jobs pageInfo on request and keeps the default array API', async () => {
    const jobs = { nodes: [{ ...job, expenses: { nodes: [], pageInfo: { hasNextPage: true } } }], pageInfo: { hasNextPage: true } }
    const fetcher = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ data: { quote: { jobs } } })))
    const connection = await fetchJobberQuoteJobs(quote.id, { ...options, fetcher }, true)
    expect(connection).toEqual(jobs)
    expect(mapJobberQuoteToDraft({ ...quote, jobs: connection }).loadWarnings).toEqual([jobsWarning, expensesWarning])
    expect(String(fetcher.mock.calls[0][1].body).match(/pageInfo \{ hasNextPage \}/g)).toHaveLength(2)
    expect(await fetchJobberQuoteJobs(quote.id, { ...options, fetcher })).toEqual(jobs.nodes)
  })

  it('requests and retains job line and expense pageInfo', async () => {
    const fetcher = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ data: { job: {
      ...job, lineItems: { nodes: [], pageInfo: { hasNextPage: true } }, expenses: { nodes: [], pageInfo: { hasNextPage: true } },
    } } })))
    const result = await fetchJobberJob(job.id, { ...options, fetcher })
    expect(String(fetcher.mock.calls[0][1].body).match(/pageInfo \{ hasNextPage \}/g)).toHaveLength(2)
    expect(mapJobberJobToDraft(result).loadWarnings).toEqual([lineWarning, expensesWarning])
  })
})
