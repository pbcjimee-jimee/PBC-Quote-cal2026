import Decimal from 'decimal.js'
import { createAiDraftMaterialItem } from '@/components/quote-form/ai-draft-apply'
import type { AreaFormulaSelections } from '@/components/quote-form/types'
import { normalizeAreaKey } from '@/lib/ai-quote/knowledge-stats'
import type { AiQuoteDraft } from '@/lib/ai-quote/types'
import type { PricingSettings } from '@/lib/calculator'
import { calculateMainQuoteTotals } from '@/lib/quote-calculation-totals'

export interface AiDraftComparison {
  finalTotalDiffPct: string
  workingDaysDiffPct: string
  productMatchRate: string
  areaRecall: string
  areaPrecision: string
  publicLineCountDiff: number
}

function differencePercent(value: Decimal, reference: string): string {
  const base = new Decimal(reference)
  return base.isZero() ? '0.00' : value.sub(base).abs().div(base.abs()).mul(100).toFixed(2)
}

function matchRate(matches: number, count: number): string {
  return count ? new Decimal(matches).div(count).toFixed(2) : '0.00'
}

export function compareDraftWithQuote(input: {
  draft: AiQuoteDraft
  settings: PricingSettings
  reference: { areaNames: string[]; productIds: string[]; totalWorkingDays: string; finalTotal: string; publicLineCount: number }
}): AiDraftComparison {
  const { draft, settings, reference } = input
  const materials = draft.workItems.map(item => createAiDraftMaterialItem(item, { name: item.areaName, scope: item.areaScope }))
  const areaFormulaSelections: AreaFormulaSelections = {
    interior: { selectedMin: 1, selectedMax: 1 },
    exterior: { selectedMin: 1, selectedMax: 1 },
    roof: { selectedMin: 1, selectedMax: 1 },
  }
  for (const selection of draft.formulaSelections) {
    areaFormulaSelections[selection.scope] = { selectedMin: selection.selectedMin, selectedMax: selection.selectedMax }
  }
  const totals = calculateMainQuoteTotals({ materials, settings, selectedMin: 1, selectedMax: 1, areaFormulaSelections })
  const referenceProducts = new Set(reference.productIds)
  const draftProducts = new Set(draft.workItems.map(item => item.product.id))
  const referenceAreas = new Set(reference.areaNames.map(normalizeAreaKey).filter(Boolean))
  const draftAreas = new Set(draft.areas.map(area => normalizeAreaKey(area.name)).filter(Boolean))
  const matchingAreas = [...referenceAreas].filter(area => draftAreas.has(area)).length
  return {
    finalTotalDiffPct: differencePercent(totals.areaBreakdown.finalTotal, reference.finalTotal),
    workingDaysDiffPct: differencePercent(totals.totalWorkingDays, reference.totalWorkingDays),
    productMatchRate: matchRate([...referenceProducts].filter(id => draftProducts.has(id)).length, referenceProducts.size),
    areaRecall: matchRate(matchingAreas, referenceAreas.size),
    areaPrecision: matchRate(matchingAreas, draftAreas.size),
    publicLineCountDiff: draft.publicLines.length - reference.publicLineCount,
  }
}

export function summarizeEvalMetrics(rows: AiDraftComparison[]): { median: AiDraftComparison; meetsLaunchCriteria: boolean } {
  function medianValue(key: keyof AiDraftComparison): Decimal {
    if (!rows.length) return new Decimal(0)
    const values = rows.map(row => new Decimal(row[key])).sort((a, b) => a.cmp(b))
    const middle = Math.floor(values.length / 2)
    return values.length % 2 ? values[middle] : values[middle - 1].add(values[middle]).div(2)
  }
  const median: AiDraftComparison = {
    finalTotalDiffPct: medianValue('finalTotalDiffPct').toFixed(2),
    workingDaysDiffPct: medianValue('workingDaysDiffPct').toFixed(2),
    productMatchRate: medianValue('productMatchRate').toFixed(2),
    areaRecall: medianValue('areaRecall').toFixed(2),
    areaPrecision: medianValue('areaPrecision').toFixed(2),
    publicLineCountDiff: medianValue('publicLineCountDiff').toNumber(),
  }
  return {
    median,
    meetsLaunchCriteria: rows.length > 0 && medianValue('finalTotalDiffPct').lte(15)
      && medianValue('workingDaysDiffPct').lte(20) && medianValue('productMatchRate').gte('0.60'),
  }
}
