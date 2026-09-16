import { z } from 'zod'

export interface QuoteLifecycleInput {
  id: string
  expectedVersion: number
}

export interface DeletedQuoteSummary {
  id: string
  version: number
  customerName: string | null
  customerAddress: string | null
  quoteNumber: string | null
  subtotal: string
  deletedAt: string
  deletedByName: string | null
}

export interface DeletedQuotePage {
  items: DeletedQuoteSummary[]
  page: number
  hasNextPage: boolean
}

export const TRASH_PAGE_SIZE = 50
export const deletedQuoteSearchSchema = z.object({
  query: z.string().trim().max(200).default(''),
  page: z.number().int().min(1).max(100000).default(1),
})

export function quoteLifecycleSchema(devMode: boolean) {
  return z.object({
    id: devMode ? z.string().trim().min(1).max(100) : z.string().trim().uuid(),
    expectedVersion: z.number().int().positive(),
  })
}

export function quoteLifecycleError(message: string): string {
  if (message.includes('QUOTE_DELETED') || message.includes('QUOTE_IN_TRASH')) {
    return 'This quote is in Trash. Restore it before editing or saving.'
  }
  if (message.includes('QUOTE_VERSION_CONFLICT')) {
    return 'Quote was changed by someone else. Refresh and try again.'
  }
  if (message.includes('QUOTE_RESTORE_CONFLICT') || message.includes('QUOTE_JOBBER_CONFLICT')) {
    return 'Another saved quote is linked to this Jobber quote. Resolve the duplicate before restoring or saving.'
  }
  if (message.includes('QUOTE_NOT_FOUND')) return 'Quote not found.'
  if (message.includes('ADMIN_REQUIRED')) return 'Admin access required'
  return 'Unable to change this quote. Refresh and try again.'
}
