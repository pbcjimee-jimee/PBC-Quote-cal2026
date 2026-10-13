import { createQuote, updateQuote } from '@/lib/actions/quotes'
import type { PricingSettings } from '@/lib/calculator'
import Decimal from 'decimal.js'
import { decimalFromInput } from '@/lib/quote-labour'
import { parsePublicLineMoney, signedPublicDecimalFromInput } from '@/lib/public-line-money'
import type { PaintComparison } from '@/lib/paint-comparison-types'
import type { JobberQuoteDraft } from '@/lib/jobber/mapper'
import type { JobberSnapshotChangeStatus } from '@/lib/jobber/snapshot-diff'
import type { JobberSnapshotChangeSummaryItem } from '@/lib/dev-data'
import { calculateMainQuoteTotals } from './quote-calculation-totals'
import { isLocalDraftJobberQuoteDraft } from './quote-draft'
import type { AreaFormulaSelections, FormulaNumber, JobberQuoteLineItemDraft, MaterialItem, QuoteMemoItem, QuoteOptionItem } from './types'

export interface QuoteFormSavePayloadInput {
  settings: PricingSettings
  initialQuoteId?: string
  initialQuoteVersion?: number
  syncJobber?: boolean
  customerName: string
  customerAddress: string
  jobberQuoteId: string
  jobberQuoteLookup: string
  jobberQuoteDraft: JobberQuoteDraft | null
  jobberSnapshotRefreshedAt?: string | null
  jobberSnapshotChangeStatus?: JobberSnapshotChangeStatus
  jobberSnapshotChangeSummary?: JobberSnapshotChangeSummaryItem[]
  deletedJobberLineItemIds: string[]
  jobberQuoteLines: JobberQuoteLineItemDraft[]
  workType: string
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
  areaFormulaSelections?: AreaFormulaSelections
  materials: MaterialItem[]
  options: QuoteOptionItem[]
  memos: QuoteMemoItem[]
  paintComparison?: PaintComparison | null
}

export interface JobberSyncPreviewLine {
  kind: 'line_item' | 'text'
  name?: string
  description?: string | null
  quantity?: Decimal | number | string | null
  unitPrice?: Decimal | number | string | null
  totalPrice?: Decimal | number | string | null
  taxable?: boolean
  clientVisible?: boolean
  jobberLineItemId?: string | null
  linkedProductOrServiceId?: string | null
  optional?: boolean | null
  selected?: boolean | null
  optionalWritePolicy?: 'preserve' | 'set_true' | 'set_false'
}

export interface JobberSyncPreviewInput {
  pbcSubtotal: Decimal | number | string
  jobberQuoteLines: JobberSyncPreviewLine[]
}

export function calculateJobberSyncPreview({ pbcSubtotal, jobberQuoteLines }: JobberSyncPreviewInput) {
  const pbcSubtotalDecimal = decimalFromInput(pbcSubtotal)
  const lineTotal = (line: JobberSyncPreviewLine) => line.totalPrice !== null && line.totalPrice !== undefined && String(line.totalPrice).trim() !== ''
    ? signedPublicDecimalFromInput(line.totalPrice)
    : decimalFromInput(line.quantity).mul(signedPublicDecimalFromInput(line.unitPrice))
  const isOptional = (line: JobberSyncPreviewLine) => line.optionalWritePolicy === 'set_true' || (line.optionalWritePolicy !== 'set_false' && line.optional === true)
  const jobberPublicLineTotal = jobberQuoteLines.reduce((total, line) => {
    if (line.kind !== 'line_item' || line.clientVisible === false) return total
    if (isOptional(line) && line.selected !== true) return total
    return total.add(lineTotal(line))
  }, new Decimal(0))
  const optionalLineTotal = jobberQuoteLines.reduce((total, line) => line.kind === 'line_item' && line.clientVisible !== false && isOptional(line) && line.selected !== true ? total.add(lineTotal(line)) : total, new Decimal(0))

  return {
    pbcSubtotal: pbcSubtotalDecimal,
    jobberPublicLineTotal,
    optionalLineTotal,
    withOptionalTotal: jobberPublicLineTotal.add(optionalLineTotal),
    difference: pbcSubtotalDecimal.sub(jobberPublicLineTotal),
  }
}

