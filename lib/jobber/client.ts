import { JOBBER_GRAPHQL_URL } from './config'
import {
  buildJobberQuoteLineMutationItems,
  type BuildJobberQuoteLinePayloadInput,
  type JobberQuoteLineMutationItem,
} from './quote-line-payload'

export interface JobberQuoteAddress {
  street1?: string | null
  street2?: string | null
  city?: string | null
  province?: string | null
  postalCode?: string | null
}

export interface JobberClient {
  id: string
  name: string | null
  companyName: string | null
  firstName: string | null
  lastName: string | null
  leadSource?: string | null
  sourceAttribution?: {
    displayLeadSource?: string | null
    source?: string | null
    sourceText?: string | null
  } | null
  tags?: {
    nodes: Array<{
      id: string
      label: string
    }>
  }
  customFields?: JobberCustomField[]
}

export interface JobberProperty {
  id: string
  jobberWebUri: string
  address?: JobberQuoteAddress | null
  customFields?: JobberCustomField[]
}

export interface JobberQuote {
  id: string
  quoteNumber: string
  title: string | null
  createdAt: string
  message: string | null
  customFields?: JobberCustomField[]
  jobberWebUri: string
  client: JobberClient | null
  property: JobberProperty | null
  lineItems: {
    nodes: JobberQuoteLineItem[]
  }
  jobs?: {
    nodes: JobberJob[]
  } | null
}

export interface JobberJob {
  id: string
  jobNumber: number
  title: string | null
  jobStatus: string
  jobberWebUri: string
  expenses: {
    nodes: JobberExpense[]
  }
}

export interface JobberJobDetail extends JobberJob {
  createdAt: string
  instructions: string | null
  customFields?: JobberCustomField[]
  jobType: string
  total: number
  client: JobberClient | null
  property: JobberProperty | null
  quote: {
    id: string
    quoteNumber: string
    jobberWebUri: string
  } | null
  lineItems: {
    nodes: JobberQuoteLineItem[]
  }
  visits?: {
    nodes: JobberVisit[]
  }
}

export interface JobberVisit {
  id: string
  title: string | null
  visitStatus: string
  startAt: string | null
  lineItems: {
    nodes: JobberQuoteLineItem[]
  }
}

export interface JobberExpenseUser {
  name?: {
    full?: string | null
  } | null
}

export interface JobberExpense {
  id: string
  title: string
  description: string | null
  date: string
  total: number | null
  enteredBy: JobberExpenseUser | null
  paidBy: JobberExpenseUser | null
  reimbursableTo: JobberExpenseUser | null
}

export interface JobberCustomField {
  label: string
  unit?: string | null
  valueText?: string
  valueDropdown?: string
  valueNumeric?: number
  valueArea?: {
    length: number
    width: number
  }
  valueTrueFalse?: boolean
}

export interface JobberQuoteLineItem {
  id: string
  name: string
  category: string
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  textOnly?: boolean
  linkedProductOrService: {
    id: string
    name: string
    category: string
    description: string
  } | null
}

interface FetchJobberQuoteOptions {
  accessToken: string
  graphqlVersion: string
  fetcher?: (input: string, init: RequestInit) => Promise<Response>
  throttleRetryDelayMs?: number
  maxThrottleRetries?: number
  preferFullQuoteQuery?: boolean
}

export class JobberApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'JobberApiError'
  }
}

export class JobberGraphqlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JobberGraphqlError'
  }
}

export class JobberPermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JobberPermissionError'
  }
}

interface JobberJobSearchResult {
  id: string
  jobNumber: number
  title: string | null
}

interface JobberQuoteSearchResult {
  id: string
  quoteNumber: string
  title: string | null
}

export interface JobberQuoteLineSyncResult {
  deletedLineItemIds: string[]
  createdLineItemIds: string[]
  editedLineItemIds: string[]
  syncedLineItems: Array<{
    sourcePosition: number
    jobberLineItemId: string
  }>
}

interface MutationError {
  message?: string
}

const DEFAULT_THROTTLE_RETRIES = 4
const DEFAULT_THROTTLE_RETRY_DELAY_MS = 500
const MAX_THROTTLE_RETRY_DELAY_MS = 10000

export function assertJobberReadOnlyGraphqlDocument(query: string): void {
  const executableLines = query
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean)
  const document = executableLines.join(' ')

  if (/\bmutation\b/i.test(document)) {
    throw new Error('Jobber integration is read-only; GraphQL mutations are not allowed')
  }
}

