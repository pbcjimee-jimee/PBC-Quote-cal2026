import type { AiDraftModelOutput } from '@/lib/ai-quote/draft-schema'
import type { ProductRecord } from '@/lib/products/types'

export type AiScope = 'interior' | 'exterior' | 'roof'

export type AiPriceSource = 'catalog' | 'allocated' | 'none'

export interface AiUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface AiPhotoFinding {
  area: string
  kind: 'problem' | 'access'
  issue: string
  suggestedTreatment: string
  photoRefs: number[]
  confidence: 'low' | 'medium' | 'high'
}

export interface AiPhotoAdjustment {
  workingDays: string
  labourPerDay: string
  reason: string
  photoRefs: number[]
}

export interface AiQuoteDraftPublicLine {
  id: string
  kind: 'line_item' | 'text'
  productServiceId: string | null
  name: string
  description: string
  quantity: string
  priceSource: AiPriceSource
  priceWeight: number
  catalogUnitPrice: string | null
  taxable: boolean
  areaName: string | null
  rationale: string
}

export interface AiQuoteDraftWorkItem {
  id: string
  product: ProductRecord
  areaScope: AiScope
  areaName: string
  quantity: string
  workingDays: string
  labourPerDay: string
  rationale: string
  photoAdjustment: AiPhotoAdjustment | null
}

export interface AiQuoteDraft {
  summary: string
  findings: AiDraftModelOutput['findings']
  photoFindings: AiPhotoFinding[]
  questions: string[]
  warnings: string[]
  areas: Array<{ scope: AiScope; name: string }>
  publicLines: AiQuoteDraftPublicLine[]
  workItems: AiQuoteDraftWorkItem[]
  formulaSelections: Array<{
    scope: AiScope
    selectedMin: 1 | 2 | 3 | 4 | 5
    selectedMax: 1 | 2 | 3 | 4 | 5
    rationale: string
  }>
}

export interface DraftJobberContext {
  jobberQuoteId: string | null
  workType: string
  customerType: string
  areaSqft: number | null
  existingLines: Array<{ name: string; description: string; quantity: number; unitPrice: number }>
}
