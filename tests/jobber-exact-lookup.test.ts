import { describe, expect, it, vi } from 'vitest'
import { fetchJobberJob, fetchJobberQuote, JobberNotFoundError, searchJobberJob, searchJobberQuote } from '@/lib/jobber/client'

const options = { accessToken: 'test-token', graphqlVersion: '2025-04-16' }
const response = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 })

describe('exact Jobber identity lookup', () => {
  it.each(['123', ' #123 ', ' Quote #123 ', 'quote 123', 'QUOTE#123'])('normalizes quote lookup %s before search and comparison', async lookup => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ quotes: { nodes: [{ id: 'wrong', quoteNumber: '1234' }, { id: 'correct', quoteNumber: ' #123 ' }] } }))
      .mockResolvedValueOnce(response({ quote: { id: 'correct', quoteNumber: '123' } }))
    expect((await searchJobberQuote(lookup, { ...options, fetcher })).id).toBe('correct')
    const request = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(request.variables.term).toBe('123')
    expect(request.query).toContain('first: 25')
    expect(JSON.parse(fetcher.mock.calls[1][1].body).variables.id).toBe('correct')
  })

  it('compares prefixed alphanumeric quote numbers case-insensitively', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ quotes: { nodes: [{ id: 'correct', quoteNumber: 'Quote Q-77' }] } }))
      .mockResolvedValueOnce(response({ quote: { id: 'correct' } }))
    expect((await searchJobberQuote(' #q-77 ', { ...options, fetcher })).id).toBe('correct')
  })

  it.each(['123', 'Job #123', ' job 123 ', '#123', 'JOB#123'])('normalizes job lookup %s', async lookup => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ jobs: { nodes: [{ id: 'wrong', jobNumber: 1234 }, { id: 'correct', jobNumber: 123 }] } }))
      .mockResolvedValueOnce(response({ job: { id: 'correct', jobNumber: 123 } }))
      .mockResolvedValueOnce(response({ job: { visits: { nodes: [] } } }))
    expect((await searchJobberJob(lookup, { ...options, fetcher })).id).toBe('correct')
    const request = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(request.variables.term).toBe('123')
    expect(request.query).toContain('first: 25')
    expect(JSON.parse(fetcher.mock.calls[1][1].body).variables.id).toBe('correct')
  })

  it.each(['quote', 'job'] as const)('rejects a non-matching %s instead of fetching another customer and keeps at most 3 candidates', async kind => {
    const nodes = ['1234', '1235', '1236', '1237'].map(number => ({ id: number, quoteNumber: number, jobNumber: Number(number) }))
    const fetcher = vi.fn().mockResolvedValueOnce(response({ [kind === 'quote' ? 'quotes' : 'jobs']: { nodes } }))
    const search = kind === 'quote' ? searchJobberQuote : searchJobberJob
    await expect(search('123', { ...options, fetcher })).rejects.toMatchObject({ name: 'JobberNotFoundError', lookup: '123', candidates: ['1234', '1235', '1236'] })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each(['quote', 'job'] as const)('throws a typed not-found for empty %s searches and missing ID lookups', async kind => {
    const search = kind === 'quote' ? searchJobberQuote : searchJobberJob
    const byId = kind === 'quote' ? fetchJobberQuote : fetchJobberJob
    const fetcher = vi.fn().mockResolvedValueOnce(response({ [kind === 'quote' ? 'quotes' : 'jobs']: { nodes: [] } }))
      .mockResolvedValueOnce(response({ [kind]: null }))
    await expect(search('missing', { ...options, fetcher })).rejects.toBeInstanceOf(JobberNotFoundError)
    await expect(byId('missing-id', { ...options, fetcher })).rejects.toMatchObject({ lookup: 'missing-id', candidates: [] })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
