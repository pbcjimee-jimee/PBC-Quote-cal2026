'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PricingSettings } from '@/lib/calculator'
import type { QuoteRecord } from '@/lib/dev-data'
import { createArea } from '@/lib/actions/areas'
import { Icons } from '@/components/ui/icons'
import { CustomerPanel } from './customer-panel'
import { MaterialsPanel } from './materials-panel'
import { FinalSummary } from './final-summary'
import { DecimalInput } from './decimal-input'
import {
  clearLocalQuoteDrafts,
  createEmptyQuoteFormDraft,
  getQuoteDraftStorageKey,
  hasMeaningfulQuoteDraft,
  readQuoteFormDraftFromStorage,
  sanitizeQuoteFormDraftForStorage,
  type QuoteFormDraft,
} from './quote-draft'
import { QuoteOptionsPanel } from './quote-options-panel'
import { OptionTotalsSummary } from './option-totals-summary'
import { calculateMainQuoteTotals } from './quote-calculation-totals'
import type { AreaCreateResult, AreaFormulaSelections, AreaScope, FormulaNumber, JobberQuoteLineItemDraft, MaterialItem, QuoteMemoItem, QuoteOptionItem } from './types'
import { JobberProductServiceEditor } from './jobber-product-service-editor'
import { mapJobberDraftLineItemsToState } from './jobber-line-state'
import { QuoteMemosPanel } from './quote-memos-panel'
import { calculateQuoteOptionTotals } from './quote-option-totals'
import {
  mapJobberQuoteLinesToState,
  mapQuoteItemsToMaterials,
  mapQuoteMemosToState,
  mapQuoteOptionsToState,
} from './quote-record-mappers'
import { calculateJobberSyncPreview, saveQuoteFormPayload } from './quote-save-payload'
import type { AreaRecord } from '@/lib/areas/types'
import { AREA_SCOPE_SORT_ORDER } from '@/lib/areas/constants'
import type {
  JobberQuoteDraft,
  JobberQuoteDraftExpense,
  JobberQuoteFinancialSummary,
  JobberQuoteDraftJobExpenses,
  JobberQuoteDraftLineItem,
} from '@/lib/jobber/mapper'
import { getVisibleJobberQuoteLookupAfterFetch } from '@/lib/jobber/quote-lookup'
import type { ProductServiceRecord } from '@/lib/product-services/types'
import type { QuoteLineTemplateRecord } from '@/lib/quote-line-templates/types'

export { buildQuoteSavePayload, saveQuoteFormPayload } from './quote-save-payload'

interface QuoteFormProps {
  settings: PricingSettings
  areas: AreaRecord[]
  productServices?: ProductServiceRecord[]
  quoteLineTemplates?: QuoteLineTemplateRecord[]
  initialQuote?: QuoteRecord
}

type JobberQuoteResponse =
  | { ok: true; data: JobberQuoteDraft }
  | { ok: false; error: string }

type JobberLookupType = 'quote' | 'job'

function getComparableDraftValue(draft: QuoteFormDraft): string {
  return JSON.stringify({ ...draft, updatedAt: '' })
}

export function shouldRunDraftGuard(isDirty: boolean, isNavigating: boolean): boolean {
  return isDirty && !isNavigating
}

