import Decimal from 'decimal.js'
import type { AiScope } from '@/lib/ai-quote/types'

export interface KnowledgeSourceQuote {
  id: string
  workType: string
  finalTotal: string
  jobberSaveMode: 'priced_line_items' | 'description_total'
  formulaSelections: Partial<Record<AiScope, { min: number; max: number }>>
  publicLines: Array<{
    kind: 'line_item' | 'text'
    name: string
    description: string
    quantity: string
    unitPrice: string
    linkedProductServiceId: string | null
  }>
  items: Array<{
    areaName: string | null
    areaScope: AiScope | null
    productId: string | null
    productName: string
    quantity: string
    workingDays: string
    labourPerDay: string
  }>
}

export interface StatSummary {
  n: number
  p25: string
  median: string
  p75: string
  lowSample: boolean
}

export interface KnowledgeStats {
  areas: Record<string, {
    scope: AiScope
    workingDays: StatSummary
    labourPerDayMedian: string
    topProducts: Array<{ productId: string; productName: string; count: number; medianQuantity: string }>
  }>
  formulaSelections: Record<AiScope, Array<{ min: number; max: number; count: number }>>
  publicLines: Record<string, { unitPrice: StatSummary; catalogLinkedRatio: string }>
  publicVsCalculator: StatSummary
  quoteCount: number
}

const AREA_SYNONYMS = new Map([
  ...['bed', 'beds', 'bedroom', 'bedrooms', 'master bed', 'master bedroom'].map(name => [name, 'bedroom'] as const),
  ...['bath', 'baths', 'bathroom', 'bathrooms', 'ensuite', 'ensuites', 'powder room'].map(name => [name, 'bathroom'] as const),
  ...['lounge', 'living', 'living room'].map(name => [name, 'living room'] as const),
])

export function normalizeAreaKey(name: string): string {
  const key = name.replace(/[\d#]/g, '').replace(/[\/&-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  return AREA_SYNONYMS.get(key) ?? key
}

function summarize(values: Decimal[]): StatSummary {
  const sorted = [...values].sort((a, b) => a.comparedTo(b))
  const percentile = (p: string): string => {
    if (!sorted.length) return '0.00'
    const position = new Decimal(sorted.length - 1).mul(p)
    const index = position.floor().toNumber()
    const fraction = position.minus(index)
    const value = sorted[index]
    return value.add((sorted[index + 1] ?? value).minus(value).mul(fraction)).toFixed(2)
  }

  return {
    n: sorted.length,
    p25: percentile('0.25'),
    median: percentile('0.5'),
    p75: percentile('0.75'),
    lowSample: sorted.length < 3,
  }
}

export function buildKnowledgeStats(quotes: KnowledgeSourceQuote[]): KnowledgeStats {
  const areas = new Map<string, {
    scope: AiScope
    days: Decimal[]
    labour: Decimal[]
    products: Map<string, { productName: string; quantities: Decimal[] }>
  }>()
  const formulas: Record<AiScope, Map<string, { min: number; max: number; count: number }>> = {
    interior: new Map(), exterior: new Map(), roof: new Map(),
  }
  const lines = new Map<string, { prices: Decimal[]; linked: number }>()
  const ratios: Decimal[] = []

  for (const quote of quotes) {
    const quoteDays = new Map<string, Decimal>()
    for (const item of quote.items) {
      if (!item.areaName || !item.areaScope) continue
      const areaName = normalizeAreaKey(item.areaName)
      if (!areaName) continue
      const key = `${item.areaScope}:${areaName}`
      let area = areas.get(key)
      if (!area) {
        area = { scope: item.areaScope, days: [], labour: [], products: new Map() }
        areas.set(key, area)
      }
      const days = new Decimal(item.workingDays)
      quoteDays.set(key, (quoteDays.get(key) ?? new Decimal(0)).add(days))
      if (days.gt(0)) area.labour.push(new Decimal(item.labourPerDay))
      if (item.productId) {
        let product = area.products.get(item.productId)
        if (!product) {
          product = { productName: item.productName, quantities: [] }
          area.products.set(item.productId, product)
        }
        product.quantities.push(new Decimal(item.quantity))
      }
    }
    for (const [key, days] of quoteDays) areas.get(key)!.days.push(days)

    for (const scope of ['interior', 'exterior', 'roof'] as const) {
      const selection = quote.formulaSelections[scope]
      if (!selection) continue
      const key = `${selection.min}:${selection.max}`
      const pair = formulas[scope].get(key)
      if (pair) pair.count += 1
      else formulas[scope].set(key, { ...selection, count: 1 })
    }

    let publicTotal = new Decimal(0)
    for (const line of quote.publicLines) {
      if (line.kind !== 'line_item') continue
      const price = new Decimal(line.unitPrice)
      publicTotal = publicTotal.add(price.mul(line.quantity))
      const key = normalizeAreaKey(line.name)
      let group = lines.get(key)
      if (!group) {
        group = { prices: [], linked: 0 }
        lines.set(key, group)
      }
      group.prices.push(price)
      if (line.linkedProductServiceId) group.linked += 1
    }
    const finalTotal = new Decimal(quote.finalTotal)
    if (quote.jobberSaveMode === 'priced_line_items' && finalTotal.gt(0)) {
      ratios.push(publicTotal.div(finalTotal.div('1.10')))
    }
  }

  const rankFormulas = (scope: AiScope) => [...formulas[scope].values()]
    .sort((a, b) => b.count - a.count || a.min - b.min || a.max - b.max)
    .slice(0, 3)

  return {
    areas: Object.fromEntries([...areas].map(([key, area]) => [key, {
      scope: area.scope,
      workingDays: summarize(area.days),
      labourPerDayMedian: summarize(area.labour).median,
      topProducts: [...area.products].map(([productId, product]) => ({
        productId,
        productName: product.productName,
        count: product.quantities.length,
        medianQuantity: summarize(product.quantities).median,
      })).sort((a, b) => b.count - a.count || a.productId.localeCompare(b.productId)).slice(0, 3),
    }])),
    formulaSelections: {
      interior: rankFormulas('interior'), exterior: rankFormulas('exterior'), roof: rankFormulas('roof'),
    },
    publicLines: Object.fromEntries([...lines].map(([key, group]) => [key, {
      unitPrice: summarize(group.prices),
      catalogLinkedRatio: new Decimal(group.linked).div(group.prices.length).toFixed(2),
    }])),
    publicVsCalculator: summarize(ratios),
    quoteCount: quotes.length,
  }
}
