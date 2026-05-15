import Decimal from 'decimal.js'
import {
  DEFAULT_PRICING_SETTINGS,
  calculateAllFormulas,
  calculateFinal,
  calculateSubtotal,
  type PricingSettings,
} from './calculator'
import { calculateLabourTotals } from './quote-labour'
import { DULUX_PAINT_PRODUCTS } from './products/dulux-paints'
import { normalizeRrpProduct, type ProductRecord } from './products/types'
import type { AreaInput } from './validators'
import type { QuoteInput } from './validators'
import type { AreaRecord } from './areas/types'
import type { Database } from './supabase/types'
import type { JobberQuoteDraft } from './jobber/mapper'

export type { ProductRecord }

type DevQuoteInput = Omit<QuoteInput, 'options'> & {
  options?: QuoteInput['options']
}

export interface QuoteRecord {
  id: string
  customerName: string | null
  customerAddress: string | null
  jobberQuoteId: string | null
  jobberSnapshot: JobberQuoteDraft | null
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
  options: QuoteOptionRecord[]
}

export interface QuoteItemRecord {
  id: string
  quoteId: string
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
  position: number
}

export interface QuoteOptionRecord {
  id: string
  quoteId: string
  title: string
  workingDays: string
  labourPerDay: string
  materialMarket: string
  materialActual: string
  formula1Total: string
  formula2Total: string
  formula3Total: string
  formula4Total: string
  formula5Total: string
  selectedMin: 1 | 2 | 3 | 4 | 5
  selectedMax: 1 | 2 | 3 | 4 | 5
  subtotal: string
  finalTotal: string
  position: number
  items: QuoteOptionItemRecord[]
}

export interface QuoteOptionItemRecord extends Omit<QuoteItemRecord, 'quoteId'> {
  optionId: string
}

let products: ProductRecord[] = DULUX_PAINT_PRODUCTS.map(normalizeRrpProduct)

interface DevDataStore {
  pricingSettings: PricingSettings
  quotes: QuoteRecord[]
  areas: AreaRecord[]
}

const storeOwner = globalThis as typeof globalThis & {
  __pbcDevDataStore?: DevDataStore
}

const store = storeOwner.__pbcDevDataStore ??= {
  pricingSettings: { ...DEFAULT_PRICING_SETTINGS },
  quotes: [],
  areas: [],
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function money(value: Decimal | number | string): string {
  return new Decimal(value).toFixed(2)
}

function searchTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

export function getDevPricingSettings(): PricingSettings {
  return { ...store.pricingSettings }
}

export function updateDevPricingSettings(settings: PricingSettings): PricingSettings {
  store.pricingSettings = { ...settings }
  return getDevPricingSettings()
}

export function listDevAreas(): AreaRecord[] {
  return [...store.areas]
    .filter((area) => area.active)
    .sort((a, b) => a.scope.localeCompare(b.scope) || a.position - b.position || a.name.localeCompare(b.name))
}

export function createDevArea(input: AreaInput): AreaRecord {
  const name = input.name.trim()
  const existing = store.areas.find((area) => area.scope === input.scope && area.name.toLowerCase() === name.toLowerCase())
  if (existing) return existing

  const area: AreaRecord = {
    id: nextId('area'),
    scope: input.scope,
    name,
    active: true,
    position: store.areas.filter((item) => item.scope === input.scope).length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  store.areas = [...store.areas, area]
  return area
}

export function searchDevProducts(query: string, limit = 8): ProductRecord[] {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return products.filter((product) => product.active).slice(0, limit)

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

      return product.active && tokens.every((token) => haystack.includes(token))
    })
    .slice(0, limit)
}

export function listDevProducts(query = '', limit = 200): ProductRecord[] {
  return searchDevProducts(query, limit)
}

