import Decimal from 'decimal.js'
import {
  DEFAULT_PRICING_SETTINGS,
  calculateAllFormulas,
  calculateFinal,
  calculateRoofSubtotal,
  calculateSubtotal,
  type PricingSettings,
} from './calculator'
import { calculateDisplayLabourTotals, calculateFormulaLabourDays, calculateLabourTotals } from './quote-labour'
import { DULUX_PAINT_PRODUCTS } from './products/dulux-paints'
import { normalizeRrpProduct, type ProductRecord } from './products/types'
import { normalizeProductService, type ProductServiceRecord } from './product-services/types'
import { normalizeQuoteLineTemplate, type QuoteLineTemplateRecord } from './quote-line-templates/types'
import type { AreaInput } from './validators'
import type { JobberQuoteLineInput, JobberSaveModeInput, QuoteInput, QuoteLineTemplateCreateInput } from './validators'
import type { AreaRecord } from './areas/types'
import type { Database } from './supabase/types'
import type { JobberQuoteDraft } from './jobber/mapper'

export type { ProductRecord }

type DevQuoteInput = Omit<QuoteInput, 'deletedJobberLineItemIds' | 'jobberQuoteLines' | 'options' | 'memos'> & {
  jobberQuoteLines?: JobberQuoteLineInput[]
  options?: QuoteInput['options']
  memos?: QuoteInput['memos']
}