const JOBBER_QUOTE_QUERY = `
  fragment PbcCustomFieldParts on CustomFieldUnion {
    ... on CustomFieldText {
      label
      valueText
    }
    ... on CustomFieldDropdown {
      label
      valueDropdown
    }
    ... on CustomFieldNumeric {
      label
      unit
      valueNumeric
    }
    ... on CustomFieldArea {
      label
      unit
      valueArea {
        length
        width
      }
    }
    ... on CustomFieldTrueFalse {
      label
      valueTrueFalse
    }
    ... on CustomFieldLink {
      label
    }
  }

  query PbcQuote($id: EncodedId!) {
    quote(id: $id) {
      id
      quoteNumber
      title
      createdAt
      message
      customFields {
        ...PbcCustomFieldParts
      }
      jobberWebUri
      client {
        id
        name
        companyName
        firstName
        lastName
        leadSource
        sourceAttribution {
          displayLeadSource
          source
          sourceText
        }
        tags(first: 20) {
          nodes {
            id
            label
          }
        }
        customFields {
          ...PbcCustomFieldParts
        }
      }
      property {
        id
        jobberWebUri
        customFields {
          ...PbcCustomFieldParts
        }
        address {
          street1
          street2
          city
          province
          postalCode
        }
      }
      lineItems(first: 100) {
        nodes {
          id
          name
          category
          description
          quantity
          unitPrice
          totalPrice
          textOnly
          linkedProductOrService {
            id
            name
            category
            description
          }
        }
      }
    }
  }
`

const JOBBER_QUOTE_LITE_QUERY = `
  query PbcQuoteLite($id: EncodedId!) {
    quote(id: $id) {
      id
      quoteNumber
      title
      createdAt
      message
      jobberWebUri
      client {
        id
        name
        companyName
        firstName
        lastName
        leadSource
        sourceAttribution {
          displayLeadSource
          source
          sourceText
        }
      }
      property {
        id
        jobberWebUri
        address {
          street1
          street2
          city
          province
          postalCode
        }
      }
      lineItems(first: 100) {
        nodes {
          id
          name
          category
          description
          quantity
          unitPrice
          totalPrice
          textOnly
          linkedProductOrService {
            id
            name
            category
            description
          }
        }
      }
    }
  }
`

const JOBBER_QUOTE_SEARCH_LOOKUP_QUERY = `
  query PbcQuoteSearchLookup($term: String!) {
    quotes(searchTerm: $term, first: 10) {
      nodes {
        id
        quoteNumber
        title
      }
    }
  }
`

const JOBBER_QUOTE_LINE_ITEMS_QUERY = `
  query PbcQuoteLineItems($id: EncodedId!) {
    quote(id: $id) {
      id
      lineItems(first: 100) {
        nodes {
          id
          name
          category
          description
          quantity
          unitPrice
          totalPrice
          textOnly
          linkedProductOrService {
            id
            name
            category
            description
          }
        }
      }
    }
  }
`

const JOBBER_QUOTE_JOBS_QUERY = `
  query PbcQuoteJobs($id: EncodedId!) {
    quote(id: $id) {
      jobs(first: 5) {
        nodes {
          id
          jobNumber
          title
          jobStatus
          jobberWebUri
          expenses(first: 25) {
            nodes {
              id
              title
              description
              date
              total
              enteredBy {
                name {
                  full
                }
              }
              paidBy {
                name {
                  full
                }
              }
              reimbursableTo {
                name {
                  full
                }
              }
            }
          }
        }
      }
    }
  }
`

const JOBBER_JOB_QUERY = `
  fragment PbcCustomFieldParts on CustomFieldUnion {
    ... on CustomFieldText {
      label
      valueText
    }
    ... on CustomFieldDropdown {
      label
      valueDropdown
    }
    ... on CustomFieldNumeric {
      label
      unit
      valueNumeric
    }
    ... on CustomFieldArea {
      label
      unit
      valueArea {
        length
        width
      }
    }
    ... on CustomFieldTrueFalse {
      label
      valueTrueFalse
    }
    ... on CustomFieldLink {
      label
    }
  }

  query PbcJob($id: EncodedId!) {
    job(id: $id) {
      id
      jobNumber
      title
      createdAt
      instructions
      customFields {
        ...PbcCustomFieldParts
      }
      jobStatus
      jobType
      total
      jobberWebUri
      client {
        id
        name
        companyName
        firstName
        lastName
        leadSource
        sourceAttribution {
          displayLeadSource
          source
          sourceText
        }
        tags(first: 20) {
          nodes {
            id
            label
          }
        }
        customFields {
          ...PbcCustomFieldParts
        }
      }
      property {
        id
        jobberWebUri
        customFields {
          ...PbcCustomFieldParts
        }
        address {
          street1
          street2
          city
          province
          postalCode
        }
      }
      quote {
        id
        quoteNumber
        jobberWebUri
      }
      lineItems(first: 100) {
        nodes {
          id
          name
          category
          description
          quantity
          unitPrice
          totalPrice
          textOnly
          linkedProductOrService {
            id
            name
            category
            description
          }
        }
      }
      expenses(first: 25) {
        nodes {
          id
          title
          description
          date
          total
          enteredBy {
            name {
              full
            }
          }
          paidBy {
            name {
              full
            }
          }
          reimbursableTo {
            name {
              full
            }
          }
        }
      }
    }
  }
`

const JOBBER_JOB_VISITS_QUERY = `
  query PbcJobVisits($id: EncodedId!) {
    job(id: $id) {
      visits(first: 10) {
        nodes {
          id
          title
          visitStatus
          startAt
          lineItems(first: 25) {
            nodes {
              id
              name
              category
              description
          quantity
          unitPrice
          totalPrice
          textOnly
          linkedProductOrService {
                id
                name
                category
                description
              }
            }
          }
        }
      }
    }
  }
`

