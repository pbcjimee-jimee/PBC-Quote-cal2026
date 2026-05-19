import Decimal from 'decimal.js'
import type { JobberCustomField, JobberExpense, JobberExpenseUser, JobberJobDetail, JobberQuote, JobberQuoteAddress } from './client'

export interface JobberQuoteDraft {
  jobberQuoteId: string
  sourceType: 'quote' | 'job'
  quoteNumber: string
  createdAt: string
  customerName: string
  customerAddress: string
  workType: string
  areaSqft: number | null
  customerType: string
  sourceUrl: string
  productsAndServices: JobberQuoteDraftLineItem[]
  jobExpenses: JobberQuoteDraftJobExpenses[]
  jobExpensesError: string | null
  financialSummary: JobberQuoteFinancialSummary
}

export interface JobberQuoteFinancialSummary {
  quoteTotal: number
  expensesTotal: number
  profit: number
  profitMarginPercent: number | null
}

export interface JobberQuoteDraftLineItem {
  id: string
  name: string
  category: string
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  linkedName: string | null
  textOnly?: boolean
}

export interface JobberQuoteDraftJobExpenses {
  jobId: string
  jobNumber: number
  jobTitle: string
  jobStatus: string
  jobUrl: string
  expenses: JobberQuoteDraftExpense[]
}

export interface JobberQuoteDraftExpense {
  id: string
  title: string
  description: string
  date: string
  total: number | null
  enteredBy: string | null
  paidBy: string | null
  reimbursableTo: string | null
}

function compact(parts: Array<string | null | undefined>): string[] {
  return parts.map((part) => part?.trim() ?? '').filter(Boolean)
}

function formatCustomerName(quote: JobberQuote): string {
  const client = quote.client
  if (!client) return ''
  if (client.name?.trim()) return client.name.trim()
  if (client.companyName?.trim()) return client.companyName.trim()
  return compact([client.firstName, client.lastName]).join(' ')
}

function formatAddress(address: JobberQuoteAddress | null | undefined): string {
  if (!address) return ''
  return compact([
    address.street1,
    address.street2,
    address.city,
    address.province,
    address.postalCode,
  ]).join(', ')
}

function getCustomFieldValue(field: JobberCustomField): string {
  if (field.valueText?.trim()) return field.valueText.trim()
  if (field.valueDropdown?.trim()) return field.valueDropdown.trim()
  if (typeof field.valueNumeric === 'number') return String(field.valueNumeric)
  if (typeof field.valueTrueFalse === 'boolean') return field.valueTrueFalse ? 'true' : 'false'
  if (field.valueArea) return String(field.valueArea.length * field.valueArea.width)
  return ''
}

function formatCustomField(field: JobberCustomField): string {
  return compact([field.label, getCustomFieldValue(field), field.unit]).join(' ')
}

function collectCustomFields(quote: JobberQuote): JobberCustomField[] {
  return [
    ...(quote.customFields ?? []),
    ...(quote.client?.customFields ?? []),
    ...(quote.property?.customFields ?? []),
  ]
}

function buildQuoteText(quote: JobberQuote): string {
  const clientTags = quote.client?.tags?.nodes.map((tag) => tag.label) ?? []
  const sourceAttribution = quote.client?.sourceAttribution

  return compact([
    quote.title,
    quote.message,
    quote.client?.leadSource,
    sourceAttribution?.displayLeadSource,
    sourceAttribution?.source,
    sourceAttribution?.sourceText,
    ...clientTags,
    ...collectCustomFields(quote).map(formatCustomField),
    ...quote.lineItems.nodes.flatMap((item) => [
      item.name,
      item.description,
      item.linkedProductOrService?.name,
      item.linkedProductOrService?.description,
    ]),
  ]).join('\n')
}

function normalizeWorkType(value: string): string {
  const text = value.toLowerCase()
  const hasExterior = /\b(exterior|external|outside|facade|fascia|eaves|gutter|roof|render)\b/.test(text)
  const hasInterior = /\b(interior|internal|inside|ceiling|bedroom|bathroom|kitchen|living\s+room|hallway)\b/.test(text)

  if (hasExterior && hasInterior) return 'Exterior / Interior'
  if (hasExterior) return 'Exterior'
  if (hasInterior) return 'Interior'
  return ''
}

function findCustomFieldValue(fields: JobberCustomField[], labelPattern: RegExp): string {
  const field = fields.find((candidate) => labelPattern.test(candidate.label))
  return field ? getCustomFieldValue(field) : ''
}

function inferWorkType(quote: JobberQuote, fields: JobberCustomField[]): string {
  const customWorkType = normalizeWorkType(findCustomFieldValue(fields, /\b(work\s*type|scope)\b/i))
  if (customWorkType) return customWorkType

  const text = buildQuoteText(quote)
  const fallback = quote.title?.trim() || quote.message?.trim() || ''
  return normalizeWorkType(text) || fallback
}