export function getQuoteNavigationGuardTarget({
  isDirty,
  isNavigating,
  targetHref,
  currentHref,
}: {
  isDirty: boolean
  isNavigating: boolean
  targetHref: string
  currentHref: string
}): string | null {
  if (!shouldRunDraftGuard(isDirty, isNavigating)) return null

  let targetUrl: URL
  let currentUrl: URL
  try {
    targetUrl = new URL(targetHref, currentHref)
    currentUrl = new URL(currentHref)
  } catch {
    return null
  }

  if (targetUrl.origin !== currentUrl.origin) return null

  const targetPath = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`
  const currentPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
  return targetPath === currentPath ? null : targetPath
}

export function getQuoteUnexpectedSaveErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : 'Unable to save quote.'
}

function isJobberQuoteResponse(value: unknown): value is JobberQuoteResponse {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (record.ok === false) return typeof record.error === 'string'
  if (record.ok !== true || typeof record.data !== 'object' || record.data === null) return false
  const data = record.data as Record<string, unknown>
  return (
    typeof data.jobberQuoteId === 'string' &&
    (data.sourceType === 'quote' || data.sourceType === 'job') &&
    typeof data.quoteNumber === 'string' &&
    typeof data.createdAt === 'string' &&
    typeof data.customerName === 'string' &&
    typeof data.customerAddress === 'string' &&
    typeof data.workType === 'string' &&
    (data.areaSqft === null || typeof data.areaSqft === 'number') &&
    typeof data.customerType === 'string' &&
    typeof data.sourceUrl === 'string' &&
    Array.isArray(data.productsAndServices) &&
    data.productsAndServices.every(isJobberQuoteDraftLineItem) &&
    Array.isArray(data.jobExpenses) &&
    data.jobExpenses.every(isJobberQuoteDraftJobExpenses) &&
    (data.jobExpensesError === null || typeof data.jobExpensesError === 'string') &&
    isJobberQuoteFinancialSummary(data.financialSummary)
  )
}

function isJobberQuoteDraftLineItem(value: unknown): value is JobberQuoteDraftLineItem {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.category === 'string' &&
    typeof record.description === 'string' &&
    typeof record.quantity === 'number' &&
    typeof record.unitPrice === 'number' &&
    typeof record.totalPrice === 'number' &&
    (record.linkedName === null || typeof record.linkedName === 'string') &&
    (record.textOnly === undefined || typeof record.textOnly === 'boolean')
  )
}

function isJobberQuoteDraftJobExpenses(value: unknown): value is JobberQuoteDraftJobExpenses {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.jobId === 'string' &&
    typeof record.jobNumber === 'number' &&
    typeof record.jobTitle === 'string' &&
    typeof record.jobStatus === 'string' &&
    typeof record.jobUrl === 'string' &&
    Array.isArray(record.expenses) &&
    record.expenses.every(isJobberQuoteDraftExpense)
  )
}

function isJobberQuoteDraftExpense(value: unknown): value is JobberQuoteDraftExpense {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.description === 'string' &&
    typeof record.date === 'string' &&
    (record.total === null || typeof record.total === 'number') &&
    (record.enteredBy === null || typeof record.enteredBy === 'string') &&
    (record.paidBy === null || typeof record.paidBy === 'string') &&
    (record.reimbursableTo === null || typeof record.reimbursableTo === 'string')
  )
}

function isJobberQuoteFinancialSummary(value: unknown): value is JobberQuoteFinancialSummary {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.quoteTotal === 'number' &&
    typeof record.expensesTotal === 'number' &&
    typeof record.profit === 'number' &&
    (record.profitMarginPercent === null || typeof record.profitMarginPercent === 'number')
  )
}

function createClientId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`
}

function sortQuoteAreas(nextAreas: AreaRecord[]): AreaRecord[] {
  return [...nextAreas].sort((left, right) => {
    const scopeDifference = AREA_SCOPE_SORT_ORDER[left.scope] - AREA_SCOPE_SORT_ORDER[right.scope]
    if (scopeDifference !== 0) return scopeDifference
    if (left.position !== right.position) return left.position - right.position
    return left.name.localeCompare(right.name)
  })
}

function getInitialAreaFormulaSelections(initialQuote: QuoteRecord | undefined): AreaFormulaSelections {
  const fallbackMin = initialQuote?.selectedMin ?? 4
  const fallbackMax = initialQuote?.selectedMax ?? 1

  return {
    interior: {
      selectedMin: initialQuote?.interiorSelectedMin ?? fallbackMin,
      selectedMax: initialQuote?.interiorSelectedMax ?? fallbackMax,
    },
    exterior: {
      selectedMin: initialQuote?.exteriorSelectedMin ?? fallbackMin,
      selectedMax: initialQuote?.exteriorSelectedMax ?? fallbackMax,
    },
    roof: {
      selectedMin: initialQuote?.roofSelectedMin ?? fallbackMin,
      selectedMax: initialQuote?.roofSelectedMax ?? fallbackMax,
    },
  }
}

