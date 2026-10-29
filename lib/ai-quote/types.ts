export type AiScope = 'interior' | 'exterior' | 'roof'

export type AiPriceSource = 'catalog' | 'allocated' | 'none'

export interface AiUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}
