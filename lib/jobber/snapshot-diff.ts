import Decimal from 'decimal.js'
import type { JobberSnapshotChangeSummaryItem } from '@/lib/dev-data'
import type { JobberQuoteDraft, JobberQuoteDraftLineItem } from './mapper'

export type JobberSnapshotChangeStatus = 'unknown' | 'unchanged' | 'changed'

export interface JobberSnapshotDiff {
  status: JobberSnapshotChangeStatus
  summary: JobberSnapshotChangeSummaryItem[]
}

const SUMMARY_LIMIT = 8

export function diffJobberSnapshots(
  previous: JobberQuoteDraft | null,
  next: JobberQuoteDraft
): JobberSnapshotDiff {
  if (!previous) return { status: 'unknown', summary: [] }

  const summary: JobberSnapshotChangeSummaryItem[] = []
  pushTextChange(summary, 'customer', 'Customer changed', previous.customerName, next.customerName)
  pushTextChange(summary, 'address', 'Address changed', previous.customerAddress, next.customerAddress)
  pushTextChange(summary, 'workType', 'Work type changed', previous.workType, next.workType)
  pushTextChange(summary, 'customerType', 'Customer type changed', previous.customerType, next.customerType)
  pushMoneyChange(
    summary,
    'financialSummary',
    'Jobber quote total changed',
    previous.financialSummary.quoteTotal,
    next.financialSummary.quoteTotal
  )
  pushLineItemChange(summary, previous.productsAndServices, next.productsAndServices)

  return {
    status: summary.length > 0 ? 'changed' : 'unchanged',
    summary: summary.slice(0, SUMMARY_LIMIT),
  }
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function formatMoney(value: number): string {
  return `$${new Decimal(value).toFixed(2)}`
}

function pushTextChange(
  summary: JobberSnapshotChangeSummaryItem[],
  field: JobberSnapshotChangeSummaryItem['field'],
  label: string,
  previous: string,
  next: string
) {
  const before = normalizeText(previous)
  const after = normalizeText(next)
  if (before === after) return

  summary.push({ field, label, before, after })
}

function pushMoneyChange(
  summary: JobberSnapshotChangeSummaryItem[],
  field: JobberSnapshotChangeSummaryItem['field'],
  label: string,
  previous: number,
  next: number
) {
  const before = new Decimal(previous)
  const after = new Decimal(next)
  if (before.eq(after)) return

  summary.push({
    field,
    label,
    before: formatMoney(previous),
    after: formatMoney(next),
  })
}

function pushLineItemChange(
  summary: JobberSnapshotChangeSummaryItem[],
  previous: JobberQuoteDraftLineItem[],
  next: JobberQuoteDraftLineItem[]
) {
  const previousSignatures = previous.map(lineSignature)
  const nextSignatures = next.map(lineSignature)
  if (arraysEqual(previousSignatures, nextSignatures)) return

  const initialSummaryLength = summary.length
  for (const line of previous) {
    const nextLine = next.find((candidate) => candidate.id === line.id)
    if (!nextLine) continue
    if (lineStatusSignature(line) !== lineStatusSignature(nextLine)) {
      summary.push({ field: 'lineItems', label: 'Product / Service line status changed',
        before: `${normalizeText(line.name)} (${lineStatusSignature(line)})`,
        after: `${normalizeText(nextLine.name)} (${lineStatusSignature(nextLine)})` })
    }
  }
  const previousTotal = sumLineTotals(previous)
  const nextTotal = sumLineTotals(next)
  if (!previousTotal.eq(nextTotal)) {
    summary.push({
      field: 'lineItems',
      label: 'Product / Service total changed',
      before: `$${previousTotal.toFixed(2)}`,
      after: `$${nextTotal.toFixed(2)}`,
    })
  }

  const previousStructure = previous.map(lineStructureSignature)
  const nextStructure = next.map(lineStructureSignature)
  if (arraysEqual(previousStructure, nextStructure)) {
    pushLinePricingChangeIfMissing(summary, initialSummaryLength, previous, next)
    return
  }

  if (
    previous.length !== next.length ||
    haveSameSignatureSet(previousStructure, nextStructure)
  ) {
    summary.push({
      field: 'lineItems',
      label: 'Product / Service lines changed',
      before: formatLineCount(previous.length),
      after: formatLineCount(next.length),
    })
    return
  }

  for (let index = 0; index < Math.max(previous.length, next.length); index += 1) {
    if (previousStructure[index] === nextStructure[index]) continue

    summary.push({
      field: 'lineItems',
      label: 'Product / Service lines changed',
      before: previous[index] ? formatLineLabel(previous[index]) : 'Missing line',
      after: next[index] ? formatLineLabel(next[index]) : 'Missing line',
    })
  }

  pushLinePricingChangeIfMissing(summary, initialSummaryLength, previous, next)
}

function lineSignature(line: JobberQuoteDraftLineItem): string {
  return [
    line.id,
    normalizeText(line.name),
    normalizeText(line.description),
    line.quantity.toFixed(4),
    new Decimal(line.unitPrice).toFixed(2),
    new Decimal(line.totalPrice).toFixed(2),
    line.textOnly === true ? 'text' : 'line',
    lineStatusSignature(line),
  ].join('|')
}

function lineStatusSignature(line: JobberQuoteDraftLineItem): string {
  return (['optional', 'recommended', 'selected'] as const)
    .map((field) => `${field}: ${typeof line[field] === 'boolean' ? String(line[field]) : 'unknown'}`)
    .join(', ')
}

function lineStructureSignature(line: JobberQuoteDraftLineItem): string {
  return [
    line.id,
    normalizeText(line.name),
    normalizeText(line.description),
    line.quantity.toFixed(4),
    line.textOnly === true ? 'text' : 'line',
  ].join('|')
}

function sumLineTotals(lines: JobberQuoteDraftLineItem[]): Decimal {
  return lines.reduce((total, line) => total.add(line.totalPrice), new Decimal(0))
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function haveSameSignatureSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false

  const counts = new Map<string, number>()
  for (const value of left) counts.set(value, (counts.get(value) ?? 0) + 1)
  for (const value of right) {
    const count = counts.get(value)
    if (!count) return false
    if (count === 1) counts.delete(value)
    else counts.set(value, count - 1)
  }
  return counts.size === 0
}

function formatLineCount(count: number): string {
  return `${count} ${count === 1 ? 'line' : 'lines'}`
}

function formatLineLabel(line: JobberQuoteDraftLineItem): string {
  const name = normalizeText(line.name) || 'Untitled line'
  if (line.textOnly) return `${name} (${formatMoney(line.totalPrice)})`

  return `${name} (qty ${formatQuantity(line.quantity)}, unit ${formatMoney(line.unitPrice)}, total ${formatMoney(line.totalPrice)})`
}

function formatQuantity(value: number): string {
  return new Decimal(value).toString()
}

function pushLinePricingChangeIfMissing(
  summary: JobberSnapshotChangeSummaryItem[],
  initialSummaryLength: number,
  previous: JobberQuoteDraftLineItem[],
  next: JobberQuoteDraftLineItem[]
) {
  if (summary.length > initialSummaryLength) return

  const changedIndex = previous.findIndex((line, index) => lineSignature(line) !== lineSignature(next[index]))
  summary.push({
    field: 'lineItems',
    label: 'Product / Service line pricing changed',
    before: previous[changedIndex] ? formatLineLabel(previous[changedIndex]) : 'Missing line',
    after: next[changedIndex] ? formatLineLabel(next[changedIndex]) : 'Missing line',
  })
}
