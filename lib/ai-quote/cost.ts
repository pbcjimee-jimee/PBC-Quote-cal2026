import Decimal from 'decimal.js'
import type { AiUsage } from '@/lib/ai-quote/types'

export function estimateCostUsd(usage: AiUsage): string {
  return new Decimal(usage.inputTokens).mul('4')
    .add(new Decimal(usage.outputTokens).mul('20'))
    .add(new Decimal(usage.cacheReadTokens).mul('0.20'))
    .add(new Decimal(usage.cacheWriteTokens).mul('5'))
    .div('1000000')
    .toFixed(4, Decimal.ROUND_HALF_UP)
}
