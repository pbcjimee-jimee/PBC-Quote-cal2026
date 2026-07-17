'use server'

import { revalidatePath, unstable_cache, updateTag } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'
import {
  normalizeQuoteLineTemplate,
  type QuoteLineTemplateItemRecord,
  type QuoteLineTemplateRecord,
} from '@/lib/quote-line-templates/types'
import {
  quoteLineTemplateCreateSchema,
  quoteLineTemplateDeleteSchema,
  quoteLineTemplateUpdateSchema,
  type QuoteLineTemplateCreateInput,
  type QuoteLineTemplateItemInput,
} from '@/lib/validators'
import type { ActionResult } from './types'
import { isDevNoAuthMode } from './types'

type TemplateRow = Database['public']['Tables']['quote_line_templates']['Row'] & {
  quote_line_template_items?: TemplateItemRow[]
}
type TemplateInsert = Database['public']['Tables']['quote_line_templates']['Insert']
type TemplateItemRow = Database['public']['Tables']['quote_line_template_items']['Row']
type TemplateItemInsert = Database['public']['Tables']['quote_line_template_items']['Insert']

const QUOTE_LINE_TEMPLATES_TAG = 'quote-line-templates'

const TEMPLATE_COLUMNS = [
  'id',
  'name',
  'active',
  'created_at',
  'updated_at',
  'quote_line_template_items(*)',
].join(', ')

function money(value: number | undefined): string | null {
  if (value === undefined) return null
  return value.toFixed(2)
}

function rowToTemplateItem(row: TemplateItemRow): QuoteLineTemplateItemRecord {
  return {
    id: row.id,
    templateId: row.template_id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    taxable: row.taxable,
    clientVisible: row.client_visible,
    linkedProductOrServiceId: row.linked_product_or_service_id,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToTemplate(row: TemplateRow): QuoteLineTemplateRecord {
  return normalizeQuoteLineTemplate({
    id: row.id,
    name: row.name,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (row.quote_line_template_items ?? []).map(rowToTemplateItem),
  })
}

function itemToInsert(templateId: string, item: QuoteLineTemplateItemInput, index: number): TemplateItemInsert {
  const isLineItem = item.kind === 'line_item'
  return {
    template_id: templateId,
    kind: item.kind,
    name: item.name.trim(),
    description: item.description?.trim() || null,
    quantity: isLineItem ? money(item.quantity) : null,
    unit_price: isLineItem ? money(item.unitPrice) : null,
    taxable: isLineItem ? item.taxable : false,
    client_visible: item.clientVisible,
    linked_product_or_service_id: item.linkedProductOrServiceId?.trim() || null,
    position: item.position ?? index,
  }
}

function revalidateTemplateConsumers(): void {
  revalidatePath('/settings')
  revalidatePath('/quotes/new')
  // updateTag hard-expires the cached entry immediately (revalidateTag with a
  // profile only marks it stale and keeps serving the old value).
  updateTag(QUOTE_LINE_TEMPLATES_TAG)
}

function isMissingServiceConfig(error: unknown): boolean {
  return error instanceof Error && error.message.includes('service configuration is missing')
}

async function readTemplatesFrom(
  supabase: Awaited<ReturnType<typeof createClient>> | Awaited<ReturnType<typeof createServiceClient>>
) {
  return supabase
    .from('quote_line_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('active', true)
    .order('updated_at', { ascending: false })
}

// Cross-request cached read via the service-role client. Auth is verified by the
// caller before this runs; errors throw so failures are never cached.
const fetchCachedQuoteLineTemplates = unstable_cache(
  async (): Promise<QuoteLineTemplateRecord[]> => {
    const supabase = await createServiceClient()
    const { data, error } = await readTemplatesFrom(supabase)

    if (error) throw new Error(error.message)
    return (data as unknown as TemplateRow[]).map(rowToTemplate)
  },
  ['quote-line-templates'],
  { tags: [QUOTE_LINE_TEMPLATES_TAG], revalidate: 3600 }
)

async function insertTemplateItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  templateId: string,
  items: QuoteLineTemplateCreateInput['items']
): Promise<ActionResult<QuoteLineTemplateItemRecord[]>> {
  if (items.length === 0) return { ok: true, data: [] }

  const { data, error } = await supabase
    .from('quote_line_template_items')
    .insert(items.map((item, index) => itemToInsert(templateId, item, index)))
    .select('*')

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data as unknown as TemplateItemRow[]).map(rowToTemplateItem) }
}

