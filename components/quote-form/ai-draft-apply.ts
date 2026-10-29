import type Decimal from 'decimal.js'
import {
  allocatePublicLinePrices,
  type AllocationResult,
} from '@/lib/ai-quote/price-allocation'
import type { AiPriceSource, AiQuoteDraft, AiQuoteDraftWorkItem, AiScope } from '@/lib/ai-quote/types'
import type { AreaRecord } from '@/lib/areas/types'
import { createProductMaterialItem } from './material-item-factory'
import type { AreaFormulaSelections, JobberQuoteLineItemDraft, MaterialItem } from './types'

export interface AiDraftSelection {
  areas: Set<string>
  publicLines: Set<string>
  workItems: Set<string>
  formulaScopes: Set<AiScope>
}

export type AiLineApplyMode = 'append' | 'replace'

export interface AiDraftApplyPlan {
  areasToCreate: Array<{ scope: AiScope; name: string }>
  build(areas: AreaRecord[]): {
    materials: MaterialItem[]
    jobberQuoteLines: JobberQuoteLineItemDraft[]
    areaFormulaSelections: AreaFormulaSelections
    appliedLineIds: string[]
  }
}

function areaKey(scope: AiScope, name: string): string {
  return `${scope}:${name.trim().toLowerCase()}`
}

export function createAiDraftMaterialItem(
  workItem: AiQuoteDraftWorkItem,
  area: { id?: string; name: string; scope: AiScope },
): MaterialItem {
  return {
    ...createProductMaterialItem(workItem.product),
    quantity: workItem.quantity,
    workingDays: workItem.workingDays,
    labourPerDay: workItem.labourPerDay,
    areaId: area.id,
    areaName: area.name,
    areaScope: area.scope,
    memo: `AI: ${workItem.rationale}`.slice(0, 500),
  }
}

export function planAiDraftApplication(input: {
  draft: AiQuoteDraft
  selection: AiDraftSelection
  mode: AiLineApplyMode
  current: {
    materials: MaterialItem[]
    jobberQuoteLines: JobberQuoteLineItemDraft[]
    areaFormulaSelections: AreaFormulaSelections
    areas: AreaRecord[]
  }
  generateId?: () => string
}): AiDraftApplyPlan {
  const { draft, selection, mode, current, generateId = () => crypto.randomUUID() } = input
  const workItems = draft.workItems.filter((item) => selection.workItems.has(item.id))
  const publicLines = draft.publicLines.filter((line) => selection.publicLines.has(line.id))
  const knownAreaKeys = new Set(current.areas.map((area) => areaKey(area.scope, area.name)))
  const areasToCreate: AiDraftApplyPlan['areasToCreate'] = []
  const requiredAreas = [
    ...draft.areas.filter((area) => selection.areas.has(`${area.scope}:${area.name}`)),
    ...workItems.map((item) => ({ scope: item.areaScope, name: item.areaName })),
  ]

  for (const area of requiredAreas) {
    const key = areaKey(area.scope, area.name)
    if (!knownAreaKeys.has(key)) {
      areasToCreate.push({ scope: area.scope, name: area.name.trim() })
      knownAreaKeys.add(key)
    }
  }

  return {
    areasToCreate,
    build(areas) {
      const areaRecords = new Map([...current.areas, ...areas].map((area) => [areaKey(area.scope, area.name), area]))
      const materials = workItems.map((item) => {
        const area = areaRecords.get(areaKey(item.areaScope, item.areaName))
        return createAiDraftMaterialItem(item, area ?? { scope: item.areaScope, name: item.areaName.trim() })
      })
      const jobberQuoteLines: JobberQuoteLineItemDraft[] = publicLines.map((line) => ({
        id: generateId(),
        kind: line.kind,
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unitPrice: '0.00',
        taxable: line.taxable,
        clientVisible: true,
        linkedProductOrServiceId: line.productServiceId ?? undefined,
      }))
      const areaFormulaSelections = { ...current.areaFormulaSelections }
      for (const formula of draft.formulaSelections) {
        if (selection.formulaScopes.has(formula.scope)) {
          areaFormulaSelections[formula.scope] = {
            selectedMin: formula.selectedMin,
            selectedMax: formula.selectedMax,
          }
        }
      }

      return {
        materials: [...current.materials, ...materials],
        jobberQuoteLines: [
          ...current.jobberQuoteLines.filter((line) => mode === 'append' || Boolean(line.jobberLineItemId)),
          ...jobberQuoteLines,
        ],
        areaFormulaSelections,
        appliedLineIds: jobberQuoteLines.map((line) => line.id),
      }
    },
  }
}

export function reallocateAiLinePrices(
  lines: JobberQuoteLineItemDraft[],
  aiLineMeta: Record<string, { priceSource: AiPriceSource; priceWeight: number; catalogUnitPrice: string | null }>,
  finalTotal: Decimal.Value,
): { lines: JobberQuoteLineItemDraft[]; result: AllocationResult } {
  const aiLines = lines.filter((line) => Object.hasOwn(aiLineMeta, line.id))
  const result = allocatePublicLinePrices(aiLines.map((line) => ({
    id: line.id,
    kind: line.kind,
    quantity: line.quantity,
    ...aiLineMeta[line.id],
  })), finalTotal)

  return {
    lines: lines.map((line) => Object.hasOwn(aiLineMeta, line.id)
      ? { ...line, unitPrice: result.unitPrices[line.id] }
      : line),
    result,
  }
}
