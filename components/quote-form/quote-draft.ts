import Decimal from 'decimal.js'
import type { JobberQuoteDraft, JobberQuoteDraftLineItem } from '@/lib/jobber/mapper'
import type { AreaFormulaSelections, FormulaSelection, JobberQuoteLineItemDraft, JobberSaveMode, MaterialItem, QuoteMemoItem, QuoteOptionItem } from './types'
import { isDecimalInputValue } from './decimal-input-utils'

const QUOTE_DRAFT_VERSION = 1
const QUOTE_DRAFT_STORAGE_PREFIX = 'pbc-quote-draft:'
export const QUOTE_DRAFT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000
const LOCAL_DRAFT_JOBBER_PRIVATE_FIELDS_MESSAGE = 'Jobber expense and financial details are not stored in local drafts. Fetch Jobber again to refresh them.'

type LocalJobberQuoteDraft = Pick<
  JobberQuoteDraft,
  | 'jobberQuoteId'
  | 'sourceType'
  | 'quoteNumber'
  | 'createdAt'
  | 'customerName'
  | 'customerAddress'
  | 'workType'
  | 'areaSqft'
  | 'customerType'
  | 'sourceUrl'
  | 'productsAndServices'
>

export type QuoteFormStorageDraft = Omit<QuoteFormDraft, 'jobberQuoteDraft'> & {
  jobberQuoteDraft: LocalJobberQuoteDraft | null
}

type RestoredLocalJobberQuoteDraft = JobberQuoteDraft & {
  localDraftPrivateFieldsOmitted: true
}

export interface QuoteDraftStorage {
  length: number
  key(index: number): string | null
  removeItem(key: string): void
}

export interface QuoteDraftReadableStorage {
  getItem(key: string): string | null
  removeItem(key: string): void
}

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
  return `${QUOTE_DRAFT_STORAGE_PREFIX}${quoteId ?? 'new'}`
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
      roof: { selectedMin: 4, selectedMax: 1 },
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

function readNumber(record: UnknownRecord, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
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

  const areaScope = value.areaScope === 'interior' || value.areaScope === 'exterior' || value.areaScope === 'roof'
    ? value.areaScope
    : undefined

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
  const roof = parseFormulaSelection(value.roof)
  if (interior === null || exterior === null) return null
  return { interior, exterior, roof: roof ?? { selectedMin: 4, selectedMax: 1 } }
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

function sanitizeJobberQuoteLineForStorage(line: JobberQuoteDraftLineItem): JobberQuoteDraftLineItem {
  return {
    id: line.id,
    name: line.name,
    category: line.category,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    totalPrice: line.totalPrice,
    linkedName: line.linkedName,
    textOnly: line.textOnly,
  }
}

function sanitizeJobberQuoteDraftForStorage(draft: JobberQuoteDraft): LocalJobberQuoteDraft {
  return {
    jobberQuoteId: draft.jobberQuoteId,
    sourceType: draft.sourceType,
    quoteNumber: draft.quoteNumber,
    createdAt: draft.createdAt,
    customerName: draft.customerName,
    customerAddress: draft.customerAddress,
    workType: draft.workType,
    areaSqft: draft.areaSqft,
    customerType: draft.customerType,
    sourceUrl: draft.sourceUrl,
    productsAndServices: draft.productsAndServices.map(sanitizeJobberQuoteLineForStorage),
  }
}

export function sanitizeQuoteFormDraftForStorage(draft: QuoteFormDraft): QuoteFormStorageDraft {
  return {
    ...draft,
    jobberQuoteDraft: draft.jobberQuoteDraft
      ? sanitizeJobberQuoteDraftForStorage(draft.jobberQuoteDraft)
      : null,
  }
}

export function clearLocalQuoteDrafts(storage: QuoteDraftStorage): number {
  const keysToRemove: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(QUOTE_DRAFT_STORAGE_PREFIX)) {
      keysToRemove.push(key)
    }
  }

  for (const key of keysToRemove) {
    storage.removeItem(key)
  }

  return keysToRemove.length
}