const JOBBER_JOB_SEARCH_QUERY = `
  query PbcJobSearch($term: String!) {
    jobs(searchTerm: $term, first: 10) {
      nodes {
        id
        jobNumber
        title
      }
    }
  }
`

const JOBBER_QUOTE_DELETE_LINE_ITEMS_MUTATION = `
  mutation PbcQuoteDeleteLineItems($quoteId: EncodedId!, $lineItemIds: [EncodedId!]!) {
    quoteDeleteLineItems(quoteId: $quoteId, lineItemIds: $lineItemIds) {
      deletedLineItems {
        id
      }
      userErrors {
        message
        path
      }
    }
  }
`

const JOBBER_QUOTE_CREATE_LINE_ITEMS_MUTATION = `
  mutation PbcQuoteCreateLineItems($quoteId: EncodedId!, $lineItems: [QuoteCreateLineItemAttributes!]!) {
    quoteCreateLineItems(quoteId: $quoteId, lineItems: $lineItems) {
      createdLineItems {
        id
      }
      userErrors {
        message
        path
      }
    }
  }
`

const JOBBER_QUOTE_CREATE_TEXT_LINE_ITEMS_MUTATION = `
  mutation PbcQuoteCreateTextLineItems($quoteId: EncodedId!, $lineItems: [QuoteCreateTextLineItemAttributes!]!) {
    quoteCreateTextLineItems(quoteId: $quoteId, lineItems: $lineItems) {
      createdLineItems {
        id
      }
      userErrors {
        message
        path
      }
    }
  }
`

const JOBBER_QUOTE_EDIT_LINE_ITEMS_MUTATION = `
  mutation PbcQuoteEditLineItems($quoteId: EncodedId!, $lineItems: [QuoteEditLineItemAttributes!]!) {
    quoteEditLineItems(quoteId: $quoteId, lineItems: $lineItems) {
      modifiedLineItems {
        id
      }
      userErrors {
        message
        path
      }
    }
  }
`

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function formatGraphqlErrors(errors: unknown): string {
  if (!Array.isArray(errors)) return 'Jobber returned a GraphQL error'

  const messages = errors
    .map((error) => isRecord(error) && typeof error.message === 'string' ? error.message.trim() : '')
    .filter(Boolean)

  if (messages.length === 0) return 'Jobber returned a GraphQL error'
  return `Jobber returned a GraphQL error: ${messages.join('; ')}`
}

function hasHiddenObjectPermissionError(errors: unknown): boolean {
  return Array.isArray(errors) && errors.some((error) => (
    isRecord(error) &&
    typeof error.message === 'string' &&
    /object of type (?:job|expense) was hidden due to permissions/i.test(error.message)
  ))
}

function getQuoteFromPayload(payload: unknown): JobberQuote {
  if (!isRecord(payload)) throw new Error('Invalid Jobber response')
  const errors = payload.errors
  if (Array.isArray(errors) && errors.length > 0) {
    throw new JobberGraphqlError(formatGraphqlErrors(errors))
  }

  const data = payload.data
  if (!isRecord(data) || !isRecord(data.quote)) {
    throw new Error('Jobber quote not found')
  }

  return data.quote as unknown as JobberQuote
}

function getQuoteSearchResultFromPayload(payload: unknown, searchTerm: string): JobberQuoteSearchResult {
  if (!isRecord(payload)) throw new Error('Invalid Jobber response')
  const errors = payload.errors
  if (Array.isArray(errors) && errors.length > 0) {
    throw new JobberGraphqlError(formatGraphqlErrors(errors))
  }

  const data = payload.data
  if (!isRecord(data) || !isRecord(data.quotes)) {
    throw new Error('Jobber quote not found')
  }

  const nodes = data.quotes.nodes
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('Jobber quote not found')
  }

  const exactQuote = nodes.find((node) => (
    isRecord(node) &&
    typeof node.quoteNumber === 'string' &&
    node.quoteNumber.toLowerCase() === searchTerm.toLowerCase()
  ))
  const quote = exactQuote ?? nodes[0]
  if (!isRecord(quote) || typeof quote.id !== 'string' || typeof quote.quoteNumber !== 'string') {
    throw new Error('Jobber quote not found')
  }

  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    title: typeof quote.title === 'string' ? quote.title : null,
  }
}

function getQuoteLineItemsFromPayload(payload: unknown): JobberQuoteLineItem[] {
  if (!isRecord(payload)) throw new Error('Invalid Jobber response')
  const errors = payload.errors
  if (Array.isArray(errors) && errors.length > 0) {
    throw new JobberGraphqlError(formatGraphqlErrors(errors))
  }

  const data = payload.data
  if (!isRecord(data) || !isRecord(data.quote)) {
    throw new Error('Jobber quote not found')
  }

  const lineItems = data.quote.lineItems
  if (!isRecord(lineItems) || !Array.isArray(lineItems.nodes)) {
    return []
  }

  return lineItems.nodes.filter(isRecord) as unknown as JobberQuoteLineItem[]
}

