import { describe, expect, it } from 'vitest'
import { compareDraftWithQuote, summarizeEvalMetrics, type AiDraftComparison } from '@/lib/ai-quote/eval-metrics'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import type { AiQuoteDraft, AiQuoteDraftWorkItem } from '@/lib/ai-quote/types'

const settings = { ...DEFAULT_PRICING_SETTINGS, f1LabourRate: 1000, f2LabourRate: 500, f2Margin: 0 }
function item(id = 'p1', overrides: Partial<AiQuoteDraftWorkItem> = {}): AiQuoteDraftWorkItem {
  return { id, product: { id, name: 'Paint', manufacturer: null, type: null, unit: 'tin', marketPrice: '100',
    actualPrice: '40', active: true, colorCode: null }, areaScope: 'interior', areaName: 'Bedroom',
    quantity: '1', workingDays: '1', labourPerDay: '1', rationale: '', photoAdjustment: null, ...overrides }
}
function draft(overrides: Partial<AiQuoteDraft> = {}): AiQuoteDraft {
  return { summary: '', findings: [], photoFindings: [], questions: [], warnings: [], areas: [{ scope: 'interior', name: 'Bedroom' }],
    publicLines: [], workItems: [item()],
    formulaSelections: [{ scope: 'interior', selectedMin: 1, selectedMax: 1, rationale: '' }], ...overrides }
}
const reference = { areaNames: ['bedroom'], productIds: ['p1'], totalWorkingDays: '1', finalTotal: '1100', publicLineCount: 2 }
function row(overrides: Partial<AiDraftComparison> = {}): AiDraftComparison {
  return { finalTotalDiffPct: '10.00', workingDaysDiffPct: '20.00', productMatchRate: '0.60', areaRecall: '0.67',
    areaPrecision: '0.67', publicLineCountDiff: -2, ...overrides }
}

describe('eval metrics', () => {
  it('computes final total diff from real work items and scoped formula picks', () => {
    expect(compareDraftWithQuote({ draft: draft(), settings, reference })).toEqual(row({ workingDaysDiffPct: '0.00',
      productMatchRate: '1.00', areaRecall: '1.00', areaPrecision: '1.00' }))
    const changed = draft({ formulaSelections: [{ scope: 'interior', selectedMin: 2, selectedMax: 2, rationale: '' }] })
    expect(compareDraftWithQuote({ draft: changed, settings, reference }).finalTotalDiffPct).toBe('40.00')
  })

  it('computes working days diff and distinct reference product recall', () => {
    const result = compareDraftWithQuote({ draft: draft({ workItems: [item(), item('p2'), item('p3'), item('p3')] }), settings,
      reference: { ...reference, totalWorkingDays: '8', productIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p5'] } })
    expect(result.workingDaysDiffPct).toBe('50.00')
    expect(result.productMatchRate).toBe('0.60')
  })

  it('computes area recall and precision using normalized unique keys', () => {
    const result = compareDraftWithQuote({ draft: draft({ areas: [
      { scope: 'interior', name: ' BEDROOM 1 ' }, { scope: 'interior', name: 'Bath' }, { scope: 'interior', name: 'Kitchen' },
    ] }), settings, reference: { ...reference, areaNames: ['Bedroom 2', 'Bathroom', 'Hallway', 'Bedroom 3'] } })
    expect(result.areaRecall).toBe('0.67')
    expect(result.areaPrecision).toBe('0.67')
  })

  it('returns zero safely for zero denominators and empty sets', () => {
    expect(compareDraftWithQuote({ draft: draft({ areas: [], workItems: [] }), settings,
      reference: { areaNames: [], productIds: [], totalWorkingDays: '0', finalTotal: '0', publicLineCount: 0 } }))
      .toEqual(row({ finalTotalDiffPct: '0.00', workingDaysDiffPct: '0.00', productMatchRate: '0.00',
        areaRecall: '0.00', areaPrecision: '0.00', publicLineCountDiff: 0 }))
  })

  it('reports numeric medians, even set averages and inclusive launch criteria', () => {
    const rows = [row({ finalTotalDiffPct: '2.00', publicLineCountDiff: -1 }), row({ finalTotalDiffPct: '100.00', publicLineCountDiff: 3 }),
      row({ finalTotalDiffPct: '15.00', publicLineCountDiff: 1 })]
    expect(summarizeEvalMetrics(rows)).toEqual({ median: row({ finalTotalDiffPct: '15.00', publicLineCountDiff: 1 }), meetsLaunchCriteria: true })
    expect(summarizeEvalMetrics([row({ finalTotalDiffPct: '10.00' }), row({ finalTotalDiffPct: '20.00' })]).median.finalTotalDiffPct).toBe('15.00')
    expect(rows[0].finalTotalDiffPct).toBe('2.00')
  })

  it.each([{ finalTotalDiffPct: '15.01' }, { workingDaysDiffPct: '20.01' }, { productMatchRate: '0.59' }])('fails criteria for %j', values => {
    expect(summarizeEvalMetrics([row(values)]).meetsLaunchCriteria).toBe(false)
  })

  it('does not claim launch readiness without cases', () => {
    expect(summarizeEvalMetrics([]).meetsLaunchCriteria).toBe(false)
  })
})
