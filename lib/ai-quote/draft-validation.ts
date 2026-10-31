import Decimal from 'decimal.js'
import type { DraftCatalog } from '@/lib/ai-quote/data'
import type { AiDraftModelOutput } from '@/lib/ai-quote/draft-schema'
import type { AiQuoteDraft, AiScope } from '@/lib/ai-quote/types'

function cleanStrings<T>(value: T): T {
  if (typeof value === 'string') return value.replace(/\p{Cc}/gu, '') as T
  if (Array.isArray(value)) return value.map(cleanStrings) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cleanStrings(entry)])) as T
  }
  return value
}

function decimal(value: string): Decimal | null {
  try {
    const parsed = new Decimal(value)
    return parsed.isFinite() ? parsed : null
  } catch {
    return null
  }
}

function isFormula(value: number): value is 1 | 2 | 3 | 4 | 5 {
  return Number.isInteger(value) && value >= 1 && value <= 5
}

export function validateAiQuoteDraft(
  raw: AiDraftModelOutput, catalog: DraftCatalog, createId: () => string = () => crypto.randomUUID(),
): AiQuoteDraft {
  const input = cleanStrings(raw)
  const warnings: string[] = []
  const services = new Map(cleanStrings(catalog.productServices).map(row => [row.id, row]))
  const products = new Map(cleanStrings(catalog.products).filter(row => row.active).map(row => [row.id, row]))
  function cap<T>(rows: T[], max: number, label: string): T[] {
    if (rows.length > max) warnings.push(`${label} limited to ${max}.`)
    return rows.slice(0, max)
  }
  function quantity(value: string): string | null {
    const parsed = decimal(value)
    const rounded = parsed?.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    if (!parsed || parsed.lte(0) || parsed.gt(1000) || !rounded?.gt(0)) {
      warnings.push('An item with invalid quantity was removed.')
      return null
    }
    return rounded.toString()
  }
  function clamp(value: string, max: number, label: string): string {
    const parsed = decimal(value)
    if (!parsed || parsed.lt(0) || parsed.gt(max)) warnings.push(`${label} was clamped to 0–${max}.`)
    return Decimal.min(max, Decimal.max(0, parsed ?? 0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString()
  }
  const areas: AiQuoteDraft['areas'] = []
  function addArea(scope: AiScope, name: string, referenced = false): string | null {
    const trimmed = name.trim().slice(0, 80)
    if (!trimmed) return null
    const existing = areas.find(area => area.scope === scope && area.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) return existing.name
    if (areas.length >= 40) {
      warnings.push(referenced
        ? 'A work item requiring an area beyond the 40-area limit was removed.'
        : 'Areas limited to 40.')
      return null
    }
    areas.push({ scope, name: trimmed })
    return trimmed
  }

  const publicLines: AiQuoteDraft['publicLines'] = []
  for (const line of cap(input.publicLines, 60, 'Public lines')) {
    const amount = quantity(line.quantity)
    const name = line.name.trim().slice(0, 200)
    if (amount === null) continue
    if (!name) {
      warnings.push('A public line with an empty name was removed.')
      continue
    }
    const service = line.productServiceId === null ? undefined : services.get(line.productServiceId)
    if (line.productServiceId !== null && !service) warnings.push('An unavailable product/service link was removed.')
    const priceSource = line.kind === 'text' ? 'none'
      : line.priceSource === 'catalog' && !service ? 'allocated' : line.priceSource
    publicLines.push({
      ...line, id: createId(), name, description: line.description.slice(0, 4000), quantity: amount,
      productServiceId: service?.id ?? null, priceSource,
      priceWeight: Number.isFinite(line.priceWeight) ? Math.min(100, Math.max(0, line.priceWeight)) : 0,
      catalogUnitPrice: priceSource === 'catalog' ? service?.unitPrice ?? null : null,
      taxable: line.kind === 'text' ? false : service?.taxable ?? true,
      areaName: line.areaName?.trim().slice(0, 80) || null,
    })
  }
  const workItems: AiQuoteDraft['workItems'] = []
  for (const item of cap(input.workItems, 150, 'Work items')) {
    const product = products.get(item.productId)
    if (!product) {
      warnings.push('A work item with an unavailable product was removed.')
      continue
    }
    const amount = quantity(item.quantity)
    if (amount === null) continue
    const areaName = addArea(item.areaScope, item.areaName, true)
    if (areaName === null) {
      if (!item.areaName.trim()) warnings.push('A work item with an empty area was removed.')
      continue
    }
    workItems.push({
      id: createId(), product, areaScope: item.areaScope, areaName, quantity: amount,
      workingDays: clamp(item.workingDays, 60, 'Working days'),
      labourPerDay: clamp(item.labourPerDay, 12, 'Labour per day'), rationale: item.rationale,
    })
  }
  for (const area of input.areas) addArea(area.scope, area.name)
  const formulaSelections: AiQuoteDraft['formulaSelections'] = []
  for (const selection of input.formulaSelections) {
    const { selectedMin, selectedMax } = selection
    if (!isFormula(selectedMin) || !isFormula(selectedMax)) {
      warnings.push('An invalid formula selection was removed.')
      continue
    }
    formulaSelections.push({ ...selection, selectedMin, selectedMax })
  }
  return {
    summary: input.summary, findings: cap(input.findings, 30, 'Findings'),
    questions: cap(input.questions, 20, 'Questions'), warnings, areas, publicLines, workItems, formulaSelections,
  }
}
