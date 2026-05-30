import type { JobberQuoteDraft } from '@/lib/jobber/mapper'
import type { AreaFormulaSelections, FormulaSelection, JobberQuoteLineItemDraft, JobberSaveMode, MaterialItem, QuoteMemoItem, QuoteOptionItem } from './types'
import { isDecimalInputValue } from './decimal-input-utils'

const QUOTE_DRAFT_VERSION = 1

export interface QuoteFormDraft {
  version: number
  customerName: string
  customerAddress: string
  jobberLookupType: 'quote' | 'job'
  jobberQuoteLookup: string
  jobberQuoteId: string
  workType: string
  customerType: string
  jobberSaveMode: JobberSaveMode
  jobberQuoteLines: JobberQuoteLineItemDraft[]
  materials: MaterialItem[]
  options: QuoteOptionItem[]
  memos: QuoteMemoItem[]
  workingDays: string
  labourPerDay: string
  selectedMin: 1 | 2 | 3 | 4 | 5
  selectedMax: 1 | 2 | 3 | 4 | 5
  areaFormulaSelections: AreaFormulaSelections
  jobberQuoteDraft: JobberQuoteDraft | null
  updatedAt: string
}

type UnknownRecord = Record<string, unknown>

export function getQuoteDraftStorageKey(quoteId?: string): string {
  return `pbc-quote-draft:${quoteId ?? 'new'}`
}

