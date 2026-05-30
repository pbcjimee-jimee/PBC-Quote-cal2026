'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PricingSettings } from '@/lib/calculator'
import type { QuoteRecord } from '@/lib/dev-data'
import { CustomerPanel } from './customer-panel'
import { MaterialsPanel } from './materials-panel'
import { FinalSummary } from './final-summary'
import { DecimalInput } from './decimal-input'
import {
  createEmptyQuoteFormDraft,
  getQuoteDraftStorageKey,
  hasMeaningfulQuoteDraft,
  parseQuoteFormDraft,
  type QuoteFormDraft,
} from './quote-draft'
import { QuoteOptionsPanel } from './quote-options-panel'
import { OptionTotalsSummary } from './option-totals-summary'
import { calculateMainQuoteTotals } from './quote-calculation-totals'
import type { AreaFormulaSelections, AreaScope, FormulaNumber, JobberQuoteLineItemDraft, MaterialItem, QuoteMemoItem, QuoteOptionItem } from './types'
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
import { saveQuoteFormPayload } from './quote-save-payload'
import type { AreaRecord } from '@/lib/areas/types'
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
  }
}

export function QuoteForm({ settings, areas, productServices = [], quoteLineTemplates = [], initialQuote }: QuoteFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
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
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft))
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
    const storedDraft = parseQuoteFormDraft(window.localStorage.getItem(draftStorageKey))
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

      const targetUrl = new URL(target.href)
      if (targetUrl.origin !== window.location.origin) return
      if (`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}` === `${window.location.pathname}${window.location.search}${window.location.hash}`) return

      event.preventDefault()
      setPendingNavigation(`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`)
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
      setPendingNavigation('/quotes')
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isDirty])

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

  function changeAreaFormulaSelection(scope: AreaScope, field: 'selectedMin' | 'selectedMax', value: FormulaNumber) {
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
      const nextJobberLineIds = new Set(nextLines
        .map((line) => line.jobberLineItemId)
        .filter((id): id is string => Boolean(id)))
      const removedJobberLineIds = currentLines
        .map((line) => line.jobberLineItemId)
        .filter((id): id is string => typeof id === 'string' && !nextJobberLineIds.has(id))

      if (removedJobberLineIds.length > 0 || nextJobberLineIds.size > 0) {
        setDeletedJobberLineItemIds((currentDeletedIds) => {
          const merged = new Set([...currentDeletedIds, ...removedJobberLineIds])
          for (const id of nextJobberLineIds) {
            merged.delete(id)
          }
          return Array.from(merged)
        })
      }

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
        router.push(initialQuote ? `/quotes/${initialQuote.id}` : '/quotes')
      } else {
        setSaveError(result.error)
      }
    })
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="sticky top-16 z-20 mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/80 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <button type="button" onClick={() => requestNavigation('/quotes')} className="text-sm font-semibold text-slate-400 hover:text-[var(--primary)]">Back to Quotes</button>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{initialQuote ? 'Edit Quote' : 'New Quote'}</h1>
          <p className="mt-1 text-sm text-slate-500">Build the quote, compare formulas, and lock the final total.</p>
        </div>
        <button type="button" onClick={saveQuote} disabled={isPending} className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--primary-strong)] disabled:opacity-50">
          {isPending ? 'Saving...' : initialQuote ? 'Update Quote' : 'Save Quote'}
        </button>
      </div>

      {saveError ? <p className="mb-4 rounded-lg border border-red-100 bg-[var(--danger-soft)] px-3 py-2 text-sm font-medium text-[var(--danger)]">{saveError}</p> : null}
      {availableDraft ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-100 bg-[var(--warning-soft)] px-4 py-3 text-sm text-amber-800">
          <span>Unsaved draft found from {new Date(availableDraft.updatedAt).toLocaleString('en-AU')}.</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => restoreDraft(availableDraft)} className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800">
              Restore Draft
            </button>
            <button type="button" onClick={discardStoredDraft} className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">
              Discard
            </button>
          </span>
        </div>
      ) : null}
      {draftMessage ? <p className="mb-4 rounded-lg border border-green-100 bg-[var(--success-soft)] px-3 py-2 text-sm font-medium text-green-700">{draftMessage}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.06fr)_minmax(360px,0.94fr)]">
        <div className="space-y-8 rounded-lg border border-white bg-white/90 p-5 shadow-[var(--shadow-soft)]">
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
            areas={areas}
            areaBreakdown={totals.areaBreakdown}
            areaFormulaSelections={areaFormulaSelections}
            onAdd={addMaterial}
            onChange={changeMaterial}
            onRemove={removeMaterial}
            onAreaFormulaSelectionChange={changeAreaFormulaSelection}
          />
          <QuoteOptionsPanel
            options={options}
            optionTotals={optionPanelTotals}
            areas={areas}
            onAddOption={addOption}
            onChangeOption={changeOption}
            onRemoveOption={removeOption}
          />
          <QuoteMemosPanel memos={memos} onAddMemo={addMemo} onChangeMemo={changeMemo} onRemoveMemo={removeMemo} />
        </div>

        <aside className="space-y-6 rounded-lg border border-white bg-white/90 p-5 shadow-[var(--shadow-soft)] xl:sticky xl:top-24 xl:self-start">
          <section className="space-y-4">
            <h2 className="text-sm font-bold uppercase text-slate-400">Calculation</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <DecimalInput
                label="Total Working Days"
                value={totals.totalWorkingDays.toFixed(2)}
                onValueChange={() => undefined}
                labelClassName="space-y-1 text-sm font-semibold text-slate-600"
                inputClassName="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900"
                warningClassName="block text-xs font-normal text-amber-600"
                readOnly
              />
              <DecimalInput
                label="Total Labour Days"
                value={totals.totalLabourPerDay.toFixed(2)}
                onValueChange={() => undefined}
                labelClassName="space-y-1 text-sm font-semibold text-slate-600"
                inputClassName="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900"
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
          <OptionTotalsSummary options={optionSummaryItems} />
        </aside>
      </div>
      {pendingNavigation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div role="dialog" aria-modal="true" aria-labelledby="leave-dialog-title" className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 id="leave-dialog-title" className="text-lg font-bold text-slate-950">Save draft before leaving?</h2>
            <p className="mt-2 text-sm text-slate-600">You have unsaved quote changes. Save a local draft so this quote can be restored when you return.</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setPendingNavigation(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={leaveWithoutDraft} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                Leave without draft
              </button>
              <button type="button" onClick={saveDraftAndLeave} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-strong)]">
                Save draft
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
