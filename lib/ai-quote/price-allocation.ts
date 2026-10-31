import Decimal from 'decimal.js'
import type { AiPriceSource } from '@/lib/ai-quote/types'

export interface AllocatableLine {
  id: string
  kind: 'line_item' | 'text'
  quantity: string
  priceSource: AiPriceSource
  priceWeight: number
  catalogUnitPrice: string | null
}

export type AllocationResult = {
  status: 'allocated'
  unitPrices: Record<string, string>
  residual: string
} | {
  status: 'skipped'
  reason: 'no_total' | 'catalog_exceeds_total' | 'no_weights'
  unitPrices: Record<string, string>
}

const GST_MULTIPLIER = new Decimal('1.10')

export function allocatePublicLinePrices(
  lines: AllocatableLine[],
  finalTotal: Decimal.Value,
  reservedExGst: Decimal.Value = 0,
): AllocationResult {
  const unitPrices: Record<string, string> = Object.fromEntries(lines.map((line) => [
    line.id,
    line.kind === 'line_item' && line.priceSource === 'catalog'
      ? new Decimal(line.catalogUnitPrice ?? '0').toFixed(2, Decimal.ROUND_HALF_UP)
      : '0.00',
  ]))
  const target = new Decimal(finalTotal).div(GST_MULTIPLIER)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .sub(new Decimal(reservedExGst).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))

  if (target.lte(0)) {
    return { status: 'skipped', reason: 'no_total', unitPrices }
  }

  const fixed = lines.reduce((total, line) => (
    line.kind === 'line_item' && line.priceSource === 'catalog'
      ? total.add(new Decimal(unitPrices[line.id]).mul(line.quantity))
      : total
  ), new Decimal(0))
  const pool = target.sub(fixed)

  if (pool.lt(0)) {
    return { status: 'skipped', reason: 'catalog_exceeds_total', unitPrices }
  }

  const allocatedLines = lines.filter((line) => (
    line.kind === 'line_item' && line.priceSource === 'allocated' && line.priceWeight > 0
  ))
  const weightTotal = allocatedLines.reduce((total, line) => total.add(line.priceWeight), new Decimal(0))

  if (weightTotal.isZero()) {
    return { status: 'skipped', reason: 'no_weights', unitPrices }
  }

  let allocatedTotal = new Decimal(0)
  let remainderLine: AllocatableLine | undefined

  for (const line of allocatedLines) {
    const unitPrice = pool.mul(line.priceWeight).div(weightTotal).div(line.quantity)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    unitPrices[line.id] = unitPrice.toFixed(2)
    allocatedTotal = allocatedTotal.add(unitPrice.mul(line.quantity))

    if (new Decimal(line.quantity).eq(1)
      && (!remainderLine || line.priceWeight > remainderLine.priceWeight)) {
      remainderLine = line
    }
  }

  let residual = pool.sub(allocatedTotal)

  if (remainderLine && !residual.isZero()) {
    const previousPrice = new Decimal(unitPrices[remainderLine.id])
    const adjustedPrice = previousPrice.add(residual).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    unitPrices[remainderLine.id] = adjustedPrice.toFixed(2)
    residual = residual.sub(adjustedPrice.sub(previousPrice))
  }

  return { status: 'allocated', unitPrices, residual: residual.toFixed(2, Decimal.ROUND_HALF_UP) }
}
