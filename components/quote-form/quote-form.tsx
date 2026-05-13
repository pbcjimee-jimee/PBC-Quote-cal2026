'use client'

import Decimal from 'decimal.js'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  calculateAllFormulas,
  calculateFinal,
  calculateSubtotal,
  type PricingSettings,
} from '@/lib/calculator'
import { calculateLabourTotals, decimalFromInput } from '@/lib/quote-labour'
import { createQuote } from '@/lib/actions/quotes'
import { CustomerPanel } from './customer-panel'
import { MaterialsPanel } from './materials-panel'
import { FormulaResults } from './formula-results'
import { FinalSummary } from './final-summary'
import type { FormulaNumber, MaterialItem } from './types'
import type { AreaRecord } from '@/lib/areas/types'

interface QuoteFormProps {
  settings: PricingSettings
  areas: AreaRecord[]
}

interface JobberQuoteDraft {
  jobberQuoteId: string
  customerName: string
  customerAddress: string
  workType: string
  sourceUrl: string
}

type JobberQuoteResponse =
  | { ok: true; data: JobberQuoteDraft }
  | { ok: false; error: string }

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return Number(trimmed)
}

function isJobberQuoteResponse(value: unknown): value is JobberQuoteResponse {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (record.ok === false) return typeof record.error === 'string'
  if (record.ok !== true || typeof record.data !== 'object' || record.data === null) return false
  const data = record.data as Record<string, unknown>
  return (
    typeof data.jobberQuoteId === 'string' &&
    typeof data.customerName === 'string' &&
    typeof data.customerAddress === 'string' &&
    typeof data.workType === 'string' &&
    typeof data.sourceUrl === 'string'
  )
}

export function QuoteForm({ settings, areas }: QuoteFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [jobberQuoteId, setJobberQuoteId] = useState('')
  const [workType, setWorkType] = useState('')
  const [areaSqft, setAreaSqft] = useState('')
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [selectedMin, setSelectedMin] = useState<FormulaNumber>(4)
  const [selectedMax, setSelectedMax] = useState<FormulaNumber>(1)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [jobberFetchError, setJobberFetchError] = useState<string | null>(null)
  const [isFetchingJobberQuote, setIsFetchingJobberQuote] = useState(false)

  const totals = useMemo(() => {
    const materialMarket = materials.reduce(
      (total, item) => total.add(decimalFromInput(item.marketPrice).mul(decimalFromInput(item.quantity))),
      new Decimal(0)
    )
    const materialActual = materialMarket
    const labour = calculateLabourTotals(materials)
    const results = calculateAllFormulas(
      {
        workingDays: labour.labourDays,
        labourPerDay: 1,
        materialMarket,
        materialActual,
      },
      settings
    )
    const subtotal = calculateSubtotal(results, selectedMin, selectedMax)
    const finalTotal = calculateFinal(subtotal)
    const subtotalLabour = Decimal.max(subtotal.sub(materialMarket), 0)

    return { materialMarket, materialActual, labour, results, subtotal, subtotalLabour, finalTotal }
  }, [materials, selectedMax, selectedMin, settings])

  function addMaterial(item: MaterialItem) {
    setMaterials((current) => [...current, item])
  }

  function changeMaterial(item: MaterialItem) {
    setMaterials((current) => current.map((existing) => existing.id === item.id ? item : existing))
  }

  function removeMaterial(id: string) {
    setMaterials((current) => current.filter((item) => item.id !== id))
  }

  async function fetchJobberQuote() {
    const quoteId = jobberQuoteId.trim()
    setJobberFetchError(null)
    if (!quoteId) {
      setJobberFetchError('Enter a Jobber Quote ID first.')
      return
    }

    setIsFetchingJobberQuote(true)
    try {
      const response = await fetch(`/api/jobber/quote/${encodeURIComponent(quoteId)}`)
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
      setCustomerName(payload.data.customerName)
      setCustomerAddress(payload.data.customerAddress)
      setWorkType(payload.data.workType)
    } catch {
      setJobberFetchError('Unable to fetch Jobber quote.')
    } finally {
      setIsFetchingJobberQuote(false)
    }
  }

  function saveQuote() {
    setSaveError(null)
    startTransition(async () => {
      const result = await createQuote({
        customerName,
        customerAddress,
        jobberQuoteId,
        workType,
        areaSqft: optionalNumber(areaSqft),
        workingDays: Number(totals.labour.workingDays.toString()),
        labourPerDay: Number(totals.labour.labourPerDay.toString()),
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
      })

      if (result.ok) {
        router.push('/quotes')
      } else {
        setSaveError(result.error)
      }
    })
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <Link href="/quotes" className="text-sm text-gray-500 hover:text-gray-900">Back to Quotes</Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">New Quote <span className="text-blue-500">.</span></h1>
        </div>
        <button type="button" onClick={saveQuote} disabled={isPending} className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {isPending ? 'Saving...' : 'Save Quote'}
        </button>
      </div>

      {saveError ? <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</p> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-8 rounded-md border border-gray-200 bg-white p-5">
          <CustomerPanel
            customerName={customerName}
            customerAddress={customerAddress}
            jobberQuoteId={jobberQuoteId}
            workType={workType}
            areaSqft={areaSqft}
            onCustomerNameChange={setCustomerName}
            onCustomerAddressChange={setCustomerAddress}
            onJobberQuoteIdChange={setJobberQuoteId}
            onFetchJobberQuote={fetchJobberQuote}
            onWorkTypeChange={setWorkType}
            onAreaSqftChange={setAreaSqft}
            isFetchingJobberQuote={isFetchingJobberQuote}
            jobberFetchError={jobberFetchError}
          />
          <MaterialsPanel materials={materials} areas={areas} onAdd={addMaterial} onChange={changeMaterial} onRemove={removeMaterial} />
        </div>

        <div className="space-y-6 rounded-md border border-gray-200 bg-white p-5">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Calculation</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Working Days
                <input value={totals.labour.workingDays.toFixed(2)} readOnly className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Labour Per Day
                <input value={totals.labour.labourPerDay.toFixed(2)} readOnly className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700" />
              </label>
            </div>
            <p className="text-sm text-gray-500">Labour days: {totals.labour.labourDays.toFixed(2)}</p>
            {totals.labour.workingDays.gt(365) ? <p className="text-sm text-amber-600">Over 365 days - double check.</p> : null}
          </section>

          <FormulaResults results={totals.results} selectedMin={selectedMin} selectedMax={selectedMax} onSelectedMinChange={setSelectedMin} onSelectedMaxChange={setSelectedMax} />
          <FinalSummary
            labourTotal={totals.subtotalLabour}
            materialTotal={totals.materialMarket}
            subtotal={totals.subtotal}
            finalTotal={totals.finalTotal}
          />
        </div>
      </div>
    </div>
  )
}