export function buildQuoteSavePayload({
  settings,
  customerName,
  customerAddress,
  jobberQuoteId,
  jobberQuoteDraft,
  jobberSnapshotRefreshedAt,
  jobberSnapshotChangeStatus,
  jobberSnapshotChangeSummary,
  deletedJobberLineItemIds,
  jobberQuoteLines,
  workType,
  selectedMin,
  selectedMax,
  areaFormulaSelections,
  materials,
  options,
  memos,
  paintComparison,
}: QuoteFormSavePayloadInput) {
  const normalizedAreaFormulaSelections = areaFormulaSelections ?? {
    interior: { selectedMin, selectedMax },
    exterior: { selectedMin, selectedMax },
    roof: { selectedMin, selectedMax },
  }
  const totals = calculateMainQuoteTotals({
    materials,
    selectedMin,
    selectedMax,
    areaFormulaSelections: normalizedAreaFormulaSelections,
    settings,
  })
  const jobberSnapshot = jobberQuoteDraft && !isLocalDraftJobberQuoteDraft(jobberQuoteDraft)
    ? jobberQuoteDraft
    : undefined

  return {
    customerName,
    customerAddress,
    jobberQuoteId: jobberQuoteId || undefined,
    jobberSnapshot,
    jobberSnapshotRefreshedAt: jobberSnapshot ? jobberSnapshotRefreshedAt ?? undefined : undefined,
    jobberSnapshotChangeStatus: jobberSnapshot ? jobberSnapshotChangeStatus : undefined,
    jobberSnapshotChangeSummary: jobberSnapshot ? jobberSnapshotChangeSummary : undefined,
    jobberSaveMode: 'priced_line_items',
    deletedJobberLineItemIds,
    paintComparisons: paintComparison ? [paintComparison] : [],
    jobberQuoteLines: jobberQuoteLines.map((line, index) => ({
      kind: line.kind,
      name: line.name.trim() || (line.kind === 'text' ? `Text ${index + 1}` : `Line item ${index + 1}`),
      description: line.description,
      quantity: Number(decimalFromInput(line.quantity).toString()),
      unitPrice: (() => { const price = parsePublicLineMoney(line.unitPrice); if (!price.ok) throw new Error('Enter a valid public unit price.'); return Number(price.value.toString()) })(),
      taxable: line.taxable,
      clientVisible: line.clientVisible,
      jobberLineItemId: line.jobberLineItemId,
      linkedProductOrServiceId: line.linkedProductOrServiceId,
      optional: line.optional,
      recommended: line.recommended,
      selected: line.selected,
      optionalWritePolicy: line.optionalWritePolicy,
      recommendedWritePolicy: line.recommendedWritePolicy,
      paintComparisonKey: line.paintComparisonKey,
      position: index,
    })),
    workType,
    workingDays: Number(totals.totalWorkingDays.toString()),
    labourPerDay: Number(totals.totalLabourPerDay.toString()),
    materialMarket: Number(totals.materialMarket.toString()),
    materialActual: Number(totals.materialActual.toString()),
    selectedMin,
    selectedMax,
    areaFormulaSelections: normalizedAreaFormulaSelections,
    items: materials.map((item, index) => ({
      sourceItemId: item.id,
      logicalKey: item.logicalKey,
      timberRole: item.timberRole,
      productId: item.productId,
      productNameSnapshot: item.name,
      memo: item.memo ?? '',
      marketPriceSnapshot: Number(decimalFromInput(item.marketPrice).toString()),
      actualPriceSnapshot: Number(decimalFromInput(item.actualPrice).toString()),
      quantity: Number(decimalFromInput(item.quantity).toString()),
      workingDays: Number(decimalFromInput(item.workingDays).toString()),
      labourPerDay: Number(decimalFromInput(item.labourPerDay).toString()),
      areaId: item.areaId,
      areaNameSnapshot: item.areaName,
      areaScopeSnapshot: item.areaScope,
      isCustom: item.isCustom,
      position: index,
    })),
    options: options.map((option, optionIndex) => ({
      title: option.title.trim() || `Option ${optionIndex + 1}`,
      selectedMin: option.selectedMin,
      selectedMax: option.selectedMax,
      position: optionIndex,
      items: option.materials.map((item, itemIndex) => ({
        sourceItemId: item.id,
        logicalKey: item.logicalKey,
        timberRole: item.timberRole,
        productId: item.productId,
        productNameSnapshot: item.name,
        memo: item.memo ?? '',
        marketPriceSnapshot: Number(decimalFromInput(item.marketPrice).toString()),
        actualPriceSnapshot: Number(decimalFromInput(item.actualPrice).toString()),
        quantity: Number(decimalFromInput(item.quantity).toString()),
        workingDays: Number(decimalFromInput(item.workingDays).toString()),
        labourPerDay: Number(decimalFromInput(item.labourPerDay).toString()),
        areaId: item.areaId,
        areaNameSnapshot: item.areaName,
        areaScopeSnapshot: item.areaScope,
        isCustom: item.isCustom,
        position: itemIndex,
      })),
    })),
    memos: memos
      .map((memo, memoIndex) => ({
        body: memo.body.trim(),
        position: memoIndex,
      }))
      .filter((memo) => memo.body.length > 0),
  }
}

export async function saveQuoteFormPayload(input: QuoteFormSavePayloadInput) {
  const payload = buildQuoteSavePayload(input)
  return input.initialQuoteId
    ? updateQuote({
        ...payload,
        id: input.initialQuoteId,
        expectedVersion: input.initialQuoteVersion,
        syncJobber: input.syncJobber ?? false,
      })
    : createQuote({ ...payload, syncJobber: input.syncJobber ?? false })
}
