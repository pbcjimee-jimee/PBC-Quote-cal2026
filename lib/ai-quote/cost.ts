import Decimal from 'decimal.js'
import type { AiUsage } from '@/lib/ai-quote/types'

export function estimateCostUsd(usage: AiUsage, model: string): string {
  const sonnet = model === 'claude-sonnet-5-5'
  return new Decimal(usage.inputTokens).mul(sonnet ? '2' : '4')
    .add(new Decimal(usage.outputTokens).mul(sonnet ? '10' : '20'))
    .add(new Decimal(usage.cacheReadTokens).mul('0.20'))
    .add(new Decimal(usage.cacheWriteTokens).mul(sonnet ? '2.5' : '5'))
    .div('1000000')
    .toFixed(4, Decimal.ROUND_HALF_UP)
}
