import type { JobberQuoteDraftLineItem } from '@/lib/jobber/mapper'
import type { JobberQuoteLineItemDraft } from './types'

function formatDecimal(value: number): string {
  return value.toFixed(2).replace(/\.00$/, '')
}

function formatMoney(value: number): string {
  return value.toFixed(2)
}

export function mapJobberDraftLineItemsToState(
  lines: JobberQuoteDraftLineItem[]
): JobberQuoteLineItemDraft[] {
  return lines.map((line) => {
    const kind = line.textOnly === true
      ? 'text'
      : 'line_item'

    return {
      id: `jobber-${line.id}`,
      kind,
      name: line.name,
      description: line.description,
      quantity: formatDecimal(line.quantity),
      unitPrice: formatMoney(line.unitPrice),
      taxable: kind === 'line_item',
      clientVisible: true,
      jobberLineItemId: line.id,
      ...(line.optional !== undefined ? { optional: line.optional } : {}),
      ...(line.recommended !== undefined ? { recommended: line.recommended } : {}),
      ...(line.selected !== undefined ? { selected: line.selected } : {}),
    }
  })
}
