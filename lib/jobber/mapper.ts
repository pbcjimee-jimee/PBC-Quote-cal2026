import type { JobberQuote, JobberQuoteAddress } from './client'

export interface JobberQuoteDraft {
  jobberQuoteId: string
  customerName: string
  customerAddress: string
  workType: string
  sourceUrl: string
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

export function mapJobberQuoteToDraft(quote: JobberQuote): JobberQuoteDraft {
  return {
    jobberQuoteId: quote.id,
    customerName: formatCustomerName(quote),
    customerAddress: formatAddress(quote.property?.address),
    workType: quote.title?.trim() || quote.message?.trim() || '',
    sourceUrl: quote.jobberWebUri,
  }
}