function getQuoteJobsFromPayload(payload: unknown): JobberJob[] {
  if (!isRecord(payload)) throw new Error('Invalid Jobber response')
  const errors = payload.errors
  const data = payload.data
  if (!isRecord(data) || !isRecord(data.quote)) {
    if (hasHiddenObjectPermissionError(errors)) {
      throw new JobberPermissionError('Jobber hid Job or Expense data due to permissions. Turn on Jobs Read and Expenses Read, save the app, then Reconnect Jobber so the current token receives the new access.')
    }
    if (Array.isArray(errors) && errors.length > 0) {
      throw new JobberGraphqlError(formatGraphqlErrors(errors))
    }
    throw new Error('Jobber quote not found')
  }

  const jobs = data.quote.jobs
  if (!isRecord(jobs) || !Array.isArray(jobs.nodes)) {
    if (hasHiddenObjectPermissionError(errors)) {
      throw new JobberPermissionError('Jobber hid Job or Expense data due to permissions. Turn on Jobs Read and Expenses Read, save the app, then Reconnect Jobber so the current token receives the new access.')
    }
    if (Array.isArray(errors) && errors.length > 0) {
      throw new JobberGraphqlError(formatGraphqlErrors(errors))
    }
    return []
  }

  const visibleJobs = jobs.nodes.filter(isRecord) as unknown as JobberJob[]
  if (visibleJobs.length > 0) return visibleJobs

  if (hasHiddenObjectPermissionError(errors)) {
    throw new JobberPermissionError('Jobber hid Job or Expense data due to permissions. Turn on Jobs Read and Expenses Read, save the app, then Reconnect Jobber so the current token receives the new access.')
  }
  if (Array.isArray(errors) && errors.length > 0) {
    throw new JobberGraphqlError(formatGraphqlErrors(errors))
  }

  return visibleJobs
}

function getJobFromPayload(payload: unknown): JobberJobDetail {
  if (!isRecord(payload)) throw new Error('Invalid Jobber response')
  const errors = payload.errors
  if (hasHiddenObjectPermissionError(errors)) {
    throw new JobberPermissionError('Jobber hid Job or Expense data due to permissions. Turn on Jobs Read and Expenses Read, save the app, then Reconnect Jobber so the current token receives the new access.')
  }
  if (Array.isArray(errors) && errors.length > 0) {
    throw new JobberGraphqlError(formatGraphqlErrors(errors))
  }

  const data = payload.data
  if (!isRecord(data) || !isRecord(data.job)) {
    throw new Error('Jobber job not found')
  }

  return data.job as unknown as JobberJobDetail
}

function getJobVisitsFromPayload(payload: unknown): JobberVisit[] {
  if (!isRecord(payload)) throw new Error('Invalid Jobber response')
  const errors = payload.errors
  if (Array.isArray(errors) && errors.length > 0) {
    throw new JobberGraphqlError(formatGraphqlErrors(errors))
  }

  const data = payload.data
  if (!isRecord(data) || !isRecord(data.job)) {
    return []
  }

  const visits = data.job.visits
  if (!isRecord(visits) || !Array.isArray(visits.nodes)) {
    return []
  }

  return visits.nodes.filter(isRecord) as unknown as JobberVisit[]
}

function getJobSearchResultFromPayload(payload: unknown, searchTerm: string): JobberJobSearchResult {
  if (!isRecord(payload)) throw new Error('Invalid Jobber response')
  const errors = payload.errors
  if (hasHiddenObjectPermissionError(errors)) {
    throw new JobberPermissionError('Jobber hid Job or Expense data due to permissions. Turn on Jobs Read and Expenses Read, save the app, then Reconnect Jobber so the current token receives the new access.')
  }
  if (Array.isArray(errors) && errors.length > 0) {
    throw new JobberGraphqlError(formatGraphqlErrors(errors))
  }

  const data = payload.data
  if (!isRecord(data) || !isRecord(data.jobs)) {
    throw new Error('Jobber job not found')
  }

  const nodes = data.jobs.nodes
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('Jobber job not found')
  }

  const exactJob = nodes.find((node) => (
    isRecord(node) &&
    typeof node.jobNumber === 'number' &&
    String(node.jobNumber) === searchTerm.trim()
  ))

  return (exactJob ?? nodes[0]) as unknown as JobberJobSearchResult
}

function hasThrottleError(errors: unknown): boolean {
  return Array.isArray(errors) && errors.some((error) => {
    if (!isRecord(error)) return false

    const extensions = error.extensions
    const code = isRecord(extensions) ? extensions.code : null
    return (
      (typeof error.message === 'string' && error.message.trim().toLowerCase() === 'throttled') ||
      code === 'THROTTLED'
    )
  })
}

function isThrottledPayload(payload: unknown): boolean {
  return isRecord(payload) && hasThrottleError(payload.errors)
}

function getRecordProperty(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key]
  return isRecord(value) ? value : null
}

