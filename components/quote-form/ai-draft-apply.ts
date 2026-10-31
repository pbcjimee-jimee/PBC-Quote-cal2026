import Decimal from 'decimal.js'
import {
  allocatePublicLinePrices,
  type AllocationResult,
} from '@/lib/ai-quote/price-allocation'
import type { AiPriceSource, AiQuoteDraft, AiQuoteDraftWorkItem, AiScope } from '@/lib/ai-quote/types'
import type { AreaRecord } from '@/lib/areas/types'
import type { QuoteLineTemplateRecord } from '@/lib/quote-line-templates/types'
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
    totalLineId: string
    removedDuplicateCount: number
    basicTemplateApplied: boolean
  }
}

function areaKey(scope: AiScope, name: string): string {
  return `${scope}:${name.trim().toLowerCase()}`
}

function lineKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
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
  templates?: QuoteLineTemplateRecord[]
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
  const basicTemplate = input.templates?.find(template => /basic/i.test(template.name))
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
      const jobberQuoteLines: JobberQuoteLineItemDraft[] = []
      const appliedLineIds: string[] = []
      const seenKeys = new Set<string>()
      let removedDuplicateCount = 0
      for (const line of current.jobberQuoteLines) {
        if (mode !== 'append' && !line.jobberLineItemId) continue
        const key = lineKey(line.name)
        if (seenKeys.has(key) && !line.jobberLineItemId) {
          removedDuplicateCount++
          continue
        }
        seenKeys.add(key)
        jobberQuoteLines.push(line)
      }
      const totalIndex = jobberQuoteLines.findIndex(line => line.kind === 'line_item' && line.optional !== true && /^total\b/i.test(line.name.trim()))
      const existingTotal = totalIndex < 0 ? undefined : jobberQuoteLines.splice(totalIndex, 1)[0]
      // Saved Basic wording takes priority over AI versions of standard terms.
      const templateKeys = new Set(basicTemplate?.items.map(line => lineKey(line.name)))
      for (const line of publicLines) {
        const key = lineKey(line.name)
        if (seenKeys.has(key) || templateKeys.has(key)) {
          removedDuplicateCount++
          continue
        }
        seenKeys.add(key)
        const id = generateId()
        appliedLineIds.push(id)
        jobberQuoteLines.push({
          id, kind: line.kind, name: line.name, description: line.description,
          quantity: line.quantity, unitPrice: '0.00', taxable: line.taxable, clientVisible: true,
          linkedProductOrServiceId: line.productServiceId ?? undefined,
        })
      }
      for (const line of basicTemplate?.items ?? []) {
        const key = lineKey(line.name)
        if (seenKeys.has(key)) {
          removedDuplicateCount++
          continue
        }
        seenKeys.add(key)
        jobberQuoteLines.push({
          id: generateId(), kind: line.kind, name: line.name, description: line.description ?? '',
          quantity: line.quantity ?? '1', unitPrice: line.unitPrice ?? '0',
          taxable: line.kind === 'line_item' ? line.taxable : false, clientVisible: line.clientVisible,
          linkedProductOrServiceId: line.linkedProductOrServiceId ?? undefined,
        })
      }
      const totalLine: JobberQuoteLineItemDraft = existingTotal ?? {
        id: generateId(), kind: 'line_item', name: 'Total', description: '', quantity: '1',
        unitPrice: '0.00', taxable: true, clientVisible: true,
      }
      jobberQuoteLines.push(totalLine)
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
        jobberQuoteLines,
        areaFormulaSelections,
        appliedLineIds,
        totalLineId: totalLine.id,
        removedDuplicateCount,
        basicTemplateApplied: Boolean(basicTemplate),
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
  const reservedExGst = lines.reduce((total, line) => (
    !Object.hasOwn(aiLineMeta, line.id) && line.kind === 'line_item'
      && line.clientVisible !== false && line.optional !== true
      ? total.add(new Decimal(line.unitPrice).mul(line.quantity))
      : total
  ), new Decimal(0))
  const result = allocatePublicLinePrices(aiLines.map((line) => ({
    id: line.id,
    kind: line.kind,
    quantity: line.quantity,
    ...aiLineMeta[line.id],
  })), finalTotal, reservedExGst)

  return {
    lines: lines.map((line) => Object.hasOwn(aiLineMeta, line.id)
      ? { ...line, unitPrice: result.unitPrices[line.id] }
      : line),
    result,
  }
}
