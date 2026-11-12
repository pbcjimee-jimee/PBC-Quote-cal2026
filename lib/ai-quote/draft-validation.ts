import Decimal from 'decimal.js'
import { AI_QUOTE_LIMITS } from '@/lib/ai-quote/config'
import type { DraftCatalog } from '@/lib/ai-quote/data'
import type { AiDraftModelOutput } from '@/lib/ai-quote/draft-schema'
import type { AiQuoteDraft, AiScope } from '@/lib/ai-quote/types'

// Keep line breaks and tabs: quote line descriptions are multi-line.
function cleanStrings<T>(value: T): T {
  if (typeof value === 'string') return value.replace(/\r\n?/g, '\n').replace(/[^\P{Cc}\n\t]/gu, '') as T
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
  photoCount = 0,
): AiQuoteDraft {
  const input = cleanStrings(raw)
  const warnings: string[] = []
  const services = new Map(catalog.productServices.map(row => [row.id, row]))
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

  const optionalItems: AiQuoteDraft['optionalItems'] = []
  const optionalIds = new Map<string, string>()
  const optionalNames = new Set<string>()
  function nameKey(name: string): string {
    return name.replace(/\s+/g, '').toLowerCase()
  }
  for (const item of cap(input.optionalItems, 10, 'Optional items')) {
    const name = item.name.trim().slice(0, 200)
    if (!name || /^total\b/i.test(name)) {
      warnings.push('An optional item with an empty or Total name was removed.')
      continue
    }
    const normalizedName = nameKey(name)
    if (optionalIds.has(item.key) || optionalNames.has(normalizedName)) continue
    const id = createId()
    optionalIds.set(item.key, id)
    optionalNames.add(normalizedName)
    optionalItems.push({ id, name, description: item.description.slice(0, 4000),
      areaName: item.areaName?.trim().slice(0, 80) || null, rationale: item.rationale })
  }

  const publicLines: AiQuoteDraft['publicLines'] = []
  for (const line of cap(input.publicLines, 60, 'Public lines')) {
    const service = line.productServiceId === null ? undefined : services.get(line.productServiceId)
    if (/^total\b/i.test(line.name.trim()) || /^total\b/i.test(service?.name.trim() ?? '')) continue
    const amount = quantity(line.quantity)
    const name = line.name.trim().slice(0, 200)
    if (amount === null) continue
    if (!name) {
      warnings.push('A public line with an empty name was removed.')
      continue
    }
    if (optionalNames.has(nameKey(name)) || (service && optionalNames.has(nameKey(service.name)))) continue
    if (line.productServiceId !== null && !service) warnings.push('An unavailable product/service link was removed.')
    // A linked service keeps its stored name and description verbatim, like picking it by hand.
    publicLines.push({
      ...line, id: createId(), kind: 'text',
      name: service ? service.name : name,
      description: service?.description ? service.description : line.description.slice(0, 4000),
      quantity: amount,
      productServiceId: service?.id ?? null, priceSource: 'none', priceWeight: 0,
      catalogUnitPrice: null, taxable: false,
      areaName: line.areaName?.trim().slice(0, 80) || null,
    })
  }
  const workItems: AiQuoteDraft['workItems'] = []
  for (const item of cap(input.workItems, 150, 'Work items')) {
    const optionalItemId = item.optionalKey === null ? null : optionalIds.get(item.optionalKey)
    if (optionalItemId === undefined) {
      warnings.push('A work item for an unknown optional item was removed.')
      continue
    }
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
    const workingDays = clamp(item.workingDays, 60, 'Working days')
    const labourPerDay = clamp(item.labourPerDay, 12, 'Labour per day')
    let photoAdjustment: AiQuoteDraft['workItems'][number]['photoAdjustment'] = null
    if (photoCount > 0 && item.photoAdjustment) {
      const adjustment = item.photoAdjustment
      const days = Decimal.min(60, new Decimal(workingDays).mul(AI_QUOTE_LIMITS.photoAdjustmentDaysFactor),
        Decimal.max(workingDays, decimal(adjustment.workingDays) ?? workingDays)).toDecimalPlaces(2, Decimal.ROUND_DOWN)
      const labour = Decimal.min(12, new Decimal(labourPerDay).add(AI_QUOTE_LIMITS.photoAdjustmentLabourAdd),
        Decimal.max(labourPerDay, decimal(adjustment.labourPerDay) ?? labourPerDay)).toDecimalPlaces(2, Decimal.ROUND_DOWN)
      if (days.gt(workingDays) || labour.gt(labourPerDay)) {
        photoAdjustment = { workingDays: days.toString(), labourPerDay: labour.toString(), reason: adjustment.reason,
          photoRefs: adjustment.photoRefs.filter(ref => Number.isInteger(ref) && ref >= 1 && ref <= photoCount) }
      }
    }
    workItems.push({
      id: createId(), optionalItemId, product, areaScope: item.areaScope, areaName, quantity: amount,
      workingDays, labourPerDay, rationale: item.rationale, photoAdjustment,
    })
  }
  for (const item of optionalItems) {
    if (!workItems.some(work => work.optionalItemId === item.id)) {
      warnings.push(`Optional item "${item.name}" has no calculation. Enter its price manually.`)
    }
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
    photoFindings: [],
    questions: cap(input.questions, 20, 'Questions'), warnings, areas, publicLines, optionalItems, workItems, formulaSelections,
  }
}