function getNumberProperty(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isQueryCostTooHighForRetry(payload: unknown): boolean {
  if (!isRecord(payload)) return false

  const extensions = getRecordProperty(payload, 'extensions')
  const cost = extensions ? getRecordProperty(extensions, 'cost') : null
  const throttleStatus = cost ? getRecordProperty(cost, 'throttleStatus') : null
  if (!cost || !throttleStatus) return false

  const requestedQueryCost = getNumberProperty(cost, 'requestedQueryCost')
  const maximumAvailable = getNumberProperty(throttleStatus, 'maximumAvailable')
  return requestedQueryCost !== null && maximumAvailable !== null && requestedQueryCost > maximumAvailable
}

function shouldUseLightweightQuoteQuery(payload: unknown): boolean {
  return isThrottledPayload(payload)
}

function getThrottleRetryDelayMs(payload: unknown, options: FetchJobberQuoteOptions, attempt: number): number {
  if (typeof options.throttleRetryDelayMs === 'number') {
    return Math.max(options.throttleRetryDelayMs, 0)
  }

  if (isRecord(payload)) {
    const extensions = getRecordProperty(payload, 'extensions')
    const cost = extensions ? getRecordProperty(extensions, 'cost') : null
    const throttleStatus = cost ? getRecordProperty(cost, 'throttleStatus') : null
    if (cost && throttleStatus) {
      const requestedQueryCost = getNumberProperty(cost, 'requestedQueryCost')
      const currentlyAvailable = getNumberProperty(throttleStatus, 'currentlyAvailable')
      const restoreRate = getNumberProperty(throttleStatus, 'restoreRate')
      if (
        requestedQueryCost !== null &&
        currentlyAvailable !== null &&
        restoreRate !== null &&
        restoreRate > 0 &&
        requestedQueryCost > currentlyAvailable
      ) {
        return Math.min(
          Math.ceil(((requestedQueryCost - currentlyAvailable) / restoreRate) * 1000) + 100,
          MAX_THROTTLE_RETRY_DELAY_MS
        )
      }
    }
  }

  return Math.min(DEFAULT_THROTTLE_RETRY_DELAY_MS * (attempt + 1), MAX_THROTTLE_RETRY_DELAY_MS)
}

function getHttpRetryDelayMs(response: Response, options: FetchJobberQuoteOptions, attempt: number): number {
  if (typeof options.throttleRetryDelayMs === 'number') {
    return Math.max(options.throttleRetryDelayMs, 0)
  }

  const retryAfter = response.headers.get('retry-after')
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1000, MAX_THROTTLE_RETRY_DELAY_MS)
  }

  return Math.min(DEFAULT_THROTTLE_RETRY_DELAY_MS * (attempt + 1), MAX_THROTTLE_RETRY_DELAY_MS)
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function postJobberGraphql(
  query: string,
  variables: Record<string, unknown>,
  options: FetchJobberQuoteOptions,
  allowMutation = false
): Promise<unknown> {
  if (!allowMutation) {
    assertJobberReadOnlyGraphqlDocument(query)
  }

  const fetcher = options.fetcher ?? fetch
  const maxRetries = options.maxThrottleRetries ?? DEFAULT_THROTTLE_RETRIES
  const requestInit: RequestInit = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      'Content-Type': 'application/json',
      'X-JOBBER-GRAPHQL-VERSION': options.graphqlVersion,
    },
    body: JSON.stringify({ query, variables }),
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetcher(JOBBER_GRAPHQL_URL, requestInit)

    if (response.status === 429 && attempt < maxRetries) {
      await delay(getHttpRetryDelayMs(response, options, attempt))
      continue
    }

    if (!response.ok) {
      throw new JobberApiError(`Jobber request failed with status ${response.status}`, response.status)
    }

    const payload: unknown = await response.json()
    if (
      isThrottledPayload(payload) &&
      !isQueryCostTooHighForRetry(payload) &&
      attempt < maxRetries
    ) {
      await delay(getThrottleRetryDelayMs(payload, options, attempt))
      continue
    }

    return payload
  }

  throw new JobberApiError('Jobber request failed after retrying throttled responses', 429)
}

function getMutationUserErrors(payload: unknown, mutationName: string): MutationError[] {
  if (!isRecord(payload)) throw new Error('Invalid Jobber response')
  const errors = payload.errors
  if (Array.isArray(errors) && errors.length > 0) {
    throw new JobberGraphqlError(formatGraphqlErrors(errors))
  }

  const data = payload.data
  const mutationPayload = isRecord(data) ? data[mutationName] : null
  if (!isRecord(mutationPayload)) throw new Error('Invalid Jobber response')

  const userErrors = mutationPayload.userErrors
  return Array.isArray(userErrors) ? userErrors.filter(isRecord) as MutationError[] : []
}

function assertNoMutationUserErrors(payload: unknown, mutationName: string): void {
  const userErrors = getMutationUserErrors(payload, mutationName)
  if (userErrors.length === 0) return

  const messages = userErrors
    .map((error) => typeof error.message === 'string' ? error.message.trim() : '')
    .filter(Boolean)

  throw new JobberGraphqlError(messages.length > 0
    ? `Jobber returned a GraphQL error: ${messages.join('; ')}`
    : 'Jobber returned a GraphQL error')
}

