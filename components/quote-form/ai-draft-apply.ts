import Decimal from 'decimal.js'
import {
  allocatePublicLinePrices,
  type AllocationResult,
} from '@/lib/ai-quote/price-allocation'
import type { AiPriceSource, AiQuoteDraft, AiQuoteDraftWorkItem, AiScope } from '@/lib/ai-quote/types'
import type { AreaRecord } from '@/lib/areas/types'
import type { QuoteLineTemplateRecord } from '@/lib/quote-line-templates/types'
import { createProductMaterialItem } from './material-item-factory'
import { getQuoteOptionImportFingerprint } from './jobber-option-mapping'
import type { QuoteFormDraft } from './quote-draft'
import type { AreaFormulaSelections, JobberQuoteLineItemDraft, MaterialItem, QuoteOptionItem } from './types'

export interface AiDraftSelection {
  areas: Set<string>
  publicLines: Set<string>
  optionalItems: Set<string>
  workItems: Set<string>
  formulaScopes: Set<AiScope>
  photoAdjustments: Set<string>
}

export type AiLineApplyMode = 'append' | 'replace'

export interface AiDraftApplyPlan {
  areasToCreate: Array<{ scope: AiScope; name: string }>
  build(areas: AreaRecord[]): {
    materials: MaterialItem[]
    options: QuoteOptionItem[]
    optionLineLinks: Array<{ lineId: string; optionId: string }>
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
  includePhotoAdjustment = false,
): MaterialItem {
  const adjustment = includePhotoAdjustment ? workItem.photoAdjustment : null
  return {
    ...createProductMaterialItem(workItem.product),
    quantity: workItem.quantity,
    workingDays: adjustment?.workingDays ?? workItem.workingDays,
    labourPerDay: adjustment?.labourPerDay ?? workItem.labourPerDay,
    areaId: area.id,
    areaName: area.name,
    areaScope: area.scope,
    memo: '',
  }
}

export function planAiDraftApplication(input: {
  draft: AiQuoteDraft
  selection: AiDraftSelection
  mode: AiLineApplyMode
  templates?: QuoteLineTemplateRecord[]
  current: {
    materials: MaterialItem[]
    options: QuoteOptionItem[]
    aiLineMeta: NonNullable<QuoteFormDraft['aiLineMeta']>
    jobberQuoteLines: JobberQuoteLineItemDraft[]
    areaFormulaSelections: AreaFormulaSelections
    areas: AreaRecord[]
  }
  generateId?: () => string
}): AiDraftApplyPlan {
  const { draft, selection, mode, current, generateId = () => crypto.randomUUID() } = input
  const optionalItems = draft.optionalItems.filter(item => selection.optionalItems.has(item.id))
  const workItems = draft.workItems.filter((item) => selection.workItems.has(item.id)
    && (item.optionalItemId === null || optionalItems.some(option => option.id === item.optionalItemId)))
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
      function createMaterial(item: AiQuoteDraftWorkItem) {
        const area = areaRecords.get(areaKey(item.areaScope, item.areaName))
        return createAiDraftMaterialItem(item, area ?? { scope: item.areaScope, name: item.areaName.trim() }, selection.photoAdjustments.has(item.id))
      }
      const materials = workItems.filter(item => item.optionalItemId === null).map(createMaterial)
      const jobberQuoteLines: JobberQuoteLineItemDraft[] = []
      const optionLineLinks: Array<{ lineId: string; optionId: string }> = []
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
      const totalIndex = jobberQuoteLines.findIndex(line => line.kind === 'line_item' && line.optional !== true && line.clientVisible !== false && new Decimal(line.quantity).gt(0) && /^total\b/i.test(line.name.trim()))
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
      const removedOptionIds = new Set(mode === 'replace'
        ? current.jobberQuoteLines.filter(line => !line.jobberLineItemId).map(line => current.aiLineMeta[line.id]?.optionId)
        : [])
      const keptOptionIds = new Set(current.jobberQuoteLines.filter(line => line.jobberLineItemId).map(line => current.aiLineMeta[line.id]?.optionId))
      let options = current.options.filter(option => !removedOptionIds.has(option.id) || keptOptionIds.has(option.id))
      for (const item of optionalItems) {
        const key = lineKey(item.name)
        if (seenKeys.has(key) || templateKeys.has(key)) {
          removedDuplicateCount++
          continue
        }
        seenKeys.add(key)
        options = options.filter(option => lineKey(option.title) !== key)
        const optionWorkItems = workItems.filter(workItem => workItem.optionalItemId === item.id)
        const scopeCounts = new Map<AiScope, number>()
        for (const workItem of optionWorkItems) {
          scopeCounts.set(workItem.areaScope, (scopeCounts.get(workItem.areaScope) ?? 0) + 1)
        }
        const scope = [...scopeCounts].sort((a, b) => b[1] - a[1])[0]?.[0]
        const draftFormula = scope && selection.formulaScopes.has(scope)
          ? draft.formulaSelections.find(formula => formula.scope === scope) : undefined
        const formula = draftFormula ?? (scope ? current.areaFormulaSelections[scope] : { selectedMin: 4 as const, selectedMax: 1 as const })
        const lineId = generateId()
        const optionId = generateId()
        jobberQuoteLines.push({
          id: lineId, kind: 'line_item', name: item.name, description: item.description,
          quantity: '1', unitPrice: '0.00', taxable: true, clientVisible: true,
          optional: false, recommended: false, selected: false,
          optionalWritePolicy: 'set_false', recommendedWritePolicy: 'set_false',
        })
        options.push({
          id: optionId, title: item.name, materials: optionWorkItems.map(createMaterial),
          selectedMin: formula.selectedMin, selectedMax: formula.selectedMax, isExpanded: true,
        })
        optionLineLinks.push({ lineId, optionId })
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
        options,
        optionLineLinks,
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

export function restoreAiOptionLineLinks(
  lines: JobberQuoteLineItemDraft[],
  options: QuoteOptionItem[],
  aiLineMeta: NonNullable<QuoteFormDraft['aiLineMeta']>,
): NonNullable<QuoteFormDraft['aiLineMeta']> {
  const metadata = { ...aiLineMeta }
  const linkedOptionIds = new Set(Object.values(metadata).map(meta => meta.optionId))
  for (const line of lines) {
    if (line.kind !== 'line_item' || Object.hasOwn(metadata, line.id) || line.clientVisible === false
      || line.optional === true || line.paintComparisonKey !== undefined || /^total/i.test(lineKey(line.name))) continue
    const option = options.find(option => !linkedOptionIds.has(option.id) && lineKey(option.title) === lineKey(line.name)
      && getQuoteOptionImportFingerprint(option) === null)
    if (!option) continue
    metadata[line.id] = { priceSource: 'none', priceWeight: 0, catalogUnitPrice: null, optionId: option.id }
    linkedOptionIds.add(option.id)
  }
  return metadata
}

export function reallocateAiLinePrices(
  lines: JobberQuoteLineItemDraft[],
  aiLineMeta: Record<string, { priceSource: AiPriceSource; priceWeight: number; catalogUnitPrice: string | null; optionId?: string }>,
  finalTotal: Decimal.Value,
  optionSubtotals?: Record<string, string>,
): { lines: JobberQuoteLineItemDraft[]; result: AllocationResult } {
  const aiLines = lines.filter((line) => Object.hasOwn(aiLineMeta, line.id) && aiLineMeta[line.id].optionId === undefined)
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
    lines: lines.map((line) => {
      const meta = aiLineMeta[line.id]
      if (!Object.hasOwn(aiLineMeta, line.id)) return line
      if (meta.optionId !== undefined) {
        const subtotal = optionSubtotals?.[meta.optionId]
        return subtotal === undefined ? line : { ...line, unitPrice: new Decimal(subtotal).toFixed(2) }
      }
      return { ...line, unitPrice: result.unitPrices[line.id] }
    }),
    result,
  }
}
