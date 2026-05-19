import Decimal from 'decimal.js'

export type JobberSaveMode = 'priced_line_items' | 'description_total'
export type JobberQuoteLineKind = 'line_item' | 'text'
export type DecimalInput = Decimal | string | number

export interface JobberQuoteLineInput {
  kind: JobberQuoteLineKind
  name: string
  description?: string | null
  quantity?: DecimalInput | null
  unitPrice?: DecimalInput | null
  taxable?: boolean | null
  clientVisible?: boolean | null
  jobberLineItemId?: string | null
  linkedProductOrServiceId?: string | null
  position?: number | null
  [key: string]: unknown
}

export interface BuildJobberQuoteLinePayloadInput {
  saveMode: JobberSaveMode
  lines: JobberQuoteLineInput[]
  finalTotal: DecimalInput
  finalTotalIncludesGst: boolean
  deletedJobberLineItemIds?: string[]
  internalMaterials?: unknown
}

export interface JobberQuoteLinePayloadItem {
  name: string
  description: string
  quantity: number
  unitPrice: number
  taxable: boolean
  linkedProductOrServiceId?: string
}

export interface JobberQuoteLinePayload {
  lineItems: JobberQuoteLinePayloadItem[]
}

export interface JobberQuoteLineMutationItem {
  kind: JobberQuoteLineKind
  name: string
  description: string
  quantity?: number
  unitPrice?: number
  totalPrice?: number
  taxable?: boolean
  productOrServiceId?: string
  jobberLineItemId?: string
  sourcePosition?: number
  sortOrder?: number
}

const GST_MULTIPLIER = new Decimal('1.10')

function decimalFrom(value: DecimalInput): Decimal {
  return value instanceof Decimal ? value : new Decimal(value)
}

function moneyNumber(value: DecimalInput): number {
  return decimalFrom(value).toDecimalPlaces(2).toNumber()
}

function quantityNumber(value: DecimalInput | null | undefined): number {
  if (value === null || value === undefined) return 1
  return decimalFrom(value).toDecimalPlaces(2).toNumber()
}

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function publicLines(lines: JobberQuoteLineInput[]): JobberQuoteLineInput[] {
  return lines.filter((line) => line.clientVisible !== false)
}

function buildPricedLine(line: JobberQuoteLineInput): JobberQuoteLinePayloadItem {
  const payload: JobberQuoteLinePayloadItem = {
    name: cleanText(line.name),
    description: cleanText(line.description),
    quantity: line.kind === 'text' ? 1 : quantityNumber(line.quantity),
    unitPrice: line.kind === 'text' ? 0 : moneyNumber(line.unitPrice ?? 0),
    taxable: line.kind === 'text' ? false : line.taxable !== false,
  }

  const linkedProductOrServiceId = cleanText(line.linkedProductOrServiceId)
  if (linkedProductOrServiceId && line.kind === 'line_item') {
    payload.linkedProductOrServiceId = linkedProductOrServiceId
  }

  return payload
}

function buildDescriptionLine(line: JobberQuoteLineInput): JobberQuoteLinePayloadItem {
  return {
    name: cleanText(line.name),
    description: cleanText(line.description),
    quantity: 1,
    unitPrice: 0,
    taxable: false,
  }
}

function buildTotalLine(finalTotal: DecimalInput, finalTotalIncludesGst: boolean): JobberQuoteLinePayloadItem {
  const unitPrice = finalTotalIncludesGst
    ? decimalFrom(finalTotal).div(GST_MULTIPLIER)
    : decimalFrom(finalTotal)

  return {
    name: 'Total',
    description: '',
    quantity: 1,
    unitPrice: moneyNumber(unitPrice),
    taxable: true,
  }
}

function buildPricedMutationLine(line: JobberQuoteLineInput): JobberQuoteLineMutationItem {
  const unitPrice = moneyNumber(line.unitPrice ?? 0)
  const quantity = quantityNumber(line.quantity)
  const payload: JobberQuoteLineMutationItem = {
    kind: 'line_item',
    name: cleanText(line.name),
    description: cleanText(line.description),
    quantity,
    unitPrice,
    totalPrice: moneyNumber(decimalFrom(quantity).mul(unitPrice)),
    taxable: line.taxable !== false,
  }

  const jobberLineItemId = cleanText(line.jobberLineItemId)
  if (jobberLineItemId) {
    payload.jobberLineItemId = jobberLineItemId
  }

  if (typeof line.position === 'number') {
    payload.sourcePosition = line.position
    payload.sortOrder = line.position
  }

  const linkedProductOrServiceId = cleanText(line.linkedProductOrServiceId)
  if (linkedProductOrServiceId) {
    payload.productOrServiceId = linkedProductOrServiceId
  }

  return payload
}

function buildTextMutationLine(line: JobberQuoteLineInput): JobberQuoteLineMutationItem {
  const payload: JobberQuoteLineMutationItem = {
    kind: 'text',
    name: cleanText(line.name),
    description: cleanText(line.description),
  }

  const jobberLineItemId = cleanText(line.jobberLineItemId)
  if (jobberLineItemId) {
    payload.jobberLineItemId = jobberLineItemId
  }

  if (typeof line.position === 'number') {
    payload.sourcePosition = line.position
    payload.sortOrder = line.position
  }

  return payload
}

function buildTotalMutationLine(finalTotal: DecimalInput, finalTotalIncludesGst: boolean): JobberQuoteLineMutationItem {
  const totalLine = buildTotalLine(finalTotal, finalTotalIncludesGst)
  return {
    kind: 'line_item',
    name: totalLine.name,
    description: totalLine.description,
    quantity: totalLine.quantity,
    unitPrice: totalLine.unitPrice,
    totalPrice: moneyNumber(decimalFrom(totalLine.quantity).mul(totalLine.unitPrice)),
    taxable: totalLine.taxable,
  }
}

export function buildJobberQuoteLinePayload(
  input: BuildJobberQuoteLinePayloadInput
): JobberQuoteLinePayload {
  const lines = publicLines(input.lines)

  if (input.saveMode === 'description_total') {
    return {
      lineItems: [
        ...lines.map(buildDescriptionLine),
        buildTotalLine(input.finalTotal, input.finalTotalIncludesGst),
      ],
    }
  }

  return {
    lineItems: lines.map(buildPricedLine),
  }
}

export function buildJobberQuoteLineMutationItems(
  input: BuildJobberQuoteLinePayloadInput
): JobberQuoteLineMutationItem[] {
  const lines = publicLines(input.lines)

  if (input.saveMode === 'description_total') {
    return [
      ...lines.map(buildTextMutationLine),
      buildTotalMutationLine(input.finalTotal, input.finalTotalIncludesGst),
    ]
  }

  return lines.map((line) => line.kind === 'text' ? buildTextMutationLine(line) : buildPricedMutationLine(line))
}