function getCreatedLineItemIds(payload: unknown, mutationName: string): string[] {
  if (!isRecord(payload) || !isRecord(payload.data)) return []
  const mutationPayload = payload.data[mutationName]
  if (!isRecord(mutationPayload) || !Array.isArray(mutationPayload.createdLineItems)) return []

  return mutationPayload.createdLineItems
    .filter(isRecord)
    .map((lineItem) => lineItem.id)
    .filter((id): id is string => typeof id === 'string')
}

function getEditedLineItemIds(payload: unknown, mutationName: string): string[] {
  if (!isRecord(payload) || !isRecord(payload.data)) return []
  const mutationPayload = payload.data[mutationName]
  if (!isRecord(mutationPayload) || !Array.isArray(mutationPayload.modifiedLineItems)) return []

  return mutationPayload.modifiedLineItems
    .filter(isRecord)
    .map((lineItem) => lineItem.id)
    .filter((id): id is string => typeof id === 'string')
}

function toQuoteCreateLineItemAttributes(item: JobberQuoteLineMutationItem) {
  return {
    name: item.name,
    description: item.description,
    category: 'SERVICE',
    taxable: item.taxable ?? true,
    saveToProductsAndServices: false,
    quantity: item.quantity ?? 1,
    unitPrice: item.unitPrice ?? 0,
    totalPrice: item.totalPrice ?? (item.quantity ?? 1) * (item.unitPrice ?? 0),
    ...(item.productOrServiceId ? { productOrServiceId: item.productOrServiceId } : {}),
  }
}

function toQuoteCreateTextLineItemAttributes(item: JobberQuoteLineMutationItem) {
  return {
    name: item.name,
    description: item.description,
    category: 'SERVICE',
  }
}

function toQuoteEditLineItemAttributes(item: JobberQuoteLineMutationItem) {
  if (item.kind === 'text') {
    return {
      lineItemId: item.jobberLineItemId,
      name: item.name,
      description: item.description,
      category: 'SERVICE',
      ...(typeof item.sortOrder === 'number' ? { sortOrder: item.sortOrder } : {}),
    }
  }

  return {
    lineItemId: item.jobberLineItemId,
    name: item.name,
    description: item.description,
    category: 'SERVICE',
    taxable: item.taxable ?? true,
    quantity: item.quantity ?? 1,
    unitPrice: item.unitPrice ?? 0,
    totalPrice: item.totalPrice ?? (item.quantity ?? 1) * (item.unitPrice ?? 0),
    ...(typeof item.sortOrder === 'number' ? { sortOrder: item.sortOrder } : {}),
    ...(item.productOrServiceId ? { productOrServiceId: item.productOrServiceId } : {}),
  }
}

function normalizeLineText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function lineNumberKey(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '0.00'
}

function currentLineKind(lineItem: JobberQuoteLineItem): JobberQuoteLineMutationItem['kind'] {
  return lineItem.textOnly === true ? 'text' : 'line_item'
}

function currentLineMatchKey(lineItem: JobberQuoteLineItem): string {
  const kind = currentLineKind(lineItem)
  const base = [
    kind,
    normalizeLineText(lineItem.name),
    normalizeLineText(lineItem.description),
  ]

  if (kind === 'text') return base.join('|')

  return [
    ...base,
    lineNumberKey(lineItem.quantity),
    lineNumberKey(lineItem.unitPrice),
    lineNumberKey(lineItem.totalPrice),
  ].join('|')
}

function currentLineNameKey(lineItem: JobberQuoteLineItem): string {
  return [
    currentLineKind(lineItem),
    normalizeLineText(lineItem.name),
  ].join('|')
}

function mutationLineMatchKey(item: JobberQuoteLineMutationItem): string {
  const base = [
    item.kind,
    normalizeLineText(item.name),
    normalizeLineText(item.description),
  ]

  if (item.kind === 'text') return base.join('|')

  return [
    ...base,
    lineNumberKey(item.quantity),
    lineNumberKey(item.unitPrice),
    lineNumberKey(item.totalPrice),
  ].join('|')
}

function mutationLineNameKey(item: JobberQuoteLineMutationItem): string {
  return [
    item.kind,
    normalizeLineText(item.name),
  ].join('|')
}

