import Decimal from 'decimal.js'
import type { JobberQuoteDraftLineItem } from '@/lib/jobber/mapper'
import type { MaterialItem, QuoteOptionItem } from './types'

export interface JobberOptionImportCandidate {
  id: string
  title: string
  sourceLineIds: string[]
  lines: JobberQuoteDraftLineItem[]
  total: number
}

const OPTION_HEADING_PATTERN = /^(option(?:\s+\d+)?|optional(?:\s+add[-\s]?on)?|alternate|alternative|add[-\s]?on|addon)\b/i
const OPTION_LINE_START_PATTERN = /^(option|optional|alternate|alternative|add[-\s]?on|addon)\b/i

function normalizeOptionFingerprintText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function decimalFingerprint(value: Decimal.Value | undefined): string | null {
  if (value === undefined || String(value).trim() === '') return null

  try {
    return new Decimal(value).toDecimalPlaces(2).toFixed(2)
  } catch {
    return null
  }
}

function getImportedLineName(line: JobberQuoteDraftLineItem, index: number): string {
  return line.name.trim() || line.description.trim() || `Jobber option line ${index + 1}`
}

export function getJobberOptionCandidateFingerprint(candidate: JobberOptionImportCandidate): string {
  return JSON.stringify({
    title: normalizeOptionFingerprintText(candidate.title),
    total: new Decimal(candidate.total).toDecimalPlaces(2).toFixed(2),
    lines: candidate.lines.map((line, index) => ({
      name: normalizeOptionFingerprintText(getImportedLineName(line, index)),
      total: new Decimal(line.totalPrice).toDecimalPlaces(2).toFixed(2),
    })),
  })
}

export function getQuoteOptionImportFingerprint(option: QuoteOptionItem): string | null {
  const title = normalizeOptionFingerprintText(option.title)
  if (!title || option.materials.length === 0) return null

  let total = new Decimal(0)
  const lines: Array<{ name: string; total: string }> = []

  for (const material of option.materials) {
    const name = normalizeOptionFingerprintText(material.name)
    const marketPrice = decimalFingerprint(material.marketPrice)
    const actualPrice = decimalFingerprint(material.actualPrice)
    const quantity = decimalFingerprint(material.quantity)
    const workingDays = decimalFingerprint(material.workingDays)
    const labourPerDay = decimalFingerprint(material.labourPerDay)

    if (
      !name ||
      marketPrice === null ||
      actualPrice === null ||
      quantity === null ||
      workingDays === null ||
      labourPerDay === null ||
      marketPrice !== actualPrice ||
      quantity !== '1.00' ||
      workingDays !== '0.00' ||
      labourPerDay !== '0.00' ||
      material.isCustom !== true
    ) {
      return null
    }

    total = total.add(marketPrice)
    lines.push({ name, total: marketPrice })
  }

  return JSON.stringify({
    title,
    total: total.toDecimalPlaces(2).toFixed(2),
    lines,
  })
}

export function isJobberOptionCandidateAlreadyImported(
  candidate: JobberOptionImportCandidate,
  options: QuoteOptionItem[]
): boolean {
  const importedIds = new Set(options.flatMap((option) => option.sourceJobberLineItemIds ?? []))
  if (candidate.sourceLineIds.some((id) => importedIds.has(id))) return true

  const candidateFingerprint = getJobberOptionCandidateFingerprint(candidate)
  return options.some((option) => {
    const fingerprint = getQuoteOptionImportFingerprint(option)
    return fingerprint === candidateFingerprint || (option.materials.length > 0 && fingerprint === null
      && normalizeOptionFingerprintText(option.title) === normalizeOptionFingerprintText(candidate.title))
  })
}

export function buildJobberOptionImportCandidates(
  lines: JobberQuoteDraftLineItem[]
): JobberOptionImportCandidate[] {
  const candidates: JobberOptionImportCandidate[] = []
  let current: { title: string; headingId: string; lines: JobberQuoteDraftLineItem[] } | null = null

  function flushCurrent() {
    if (!current || current.lines.length === 0) return

    const sourceLineIds = [current.headingId, ...current.lines.map((line) => line.id)]
    const total = current.lines
      .reduce((sum, line) => sum.add(line.totalPrice), new Decimal(0))
      .toDecimalPlaces(2)
      .toNumber()

    candidates.push({
      id: sourceLineIds.join('|'),
      title: current.title,
      sourceLineIds,
      lines: current.lines,
      total,
    })
  }

  for (const line of lines) {
    const titleText = `${line.name} ${line.description}`.trim()
    const isOptionHeading = line.textOnly === true && OPTION_HEADING_PATTERN.test(titleText)
    if (isOptionHeading) {
      flushCurrent()
      current = { title: line.name.trim() || line.description.trim() || 'Jobber option', headingId: line.id, lines: [] }
      continue
    }

    const isPriced = line.textOnly !== true && new Decimal(line.totalPrice).gt(0)
    if (current && isPriced) {
      current.lines.push(line)
      continue
    }

    if (isPriced && OPTION_LINE_START_PATTERN.test(line.name.trim())) {
      candidates.push({
        id: line.id,
        title: line.name.trim(),
        sourceLineIds: [line.id],
        lines: [line],
        total: new Decimal(line.totalPrice).toDecimalPlaces(2).toNumber(),
      })
    }

    if (current && !isPriced) {
      flushCurrent()
      current = null
    }
  }

  flushCurrent()
  return candidates
}

export function convertJobberOptionCandidateToQuoteOption(
  candidate: JobberOptionImportCandidate,
  createId: (prefix: string) => string
): QuoteOptionItem {
  return {
    id: createId('option'),
    title: candidate.title,
    selectedMin: 1,
    selectedMax: 1,
    isExpanded: true,
    sourceJobberLineItemIds: candidate.sourceLineIds,
    materials: candidate.lines.map((line, index): MaterialItem => ({
      id: createId('option-item'),
      name: getImportedLineName(line, index),
      marketPrice: new Decimal(line.totalPrice).toFixed(2),
      actualPrice: new Decimal(line.totalPrice).toFixed(2),
      quantity: '1',
      workingDays: '0',
      labourPerDay: '0',
      isCustom: true,
    })),
  }
}