function parseAreaSqft(text: string): number | null {
  const labelledMatch = text.match(/\barea\s*(?:sq\s*\.?\s*ft|sqft|square\s*feet)?\s*[:=-]\s*([0-9][0-9,]*(?:\.\d+)?)/i)
  const unitMatch = text.match(/\b([0-9][0-9,]*(?:\.\d+)?)\s*(?:sq\s*\.?\s*ft|sqft|square\s*feet)\b/i)
  const match = labelledMatch ?? unitMatch
  if (!match) return null

  const value = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value)
}

function parseAreaSqftFromCustomFields(fields: JobberCustomField[]): number | null {
  const areaField = fields.find((field) => {
    const labelAndUnit = compact([field.label, field.unit]).join(' ')
    return /\b(area|sq\s*\.?\s*ft|sqft|square\s*feet)\b/i.test(labelAndUnit)
  })
  if (!areaField) return null

  if (typeof areaField.valueNumeric === 'number') return Math.round(areaField.valueNumeric)
  if (areaField.valueArea) return Math.round(areaField.valueArea.length * areaField.valueArea.width)
  return parseAreaSqft(formatCustomField(areaField))
}

function normalizeCustomerType(value: string): string {
  const normalized = value.toLowerCase()
  if (/\b(real\s*estate|realestate|realtor|property\s*manager|agent)\b/.test(normalized)) return 'Real Estate'
  if (/\b(residential|resident|home\s*owner|homeowner)\b/.test(normalized)) return 'Residential'
  if (/\b(commercial|business|office|shop|retail)\b/.test(normalized)) return 'Commercial'
  return ''
}

function inferCustomerType(text: string): string {
  const labelledMatch = text.match(/\b(?:customer|client|property)\s*(?:type|category)\s*[:=-]\s*([^\n\r,;]+)/i)
  if (labelledMatch) {
    const labelledType = normalizeCustomerType(labelledMatch[1])
    if (labelledType) return labelledType
  }

  return normalizeCustomerType(text)
}

function getJobType(fields: JobberCustomField[]): string {
  return findCustomFieldValue(fields, /^\s*job\s*type\s*$/i).trim()
}

function formatExpenseUser(user: JobberExpenseUser | null): string | null {
  return user?.name?.full?.trim() || null
}

function moneyToNumber(value: Decimal): number {
  return value.toDecimalPlaces(2).toNumber()
}

function percentToNumber(value: Decimal): number {
  return value.toDecimalPlaces(1).toNumber()
}

function calculateFinancialSummary(
  productsAndServices: JobberQuoteDraftLineItem[],
  jobExpenses: JobberQuoteDraftJobExpenses[],
  sourceTotal?: number
): JobberQuoteFinancialSummary {
  const quoteTotal = typeof sourceTotal === 'number'
    ? new Decimal(sourceTotal)
    : productsAndServices.reduce(
      (total, item) => total.add(item.totalPrice),
      new Decimal(0)
    )
  const expensesTotal = jobExpenses.reduce(
    (jobsTotal, job) => jobsTotal.add(job.expenses.reduce(
      (expenseTotal, expense) => expense.total === null ? expenseTotal : expenseTotal.add(expense.total),
      new Decimal(0)
    )),
    new Decimal(0)
  )
  const profit = quoteTotal.sub(expensesTotal)
  const profitMarginPercent = quoteTotal.gt(0)
    ? percentToNumber(profit.div(quoteTotal).mul(100))
    : null

  return {
    quoteTotal: moneyToNumber(quoteTotal),
    expensesTotal: moneyToNumber(expensesTotal),
    profit: moneyToNumber(profit),
    profitMarginPercent,
  }
}

function mapLineItems(items: JobberQuote['lineItems']['nodes']): JobberQuoteDraftLineItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    linkedName: item.linkedProductOrService?.name ?? null,
    textOnly: item.textOnly,
  }))
}

function getVisitLabel(title: string | null, startAt: string | null): string {
  const titleLabel = title?.trim()
  if (titleLabel) return titleLabel
  if (startAt?.trim()) return startAt.slice(0, 10)
  return 'Visit'
}

function mapJobLineItemsWithVisitExtras(job: JobberJobDetail): JobberQuoteDraftLineItem[] {
  const baseItems = mapLineItems(job.lineItems.nodes)
  const baseById = new Map(job.lineItems.nodes.map((item) => [item.id, item]))
  const seenItemIds = new Set(baseItems.map((item) => item.id))
  const visitItems = job.visits?.nodes.flatMap((visit) => {
    const visitLabel = getVisitLabel(visit.title, visit.startAt)

    return visit.lineItems.nodes.flatMap((item) => {
      const baseItem = baseById.get(item.id)
      const isUnchangedBaseItem = baseItem &&
        baseItem.quantity === item.quantity &&
        baseItem.unitPrice === item.unitPrice &&
        baseItem.totalPrice === item.totalPrice

      if (isUnchangedBaseItem || (!baseItem && seenItemIds.has(item.id))) return []

      seenItemIds.add(item.id)
      const mapped = mapLineItems([item])[0]
      return [{
        ...mapped,
        id: baseItem ? `${visit.id}:${item.id}` : mapped.id,
        name: baseItem ? `${mapped.name} (${visitLabel})` : mapped.name,
      }]
    })
  }) ?? []

  return [...baseItems, ...visitItems]
}

