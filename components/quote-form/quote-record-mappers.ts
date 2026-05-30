import type { QuoteRecord } from '@/lib/dev-data'
import type { JobberQuoteLineItemDraft, MaterialItem, QuoteMemoItem, QuoteOptionItem } from './types'

type SavedMaterialItem = {
  id: string
  productId: string | null
  productNameSnapshot: string
  marketPriceSnapshot: string
  actualPriceSnapshot: string
  quantity: string
  workingDays: string | null
  labourPerDay: string | null
  areaId: string | null
  areaNameSnapshot: string | null
  areaScopeSnapshot: 'interior' | 'exterior' | null
  isCustom: boolean
}

export function mapSavedItemsToMaterials(items: SavedMaterialItem[]): MaterialItem[] {
  return items.map((item) => ({
    id: item.id,
    productId: item.productId ?? undefined,
    name: item.productNameSnapshot,
    marketPrice: item.marketPriceSnapshot,
    actualPrice: item.actualPriceSnapshot,
    quantity: item.quantity,
    workingDays: item.workingDays ?? '0',
    labourPerDay: item.labourPerDay ?? '0',
    areaId: item.areaId ?? undefined,
    areaName: item.areaNameSnapshot ?? undefined,
    areaScope: item.areaScopeSnapshot ?? undefined,
    isCustom: item.isCustom,
  }))
}

export function mapQuoteItemsToMaterials(quote: QuoteRecord): MaterialItem[] {
  return mapSavedItemsToMaterials(quote.items)
}

export function mapQuoteOptionsToState(quote: QuoteRecord): QuoteOptionItem[] {
  return quote.options.map((option) => ({
    id: option.id,
    title: option.title,
    selectedMin: option.selectedMin,
    selectedMax: option.selectedMax,
    isExpanded: false,
    materials: mapSavedItemsToMaterials(option.items),
  }))
}

export function mapQuoteMemosToState(quote: QuoteRecord): QuoteMemoItem[] {
  return quote.memos.map((memo) => ({
    id: memo.id,
    body: memo.body,
  }))
}

export function mapJobberQuoteLinesToState(quote: QuoteRecord): JobberQuoteLineItemDraft[] {
  return quote.jobberQuoteLines.map((line) => ({
    id: line.id,
    kind: line.kind,
    name: line.name,
    description: line.description ?? '',
    quantity: line.quantity ?? '1',
    unitPrice: line.unitPrice ?? '0',
    taxable: line.taxable,
    clientVisible: line.clientVisible,
    jobberLineItemId: line.jobberLineItemId ?? undefined,
    linkedProductOrServiceId: line.linkedProductOrServiceId ?? undefined,
  }))
}
