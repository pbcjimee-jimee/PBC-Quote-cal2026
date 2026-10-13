import type { JobberQuoteLineItemDraft } from './types'
import { parsePublicLineMoney } from '@/lib/public-line-money'

export function refreshPaintComparisonLines(lines: JobberQuoteLineItemDraft[], key: string, amount: string): JobberQuoteLineItemDraft[] {
  const parsed = parsePublicLineMoney(amount)
  if (!parsed.ok) return lines
  const price = parsed.value.toFixed(2)
  let changed = false
  const next = lines.map(line => {
    if (line.paintComparisonKey !== key || (line.unitPrice === price && line.quantity === '1' && line.optionalWritePolicy === 'set_true' && line.taxable && line.clientVisible)) return line
    changed = true
    return { ...line, unitPrice: price, quantity: '1', taxable: true, clientVisible: true, optional: true, optionalWritePolicy: 'set_true' as const, recommendedWritePolicy: line.jobberLineItemId ? 'preserve' as const : 'set_false' as const }
  })
  return changed ? next : lines
}

export function applyPaintComparisonLine(lines: JobberQuoteLineItemDraft[], key: string, amount: string, createId: () => string): JobberQuoteLineItemDraft[] {
  if (lines.some(line => line.paintComparisonKey === key)) {
    return refreshPaintComparisonLines(lines.map(line => line.paintComparisonKey === key ? { ...line, clientVisible: true, optionalWritePolicy: undefined } : line), key, amount)
  }
  const parsed = parsePublicLineMoney(amount)
  if (!parsed.ok || parsed.value.isZero()) return lines
  return [...lines, { id: createId(), kind: 'line_item', name: 'Aquanamel optional adjustment', description: 'Choose Aquanamel instead of Super Enamel. Adjustment to the base quote, excluding GST.', quantity: '1', unitPrice: parsed.value.toFixed(2), taxable: true, clientVisible: true, optional: true, recommended: false, selected: false, optionalWritePolicy: 'set_true', recommendedWritePolicy: 'set_false', paintComparisonKey: key }]
}

export function mergePaintComparisonLinesAfterFetch(current: JobberQuoteLineItemDraft[], fetched: JobberQuoteLineItemDraft[], deletedRemoteIds: string[] = []): JobberQuoteLineItemDraft[] {
  const generated = current.filter(line => line.paintComparisonKey)
  const consumed = new Set<string>()
  const deleted = new Set(deletedRemoteIds)
  const next = fetched.filter(line => !line.jobberLineItemId || !deleted.has(line.jobberLineItemId)).map(line => {
    const linked = generated.find(existing => (line.jobberLineItemId && existing.jobberLineItemId === line.jobberLineItemId) || (line.paintComparisonKey && line.paintComparisonKey === existing.paintComparisonKey))
    if (!linked) return line
    consumed.add(linked.id)
    return { ...linked, optional: line.optional, recommended: line.recommended, selected: line.selected, optionalWritePolicy: 'set_true' as const, recommendedWritePolicy: 'preserve' as const }
  })
  return [...next, ...generated.filter(line => !consumed.has(line.id))]
}
