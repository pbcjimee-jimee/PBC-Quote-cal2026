import Decimal from 'decimal.js'
import {
  DEFAULT_PRICING_SETTINGS,
  calculateAllFormulas,
  calculateFinal,
  calculateSubtotal,
  type PricingSettings,
} from './calculator'
import { DULUX_PAINT_PRODUCTS } from './products/dulux-paints'
import { normalizeRrpProduct, type ProductRecord } from './products/types'
import type { QuoteInput } from './validators'

export type { ProductRecord }

export interface QuoteRecord {
  id: string
  customerName: string | null
  customerAddress: string | null
  jobberQuoteId: string | null
  areaSqft: number | null
  workType: string | null
  workingDays: string
  labourPerDay: string
  formula1Total: string
  formula2Total: string
  formula3Total: string
  formula4Total: string
  formula5Total: string
  selectedMin: 1 | 2 | 3 | 4 | 5
  selectedMax: 1 | 2 | 3 | 4 | 5
  subtotal: string
  finalTotal: string
  pricingSettingsSnapshot: PricingSettings
  createdAt: string
  items: QuoteItemRecord[]
}

export interface QuoteItemRecord {
  id: string
  quoteId: string
  productId: string | null
  productNameSnapshot: string
  marketPriceSnapshot: string
  actualPriceSnapshot: string
  quantity: string
  isCustom: boolean
  position: number
}

const products: ProductRecord[] = DULUX_PAINT_PRODUCTS.map(normalizeRrpProduct)

let pricingSettings: PricingSettings = { ...DEFAULT_PRICING_SETTINGS }
let quotes: QuoteRecord[] = []

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function money(value: Decimal | number | string): string {
  return new Decimal(value).toFixed(2)
}

export function getDevPricingSettings(): PricingSettings {
  return { ...pricingSettings }
}

export function updateDevPricingSettings(settings: PricingSettings): PricingSettings {
  pricingSettings = { ...settings }
  return getDevPricingSettings()
}

export function searchDevProducts(query: string, limit = 8): ProductRecord[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return products.filter((product) => product.active).slice(0, limit)

  return products
    .filter((product) => {
      const haystack = [
        product.name,
        product.manufacturer,
        product.type,
        product.colorCode,
        product.category,
        product.productLine,
        product.base,
        product.sheen,
        product.unit,
        product.volumeLitres,
        product.productCode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return product.active && haystack.includes(needle)
    })
    .slice(0, limit)
}

export function listDevProducts(query = '', limit = 200): ProductRecord[] {
  return searchDevProducts(query, limit)
}

export function listDevQuotes(query = ''): QuoteRecord[] {
  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? quotes.filter((quote) =>
        [quote.customerName, quote.customerAddress, quote.jobberQuoteId]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      )
    : quotes

  return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getDevQuote(id: string): QuoteRecord | null {
  return quotes.find((quote) => quote.id === id) ?? null
}

export function createDevQuote(input: QuoteInput): QuoteRecord {
  const settings = getDevPricingSettings()
  const formulaResults = calculateAllFormulas(
    {
      workingDays: input.workingDays,
      labourPerDay: input.labourPerDay,
      materialMarket: input.materialMarket,
      materialActual: input.materialActual,
    },
    settings
  )
  const subtotal = calculateSubtotal(formulaResults, input.selectedMin, input.selectedMax)
  const finalTotal = calculateFinal(subtotal)
  const id = nextId('quote')

  const quote: QuoteRecord = {
    id,
    customerName: input.customerName?.trim() || null,
    customerAddress: input.customerAddress?.trim() || null,
    jobberQuoteId: input.jobberQuoteId?.trim() || null,
    areaSqft: input.areaSqft ?? null,
    workType: input.workType?.trim() || null,
    workingDays: money(input.workingDays),
    labourPerDay: money(input.labourPerDay),
    formula1Total: money(formulaResults[0].total),
    formula2Total: money(formulaResults[1].total),
    formula3Total: money(formulaResults[2].total),
    formula4Total: money(formulaResults[3].total),
    formula5Total: money(formulaResults[4].total),
    selectedMin: input.selectedMin,
    selectedMax: input.selectedMax,
    subtotal: money(subtotal),
    finalTotal: money(finalTotal),
    pricingSettingsSnapshot: settings,
    createdAt: new Date().toISOString(),
    items: input.items.map((item, index) => ({
      id: nextId('item'),
      quoteId: id,
      productId: item.productId ?? null,
      productNameSnapshot: item.productNameSnapshot,
      marketPriceSnapshot: money(item.marketPriceSnapshot),
      actualPriceSnapshot: money(item.actualPriceSnapshot),
      quantity: money(item.quantity),
      isCustom: item.isCustom,
      position: item.position ?? index,
    })),
  }

  quotes = [quote, ...quotes]
  return quote
}

export function resetDevData(): void {
  pricingSettings = { ...DEFAULT_PRICING_SETTINGS }
  quotes = []
}
