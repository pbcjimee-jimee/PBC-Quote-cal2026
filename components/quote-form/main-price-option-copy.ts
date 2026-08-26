import Decimal from 'decimal.js'
import type { JobberQuoteLineItemDraft, MaterialItem, QuoteOptionItem } from './types'

type CreateClientId = (prefix: string) => string

interface CopyableMainPriceLine {
  sourceIndex: number
  name: string
  quantity: string
  unitPrice: string
}

function parseCompleteDecimal(value: string): Decimal | null {
  const text = value.trim()
  if (!/^\d+(?:\.\d*)?$/.test(text)) return null

  try {
    const decimal = new Decimal(text)
    return decimal.isNegative() ? null : decimal
  } catch {
    return null
  }
}

function getCopyableMainPriceLines(lines: JobberQuoteLineItemDraft[]): CopyableMainPriceLine[] {
  const copyable: CopyableMainPriceLine[] = []

  lines.forEach((line, sourceIndex) => {
    if (line.kind !== 'line_item' || line.clientVisible !== true) return

    const quantity = parseCompleteDecimal(line.quantity)
    const unitPrice = parseCompleteDecimal(line.unitPrice)
    if (!quantity || !unitPrice || !quantity.gt(0) || !quantity.mul(unitPrice).gt(0)) return

    copyable.push({
      sourceIndex,
      name: line.name.trim() || line.description.trim() || `Line item ${sourceIndex + 1}`,
      quantity: line.quantity.trim(),
      unitPrice: line.unitPrice.trim(),
    })
  })

  return copyable
}

export function hasCopyableMainPriceLines(lines: JobberQuoteLineItemDraft[]): boolean {
  return getCopyableMainPriceLines(lines).length > 0
}

export function createMainPriceOption(
  lines: JobberQuoteLineItemDraft[],
  optionNumber: number,
  createId: CreateClientId
): QuoteOptionItem | null {
  const copyableLines = getCopyableMainPriceLines(lines)
  if (copyableLines.length === 0) return null

  return {
    id: createId('option'),
    title: `Option ${optionNumber}`,
    selectedMin: 1,
    selectedMax: 1,
    isExpanded: true,
    materials: copyableLines.map((line): MaterialItem => ({
      id: createId('option-item'),
      name: line.name,
      marketPrice: line.unitPrice,
      actualPrice: line.unitPrice,
      quantity: line.quantity,
      workingDays: '0',
      labourPerDay: '0',
      isCustom: true,
    })),
  }
}

export function appendMainPriceOption(
  options: QuoteOptionItem[],
  lines: JobberQuoteLineItemDraft[],
  createId: CreateClientId
): QuoteOptionItem[] {
  const option = createMainPriceOption(lines, options.length + 1, createId)
  return option ? [...options, option] : options
}