export function createEmptyQuoteFormDraft(): QuoteFormDraft {
  return {
    version: QUOTE_DRAFT_VERSION,
    customerName: '',
    customerAddress: '',
    jobberLookupType: 'quote',
    jobberQuoteLookup: '',
    jobberQuoteId: '',
    workType: '',
    customerType: '',
    jobberSaveMode: 'priced_line_items',
    jobberQuoteLines: [],
    materials: [],
    options: [],
    memos: [],
    workingDays: '0',
    labourPerDay: '0',
    selectedMin: 4,
    selectedMax: 1,
    areaFormulaSelections: {
      interior: { selectedMin: 4, selectedMax: 1 },
      exterior: { selectedMin: 4, selectedMax: 1 },
    },
    jobberQuoteDraft: null,
    updatedAt: new Date(0).toISOString(),
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: UnknownRecord, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

function readOptionalString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function readDecimalString(record: UnknownRecord, key: string): string | null {
  const value = readString(record, key)
  return value !== null && isDecimalInputValue(value) ? value : null
}

function readFormulaNumber(record: UnknownRecord, key: string): 1 | 2 | 3 | 4 | 5 | null {
  const value = record[key]
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null
}

function parseMaterial(value: unknown): MaterialItem | null {
  if (!isRecord(value)) return null

  const id = readString(value, 'id')
  const name = readString(value, 'name')
  const marketPrice = readDecimalString(value, 'marketPrice')
  const actualPrice = readDecimalString(value, 'actualPrice')
  const quantity = readDecimalString(value, 'quantity')
  const workingDays = readDecimalString(value, 'workingDays')
  const labourPerDay = readDecimalString(value, 'labourPerDay')
  const isCustom = value.isCustom

  if (
    id === null ||
    name === null ||
    marketPrice === null ||
    actualPrice === null ||
    quantity === null ||
    workingDays === null ||
    labourPerDay === null ||
    typeof isCustom !== 'boolean'
  ) {
    return null
  }

  const areaScope = value.areaScope === 'interior' || value.areaScope === 'exterior' ? value.areaScope : undefined

  return {
    id,
    productId: readOptionalString(value, 'productId'),
    name,
    manufacturer: readOptionalString(value, 'manufacturer'),
    type: readOptionalString(value, 'type'),
    unit: readOptionalString(value, 'unit'),
    category: readOptionalString(value, 'category'),
    productLine: readOptionalString(value, 'productLine'),
    base: readOptionalString(value, 'base'),
    sheen: readOptionalString(value, 'sheen'),
    volumeLitres: readOptionalString(value, 'volumeLitres'),
    productCode: readOptionalString(value, 'productCode'),
    marketPrice,
    actualPrice,
    quantity,
    workingDays,
    labourPerDay,
    areaId: readOptionalString(value, 'areaId'),
    areaName: readOptionalString(value, 'areaName'),
    areaScope,
    isCustom,
  }
}

function parseOption(value: unknown): QuoteOptionItem | null {
  if (!isRecord(value)) return null

  const id = readString(value, 'id')
  const title = readString(value, 'title')
  const selectedMin = readFormulaNumber(value, 'selectedMin')
  const selectedMax = readFormulaNumber(value, 'selectedMax')
  const isExpanded = value.isExpanded
  const materials = Array.isArray(value.materials)
    ? value.materials.map(parseMaterial)
    : null

  if (
    id === null ||
    title === null ||
    selectedMin === null ||
    selectedMax === null ||
    typeof isExpanded !== 'boolean' ||
    materials === null ||
    materials.some((item) => item === null)
  ) {
    return null
  }

  return {
    id,
    title,
    materials: materials as MaterialItem[],
    selectedMin,
    selectedMax,
    isExpanded,
  }
}

function parseFormulaSelection(value: unknown): FormulaSelection | null {
  if (!isRecord(value)) return null
  const selectedMin = readFormulaNumber(value, 'selectedMin')
  const selectedMax = readFormulaNumber(value, 'selectedMax')
  if (selectedMin === null || selectedMax === null) return null
  return { selectedMin, selectedMax }
}

function parseAreaFormulaSelections(value: unknown): AreaFormulaSelections | null {
  if (!isRecord(value)) return null
  const interior = parseFormulaSelection(value.interior)
  const exterior = parseFormulaSelection(value.exterior)
  if (interior === null || exterior === null) return null
  return { interior, exterior }
}

function parseMemo(value: unknown): QuoteMemoItem | null {
  if (!isRecord(value)) return null

  const id = readString(value, 'id')
  const body = readString(value, 'body')
  if (id === null || body === null) return null

  return { id, body }
}

function parseJobberQuoteLine(value: unknown): JobberQuoteLineItemDraft | null {
  if (!isRecord(value)) return null

  const id = readString(value, 'id')
  const kind = value.kind
  const name = readString(value, 'name')
  const description = readString(value, 'description')
  const quantity = readDecimalString(value, 'quantity')
  const unitPrice = readDecimalString(value, 'unitPrice')
  const taxable = value.taxable
  const clientVisible = value.clientVisible

  if (
    id === null ||
    (kind !== 'line_item' && kind !== 'text') ||
    name === null ||
    description === null ||
    quantity === null ||
    unitPrice === null ||
    typeof taxable !== 'boolean' ||
    typeof clientVisible !== 'boolean'
  ) {
    return null
  }

  return {
    id,
    kind,
    name,
    description,
    quantity,
    unitPrice,
    taxable,
    clientVisible,
    jobberLineItemId: readOptionalString(value, 'jobberLineItemId'),
    linkedProductOrServiceId: readOptionalString(value, 'linkedProductOrServiceId'),
  }
}

export function parseQuoteFormDraft(value: string | null): QuoteFormDraft | null {
  if (!value) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }

  if (!isRecord(parsed) || parsed.version !== QUOTE_DRAFT_VERSION) return null

  const customerName = readString(parsed, 'customerName')
  const customerAddress = readString(parsed, 'customerAddress')
  const jobberLookupType = parsed.jobberLookupType
  const jobberQuoteLookup = readString(parsed, 'jobberQuoteLookup')
  const jobberQuoteId = readString(parsed, 'jobberQuoteId')
  const workType = readString(parsed, 'workType')
  const customerType = readString(parsed, 'customerType')
  const jobberSaveMode = parsed.jobberSaveMode
  const workingDays = readDecimalString(parsed, 'workingDays')
  const labourPerDay = readDecimalString(parsed, 'labourPerDay')
  const selectedMin = readFormulaNumber(parsed, 'selectedMin')
  const selectedMax = readFormulaNumber(parsed, 'selectedMax')
  const parsedAreaFormulaSelections = parseAreaFormulaSelections(parsed.areaFormulaSelections)
  const updatedAt = readString(parsed, 'updatedAt')
  const materials = Array.isArray(parsed.materials)
    ? parsed.materials.map(parseMaterial)
    : null
  const options = Array.isArray(parsed.options)
    ? parsed.options.map(parseOption)
    : []
  const memos = Array.isArray(parsed.memos)
    ? parsed.memos.map(parseMemo)
    : []
  const jobberQuoteLines = Array.isArray(parsed.jobberQuoteLines)
    ? parsed.jobberQuoteLines.map(parseJobberQuoteLine)
    : []

  if (
    customerName === null ||
    customerAddress === null ||
    (jobberLookupType !== 'quote' && jobberLookupType !== 'job') ||
    jobberQuoteLookup === null ||
    jobberQuoteId === null ||
    workType === null ||
    customerType === null ||
    (jobberSaveMode !== 'priced_line_items' && jobberSaveMode !== 'description_total') ||
    workingDays === null ||
    labourPerDay === null ||
    selectedMin === null ||
    selectedMax === null ||
    (parsed.areaFormulaSelections !== undefined && parsedAreaFormulaSelections === null) ||
    updatedAt === null ||
    materials === null ||
    materials.some((item) => item === null) ||
    options.some((item) => item === null) ||
    memos.some((item) => item === null) ||
    jobberQuoteLines.some((item) => item === null)
  ) {
    return null
  }

  const areaFormulaSelections = parsedAreaFormulaSelections ?? {
    interior: { selectedMin, selectedMax },
    exterior: { selectedMin, selectedMax },
  }

  return {
    version: QUOTE_DRAFT_VERSION,
    customerName,
    customerAddress,
    jobberLookupType,
    jobberQuoteLookup,
    jobberQuoteId,
    workType,
    customerType,
    jobberSaveMode,
    jobberQuoteLines: jobberQuoteLines as JobberQuoteLineItemDraft[],
    materials: materials as MaterialItem[],
    options: options as QuoteOptionItem[],
    memos: memos as QuoteMemoItem[],
    workingDays,
    labourPerDay,
    selectedMin,
    selectedMax,
    areaFormulaSelections,
    jobberQuoteDraft: isRecord(parsed.jobberQuoteDraft) ? parsed.jobberQuoteDraft as unknown as JobberQuoteDraft : null,
    updatedAt,
  }
}

export function hasMeaningfulQuoteDraft(draft: QuoteFormDraft): boolean {
  return Boolean(
    draft.customerName.trim() ||
    draft.customerAddress.trim() ||
    draft.jobberQuoteLookup.trim() ||
    draft.jobberQuoteId.trim() ||
    draft.workType.trim() ||
    draft.customerType.trim() ||
    draft.jobberQuoteLines.length > 0 ||
    draft.jobberSaveMode !== 'priced_line_items' ||
    draft.materials.length > 0 ||
    draft.options.length > 0 ||
    draft.memos.some((memo) => memo.body.trim()) ||
    draft.workingDays !== '0' ||
    draft.labourPerDay !== '0' ||
    draft.selectedMin !== 4 ||
    draft.selectedMax !== 1 ||
    draft.areaFormulaSelections.interior.selectedMin !== 4 ||
    draft.areaFormulaSelections.interior.selectedMax !== 1 ||
    draft.areaFormulaSelections.exterior.selectedMin !== 4 ||
    draft.areaFormulaSelections.exterior.selectedMax !== 1 ||
    draft.jobberQuoteDraft
  )
}