export interface QuoteRecord {
  id: string
  customerName: string | null
  customerAddress: string | null
  jobberQuoteId: string | null
  jobberSnapshot: JobberQuoteDraft | null
  jobberSaveMode: JobberSaveModeInput | null
  jobberSyncStatus: JobberSyncStatus
  jobberLastSyncedAt: string | null
  jobberSyncError: string | null
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
  interiorSelectedMin?: 1 | 2 | 3 | 4 | 5
  interiorSelectedMax?: 1 | 2 | 3 | 4 | 5
  exteriorSelectedMin?: 1 | 2 | 3 | 4 | 5
  exteriorSelectedMax?: 1 | 2 | 3 | 4 | 5
  roofSelectedMin?: 1 | 2 | 3 | 4 | 5
  roofSelectedMax?: 1 | 2 | 3 | 4 | 5
  subtotal: string
  finalTotal: string
  pricingSettingsSnapshot: PricingSettings
  createdAt: string
  createdBy: string
  createdByName: string | null
  createdByEmail: string | null
  items: QuoteItemRecord[]
  jobberQuoteLines: JobberQuoteLineRecord[]
  options: QuoteOptionRecord[]
  memos: QuoteMemoRecord[]
  priceRevisions: QuotePriceRevisionRecord[]
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
  areaScopeSnapshot: 'interior' | 'exterior' | 'roof' | null
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

export interface QuoteMemoRecord {
  id: string
  quoteId: string
  body: string
  position: number
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

export interface QuotePriceRevisionRecord {
  id: string
  quoteId: string
  revisionNumber: number
  eventType: 'created' | 'updated'
  previousSubtotal: string | null
  previousFinalTotal: string | null
  newSubtotal: string
  newFinalTotal: string
  previousJobberLinesTotal: string | null
  newJobberLinesTotal: string | null
  previousOptionsSubtotal: string | null
  newOptionsSubtotal: string | null
  previousOptionsFinalTotal: string | null
  newOptionsFinalTotal: string | null
  changedBy: string | null
  changedByName: string | null
  changedByEmail: string | null
  changedAt: string
}

export type JobberSyncStatus = 'not_synced' | 'synced' | 'failed'

export interface JobberQuoteLineRecord {
  id: string
  quoteId: string
  kind: 'line_item' | 'text'
  name: string
  description: string | null
  quantity: string | null
  unitPrice: string | null
  totalPrice: string | null
  taxable: boolean
  clientVisible: boolean
  jobberLineItemId: string | null
  linkedProductOrServiceId: string | null
  position: number
  createdAt: string
  updatedAt: string
}

let products: ProductRecord[] = DULUX_PAINT_PRODUCTS.map(normalizeRrpProduct)
let productServices: ProductServiceRecord[] = []

interface DevDataStore {
  pricingSettings: PricingSettings
  quotes: QuoteRecord[]
  areas: AreaRecord[]
  quoteLineTemplates: QuoteLineTemplateRecord[]
}

const storeOwner = globalThis as typeof globalThis & {
  __pbcDevDataStore?: DevDataStore
}

const store = storeOwner.__pbcDevDataStore ??= {
  pricingSettings: { ...DEFAULT_PRICING_SETTINGS },
  quotes: [],
  areas: [],
  quoteLineTemplates: [],
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function money(value: Decimal | number | string): string {
  return new Decimal(value).toFixed(2)
}

function optionalPublicMoney(value: Decimal | number | string | undefined): string | null {
  return value === undefined ? null : money(value)
}

type FormulaSelection = {
  selectedMin: 1 | 2 | 3 | 4 | 5
  selectedMax: 1 | 2 | 3 | 4 | 5
}

type AreaFormulaInput = Pick<QuoteInput, 'selectedMin' | 'selectedMax' | 'areaFormulaSelections' | 'items'>

function getAreaFormulaSelections(input: AreaFormulaInput): { interior: FormulaSelection; exterior: FormulaSelection; roof: FormulaSelection } {
  const fallback = { selectedMin: input.selectedMin, selectedMax: input.selectedMax }
  return {
    interior: input.areaFormulaSelections?.interior ?? fallback,
    exterior: input.areaFormulaSelections?.exterior ?? fallback,
    roof: input.areaFormulaSelections?.roof ?? fallback,
  }
}

function calculateAreaSubtotalFromInputItems(
  items: QuoteInput['items'],
  selection: FormulaSelection,
  scope: 'interior' | 'exterior' | 'roof',
  settings: PricingSettings
): Decimal {
  const scopedItems = items.filter((item) => item.areaScopeSnapshot === scope)
  const labour = calculateLabourTotals(scopedItems)
  const materialMarket = scopedItems.reduce(
    (total, item) => total.add(new Decimal(item.marketPriceSnapshot).mul(item.quantity)),
    new Decimal(0)
  )
  const materialActual = scopedItems.reduce(
    (total, item) => total.add(new Decimal(item.actualPriceSnapshot).mul(item.quantity)),
    new Decimal(0)
  )
  if (scope === 'roof') {
    return calculateRoofSubtotal({ labourDays: labour.labourDays, materialMarket, materialActual }, settings, selection.selectedMin, selection.selectedMax)
  }

  const formulaResults = calculateAllFormulas(
    {
      workingDays: labour.labourDays,
      labourPerDay: 1,
      materialMarket,
      materialActual,
    },
    settings
  )
  return calculateSubtotal(formulaResults, selection.selectedMin, selection.selectedMax)
}

function calculateMainQuoteSubtotal(input: AreaFormulaInput, formulaResults: ReturnType<typeof calculateAllFormulas>, settings: PricingSettings): Decimal {
  const selections = getAreaFormulaSelections(input)
  const hasAssignedAreaRows = input.items.some((item) =>
    item.areaScopeSnapshot === 'interior' || item.areaScopeSnapshot === 'exterior' || item.areaScopeSnapshot === 'roof'
  )
  if (!hasAssignedAreaRows) return calculateSubtotal(formulaResults, input.selectedMin, input.selectedMax)

  return calculateAreaSubtotalFromInputItems(input.items, selections.interior, 'interior', settings)
    .add(calculateAreaSubtotalFromInputItems(input.items, selections.exterior, 'exterior', settings))
    .add(calculateAreaSubtotalFromInputItems(input.items, selections.roof, 'roof', settings))
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

export function updateDevArea(input: AreaInput & { id: string }): AreaRecord | null {
  const index = store.areas.findIndex((area) => area.id === input.id)
  if (index === -1) return null

  const updated: AreaRecord = {
    ...store.areas[index],
    scope: input.scope,
    name: input.name.trim(),
    active: true,
    updatedAt: new Date().toISOString(),
  }

  store.areas = [...store.areas]
  store.areas[index] = updated
  return updated
}

export function deleteDevArea(id: string): AreaRecord | null {
  const index = store.areas.findIndex((area) => area.id === id)
  if (index === -1) return null

  const deleted: AreaRecord = {
    ...store.areas[index],
    active: false,
    updatedAt: new Date().toISOString(),
  }

  store.areas = [...store.areas]
  store.areas[index] = deleted
  return deleted
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
  return searchDevProducts(query, limit).map((product) => ({
    ...product,
    actualPrice: product.marketPrice,
  }))
}

function rowToDevProductService(
  row: Database['public']['Tables']['product_services']['Insert'] & {
    id?: string
    created_at?: string
    updated_at?: string
  }
): ProductServiceRecord {
  const now = new Date().toISOString()
  return normalizeProductService({
    id: row.id ?? crypto.randomUUID(),
    name: row.name,
    description: row.description ?? null,
    category: row.category ?? null,
    unitPrice: row.unit_price,
    unitCost: row.unit_cost ?? null,
    bookable: row.bookable,
    durationMinutes: row.duration_minutes ?? null,
    quantityEnabled: row.quantity_enabled,
    minimumQuantity: row.minimum_quantity ?? null,
    maximumQuantity: row.maximum_quantity ?? null,
    taxable: row.taxable,
    active: row.active,
    createdAt: row.created_at ?? now,
    updatedAt: row.updated_at ?? now,
  })
}

export function searchDevProductServices(query: string, limit = 100): ProductServiceRecord[] {
  const tokens = searchTokens(query)
  const activeServices = productServices.filter((service) => service.active)
  if (tokens.length === 0) return activeServices.slice(0, limit)

  return activeServices
    .filter((service) => {
      const haystack = [
        service.name,
        service.description,
        service.category,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return tokens.every((token) => haystack.includes(token))
    })
    .slice(0, limit)
}

export function listDevProductServices(query = '', limit = 200): ProductServiceRecord[] {
  return searchDevProductServices(query, limit)
}

function buildDevQuoteLineTemplate(
  id: string,
  createdAt: string,
  input: QuoteLineTemplateCreateInput
): QuoteLineTemplateRecord {
  const now = new Date().toISOString()
  return normalizeQuoteLineTemplate({
    id,
    name: input.name,
    active: true,
    createdAt,
    updatedAt: now,
    items: input.items.map((item, index) => ({
      id: nextId('template-item'),
      templateId: id,
      kind: item.kind,
      name: item.name,
      description: item.description?.trim() || null,
      quantity: item.kind === 'line_item' ? money(item.quantity ?? 0) : null,
      unitPrice: item.kind === 'line_item' ? money(item.unitPrice ?? 0) : null,
      taxable: item.kind === 'line_item' ? item.taxable : false,
      clientVisible: item.clientVisible,
      linkedProductOrServiceId: item.linkedProductOrServiceId?.trim() || null,
      position: item.position ?? index,
      createdAt: now,
      updatedAt: now,
    })),
  })
}

export function listDevQuoteLineTemplates(): QuoteLineTemplateRecord[] {
  return [...store.quoteLineTemplates]
    .filter((template) => template.active)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function createDevQuoteLineTemplate(input: QuoteLineTemplateCreateInput): QuoteLineTemplateRecord {
  const template = buildDevQuoteLineTemplate(nextId('template'), new Date().toISOString(), input)
  store.quoteLineTemplates = [template, ...store.quoteLineTemplates]
  return template
}

export function updateDevQuoteLineTemplate(id: string, input: QuoteLineTemplateCreateInput): QuoteLineTemplateRecord | null {
  const index = store.quoteLineTemplates.findIndex((template) => template.id === id)
  if (index === -1) return null

  const current = store.quoteLineTemplates[index]
  const template = buildDevQuoteLineTemplate(id, current.createdAt, input)
  store.quoteLineTemplates = [...store.quoteLineTemplates]
  store.quoteLineTemplates[index] = template
  return template
}

export function deleteDevQuoteLineTemplate(id: string): QuoteLineTemplateRecord | null {
  const index = store.quoteLineTemplates.findIndex((template) => template.id === id)
  if (index === -1) return null

  const template = { ...store.quoteLineTemplates[index], active: false, updatedAt: new Date().toISOString() }
  store.quoteLineTemplates = [...store.quoteLineTemplates]
  store.quoteLineTemplates[index] = template
  return template
}

export function createDevProductService(
  row: Database['public']['Tables']['product_services']['Insert']
): ProductServiceRecord {
  const productService = rowToDevProductService(row)
  productServices = [productService, ...productServices]
  return productService
}

export function createDevProductServicesFromImport(
  rows: Database['public']['Tables']['product_services']['Insert'][]
): ProductServiceRecord[] {
  const created = rows.map((row) => rowToDevProductService(row))
  productServices = [...created, ...productServices.filter((existing) =>
    !created.some((item) =>
      item.name.toLowerCase() === existing.name.toLowerCase() &&
      (item.category ?? '').toLowerCase() === (existing.category ?? '').toLowerCase()
    )
  )]
  return created
}

export function updateDevProductService(
  id: string,
  updates: Database['public']['Tables']['product_services']['Update']
): ProductServiceRecord | null {
  const index = productServices.findIndex((service) => service.id === id)
  if (index === -1) return null

  const current = productServices[index]
  const updated = normalizeProductService({
    ...current,
    name: updates.name ?? current.name,
    description: updates.description ?? current.description,
    category: updates.category ?? current.category,
    unitPrice: updates.unit_price ?? current.unitPrice,
    unitCost: updates.unit_cost ?? current.unitCost,
    bookable: updates.bookable ?? current.bookable,
    durationMinutes: updates.duration_minutes ?? current.durationMinutes,
    quantityEnabled: updates.quantity_enabled ?? current.quantityEnabled,
    minimumQuantity: updates.minimum_quantity ?? current.minimumQuantity,
    maximumQuantity: updates.maximum_quantity ?? current.maximumQuantity,
    taxable: updates.taxable ?? current.taxable,
    active: updates.active ?? current.active,
    updatedAt: updates.updated_at ?? new Date().toISOString(),
  })

  productServices = [...productServices]
  productServices[index] = updated
  return updated
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
  const displayLabour = calculateDisplayLabourTotals(input.workingDays, input.labourPerDay, input.items)
  const formulaResults = calculateAllFormulas(
    {
      workingDays: calculateFormulaLabourDays(input.workingDays, input.labourPerDay, input.items),
      labourPerDay: 1,
      materialMarket: input.materialMarket,
      materialActual: input.materialActual,
    },
    settings
  )
  const areaFormulaSelections = getAreaFormulaSelections(input)
  const subtotal = calculateMainQuoteSubtotal(input, formulaResults, settings)
  const finalTotal = calculateFinal(subtotal)

  return {
    id,
    customerName: input.customerName?.trim() || null,
    customerAddress: input.customerAddress?.trim() || null,
    jobberQuoteId: input.jobberQuoteId?.trim() || null,
    jobberSnapshot: input.jobberSnapshot ?? null,
    jobberSaveMode: input.jobberSaveMode ?? null,
    jobberSyncStatus: 'not_synced',
    jobberLastSyncedAt: null,
    jobberSyncError: null,
    areaSqft: input.areaSqft ?? null,
    workType: input.workType?.trim() || null,
    workingDays: money(displayLabour.workingDays),
    labourPerDay: money(displayLabour.labourPerDay),
    formula1Total: money(formulaResults[0].total),
    formula2Total: money(formulaResults[1].total),
    formula3Total: money(formulaResults[2].total),
    formula4Total: money(formulaResults[3].total),
    formula5Total: money(formulaResults[4].total),
    selectedMin: input.selectedMin,
    selectedMax: input.selectedMax,
    interiorSelectedMin: areaFormulaSelections.interior.selectedMin,
    interiorSelectedMax: areaFormulaSelections.interior.selectedMax,
    exteriorSelectedMin: areaFormulaSelections.exterior.selectedMin,
    exteriorSelectedMax: areaFormulaSelections.exterior.selectedMax,
    roofSelectedMin: areaFormulaSelections.roof.selectedMin,
    roofSelectedMax: areaFormulaSelections.roof.selectedMax,
    subtotal: money(subtotal),
    finalTotal: money(finalTotal),
    pricingSettingsSnapshot: settings,
    createdAt,
    createdBy: 'dev-user',
    createdByName: 'Dev User',
    createdByEmail: 'dev@example.com',
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
    jobberQuoteLines: (input.jobberQuoteLines ?? []).map((line, index) => buildDevJobberQuoteLineRecord(id, line, line.position ?? index)),
    options: (input.options ?? []).map((option, optionIndex) => buildDevQuoteOptionRecord(id, option, option.position ?? optionIndex, settings)),
    memos: (input.memos ?? [])
      .map((memo, memoIndex) => buildDevQuoteMemoRecord(id, memo, memo.position ?? memoIndex))
      .sort((a, b) => a.position - b.position),
    priceRevisions: [
      {
        id: nextId('price-revision'),
        quoteId: id,
        revisionNumber: 1,
        eventType: 'created',
        previousSubtotal: null,
        previousFinalTotal: null,
        newSubtotal: money(subtotal),
        newFinalTotal: money(finalTotal),
        previousJobberLinesTotal: null,
        newJobberLinesTotal: optionalPublicMoney(calculateDevJobberLinesTotal(input.jobberQuoteLines ?? [])),
        previousOptionsSubtotal: null,
        newOptionsSubtotal: optionalPublicMoney(calculateDevQuoteOptionsTotal(input.options ?? [], settings, 'subtotal')),
        previousOptionsFinalTotal: null,
        newOptionsFinalTotal: optionalPublicMoney(calculateDevQuoteOptionsTotal(input.options ?? [], settings, 'finalTotal')),
        changedBy: 'dev-user',
        changedByName: 'Dev User',
        changedByEmail: 'dev@example.com',
        changedAt: createdAt,
      },
    ],
  }
}

function calculateDevJobberLinesTotal(lines: JobberQuoteLineInput[]): Decimal | undefined {
  if (lines.length === 0) return undefined

  return lines.reduce((total, line) => {
    const lineTotal = line.totalPrice === undefined && line.quantity !== undefined && line.unitPrice !== undefined
      ? new Decimal(line.quantity).mul(line.unitPrice)
      : line.totalPrice
    return lineTotal === undefined ? total : total.add(lineTotal)
  }, new Decimal(0))
}

function calculateDevQuoteOptionsTotal(
  options: QuoteInput['options'],
  settings: PricingSettings,
  field: 'subtotal' | 'finalTotal'
): Decimal | undefined {
  if (options.length === 0) return undefined

  return options.reduce((total, option) => {
    const calculated = buildDevQuoteOptionRecord('quote-total', option, 0, settings)
    return total.add(field === 'subtotal' ? calculated.subtotal : calculated.finalTotal)
  }, new Decimal(0))
}

function buildDevQuoteMemoRecord(
  quoteId: string,
  memo: QuoteInput['memos'][number],
  position: number
): QuoteMemoRecord {
  const now = new Date().toISOString()

  return {
    id: nextId('memo'),
    quoteId,
    body: memo.body.trim(),
    position,
    createdAt: now,
    updatedAt: now,
    createdBy: 'dev-user',
  }
}

function buildDevJobberQuoteLineRecord(
  quoteId: string,
  line: JobberQuoteLineInput,
  position: number
): JobberQuoteLineRecord {
  const now = new Date().toISOString()
  const totalPrice = line.totalPrice === undefined && line.quantity !== undefined && line.unitPrice !== undefined
    ? new Decimal(line.quantity).mul(line.unitPrice)
    : line.totalPrice

  return {
    id: nextId('jobber-line'),
    quoteId,
    kind: line.kind,
    name: line.name.trim(),
    description: line.description?.trim() || null,
    quantity: optionalPublicMoney(line.quantity),
    unitPrice: optionalPublicMoney(line.unitPrice),
    totalPrice: optionalPublicMoney(totalPrice),
    taxable: line.taxable,
    clientVisible: line.clientVisible,
    jobberLineItemId: line.jobberLineItemId?.trim() || null,
    linkedProductOrServiceId: line.linkedProductOrServiceId?.trim() || null,
    position,
    createdAt: now,
    updatedAt: now,
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
  const hasAssignedAreaRows = option.items.some((item) =>
    item.areaScopeSnapshot === 'interior' || item.areaScopeSnapshot === 'exterior' || item.areaScopeSnapshot === 'roof'
  )
  const subtotal = hasAssignedAreaRows
    ? calculateAreaSubtotalFromInputItems(option.items, { selectedMin: option.selectedMin, selectedMax: option.selectedMax }, 'interior', settings)
      .add(calculateAreaSubtotalFromInputItems(option.items, { selectedMin: option.selectedMin, selectedMax: option.selectedMax }, 'exterior', settings))
      .add(calculateAreaSubtotalFromInputItems(option.items, { selectedMin: option.selectedMin, selectedMax: option.selectedMax }, 'roof', settings))
    : calculateSubtotal(formulaResults, option.selectedMin, option.selectedMax)
  const finalTotal = calculateFinal(subtotal)

  return {
    id,
    quoteId,
    title: option.title.trim(),
    workingDays: money(labour.workingDays),
    labourPerDay: money(labour.labourDays),
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
  const previousOptionsSubtotal = sumDevQuoteOptionTotals(current.options, 'subtotal')
  const previousOptionsFinalTotal = sumDevQuoteOptionTotals(current.options, 'finalTotal')
  const newOptionsSubtotal = sumDevQuoteOptionTotals(quote.options, 'subtotal')
  const newOptionsFinalTotal = sumDevQuoteOptionTotals(quote.options, 'finalTotal')
  const priceChanged = current.subtotal !== quote.subtotal ||
    current.finalTotal !== quote.finalTotal ||
    previousOptionsSubtotal !== newOptionsSubtotal ||
    previousOptionsFinalTotal !== newOptionsFinalTotal
  quote.priceRevisions = priceChanged
    ? [
        ...current.priceRevisions,
        {
          id: nextId('price-revision'),
          quoteId: id,
          revisionNumber: current.priceRevisions.length + 1,
          eventType: 'updated',
          previousSubtotal: current.subtotal,
          previousFinalTotal: current.finalTotal,
          newSubtotal: quote.subtotal,
          newFinalTotal: quote.finalTotal,
          previousJobberLinesTotal: current.priceRevisions.at(-1)?.newJobberLinesTotal ?? null,
          newJobberLinesTotal: optionalPublicMoney(calculateDevJobberLinesTotal(input.jobberQuoteLines ?? [])),
          previousOptionsSubtotal,
          newOptionsSubtotal,
          previousOptionsFinalTotal,
          newOptionsFinalTotal,
          changedBy: 'dev-user',
          changedByName: 'Dev User',
          changedByEmail: 'dev@example.com',
          changedAt: new Date().toISOString(),
        },
      ]
    : current.priceRevisions
  store.quotes = [...store.quotes]
  store.quotes[index] = quote
  return quote
}

function sumDevQuoteOptionTotals(
  options: QuoteOptionRecord[],
  field: 'subtotal' | 'finalTotal'
): string | null {
  if (options.length === 0) return null

  return options
    .reduce((total, option) => total.add(option[field]), new Decimal(0))
    .toFixed(2)
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
  store.quoteLineTemplates = []
  products = DULUX_PAINT_PRODUCTS.map(normalizeRrpProduct)
  productServices = []
}