export function createDevProductsFromImport(
  rows: Array<{
    manufacturer: string
    productLine: string
    base: string
    sheen: string
    volumeLitres: string
    rrpPrice: string
  }>
): ProductRecord[] {
  const created = rows.map((row) => {
    const manufacturer = row.manufacturer.trim()
    const productLine = row.productLine.trim()
    const base = row.base.trim()
    const sheen = row.sheen.trim()
    const volumeLitres = row.volumeLitres.trim()
    const rrpPrice = row.rrpPrice.trim()
    const volumeText = volumeLitres ? `${volumeLitres}L` : 'L'
    const nameParts = [manufacturer, productLine, sheen, base, volumeText].filter(Boolean)
    const name = nameParts.join(' ')
    const product: ProductRecord = {
      id: nextId('product-import'),
      name,
      manufacturer,
      type: productLine,
      unit: volumeText,
      marketPrice: rrpPrice,
      actualPrice: rrpPrice,
      colorCode: base || null,
      active: true,
      category: productLine,
      productLine,
      base: base || null,
      sheen: sheen || null,
      volumeLitres: volumeLitres || null,
      price: rrpPrice,
      rrpPrice,
    }

    return normalizeRrpProduct(product)
  })

  products = [...created, ...products]
  return created
}

export function createDevProduct(input: {
  name: string
  manufacturer: string | null
  type: string | null
  productLine: string
  base: string | null
  sheen: string | null
  unit: string
  volumeLitres: string | null
  rrpPrice: string
}): ProductRecord {
  const product: ProductRecord = {
    id: crypto.randomUUID(),
    name: input.name,
    manufacturer: input.manufacturer,
    type: input.type,
    unit: input.unit,
    marketPrice: input.rrpPrice,
    actualPrice: input.rrpPrice,
    colorCode: input.base,
    active: true,
    category: input.type,
    productLine: input.productLine,
    base: input.base,
    sheen: input.sheen,
    volumeLitres: input.volumeLitres,
    price: input.rrpPrice,
    rrpPrice: input.rrpPrice,
  }

  const normalized = normalizeRrpProduct(product)
  products = [normalized, ...products]
  return normalized
}

export function updateDevProduct(
  id: string,
  updates: Partial<Omit<Database['public']['Tables']['products']['Insert'], 'updated_at' | 'created_at' | 'id'>>
): ProductRecord | null {
  const index = products.findIndex((product) => product.id === id)
  if (index === -1) return null

  const current = products[index]
  const updated: ProductRecord = {
    ...current,
    ...updates,
    name: updates.name ?? current.name,
    manufacturer: updates.manufacturer ?? current.manufacturer,
    type: updates.type ?? current.type,
    productLine: updates.product_line ?? current.productLine,
    base: updates.base ?? current.base,
    sheen: updates.sheen ?? current.sheen,
    unit: updates.unit ?? current.unit,
    volumeLitres: updates.volume_litres ?? current.volumeLitres,
    marketPrice: updates.market_price ?? current.marketPrice,
    actualPrice: updates.actual_price ?? current.actualPrice,
    rrpPrice: updates.rrp_price ?? current.rrpPrice,
  }

  products = [...products]
  products[index] = normalizeRrpProduct(updated)
  return products[index]
}

export function deleteDevProduct(id: string): ProductRecord | null {
  const index = products.findIndex((product) => product.id === id)
  if (index === -1) return null

  const deleted = {
    ...products[index],
    active: false,
  }
  products = [...products]
  products[index] = deleted
  return deleted
}