function resolveCurrentJobberLineId(
  item: JobberQuoteLineMutationItem,
  currentLineItems: JobberQuoteLineItem[],
  currentLineItemIds: Set<string>,
  usedLineItemIds: Set<string>,
  currentLineItemsByKey: Map<string, JobberQuoteLineItem[]>,
  currentLineItemsByNameKey: Map<string, JobberQuoteLineItem[]>
): string | undefined {
  if (item.jobberLineItemId && currentLineItemIds.has(item.jobberLineItemId) && !usedLineItemIds.has(item.jobberLineItemId)) {
    usedLineItemIds.add(item.jobberLineItemId)
    return item.jobberLineItemId
  }

  if (!item.jobberLineItemId) return undefined

  const matchingLines = currentLineItemsByKey.get(mutationLineMatchKey(item)) ?? []
  const matchingLine = matchingLines.find((lineItem) => !usedLineItemIds.has(lineItem.id))
  if (matchingLine) {
    usedLineItemIds.add(matchingLine.id)
    return matchingLine.id
  }

  const matchingNameLines = currentLineItemsByNameKey.get(mutationLineNameKey(item)) ?? []
  const matchingNameLine = matchingNameLines.find((lineItem) => !usedLineItemIds.has(lineItem.id))
  if (matchingNameLine) {
    usedLineItemIds.add(matchingNameLine.id)
    return matchingNameLine.id
  }

  if (typeof item.sourcePosition === 'number') {
    const lineAtPosition = currentLineItems[item.sourcePosition]
    if (
      lineAtPosition &&
      currentLineKind(lineAtPosition) === item.kind &&
      !usedLineItemIds.has(lineAtPosition.id)
    ) {
      usedLineItemIds.add(lineAtPosition.id)
      return lineAtPosition.id
    }
  }

  return item.jobberLineItemId
}

function relinkMutationItemsToCurrentQuote(
  mutationItems: JobberQuoteLineMutationItem[],
  currentLineItems: JobberQuoteLineItem[],
  currentLineItemIds: Set<string>
): JobberQuoteLineMutationItem[] {
  const usedLineItemIds = new Set<string>()
  const currentLineItemsByKey = new Map<string, JobberQuoteLineItem[]>()
  const currentLineItemsByNameKey = new Map<string, JobberQuoteLineItem[]>()

  for (const lineItem of currentLineItems) {
    const key = currentLineMatchKey(lineItem)
    currentLineItemsByKey.set(key, [...(currentLineItemsByKey.get(key) ?? []), lineItem])
    const nameKey = currentLineNameKey(lineItem)
    currentLineItemsByNameKey.set(nameKey, [...(currentLineItemsByNameKey.get(nameKey) ?? []), lineItem])
  }

  return mutationItems.map((item) => {
    const resolvedLineItemId = resolveCurrentJobberLineId(
      item,
      currentLineItems,
      currentLineItemIds,
      usedLineItemIds,
      currentLineItemsByKey,
      currentLineItemsByNameKey
    )

    return resolvedLineItemId ? { ...item, jobberLineItemId: resolvedLineItemId } : item
  })
}

async function postApprovedJobberMutation(
  query: string,
  variables: Record<string, unknown>,
  options: FetchJobberQuoteOptions
): Promise<unknown> {
  return postJobberGraphql(query, variables, options, true)
}

export async function fetchJobberQuote(
  quoteId: string,
  options: FetchJobberQuoteOptions
): Promise<JobberQuote> {
  if (!options.preferFullQuoteQuery) {
    const lightweightPayload = await postJobberGraphql(JOBBER_QUOTE_LITE_QUERY, { id: quoteId }, options)
    return getQuoteFromPayload(lightweightPayload)
  }

  const payload = await postJobberGraphql(JOBBER_QUOTE_QUERY, { id: quoteId }, options)
  if (shouldUseLightweightQuoteQuery(payload)) {
    const lightweightPayload = await postJobberGraphql(JOBBER_QUOTE_LITE_QUERY, { id: quoteId }, options)
    return getQuoteFromPayload(lightweightPayload)
  }

  return getQuoteFromPayload(payload)
}

async function fetchJobberQuoteLineItems(
  quoteId: string,
  options: FetchJobberQuoteOptions
): Promise<JobberQuoteLineItem[]> {
  const payload = await postJobberGraphql(JOBBER_QUOTE_LINE_ITEMS_QUERY, { id: quoteId }, options)
  return getQuoteLineItemsFromPayload(payload)
}