type JobberSyncPreviewValue = ReturnType<typeof calculateJobberSyncPreview>

function JobberSyncPreviewCard({ preview }: { preview: JobberSyncPreviewValue }) {
  const difference = preview.difference
  const differenceLabel = difference.isNegative()
    ? `-$${difference.abs().toFixed(2)}`
    : `$${difference.toFixed(2)}`

  return (
    <section className="pbc-card pbc-card--pad">
      <div className="pbc-panelhead">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Jobber sync preview</h2>
        </div>
      </div>
      <div className="pbc-summary__rows">
        <div className="pbc-srow">
          <span>PBC subtotal ex GST</span>
          <span className="mono">${preview.pbcSubtotal.toFixed(2)}</span>
        </div>
        <div className="pbc-srow">
          <span>Jobber public line total</span>
          <span className="mono">${preview.jobberPublicLineTotal.toFixed(2)}</span>
        </div>
        <div className="pbc-srow pbc-srow--strong">
          <span>Difference</span>
          <span className="mono">{differenceLabel}</span>
        </div>
      </div>
    </section>
  )
}

function getSavedJobberLineItemId(line: JobberQuoteLineItemDraft): string | null {
  return typeof line.jobberLineItemId === 'string' && line.jobberLineItemId.trim().length > 0
    ? line.jobberLineItemId
    : null
}

export function getNextDeletedJobberLineItemIds(
  currentDeletedIds: string[],
  currentLines: JobberQuoteLineItemDraft[],
  nextLines: JobberQuoteLineItemDraft[]
): string[] {
  const visibleNextJobberLineIds = new Set(nextLines
    .filter((line) => line.clientVisible !== false)
    .map(getSavedJobberLineItemId)
    .filter((id): id is string => id !== null))
  const hiddenNextJobberLineIds = nextLines
    .filter((line) => line.clientVisible === false)
    .map(getSavedJobberLineItemId)
    .filter((id): id is string => id !== null)
  const removedJobberLineIds = currentLines
    .map(getSavedJobberLineItemId)
    .filter((id): id is string => id !== null && !visibleNextJobberLineIds.has(id))
  const merged = new Set([...currentDeletedIds, ...removedJobberLineIds, ...hiddenNextJobberLineIds])

  for (const id of visibleNextJobberLineIds) {
    merged.delete(id)
  }

  return Array.from(merged)
}

