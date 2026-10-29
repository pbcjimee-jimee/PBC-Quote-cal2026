import { describe, expect, it } from 'vitest'
import { selectEvalQuotes, type EvalCandidate } from '@/lib/ai-quote/eval-select'

function candidate(id: string, scopes: EvalCandidate['scopes'] = ['interior'], overrides: Partial<EvalCandidate> = {}): EvalCandidate {
  return { id, scopes, createdAt: '2026-10-30T00:00:00Z', itemCount: 2, pricedLineCount: 1, finalTotal: '1100', ...overrides }
}

describe('selectEvalQuotes', () => {
  it('allocates proportionally across scope strata with at least one each', () => {
    const scopes: EvalCandidate['scopes'][] = [['interior'], ['exterior'], ['interior', 'exterior'], ['roof']]
    const candidates = [60, 20, 15, 5].flatMap((count, stratum) => Array.from({ length: count }, (_, i) => candidate(`${stratum}-${i}`, scopes[stratum])))
    const selected = selectEvalQuotes(candidates, 10)
    expect(selected).toHaveLength(10)
    expect(new Set(selected.map(id => id.split('-')[0])).size).toBe(4)
    expect(selected.filter(id => id.startsWith('0-')).length).toBeGreaterThanOrEqual(5)
  })

  it('skips quotes with fewer than two items, no priced line, zero total or no scope', () => {
    const candidates = [candidate('good'), candidate('items', ['interior'], { itemCount: 1 }),
      candidate('lines', ['interior'], { pricedLineCount: 0 }), candidate('total', ['roof'], { finalTotal: '0.00' }),
      candidate('scope', []), candidate('negative', ['exterior'], { finalTotal: '-1' })]
    expect(selectEvalQuotes(candidates, 10)).toEqual(['good'])
  })

  it('picks newest quotes within each stratum with deterministic id tie breaks', () => {
    const candidates = [candidate('old', ['interior'], { createdAt: '2026-01-01Z' }), candidate('b'), candidate('a')]
    expect(selectEvalQuotes(candidates, 2)).toEqual(['a', 'b'])
    expect(selectEvalQuotes([...candidates].reverse(), 2)).toEqual(['a', 'b'])
  })

  it('puts mixed roof quotes in the roof stratum and caps small sets without duplicates', () => {
    const candidates = [candidate('a'), candidate('b', ['interior', 'roof']), candidate('c', ['exterior'])]
    expect(new Set(selectEvalQuotes([...candidates, candidates[0]], 10)).size).toBe(3)
    expect(selectEvalQuotes(candidates, 2)).toHaveLength(2)
    expect(selectEvalQuotes(candidates, 0)).toEqual([])
    expect(selectEvalQuotes([], 10)).toEqual([])
  })
})