export async function syncJobberQuoteLineItems(
  quoteId: string,
  input: BuildJobberQuoteLinePayloadInput,
  options: FetchJobberQuoteOptions
): Promise<JobberQuoteLineSyncResult> {
  const currentLineItems = await fetchJobberQuoteLineItems(quoteId, options)
  const currentLineItemIds = new Set(currentLineItems.map((lineItem) => lineItem.id).filter(Boolean))
  const deletedLineItemIds: string[] = []
  const createdLineItemIds: string[] = []
  const editedLineItemIds: string[] = []
  const syncedLineItems: JobberQuoteLineSyncResult['syncedLineItems'] = []
  const mutationItems = relinkMutationItemsToCurrentQuote(
    buildJobberQuoteLineMutationItems(input).map((item, index) => ({
      ...item,
      sortOrder: index,
    })),
    currentLineItems,
    currentLineItemIds
  ).map((item) => ({ ...item }))

  const editItems = mutationItems.filter((item) => item.jobberLineItemId && currentLineItemIds.has(item.jobberLineItemId))
  if (editItems.length > 0) {
    const payload = await postApprovedJobberMutation(
      JOBBER_QUOTE_EDIT_LINE_ITEMS_MUTATION,
      {
        quoteId,
        lineItems: editItems.map(toQuoteEditLineItemAttributes),
      },
      options
    )
    assertNoMutationUserErrors(payload, 'quoteEditLineItems')
    const editedIds = getEditedLineItemIds(payload, 'quoteEditLineItems')
    editedLineItemIds.push(...editedIds)
    editItems.forEach((item, index) => {
      if (typeof item.sourcePosition === 'number' && item.jobberLineItemId) {
        syncedLineItems.push({
          sourcePosition: item.sourcePosition,
          jobberLineItemId: editedIds[index] ?? item.jobberLineItemId,
        })
      }
    })
  }

  const createItems = mutationItems.filter((item) => !item.jobberLineItemId || !currentLineItemIds.has(item.jobberLineItemId))
  for (const item of createItems) {
    const mutationName = item.kind === 'text' ? 'quoteCreateTextLineItems' : 'quoteCreateLineItems'
    const payload = await postApprovedJobberMutation(
      item.kind === 'text' ? JOBBER_QUOTE_CREATE_TEXT_LINE_ITEMS_MUTATION : JOBBER_QUOTE_CREATE_LINE_ITEMS_MUTATION,
      {
        quoteId,
        lineItems: [
          item.kind === 'text'
            ? toQuoteCreateTextLineItemAttributes(item)
            : toQuoteCreateLineItemAttributes(item),
        ],
      },
      options
    )
    assertNoMutationUserErrors(payload, mutationName)
    const createdIds = getCreatedLineItemIds(payload, mutationName)
    createdLineItemIds.push(...createdIds)
    if (createdIds[0]) {
      item.jobberLineItemId = createdIds[0]
    }
    if (typeof item.sourcePosition === 'number' && createdIds[0]) {
      syncedLineItems.push({
        sourcePosition: item.sourcePosition,
        jobberLineItemId: createdIds[0],
      })
    }
  }

  const submittedLineItemIds = new Set(mutationItems
    .map((item) => item.jobberLineItemId)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
  const deleteCandidateIds = (input.deletedJobberLineItemIds ?? [])
    .filter((id) => currentLineItemIds.has(id) && !submittedLineItemIds.has(id))
  const lineCountAfterDelete = currentLineItemIds.size + createdLineItemIds.length - deleteCandidateIds.length

  if (deleteCandidateIds.length > 0 && lineCountAfterDelete > 0) {
    const payload = await postApprovedJobberMutation(JOBBER_QUOTE_DELETE_LINE_ITEMS_MUTATION, {
      quoteId,
      lineItemIds: deleteCandidateIds,
    }, options)
    assertNoMutationUserErrors(payload, 'quoteDeleteLineItems')
    deletedLineItemIds.push(...deleteCandidateIds)
  }

  const finalSortItems = mutationItems
    .filter((item) => item.jobberLineItemId && typeof item.sortOrder === 'number')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  if (createItems.length > 0 && finalSortItems.length > 1) {
    const payload = await postApprovedJobberMutation(
      JOBBER_QUOTE_EDIT_LINE_ITEMS_MUTATION,
      {
        quoteId,
        lineItems: finalSortItems.map(toQuoteEditLineItemAttributes),
      },
      options
    )
    assertNoMutationUserErrors(payload, 'quoteEditLineItems')
  }

  return {
    deletedLineItemIds,
    createdLineItemIds,
    editedLineItemIds,
    syncedLineItems,
  }
}

export async function searchJobberQuote(
  searchTerm: string,
  options: FetchJobberQuoteOptions
): Promise<JobberQuote> {
  const lookupPayload = await postJobberGraphql(JOBBER_QUOTE_SEARCH_LOOKUP_QUERY, { term: searchTerm }, options)
  const quote = getQuoteSearchResultFromPayload(lookupPayload, searchTerm.trim())
  return fetchJobberQuote(quote.id, options)
}

export async function fetchJobberQuoteJobs(
  quoteId: string,
  options: FetchJobberQuoteOptions
): Promise<JobberJob[]> {
  const payload = await postJobberGraphql(JOBBER_QUOTE_JOBS_QUERY, { id: quoteId }, options)
  return getQuoteJobsFromPayload(payload)
}

async function fetchJobberJobVisits(
  jobId: string,
  options: FetchJobberQuoteOptions
): Promise<JobberVisit[]> {
  const payload = await postJobberGraphql(JOBBER_JOB_VISITS_QUERY, { id: jobId }, options)
  return getJobVisitsFromPayload(payload)
}

export async function fetchJobberJob(
  jobId: string,
  options: FetchJobberQuoteOptions
): Promise<JobberJobDetail> {
  const payload = await postJobberGraphql(JOBBER_JOB_QUERY, { id: jobId }, options)
  const job = getJobFromPayload(payload)

  try {
    const visits = await fetchJobberJobVisits(jobId, options)
    return {
      ...job,
      visits: { nodes: visits },
    }
  } catch {
    return {
      ...job,
      visits: { nodes: [] },
    }
  }
}

export async function searchJobberJob(
  searchTerm: string,
  options: FetchJobberQuoteOptions
): Promise<JobberJobDetail> {
  const payload = await postJobberGraphql(JOBBER_JOB_SEARCH_QUERY, { term: searchTerm }, options)
  const result = getJobSearchResultFromPayload(payload, searchTerm)
  return fetchJobberJob(result.id, options)
}
