import { describe, expect, it } from 'vitest'
import { estimateCostUsd } from '@/lib/ai-quote/cost'
import type { AiUsage } from '@/lib/ai-quote/types'

const emptyUsage: AiUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}

describe('estimateCostUsd', () => {
  it('combines input, output, cache read and cache write costs', () => {
    expect(estimateCostUsd({
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheReadTokens: 500_000,
      cacheWriteTokens: 200_000,
    })).toBe('7.1000')
  })

  it.each([
    ['inputTokens', '4.0000'],
    ['outputTokens', '20.0000'],
    ['cacheReadTokens', '0.2000'],
    ['cacheWriteTokens', '5.0000'],
  ] as const)('uses the confirmed %s rate', (field, expected) => {
    expect(estimateCostUsd({ ...emptyUsage, [field]: 1_000_000 })).toBe(expected)
  })

  it('returns zero with four decimal places for no usage', () => {
    expect(estimateCostUsd(emptyUsage)).toBe('0.0000')
  })

  it('rounds only after combining all token costs', () => {
    expect(estimateCostUsd({
      inputTokens: 10,
      outputTokens: 2,
      cacheReadTokens: 100,
      cacheWriteTokens: 8,
    })).toBe('0.0001')
  })
})
