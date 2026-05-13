import { JOBBER_GRAPHQL_URL } from './config'

export interface JobberQuoteAddress {
  street1?: string | null
  street2?: string | null
  city?: string | null
  province?: string | null
  postalCode?: string | null
}

export interface JobberQuote {
  id: string
  quoteNumber: string
  title: string | null
  message: string | null
  jobberWebUri: string
  client: {
    id: string
    name: string | null
    companyName: string | null
    firstName: string | null
    lastName: string | null
  } | null
  property: {
    id: string
    jobberWebUri: string
    address?: JobberQuoteAddress | null
  } | null
}

interface FetchJobberQuoteOptions {
  accessToken: string
  graphqlVersion: string
  fetcher?: (input: string, init: RequestInit) => Promise<Response>
}

const JOBBER_QUOTE_QUERY = `
  query PbcQuote($id: EncodedId!) {
    quote(id: $id) {
      id
      quoteNumber
      title
      message
      jobberWebUri
      client {
        id
        name
        companyName
        firstName
        lastName
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
    }
  }
`

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getQuoteFromPayload(payload: unknown): JobberQuote {
  if (!isRecord(payload)) throw new Error('Invalid Jobber response')
  const errors = payload.errors
  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error('Jobber returned a GraphQL error')
  }

  const data = payload.data
  if (!isRecord(data) || !isRecord(data.quote)) {
    throw new Error('Jobber quote not found')
  }

  return data.quote as unknown as JobberQuote
}

export async function fetchJobberQuote(
  quoteId: string,
  options: FetchJobberQuoteOptions
): Promise<JobberQuote> {
  const fetcher = options.fetcher ?? fetch
  const response = await fetcher(JOBBER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      'Content-Type': 'application/json',
      'X-JOBBER-GRAPHQL-VERSION': options.graphqlVersion,
    },
    body: JSON.stringify({
      query: JOBBER_QUOTE_QUERY,
      variables: { id: quoteId },
    }),
  })

  if (!response.ok) {
    throw new Error(`Jobber request failed with status ${response.status}`)
  }

  const payload: unknown = await response.json()
  return getQuoteFromPayload(payload)
}