export function QuoteForm({ settings, areas, productServices = [], quoteLineTemplates = [], initialQuote }: QuoteFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [quoteAreas, setQuoteAreas] = useState(() => sortQuoteAreas(areas))
  const [customerName, setCustomerName] = useState(initialQuote?.customerName ?? '')
  const [customerAddress, setCustomerAddress] = useState(initialQuote?.customerAddress ?? '')
  const [jobberLookupType, setJobberLookupType] = useState<JobberLookupType>(initialQuote?.jobberSnapshot?.sourceType ?? 'quote')
  const [jobberQuoteLookup, setJobberQuoteLookup] = useState(initialQuote?.jobberSnapshot?.quoteNumber ?? initialQuote?.jobberQuoteId ?? '')
  const [jobberQuoteId, setJobberQuoteId] = useState(initialQuote?.jobberQuoteId ?? '')
  const [workType, setWorkType] = useState(initialQuote?.workType ?? '')
  const [customerType, setCustomerType] = useState(initialQuote?.jobberSnapshot?.customerType ?? '')
  const [jobberQuoteLines, setJobberQuoteLines] = useState<JobberQuoteLineItemDraft[]>(initialQuote ? mapJobberQuoteLinesToState(initialQuote) : [])
  const [deletedJobberLineItemIds, setDeletedJobberLineItemIds] = useState<string[]>([])
  const [materials, setMaterials] = useState<MaterialItem[]>(initialQuote ? mapQuoteItemsToMaterials(initialQuote) : [])
  const [workingDays, setWorkingDays] = useState(initialQuote?.workingDays ?? '0')
  const [labourPerDay, setLabourPerDay] = useState(initialQuote?.labourPerDay ?? '0')
  const [options, setOptions] = useState<QuoteOptionItem[]>(initialQuote ? mapQuoteOptionsToState(initialQuote) : [])
  const [memos, setMemos] = useState<QuoteMemoItem[]>(initialQuote ? mapQuoteMemosToState(initialQuote) : [])
  const [selectedMin, setSelectedMin] = useState<FormulaNumber>(initialQuote?.selectedMin ?? 4)
  const [selectedMax, setSelectedMax] = useState<FormulaNumber>(initialQuote?.selectedMax ?? 1)
  const [areaFormulaSelections, setAreaFormulaSelections] = useState<AreaFormulaSelections>(() => getInitialAreaFormulaSelections(initialQuote))
  const [saveError, setSaveError] = useState<string | null>(null)
  const [jobberFetchError, setJobberFetchError] = useState<string | null>(null)
  const [isFetchingJobberQuote, setIsFetchingJobberQuote] = useState(false)
  const [jobberQuoteDraft, setJobberQuoteDraft] = useState<JobberQuoteDraft | null>(initialQuote?.jobberSnapshot ?? null)
  const [availableDraft, setAvailableDraft] = useState<QuoteFormDraft | null>(null)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [hasCheckedStoredDraft, setHasCheckedStoredDraft] = useState(false)
  const isNavigatingRef = useRef(false)

  const draftStorageKey = useMemo(() => getQuoteDraftStorageKey(initialQuote?.id), [initialQuote?.id])
  const quoteTargetPath = initialQuote ? `/quotes/${initialQuote.id}` : '/quotes'
  const cancelTargetPath = quoteTargetPath

  const currentDraft = useMemo<QuoteFormDraft>(() => ({
    ...createEmptyQuoteFormDraft(),
    customerName,
    customerAddress,
    jobberLookupType,
    jobberQuoteLookup,
    jobberQuoteId,
    workType,
    customerType,
    jobberSaveMode: 'priced_line_items',
    jobberQuoteLines,
    materials,
    options,
    memos,
    workingDays,
    labourPerDay,
    selectedMin,
    selectedMax,
    areaFormulaSelections,
    jobberQuoteDraft,
    updatedAt: new Date().toISOString(),
  }), [
    areaFormulaSelections,
    customerAddress,
    customerName,
    customerType,
    jobberQuoteLines,
    jobberLookupType,
    jobberQuoteDraft,
    jobberQuoteId,
    jobberQuoteLookup,
    labourPerDay,
    materials,
    memos,
    options,
    selectedMax,
    selectedMin,
    workType,
    workingDays,
  ])

  const currentComparableDraft = useMemo(() => getComparableDraftValue(currentDraft), [currentDraft])
  const [initialComparableDraft] = useState(currentComparableDraft)
  const isDirty = hasCheckedStoredDraft &&
    currentComparableDraft !== initialComparableDraft &&
    hasMeaningfulQuoteDraft(currentDraft)

  const writeDraftToStorage = useCallback(() => {
    if (typeof window === 'undefined') return
    const draft = { ...currentDraft, updatedAt: new Date().toISOString() }
    window.localStorage.setItem(draftStorageKey, JSON.stringify(sanitizeQuoteFormDraftForStorage(draft)))
  }, [currentDraft, draftStorageKey])

  const persistDraft = useCallback(() => {
    writeDraftToStorage()
    setDraftMessage('Draft saved locally.')
  }, [writeDraftToStorage])

  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(draftStorageKey)
    setDraftMessage(null)
  }, [draftStorageKey])

  const clearAllLocalDrafts = useCallback(() => {
    if (typeof window === 'undefined') return
    const removedCount = clearLocalQuoteDrafts(window.localStorage)
    setAvailableDraft(null)
    setDraftMessage(removedCount > 0 ? 'Local drafts cleared.' : 'No local drafts to clear.')
  }, [])

  const totals = useMemo(() => {
    return calculateMainQuoteTotals({
      materials,
      selectedMin,
      selectedMax,
      areaFormulaSelections,
      settings,
    })
  }, [areaFormulaSelections, materials, selectedMax, selectedMin, settings])

  useEffect(() => {
    const storedDraft = readQuoteFormDraftFromStorage(window.localStorage, draftStorageKey)
    const timeoutId = window.setTimeout(() => {
      if (storedDraft && hasMeaningfulQuoteDraft(storedDraft)) {
        setAvailableDraft(storedDraft)
      }
      setHasCheckedStoredDraft(true)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [draftStorageKey])

  useEffect(() => {
    if (!shouldRunDraftGuard(isDirty, isNavigatingRef.current)) return
    writeDraftToStorage()
  }, [isDirty, writeDraftToStorage])

  useEffect(() => {
    if (!shouldRunDraftGuard(isDirty, isNavigatingRef.current)) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      writeDraftToStorage()
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, writeDraftToStorage])

  useEffect(() => {
    if (!shouldRunDraftGuard(isDirty, isNavigatingRef.current)) return

    function handleDocumentClick(event: MouseEvent) {
      if (
        isNavigatingRef.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(target instanceof HTMLAnchorElement)) return

      const guardedTarget = getQuoteNavigationGuardTarget({
        isDirty,
        isNavigating: isNavigatingRef.current,
        targetHref: target.href,
        currentHref: window.location.href,
      })
      if (guardedTarget === null) return

      event.preventDefault()
      setPendingNavigation(guardedTarget)
    }

    document.addEventListener('click', handleDocumentClick, true)
    return () => document.removeEventListener('click', handleDocumentClick, true)
  }, [isDirty])

  useEffect(() => {
    if (!shouldRunDraftGuard(isDirty, isNavigatingRef.current)) return

    window.history.pushState({ quoteDraftGuard: true }, '', window.location.href)

    function handlePopState() {
      if (isNavigatingRef.current) return
      window.history.pushState({ quoteDraftGuard: true }, '', window.location.href)
      setPendingNavigation(cancelTargetPath)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [cancelTargetPath, isDirty])

  function restoreDraft(draft: QuoteFormDraft) {
    setCustomerName(draft.customerName)
    setCustomerAddress(draft.customerAddress)
    setJobberLookupType(draft.jobberLookupType)
    setJobberQuoteLookup(draft.jobberQuoteLookup)
    setJobberQuoteId(draft.jobberQuoteId)
    setWorkType(draft.workType)
    setCustomerType(draft.customerType)
    setJobberQuoteLines(draft.jobberQuoteLines)
    setDeletedJobberLineItemIds([])
    setMaterials(draft.materials)
    setOptions(draft.options)
    setMemos(draft.memos)
    setWorkingDays(draft.workingDays)
    setLabourPerDay(draft.labourPerDay)
    setSelectedMin(draft.selectedMin)
    setSelectedMax(draft.selectedMax)
    setAreaFormulaSelections(draft.areaFormulaSelections)
    setJobberQuoteDraft(draft.jobberQuoteDraft)
    setAvailableDraft(null)
    setDraftMessage('Draft restored.')
  }

  function discardStoredDraft() {
    clearDraft()
    setAvailableDraft(null)
  }

  function navigateTo(target: string) {
    isNavigatingRef.current = true
    setPendingNavigation(null)
    router.push(target)
  }

  function requestNavigation(target: string) {
    if (isDirty) {
      setPendingNavigation(target)
      return
    }

    navigateTo(target)
  }

  function saveDraftAndLeave() {
    persistDraft()
    navigateTo(pendingNavigation ?? '/quotes')
  }

  function leaveWithoutDraft() {
    isNavigatingRef.current = true
    clearDraft()
    navigateTo(pendingNavigation ?? '/quotes')
  }

  const optionTotals = useMemo(() => calculateQuoteOptionTotals(options, settings), [options, settings])
  const shouldShowJobberSyncPreview = jobberQuoteId.trim().length > 0 ||
    jobberQuoteLookup.trim().length > 0 ||
    jobberQuoteLines.length > 0
  const jobberSyncPreview = useMemo(() => calculateJobberSyncPreview({
    pbcSubtotal: totals.areaBreakdown.finalSubtotal,
    jobberQuoteLines,
  }), [jobberQuoteLines, totals.areaBreakdown.finalSubtotal])

  const optionPanelTotals = useMemo(() => Object.fromEntries(
    options.map((option) => {
      const totalsForOption = optionTotals[option.id]
      return [
        option.id,
        {
          results: totalsForOption.results,
          subtotal: totalsForOption.subtotal.toFixed(2),
          finalTotal: totalsForOption.finalTotal.toFixed(2),
          materialTotal: totalsForOption.materialMarket.toFixed(2),
          workingDays: totalsForOption.labour.workingDays.toFixed(2),
          labourPerDay: totalsForOption.labour.labourDays.toFixed(2),
          areaBreakdown: totalsForOption.areaBreakdown,
        },
      ]
    })
  ), [optionTotals, options])

  const optionSummaryItems = useMemo(() => options.map((option, index) => ({
    id: option.id,
    title: option.title.trim() || `Option ${index + 1}`,
    subtotal: optionTotals[option.id].subtotal,
    finalTotal: optionTotals[option.id].finalTotal,
    interiorSubtotal: optionTotals[option.id].areaBreakdown.interior.subtotal,
    exteriorSubtotal: optionTotals[option.id].areaBreakdown.exterior.subtotal,
    roofSubtotal: optionTotals[option.id].areaBreakdown.roof.subtotal,
  })), [optionTotals, options])

  function addMaterial(item: MaterialItem) {
    setMaterials((current) => [...current, item])
  }

  function changeMaterial(item: MaterialItem) {
    setMaterials((current) => current.map((existing) => existing.id === item.id ? item : existing))
  }

  function removeMaterial(id: string) {
    setMaterials((current) => current.filter((item) => item.id !== id))
  }

  async function createQuoteArea(scope: AreaScope, name: string): Promise<AreaCreateResult> {
    const result = await createArea({ scope, name })
    if (result.ok) {
      setQuoteAreas((current) => {
        const nextAreas = current.some((area) => area.id === result.data.id)
          ? current.map((area) => area.id === result.data.id ? result.data : area)
          : [...current, result.data]
        return sortQuoteAreas(nextAreas)
      })
    }
    return result
  }

  function addOption() {
    setOptions((current) => [
      ...current,
      {
        id: createClientId('option'),
        title: `Option ${current.length + 1}`,
        materials: [],
        selectedMin: 4,
        selectedMax: 1,
        isExpanded: true,
      },
    ])
  }

  function changeOption(option: QuoteOptionItem) {
    setOptions((current) => current.map((existing) => existing.id === option.id ? option : existing))
  }

  function removeOption(id: string) {
    setOptions((current) => current.filter((option) => option.id !== id))
  }

  function addMemo() {
    setMemos((current) => [...current, { id: createClientId('memo'), body: '' }])
  }

  function changeMemo(memo: QuoteMemoItem) {
    setMemos((current) => current.map((existing) => existing.id === memo.id ? memo : existing))
  }

  function removeMemo(id: string) {
    setMemos((current) => current.filter((memo) => memo.id !== id))
  }

  function changeAreaFormulaSelection(scope: keyof AreaFormulaSelections, field: 'selectedMin' | 'selectedMax', value: FormulaNumber) {
    setAreaFormulaSelections((current) => ({
      ...current,
      [scope]: {
        ...current[scope],
        [field]: value,
      },
    }))
  }

  function changeJobberQuoteLines(nextLines: JobberQuoteLineItemDraft[]) {
    setJobberQuoteLines((currentLines) => {
      setDeletedJobberLineItemIds((currentDeletedIds) => getNextDeletedJobberLineItemIds(
        currentDeletedIds,
        currentLines,
        nextLines
      ))
      return nextLines
    })
  }

  async function fetchJobberQuote() {
    const lookup = jobberQuoteLookup.trim()
    setJobberFetchError(null)
    if (!lookup) {
      setJobberFetchError(`Enter a Jobber ${jobberLookupType === 'job' ? 'Job' : 'Quote'} number first.`)
      return
    }

    setIsFetchingJobberQuote(true)
    try {
      const response = await fetch(`/api/jobber/quote/${encodeURIComponent(lookup)}?type=${jobberLookupType}`)
      const payload: unknown = await response.json()
      if (!isJobberQuoteResponse(payload)) {
        setJobberFetchError('Jobber returned an unexpected response.')
        return
      }
      if (!payload.ok) {
        setJobberFetchError(payload.error)
        return
      }

      setJobberQuoteId(payload.data.jobberQuoteId)
      setJobberQuoteLookup(jobberLookupType === 'job'
        ? payload.data.quoteNumber.replace(/^Job #/, '')
        : getVisibleJobberQuoteLookupAfterFetch(lookup, payload.data.quoteNumber)
      )
      setCustomerName(payload.data.customerName)
      setCustomerAddress(payload.data.customerAddress)
      setWorkType(payload.data.workType)
      setCustomerType(payload.data.customerType)
      setJobberQuoteDraft(payload.data)
      setDeletedJobberLineItemIds([])
      setJobberQuoteLines(mapJobberDraftLineItemsToState(payload.data.productsAndServices))
    } catch {
      setJobberFetchError('Unable to fetch Jobber quote.')
    } finally {
      setIsFetchingJobberQuote(false)
    }
  }

  function saveQuote() {
    setSaveError(null)
    startTransition(async () => {
      try {
        const result = await saveQuoteFormPayload({
          settings,
          initialQuoteId: initialQuote?.id,
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
        })

        if (result.ok) {
          clearDraft()
          isNavigatingRef.current = true
          router.push(quoteTargetPath)
        } else {
          setSaveError(result.error)
        }
      } catch (error) {
        setSaveError(getQuoteUnexpectedSaveErrorMessage(error))
      }
    })
  }

  return (
    <main>
      <header className="pbc-topbar">
        <div className="pbc-crumb">
          <button type="button" onClick={() => requestNavigation('/quotes')}>Quotes</button>
          {Icons.arrowDown({ size: 14 })}
          <b>{initialQuote ? 'Edit Quote' : 'New Quote'}</b>
        </div>
        <div className="pbc-topbar__right">
          <button type="button" onClick={() => requestNavigation(cancelTargetPath)} disabled={isPending} className="pbc-btn pbc-btn--ghost">
            Cancel
          </button>
          <button type="button" onClick={saveQuote} disabled={isPending} className="pbc-btn pbc-btn--primary">
            {Icons.check({ size: 15 })} {isPending ? 'Saving...' : initialQuote ? 'Update Quote' : 'Save Quote'}
          </button>
        </div>
      </header>

      <div className="pbc-page">
      <div className="pbc-pagehead">
        <h1>{initialQuote ? 'Edit Quote' : 'New Quote'}</h1>
        <p>Build the quote, compare formulas, and lock the final total.</p>
      </div>

      {saveError ? <p className="pbc-alert pbc-alert--danger">{saveError}</p> : null}
      {availableDraft ? (
        <div className="pbc-alert pbc-alert--warning">
          <span>Unsaved draft found from {new Date(availableDraft.updatedAt).toLocaleString('en-AU')}.</span>
          <span className="pbc-alert__actions">
            <button type="button" onClick={() => restoreDraft(availableDraft)} className="pbc-btn pbc-btn--primary pbc-btn--sm">
              Restore Draft
            </button>
            <button type="button" onClick={discardStoredDraft} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
              Discard
            </button>
          </span>
        </div>
      ) : null}
      {draftMessage ? <p className="pbc-alert pbc-alert--success">{draftMessage}</p> : null}
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={clearAllLocalDrafts} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
          Clear local drafts
        </button>
      </div>

      <div className="pbc-editgrid">
        <div className="pbc-workspace">
          <CustomerPanel
            customerName={customerName}
            customerAddress={customerAddress}
            jobberLookupType={jobberLookupType}
            jobberQuoteId={jobberQuoteLookup}
            workType={workType}
            customerType={customerType}
            onCustomerNameChange={setCustomerName}
            onCustomerAddressChange={setCustomerAddress}
            onJobberLookupTypeChange={setJobberLookupType}
            onJobberQuoteIdChange={setJobberQuoteLookup}
            onFetchJobberQuote={fetchJobberQuote}
            onWorkTypeChange={setWorkType}
            isFetchingJobberQuote={isFetchingJobberQuote}
            jobberFetchError={jobberFetchError}
            jobberQuoteDraft={jobberQuoteDraft}
          />
          <JobberProductServiceEditor
            value={jobberQuoteLines}
            productServices={productServices}
            templates={quoteLineTemplates}
            onChange={changeJobberQuoteLines}
          />
          <MaterialsPanel
            materials={materials}
            areas={quoteAreas}
            areaBreakdown={totals.areaBreakdown}
            areaFormulaSelections={areaFormulaSelections}
            onAdd={addMaterial}
            onChange={changeMaterial}
            onRemove={removeMaterial}
            onCreateArea={createQuoteArea}
            onAreaFormulaSelectionChange={changeAreaFormulaSelection}
          />
          <QuoteOptionsPanel
            options={options}
            optionTotals={optionPanelTotals}
            areas={quoteAreas}
            onAddOption={addOption}
            onChangeOption={changeOption}
            onRemoveOption={removeOption}
            onCreateArea={createQuoteArea}
          />
          <QuoteMemosPanel memos={memos} onAddMemo={addMemo} onChangeMemo={changeMemo} onRemoveMemo={removeMemo} />
        </div>

        <aside className="pbc-calcstack">
          <section className="pbc-card pbc-card--pad pbc-calcpanel">
            <h2 className="pbc-paneltitle">Calculation</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <DecimalInput
                label="Total Working Days"
                value={totals.totalWorkingDays.toFixed(2)}
                onValueChange={() => undefined}
                labelClassName="pbc-field"
                inputClassName="pbc-input"
                warningClassName="block text-xs font-normal text-amber-600"
                readOnly
              />
              <DecimalInput
                label="Total Labour Days"
                value={totals.totalLabourPerDay.toFixed(2)}
                onValueChange={() => undefined}
                labelClassName="pbc-field"
                inputClassName="pbc-input"
                warningClassName="block text-xs font-normal text-amber-600"
                readOnly
              />
            </div>
            {totals.totalWorkingDays.gt(365) ? <p className="text-sm text-amber-600">Over 365 days - double check.</p> : null}
          </section>

          <FinalSummary
            labourTotal={totals.subtotalLabour}
            materialTotal={totals.materialMarket}
            areaBreakdown={totals.areaBreakdown}
            jobberFinancialSummary={jobberQuoteDraft && !jobberQuoteDraft.jobExpensesError ? jobberQuoteDraft.financialSummary : null}
          />
          {shouldShowJobberSyncPreview ? <JobberSyncPreviewCard preview={jobberSyncPreview} /> : null}
          <OptionTotalsSummary options={optionSummaryItems} />
        </aside>
      </div>
      <div className="pbc-mobile-totalbar">
        <div className="min-w-0">
          <span>Final subtotal</span>
          <b className="mono">${totals.areaBreakdown.finalSubtotal.toFixed(2)}</b>
        </div>
        <div className="min-w-0">
          <span>Inc GST</span>
          <b className="mono">${totals.areaBreakdown.finalTotal.toFixed(2)}</b>
        </div>
        <button type="button" onClick={saveQuote} disabled={isPending} className="pbc-btn pbc-btn--primary pbc-btn--sm">
          {Icons.check({ size: 14 })} {isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
      {pendingNavigation ? (
        <div className="pbc-dialogbackdrop">
          <div role="dialog" aria-modal="true" aria-labelledby="leave-dialog-title" className="pbc-dialog">
            <h2 id="leave-dialog-title">Save draft before leaving?</h2>
            <p>You have unsaved quote changes. Save a local draft so this quote can be restored when you return.</p>
            <div className="pbc-dialog__actions">
              <button type="button" onClick={() => setPendingNavigation(null)} className="pbc-btn pbc-btn--ghost">
                Cancel
              </button>
              <button type="button" onClick={leaveWithoutDraft} className="pbc-btn pbc-btn--danger">
                Leave without draft
              </button>
              <button type="button" onClick={saveDraftAndLeave} className="pbc-btn pbc-btn--primary">
                Save draft
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </main>
  )
}