function mapExpense(expense: JobberExpense): JobberQuoteDraftExpense {
  return {
    id: expense.id,
    title: expense.title,
    description: expense.description ?? '',
    date: expense.date,
    total: expense.total,
    enteredBy: formatExpenseUser(expense.enteredBy),
    paidBy: formatExpenseUser(expense.paidBy),
    reimbursableTo: formatExpenseUser(expense.reimbursableTo),
  }
}

export function mapJobberQuoteToDraft(quote: JobberQuote): JobberQuoteDraft {
  const customFields = collectCustomFields(quote)
  const quoteText = buildQuoteText(quote)
  const jobType = getJobType(customFields)
  const productsAndServices = mapLineItems(quote.lineItems.nodes)
  const jobExpenses = quote.jobs?.nodes.map((job) => ({
    jobId: job.id,
    jobNumber: job.jobNumber,
    jobTitle: job.title?.trim() || '',
    jobStatus: job.jobStatus,
    jobUrl: job.jobberWebUri,
    expenses: job.expenses.nodes.map(mapExpense),
  })) ?? []

  return {
    jobberQuoteId: quote.id,
    sourceType: 'quote',
    quoteNumber: quote.quoteNumber,
    createdAt: quote.createdAt,
    customerName: formatCustomerName(quote),
    customerAddress: formatAddress(quote.property?.address),
    workType: inferWorkType(quote, customFields),
    areaSqft: parseAreaSqftFromCustomFields(customFields) ?? parseAreaSqft(quoteText),
    customerType: jobType || inferCustomerType(quoteText),
    sourceUrl: quote.jobberWebUri,
    productsAndServices,
    jobExpenses,
    jobExpensesError: null,
    financialSummary: calculateFinancialSummary(productsAndServices, jobExpenses),
  }
}

function collectJobCustomFields(job: JobberJobDetail): JobberCustomField[] {
  return [
    ...(job.customFields ?? []),
    ...(job.client?.customFields ?? []),
    ...(job.property?.customFields ?? []),
  ]
}

function buildJobText(job: JobberJobDetail): string {
  const clientTags = job.client?.tags?.nodes.map((tag) => tag.label) ?? []
  const sourceAttribution = job.client?.sourceAttribution

  return compact([
    job.title,
    job.instructions,
    job.jobType,
    job.client?.leadSource,
    sourceAttribution?.displayLeadSource,
    sourceAttribution?.source,
    sourceAttribution?.sourceText,
    ...clientTags,
    ...collectJobCustomFields(job).map(formatCustomField),
    ...job.lineItems.nodes.flatMap((item) => [
      item.name,
      item.description,
      item.linkedProductOrService?.name,
      item.linkedProductOrService?.description,
    ]),
  ]).join('\n')
}

export function mapJobberJobToDraft(job: JobberJobDetail): JobberQuoteDraft {
  const customFields = collectJobCustomFields(job)
  const jobText = buildJobText(job)
  const jobType = getJobType(customFields)
  const productsAndServices = mapJobLineItemsWithVisitExtras(job)
  const jobExpenses = [
    {
      jobId: job.id,
      jobNumber: job.jobNumber,
      jobTitle: job.title?.trim() || '',
      jobStatus: job.jobStatus,
      jobUrl: job.jobberWebUri,
      expenses: job.expenses.nodes.map(mapExpense),
    },
  ]

  return {
    jobberQuoteId: job.quote?.id ?? job.id,
    sourceType: 'job',
    quoteNumber: `Job #${job.jobNumber}`,
    createdAt: job.createdAt,
    customerName: formatCustomerName({
      ...job,
      quoteNumber: String(job.jobNumber),
      message: job.instructions,
      lineItems: job.lineItems,
      jobs: { nodes: [job] },
    }),
    customerAddress: formatAddress(job.property?.address),
    workType: normalizeWorkType(findCustomFieldValue(customFields, /\b(work\s*type|scope)\b/i)) || normalizeWorkType(jobText) || job.title?.trim() || '',
    areaSqft: parseAreaSqftFromCustomFields(customFields) ?? parseAreaSqft(jobText),
    customerType: jobType || inferCustomerType(jobText),
    sourceUrl: job.jobberWebUri,
    productsAndServices,
    jobExpenses,
    jobExpensesError: null,
    financialSummary: calculateFinancialSummary(productsAndServices, jobExpenses, job.total),
  }
}