function parseJobberQuoteDraftLineItem(value: unknown): JobberQuoteDraftLineItem | null {
  if (!isRecord(value)) return null

  const id = readString(value, 'id')
  const name = readString(value, 'name')
  const category = readString(value, 'category')
  const description = readString(value, 'description')
  const quantity = readNumber(value, 'quantity')
  const unitPrice = readNumber(value, 'unitPrice')
  const totalPrice = readNumber(value, 'totalPrice')
  const linkedName = value.linkedName
  const textOnly = value.textOnly

  if (
    id === null ||
    name === null ||
    category === null ||
    description === null ||
    quantity === null ||
    unitPrice === null ||
    totalPrice === null ||
    (linkedName !== null && typeof linkedName !== 'string') ||
    (textOnly !== undefined && typeof textOnly !== 'boolean')
  ) {
    return null
  }

  return {
    id,
    name,
    category,
    description,
    quantity,
    unitPrice,
    totalPrice,
    linkedName,
    textOnly,
  }
}

function parseJobberQuoteDraft(value: unknown): JobberQuoteDraft | null {
  if (!isRecord(value)) return null

  const jobberQuoteId = readString(value, 'jobberQuoteId')
  const sourceType = value.sourceType
  const quoteNumber = readString(value, 'quoteNumber')
  const createdAt = readString(value, 'createdAt')
  const customerName = readString(value, 'customerName')
  const customerAddress = readString(value, 'customerAddress')
  const workType = readString(value, 'workType')
  const areaSqft = value.areaSqft
  const customerType = readString(value, 'customerType')
  const sourceUrl = readString(value, 'sourceUrl')
  const productsAndServices = Array.isArray(value.productsAndServices)
    ? value.productsAndServices.map(parseJobberQuoteDraftLineItem)
    : null

  if (
    jobberQuoteId === null ||
    (sourceType !== 'quote' && sourceType !== 'job') ||
    quoteNumber === null ||
    createdAt === null ||
    customerName === null ||
    customerAddress === null ||
    workType === null ||
    (areaSqft !== null && typeof areaSqft !== 'number') ||
    customerType === null ||
    sourceUrl === null ||
    productsAndServices === null ||
    productsAndServices.some((item) => item === null)
  ) {
    return null
  }

  const quoteTotal = (productsAndServices as JobberQuoteDraftLineItem[]).reduce(
    (total, item) => total.add(item.totalPrice),
    new Decimal(0)
  ).toDecimalPlaces(2).toNumber()

  const restoredDraft: RestoredLocalJobberQuoteDraft = {
    jobberQuoteId,
    sourceType,
    quoteNumber,
    createdAt,
    customerName,
    customerAddress,
    workType,
    areaSqft,
    customerType,
    sourceUrl,
    productsAndServices: productsAndServices as JobberQuoteDraftLineItem[],
    jobExpenses: [],
    jobExpensesError: LOCAL_DRAFT_JOBBER_PRIVATE_FIELDS_MESSAGE,
    financialSummary: {
      quoteTotal,
      expensesTotal: 0,
      profit: quoteTotal,
      profitMarginPercent: quoteTotal > 0 ? 100 : null,
    },
    localDraftPrivateFieldsOmitted: true,
  }
  return restoredDraft
}

function isUpdatedAtFresh(updatedAt: string, now: Date): boolean {
  const updatedAtTime = Date.parse(updatedAt)
  const nowTime = now.getTime()
  if (!Number.isFinite(updatedAtTime) || !Number.isFinite(nowTime)) return false
  if (updatedAtTime > nowTime) return false
  return nowTime - updatedAtTime <= QUOTE_DRAFT_EXPIRY_MS
}

export function isLocalDraftJobberQuoteDraft(draft: JobberQuoteDraft | null): boolean {
  if (!draft || !isRecord(draft)) return false
  return draft.localDraftPrivateFieldsOmitted === true
}

export function parseQuoteFormDraft(value: string | null, now: Date = new Date()): QuoteFormDraft | null {
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
  const jobberQuoteDraft = parseJobberQuoteDraft(parsed.jobberQuoteDraft)
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
    !isUpdatedAtFresh(updatedAt, now) ||
    (parsed.jobberQuoteDraft !== null && parsed.jobberQuoteDraft !== undefined && jobberQuoteDraft === null) ||
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
    roof: { selectedMin, selectedMax },
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
    jobberQuoteDraft,
    updatedAt,
  }
}

export function readQuoteFormDraftFromStorage(
  storage: QuoteDraftReadableStorage,
  key: string,
  now: Date = new Date()
): QuoteFormDraft | null {
  const storedValue = storage.getItem(key)
  const draft = parseQuoteFormDraft(storedValue, now)
  if (storedValue !== null && draft === null) {
    storage.removeItem(key)
  }
  return draft
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
    draft.areaFormulaSelections.roof.selectedMin !== 4 ||
    draft.areaFormulaSelections.roof.selectedMax !== 1 ||
    draft.jobberQuoteDraft
  )
}