export function listDevQuotes(query = ''): QuoteRecord[] {
  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? store.quotes.filter((quote) =>
        [quote.customerName, quote.customerAddress, quote.jobberQuoteId]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      )
    : store.quotes

  return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getDevQuote(id: string): QuoteRecord | null {
  return store.quotes.find((quote) => quote.id === id) ?? null
}

function buildDevQuoteRecord(id: string, createdAt: string, input: DevQuoteInput, settings: PricingSettings): QuoteRecord {
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

  return {
    id,
    customerName: input.customerName?.trim() || null,
    customerAddress: input.customerAddress?.trim() || null,
    jobberQuoteId: input.jobberQuoteId?.trim() || null,
    jobberSnapshot: input.jobberSnapshot ?? null,
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
    createdAt,
    items: input.items.map((item, index) => ({
      id: nextId('item'),
      quoteId: id,
      productId: item.productId ?? null,
      productNameSnapshot: item.productNameSnapshot,
      marketPriceSnapshot: money(item.marketPriceSnapshot),
      actualPriceSnapshot: money(item.actualPriceSnapshot),
      quantity: money(item.quantity),
      workingDays: item.workingDays === undefined ? null : money(item.workingDays),
      labourPerDay: item.labourPerDay === undefined ? null : money(item.labourPerDay),
      areaId: item.areaId ?? null,
      areaNameSnapshot: item.areaNameSnapshot ?? null,
      areaScopeSnapshot: item.areaScopeSnapshot ?? null,
      isCustom: item.isCustom,
      position: item.position ?? index,
    })),
    options: (input.options ?? []).map((option, optionIndex) => buildDevQuoteOptionRecord(id, option, option.position ?? optionIndex, settings)),
  }
}

function buildDevQuoteOptionRecord(
  quoteId: string,
  option: QuoteInput['options'][number],
  position: number,
  settings: PricingSettings
): QuoteOptionRecord {
  const id = nextId('option')
  const labour = calculateLabourTotals(option.items)
  const materialMarket = option.items.reduce(
    (total, item) => total.add(new Decimal(item.marketPriceSnapshot).mul(item.quantity)),
    new Decimal(0)
  )
  const materialActual = option.items.reduce(
    (total, item) => total.add(new Decimal(item.actualPriceSnapshot).mul(item.quantity)),
    new Decimal(0)
  )
  const formulaResults = calculateAllFormulas(
    {
      workingDays: labour.labourDays,
      labourPerDay: 1,
      materialMarket,
      materialActual,
    },
    settings
  )
  const subtotal = calculateSubtotal(formulaResults, option.selectedMin, option.selectedMax)
  const finalTotal = calculateFinal(subtotal)

  return {
    id,
    quoteId,
    title: option.title.trim(),
    workingDays: money(labour.workingDays),
    labourPerDay: money(labour.labourPerDay),
    materialMarket: money(materialMarket),
    materialActual: money(materialActual),
    formula1Total: money(formulaResults[0].total),
    formula2Total: money(formulaResults[1].total),
    formula3Total: money(formulaResults[2].total),
    formula4Total: money(formulaResults[3].total),
    formula5Total: money(formulaResults[4].total),
    selectedMin: option.selectedMin,
    selectedMax: option.selectedMax,
    subtotal: money(subtotal),
    finalTotal: money(finalTotal),
    position,
    items: option.items.map((item, index) => ({
      id: nextId('option-item'),
      optionId: id,
      productId: item.productId ?? null,
      productNameSnapshot: item.productNameSnapshot,
      marketPriceSnapshot: money(item.marketPriceSnapshot),
      actualPriceSnapshot: money(item.actualPriceSnapshot),
      quantity: money(item.quantity),
      workingDays: item.workingDays === undefined ? null : money(item.workingDays),
      labourPerDay: item.labourPerDay === undefined ? null : money(item.labourPerDay),
      areaId: item.areaId ?? null,
      areaNameSnapshot: item.areaNameSnapshot ?? null,
      areaScopeSnapshot: item.areaScopeSnapshot ?? null,
      isCustom: item.isCustom,
      position: item.position ?? index,
    })),
  }
}

export function createDevQuote(input: DevQuoteInput): QuoteRecord {
  const settings = getDevPricingSettings()
  const id = nextId('quote')
  const quote = buildDevQuoteRecord(id, new Date().toISOString(), input, settings)

  store.quotes = [quote, ...store.quotes]
  return quote
}

export function updateDevQuote(id: string, input: DevQuoteInput): QuoteRecord | null {
  const index = store.quotes.findIndex((quote) => quote.id === id)
  if (index === -1) return null

  const current = store.quotes[index]
  const quote = buildDevQuoteRecord(id, current.createdAt, input, current.pricingSettingsSnapshot)
  store.quotes = [...store.quotes]
  store.quotes[index] = quote
  return quote
}

export function deleteDevQuote(id: string): boolean {
  const nextQuotes = store.quotes.filter((quote) => quote.id !== id)
  const deleted = nextQuotes.length !== store.quotes.length
  store.quotes = nextQuotes
  return deleted
}

export function resetDevData(): void {
  store.pricingSettings = { ...DEFAULT_PRICING_SETTINGS }
  store.quotes = []
  store.areas = []
  products = DULUX_PAINT_PRODUCTS.map(normalizeRrpProduct)
}