export async function createQuoteLineTemplate(input: unknown): Promise<ActionResult<QuoteLineTemplateRecord>> {
  const parsed = quoteLineTemplateCreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  if (isDevNoAuthMode()) {
    const { createDevQuoteLineTemplate } = await import('@/lib/dev-data')
    revalidateTemplateConsumers()
    return { ok: true, data: createDevQuoteLineTemplate(parsed.data) }
  }

  const payload: TemplateInsert = {
    name: parsed.data.name.trim(),
    active: true,
  }
  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const { data: template, error } = await supabase
    .from('quote_line_templates')
    .insert(payload)
    .select('id, name, active, created_at, updated_at')
    .single()

  if (error) return { ok: false, error: error.message }

  const insertedItems = await insertTemplateItems(supabase, template.id, parsed.data.items)
  if (!insertedItems.ok) return insertedItems

  revalidateTemplateConsumers()
  return {
    ok: true,
    data: normalizeQuoteLineTemplate({
      id: template.id,
      name: template.name,
      active: template.active,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
      items: insertedItems.data,
    }),
  }
}

export async function updateQuoteLineTemplate(input: unknown): Promise<ActionResult<QuoteLineTemplateRecord>> {
  const parsed = quoteLineTemplateUpdateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  const { id, ...fields } = parsed.data
  if (isDevNoAuthMode()) {
    const { updateDevQuoteLineTemplate } = await import('@/lib/dev-data')
    const updated = updateDevQuoteLineTemplate(id, fields)
    if (!updated) return { ok: false, error: 'Template not found' }
    revalidateTemplateConsumers()
    return { ok: true, data: updated }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const { data: template, error } = await supabase
    .from('quote_line_templates')
    .update({ name: fields.name.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, active, created_at, updated_at')
    .single()

  if (error) return { ok: false, error: error.message }

  const { error: deleteError } = await supabase.from('quote_line_template_items').delete().eq('template_id', id)
  if (deleteError) return { ok: false, error: deleteError.message }

  const insertedItems = await insertTemplateItems(supabase, id, fields.items)
  if (!insertedItems.ok) return insertedItems

  revalidateTemplateConsumers()
  return {
    ok: true,
    data: normalizeQuoteLineTemplate({
      id: template.id,
      name: template.name,
      active: template.active,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
      items: insertedItems.data,
    }),
  }
}

export async function listQuoteLineTemplates(): Promise<ActionResult<QuoteLineTemplateRecord[]>> {
  if (isDevNoAuthMode()) {
    const { listDevQuoteLineTemplates } = await import('@/lib/dev-data')
    return { ok: true, data: listDevQuoteLineTemplates() }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  try {
    return { ok: true, data: await fetchCachedQuoteLineTemplates() }
  } catch (error) {
    if (!isMissingServiceConfig(error)) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
    // Missing service-role key (local dev): fall back to the uncached cookie client.
    const supabase = await createClient()
    const { data, error: readError } = await readTemplatesFrom(supabase)

    if (readError) return { ok: false, error: readError.message }
    return { ok: true, data: (data as unknown as TemplateRow[]).map(rowToTemplate) }
  }
}

export async function deleteQuoteLineTemplate(input: unknown): Promise<ActionResult<QuoteLineTemplateRecord>> {
  const parsed = quoteLineTemplateDeleteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  if (isDevNoAuthMode()) {
    const { deleteDevQuoteLineTemplate } = await import('@/lib/dev-data')
    const deleted = deleteDevQuoteLineTemplate(parsed.data.id)
    if (!deleted) return { ok: false, error: 'Template not found' }
    revalidateTemplateConsumers()
    return { ok: true, data: deleted }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('quote_line_templates')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .select(TEMPLATE_COLUMNS)
    .single()

  if (error) return { ok: false, error: error.message }
  revalidateTemplateConsumers()
  return { ok: true, data: rowToTemplate(data as unknown as TemplateRow) }
}
