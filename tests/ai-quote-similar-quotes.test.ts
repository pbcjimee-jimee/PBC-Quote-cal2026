import { describe, expect, it } from 'vitest'
import {
  rankSimilarQuotes,
  type SimilarQuoteCandidate,
  type SimilarQuoteQuery,
} from '@/lib/ai-quote/similar-quotes'

function query(overrides: Partial<SimilarQuoteQuery> = {}): SimilarQuoteQuery {
  return { workType: 'interior', customerType: 'residential', memo: '', existingLineNames: [], ...overrides }
}

function candidate(id: string, overrides: Partial<SimilarQuoteCandidate> = {}): SimilarQuoteCandidate {
  return {
    id,
    workType: 'interior',
    customerType: 'residential',
    areaKeys: [],
    lineNames: [],
    createdAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

describe('rankSimilarQuotes', () => {
  it('prefers the same work type and overlapping areas with the specified score weights', () => {
    const ranked = rankSimilarQuotes(query({ workType: 'INTERIOR', memo: 'Bedroom, bathroom' }), [
      candidate('unrelated', { workType: 'exterior', areaKeys: ['fence'] }),
      candidate('matching', { areaKeys: ['bedroom', 'bathroom'] }),
      candidate('work-only'),
    ])

    expect(ranked).toEqual([
      { id: 'matching', score: 9 }, { id: 'work-only', score: 4 }, { id: 'unrelated', score: 1 },
    ])
  })

  it('tokenizes memo fragments through normalizeAreaKey including plurals and synonyms', () => {
    const ranked = rankSimilarQuotes(query({ memo: '2 beds, ensuite. hallway\nunknown room' }), [
      candidate('all-areas', { areaKeys: ['bedroom', 'bathroom', 'hallway'] }),
      candidate('one-area', { areaKeys: ['bedroom'] }),
    ])

    expect(ranked[0]).toEqual({ id: 'all-areas', score: 9 })
    expect(ranked[1].score).toBeCloseTo(4 + 5 / 3)
  })

  it('uses set Jaccard overlap rather than counting duplicate area names', () => {
    const ranked = rankSimilarQuotes(query({ memo: 'Bedroom, bedroom, bathroom' }), [
      candidate('partial', { areaKeys: ['bedroom', 'bedroom', 'hallway'] }),
      candidate('bathroom', { areaKeys: ['bathroom'] }),
    ])

    expect(ranked[0]).toEqual({ id: 'bathroom', score: 6.5 })
    expect(ranked[1].score).toBeCloseTo(4 + 5 / 3)
  })

  it('extracts area keys from existing line names', () => {
    expect(rankSimilarQuotes(query({ existingLineNames: ['Master Bed #2', 'Ensuite'] }), [
      candidate('bedroom', { areaKeys: ['bedroom', 'bathroom'] }),
    ])).toEqual([{ id: 'bedroom', score: 9 }])
  })

  it('adds twice the Jaccard of case-insensitive line name tokens', () => {
    const ranked = rankSimilarQuotes(query({ existingLineNames: ['PAINT walls, walls'] }), [
      candidate('walls', { lineNames: ['paint walls'] }),
      candidate('ceilings', { lineNames: ['Paint ceilings'] }),
    ])

    expect(ranked[0]).toEqual({ id: 'walls', score: 6 })
    expect(ranked[1].score).toBeCloseTo(4 + 2 / 3)
  })

  it('breaks score ties by the most recent creation date and then by id', () => {
    expect(rankSimilarQuotes(query(), [
      candidate('older'),
      candidate('new-b', { createdAt: '2026-10-02T00:00:00Z' }),
      candidate('new-a', { createdAt: '2026-10-02T00:00:00Z' }),
    ])).toEqual([
      { id: 'new-a', score: 4 }, { id: 'new-b', score: 4 }, { id: 'older', score: 4 },
    ])
  })

  it('returns at most four candidates by default and respects an explicit limit', () => {
    const candidates = ['a', 'b', 'c', 'd', 'e'].map(id => candidate(id))

    expect(rankSimilarQuotes(query(), candidates).map(row => row.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(rankSimilarQuotes(query(), candidates, 2).map(row => row.id)).toEqual(['a', 'b'])
    expect(rankSimilarQuotes(query(), candidates, 0)).toEqual([])
  })

  it('drops zero scores and does not count two empty sets as a match', () => {
    expect(rankSimilarQuotes(query({ workType: '', customerType: '' }), [
      candidate('empty', { workType: '', customerType: '' }),
      candidate('unrelated'),
    ])).toEqual([])
  })

  it('is deterministic and leaves the query and candidates unchanged', () => {
    const input = query({ memo: 'Bedroom' })
    const candidates = [candidate('b'), candidate('a', { areaKeys: ['bedroom'] })]
    const original = structuredClone({ input, candidates })
    const expected = [{ id: 'a', score: 9 }, { id: 'b', score: 4 }]

    expect(rankSimilarQuotes(input, candidates)).toEqual(expected)
    expect(rankSimilarQuotes(input, candidates)).toEqual(expected)
    expect({ input, candidates }).toEqual(original)
  })
})
