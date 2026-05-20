'use client'

import Decimal from 'decimal.js'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  calculateAllFormulas,
  calculateFinal,
  calculateSubtotal,
  type PricingSettings,
} from '@/lib/calculator'
import { calculateLabourTotals, decimalFromInput } from '@/lib/quote-labour'
import { createQuote, updateQuote } from '@/lib/actions/quotes'
import type { QuoteRecord } from '@/lib/dev-data'
import { CustomerPanel } from './customer-panel'
import { MaterialsPanel } from './materials-panel'
import { FormulaResults } from './formula-results'
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
import type { FormulaNumber, JobberQuoteLineItemDraft, MaterialItem, QuoteOptionItem } from './types'
import { JobberProductServiceEditor } from './jobber-product-service-editor'
import { mapJobberDraftLineItemsToState } from './jobber-line-state'
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

function mapQuoteItemsToMaterials(quote: QuoteRecord): MaterialItem[] {
  return quote.items.map((item) => ({
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

function mapQuoteOptionsToState(quote: QuoteRecord): QuoteOptionItem[] {
  return quote.options.map((option) => ({
    id: option.id,
    title: option.title,
    selectedMin: option.selectedMin,
    selectedMax: option.selectedMax,
    isExpanded: false,
    materials: option.items.map((item) => ({
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
    })),
  }))
}

function mapJobberQuoteLinesToState(quote: QuoteRecord): JobberQuoteLineItemDraft[] {
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

function createClientId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`
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
  const [selectedMin, setSelectedMin] = useState<FormulaNumber>(initialQuote?.selectedMin ?? 4)
  const [selectedMax, setSelectedMax] = useState<FormulaNumber>(initialQuote?.selectedMax ?? 1)
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
    workingDays,
    labourPerDay,
    selectedMin,
    selectedMax,
    jobberQuoteDraft,
    updatedAt: new Date().toISOString(),
  }), [
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
      settings,
    })
  }, [materials, selectedMax, selectedMin, settings])

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
    if (!isDirty) return
    writeDraftToStorage()
  }, [isDirty, writeDraftToStorage])

  useEffect(() => {
    if (!isDirty) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      writeDraftToStorage()
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, writeDraftToStorage])

  useEffect(() => {
    if (!isDirty) return

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
    if (!isDirty) return

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
    setWorkingDays(draft.workingDays)
    setLabourPerDay(draft.labourPerDay)
    setSelectedMin(draft.selectedMin)
    setSelectedMax(draft.selectedMax)
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
    clearDraft()
    navigateTo(pendingNavigation ?? '/quotes')
  }

  const optionTotals = useMemo(() => {
    const calculated: Record<string, {
      materialMarket: Decimal
      materialActual: Decimal
      labour: ReturnType<typeof calculateLabourTotals>
      results: ReturnType<typeof calculateAllFormulas>
      subtotal: Decimal
      finalTotal: Decimal
    }> = {}

    for (const option of options) {
      const materialMarket = option.materials.reduce(
        (total, item) => total.add(decimalFromInput(item.marketPrice).mul(decimalFromInput(item.quantity))),
        new Decimal(0)
      )
      const materialActual = option.materials.reduce(
        (total, item) => total.add(decimalFromInput(item.actualPrice).mul(decimalFromInput(item.quantity))),
        new Decimal(0)
      )
      const labour = calculateLabourTotals(option.materials)
      const results = calculateAllFormulas(
        {
          workingDays: labour.labourDays,
          labourPerDay: 1,
          materialMarket,
          materialActual,
        },
        settings
      )
      const subtotal = calculateSubtotal(results, option.selectedMin, option.selectedMax)
      calculated[option.id] = {
        materialMarket,
        materialActual,
        labour,
        results,
        subtotal,
        finalTotal: calculateFinal(subtotal),
      }
    }

    return calculated
  }, [options, settings])

  const optionPanelTotals = useMemo(() => Object.fromEntries(
    options.map((option) => {
      const totalsForOption = optionTotals[option.id]
      return [
        option.id,
        {
          results: totalsForOption.results,
          finalTotal: totalsForOption.finalTotal.toFixed(2),
          materialTotal: totalsForOption.materialMarket.toFixed(2),
          workingDays: totalsForOption.labour.workingDays.toFixed(2),
          labourPerDay: totalsForOption.labour.labourDays.toFixed(2),
        },
      ]
    })
  ), [optionTotals, options])

  const optionSummaryItems = useMemo(() => options.map((option, index) => ({
    id: option.id,
    title: option.title.trim() || `Option ${index + 1}`,
    finalTotal: optionTotals[option.id].finalTotal,
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
      const payload = {
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
        items: materials.map((item, index) => ({
          productId: item.productId,
          productNameSnapshot: item.name,
          marketPriceSnapshot: Number(decimalFromInput(item.marketPrice).toString()),
          actualPriceSnapshot: Number(decimalFromInput(item.marketPrice).toString()),
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
      }
      const result = initialQuote
        ? await updateQuote({ ...payload, id: initialQuote.id })
        : await createQuote(payload)

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
            saveMode="priced_line_items"
            productServices={productServices}
            templates={quoteLineTemplates}
            onChange={changeJobberQuoteLines}
            onSaveModeChange={() => undefined}
          />
          <MaterialsPanel materials={materials} areas={areas} onAdd={addMaterial} onChange={changeMaterial} onRemove={removeMaterial} />
          <QuoteOptionsPanel
            options={options}
            optionTotals={optionPanelTotals}
            areas={areas}
            onAddOption={addOption}
            onChangeOption={changeOption}
            onRemoveOption={removeOption}
          />
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
                label="Total Labour"
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

          <FormulaResults results={totals.results} selectedMin={selectedMin} selectedMax={selectedMax} onSelectedMinChange={setSelectedMin} onSelectedMaxChange={setSelectedMax} />
          <FinalSummary
            labourTotal={totals.subtotalLabour}
            materialTotal={totals.materialMarket}
            subtotal={totals.subtotal}
            finalTotal={totals.finalTotal}
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
