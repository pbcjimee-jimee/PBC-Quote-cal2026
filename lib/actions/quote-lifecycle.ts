'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/security/require-app-user'
import { createClient } from '@/lib/supabase/server'
import { getUserProfilesById } from '@/lib/user-profiles'
import { buildQuoteSearchPostgrestFilter, normalizeQuoteSearchQuery } from '@/lib/quote-search'
import {
  deletedQuoteSearchSchema, quoteLifecycleError, quoteLifecycleSchema, TRASH_PAGE_SIZE,
  type DeletedQuotePage, type QuoteLifecycleInput,
} from '@/lib/quotes/lifecycle'
import { QUOTES_TRASH_SELECT } from '@/lib/quote-query-shape'
import { isDevNoAuthMode, type ActionResult } from './types'

function revalidateQuote(id: string) {
  for (const path of ['/quotes', '/quotes/trash', `/quotes/${id}`, `/quotes/${id}/edit`]) revalidatePath(path)
}

async function changeQuoteState(input: QuoteLifecycleInput, restore: boolean): Promise<ActionResult<{ id: string }>> {
  const devMode = isDevNoAuthMode()
  const parsed = quoteLifecycleSchema(devMode).safeParse(input)
  if (!parsed.success) return { ok: false, error: 'A valid quote and version are required.', code: 'VALIDATION' }
  try {
    if (devMode) {
      const { changeDevQuoteLifecycle } = await import('@/lib/dev-data')
      const error = changeDevQuoteLifecycle(parsed.data, restore)
      if (error) return { ok: false, error: quoteLifecycleError(error) }
    } else {
      const allowedUser = await requireRole('admin')
      if (!allowedUser.ok) return allowedUser
      const supabase = await createClient()
      const { data, error } = await supabase.rpc(restore ? 'restore_quote' : 'soft_delete_quote', {
        target_quote_id: parsed.data.id,
        expected_version: parsed.data.expectedVersion,
      })
      if (error) return { ok: false, error: quoteLifecycleError(error.message) }
      if (!data?.length) return { ok: false, error: 'Quote not found.' }
    }
    revalidateQuote(parsed.data.id)
    return { ok: true, data: { id: parsed.data.id } }
  } catch {
    return { ok: false, error: 'Unable to change this quote. Refresh and try again.' }
  }
}

export async function moveQuoteToTrash(input: QuoteLifecycleInput): Promise<ActionResult<{ id: string }>> {
  return changeQuoteState(input, false)
}

export async function restoreQuote(input: QuoteLifecycleInput): Promise<ActionResult<{ id: string }>> {
  return changeQuoteState(input, true)
}

export async function searchDeletedQuotes(input: { query?: string; page?: number }): Promise<ActionResult<DeletedQuotePage>> {
  const parsed = deletedQuoteSearchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Enter a valid search and page number.', code: 'VALIDATION' }
  const { query, page } = parsed.data
  try {
    if (isDevNoAuthMode()) {
      const { listDeletedDevQuotes } = await import('@/lib/dev-data')
      return { ok: true, data: listDeletedDevQuotes(query, page) }
    }
    const allowedUser = await requireRole('admin')
    if (!allowedUser.ok) return allowedUser
    const search = normalizeQuoteSearchQuery(query)
    if (query.trim() && !search) return { ok: true, data: { items: [], page, hasNextPage: false } }
    const supabase = await createClient()
    const start = (page - 1) * TRASH_PAGE_SIZE
    let request = supabase.from('quotes').select(QUOTES_TRASH_SELECT)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }).order('id', { ascending: false })
      .range(start, start + TRASH_PAGE_SIZE)
    if (search) {
      const { operator, pattern } = buildQuoteSearchPostgrestFilter(search)
      request = request.or([
        `customer_name.${operator}.${pattern}`, `customer_address.${operator}.${pattern}`,
        `jobber_quote_id.${operator}.${pattern}`, `jobber_snapshot->>quoteNumber.${operator}.${pattern}`,
      ].join(','))
    }
    const { data, error } = await request
    if (error) return { ok: false, error: 'Unable to load Trash. Please try again.' }
    const rows = (data ?? []) as unknown as Array<{
      id: string; version: number; customer_name: string | null; customer_address: string | null;
      quote_number: string | null; subtotal: string; deleted_at: string; deleted_by: string | null;
    }>
    const visible = rows.slice(0, TRASH_PAGE_SIZE)
    const profiles = await getUserProfilesById(visible.flatMap((row) => row.deleted_by ? [row.deleted_by] : []))
    return { ok: true, data: {
      items: visible.map((row) => ({
        id: row.id, version: row.version, customerName: row.customer_name,
        customerAddress: row.customer_address, quoteNumber: row.quote_number, subtotal: String(row.subtotal),
        deletedAt: row.deleted_at, deletedByName: row.deleted_by ? profiles.get(row.deleted_by)?.displayName ?? null : null,
      })), page, hasNextPage: rows.length > TRASH_PAGE_SIZE,
    } }
  } catch {
    return { ok: false, error: 'Unable to load Trash. Please try again.' }
  }
}
