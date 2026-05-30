import { createQuote, updateQuote } from '@/lib/actions/quotes'
import type { PricingSettings } from '@/lib/calculator'
import { decimalFromInput } from '@/lib/quote-labour'
import type { JobberQuoteDraft } from '@/lib/jobber/mapper'
import { calculateMainQuoteTotals } from './quote-calculation-totals'
import type { AreaFormulaSelections, FormulaNumber, JobberQuoteLineItemDraft, MaterialItem, QuoteMemoItem, QuoteOptionItem } from './types'

export interface QuoteFormSavePayloadInput {
  settings: PricingSettings
  initialQuoteId?: string
  customerName: string
  customerAddress: string
  jobberQuoteId: string
  jobberQuoteLookup: string
  jobberQuoteDraft: JobberQuoteDraft | null
  deletedJobberLineItemIds: string[]
  jobberQuoteLines: JobberQuoteLineItemDraft[]
  workType: string
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
  areaFormulaSelections?: AreaFormulaSelections
  materials: MaterialItem[]
  options: QuoteOptionItem[]
  memos: QuoteMemoItem[]
}

export function buildQuoteSavePayload({
  settings,
  customerName,
  customerAddress,
  jobberQuoteId,
  jobberQuoteLookup,
  jobberQuoteDraft,
  deletedJobberLineItemIds,
  jobberQuoteLines,
  workType,
  selectedMin,
  selectedMax,
  areaFormulaSelections,
  materials,
  options,
  memos,
}: QuoteFormSavePayloadInput) {
  const normalizedAreaFormulaSelections = areaFormulaSelections ?? {
    interior: { selectedMin, selectedMax },
    exterior: { selectedMin, selectedMax },
  }
  const totals = calculateMainQuoteTotals({
    materials,
    selectedMin,
    selectedMax,
    areaFormulaSelections: normalizedAreaFormulaSelections,
    settings,
  })

  return {
    customerName,
    customerAddress,
    jobberQuoteId: jobberQuoteId || jobberQuoteLookup,
    jobberSnapshot: jobberQuoteDraft ?? undefined,
    jobberSaveMode: 'priced_line_items',
    deletedJobberLineItemIds,
    jobberQuoteLines: jobberQuoteLines.map((line, index) => ({
      kind: line.kind,
      name: line.name.trim() || (line.kind === 'text' ? `Text ${index + 1}` : `Line item ${index + 1}`),
      description: line.description,
      quantity: Number(decimalFromInput(line.quantity).toString()),
      unitPrice: Number(decimalFromInput(line.unitPrice).toString()),
      taxable: line.taxable,
      clientVisible: line.clientVisible,
      jobberLineItemId: line.jobberLineItemId,
      linkedProductOrServiceId: line.linkedProductOrServiceId,
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
      productId: item.productId,
      productNameSnapshot: item.name,
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
        productId: item.productId,
        productNameSnapshot: item.name,
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
    ? updateQuote({ ...payload, id: input.initialQuoteId })
    : createQuote(payload)
}
