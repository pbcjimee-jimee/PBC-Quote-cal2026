'use server'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { normalizeProductService, type ProductServiceRecord } from '@/lib/product-services/types'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'
import {
  productServiceCreateSchema,
  productServiceDeleteSchema,
  productServiceImportSchema,
  productServiceSearchSchema,
  productServiceUpdateSchema,
} from '@/lib/validators'
import type { ActionResult } from './types'
import { isDevNoAuthMode } from './types'

type ProductServiceRow = Database['public']['Tables']['product_services']['Row']
type ProductServiceInsert = Database['public']['Tables']['product_services']['Insert']

type ProductServiceImportRow = {
  name: string
  description: string
  category: string
  unitPrice: string
  unitCost: string
  bookable: string
  durationMinutes: string
  quantityEnabled: string
  minimumQuantity: string
  maximumQuantity: string
  taxable: string
  active: string
}

type ProductServicesImportResult = {
  imported: number
  productServices: ProductServiceRecord[]
}

const PRODUCT_SERVICE_COLUMNS = [
  'id',
  'name',
  'description',
  'category',
  'unit_price',
  'unit_cost',
  'bookable',
  'duration_minutes',
  'quantity_enabled',
  'minimum_quantity',
  'maximum_quantity',
  'taxable',
  'active',
  'created_at',
  'updated_at',
].join(', ')

function rowToProductService(row: ProductServiceRow): ProductServiceRecord {
  return normalizeProductService({
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    unitPrice: row.unit_price,
    unitCost: row.unit_cost,
    bookable: row.bookable,
    durationMinutes: row.duration_minutes,
    quantityEnabled: row.quantity_enabled,
    minimumQuantity: row.minimum_quantity,
    maximumQuantity: row.maximum_quantity,
    taxable: row.taxable,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function searchTokens(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((token) => token
      .replace(/[%,()._]/g, '')
      .replace(/[^A-Za-z0-9&/-]/g, '')
      .slice(0, 48)
    )
    .filter(Boolean)
    .slice(0, 8)
}

function productServiceSearchOr(token: string): string {
  const q = `%${token}%`
  return [
    `name.ilike.${q}`,
    `description.ilike.${q}`,
    `category.ilike.${q}`,
  ].join(',')
}

function normalizeCsvHeaderValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[().]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

function parseCsvRows(csvText: string): string[][] {
  const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const next = normalized[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      row.push(field)
      field = ''
    } else if (char === '\n' && !inQuotes) {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
    .map((line) => line.map((value) => value.trim()))
    .filter((line) => line.some((value) => value.trim() !== ''))
}

const IMPORT_HEADER_MAP: Record<string, keyof ProductServiceImportRow> = {
  name: 'name',
  description: 'description',
  category: 'category',
  unitprice: 'unitPrice',
  unitcost: 'unitCost',
  bookable: 'bookable',
  durationminutes: 'durationMinutes',
  quantityenabled: 'quantityEnabled',
  minimumquantity: 'minimumQuantity',
  maximumquantity: 'maximumQuantity',
  taxable: 'taxable',
  active: 'active',
}

function parseOptionalMoney(value: string): string | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!trimmed) return null
  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`invalid amount: ${value}`)
  }
  return amount.toFixed(2)
}

function parseRequiredMoney(value: string): string {
  return parseOptionalMoney(value) ?? '0.00'
}

function parseOptionalInteger(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const amount = Number(trimmed)
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`invalid duration: ${value}`)
  }
  return amount
}

function parseBoolean(value: string, defaultValue: boolean): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return defaultValue
  if (['true', 'yes', 'y', '1'].includes(normalized)) return true
  if (['false', 'no', 'n', '0'].includes(normalized)) return false
  throw new Error(`invalid boolean: ${value}`)
}

function parseProductServicesCSV(csvText: string): ProductServiceImportRow[] {
  const parsedRows = parseCsvRows(csvText)
  if (parsedRows.length === 0) return []

  const header = parsedRows[0].map(normalizeCsvHeaderValue)
  const indexByField: Partial<Record<keyof ProductServiceImportRow, number>> = {}

  for (let index = 0; index < header.length; index += 1) {
    const mapped = IMPORT_HEADER_MAP[header[index]]
    if (mapped) indexByField[mapped] = index
  }

  if (indexByField.name === undefined) throw new Error('Missing required column: Name')
  if (indexByField.unitPrice === undefined) throw new Error('Missing required column: Unit Price')

  const rows: ProductServiceImportRow[] = []
  for (let rowIndex = 1; rowIndex < parsedRows.length; rowIndex += 1) {
    const row = parsedRows[rowIndex]
    const getValue = (fieldIndex?: number) => (fieldIndex === undefined ? '' : (row[fieldIndex] ?? '').trim())
    const name = getValue(indexByField.name)
    if (!name) throw new Error(`Line ${rowIndex + 1}: missing name`)

    rows.push({
      name,
      description: getValue(indexByField.description),
      category: getValue(indexByField.category),
      unitPrice: getValue(indexByField.unitPrice),
      unitCost: getValue(indexByField.unitCost),
      bookable: getValue(indexByField.bookable),
      durationMinutes: getValue(indexByField.durationMinutes),
      quantityEnabled: getValue(indexByField.quantityEnabled),
      minimumQuantity: getValue(indexByField.minimumQuantity),
      maximumQuantity: getValue(indexByField.maximumQuantity),
      taxable: getValue(indexByField.taxable),
      active: getValue(indexByField.active),
    })
  }

  return rows
}

function normalizeCreatePayload(input: {
  name: string
  description?: string | null
  category?: string | null
  unitPrice: number
  unitCost?: number | null
  bookable?: boolean
  durationMinutes?: number | null
  quantityEnabled?: boolean
  minimumQuantity?: number | null
  maximumQuantity?: number | null
  taxable?: boolean
  active?: boolean
}): ProductServiceInsert {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    category: input.category?.trim() || null,
    unit_price: input.unitPrice.toFixed(2),
    unit_cost: input.unitCost === null || input.unitCost === undefined ? null : input.unitCost.toFixed(2),
    bookable: input.bookable ?? false,
    duration_minutes: input.durationMinutes ?? null,
    quantity_enabled: input.quantityEnabled ?? false,
    minimum_quantity: input.minimumQuantity === null || input.minimumQuantity === undefined ? null : input.minimumQuantity.toFixed(2),
    maximum_quantity: input.maximumQuantity === null || input.maximumQuantity === undefined ? null : input.maximumQuantity.toFixed(2),
    taxable: input.taxable ?? true,
    active: input.active ?? true,
  }
}

function toProductServiceInsertPayload(rows: ProductServiceImportRow[]): ProductServiceInsert[] {
  return rows.map((row) => ({
    name: row.name.trim(),
    description: row.description.trim() || null,
    category: row.category.trim() || null,
    unit_price: parseRequiredMoney(row.unitPrice),
    unit_cost: parseOptionalMoney(row.unitCost),
    bookable: parseBoolean(row.bookable, false),
    duration_minutes: parseOptionalInteger(row.durationMinutes),
    quantity_enabled: parseBoolean(row.quantityEnabled, false),
    minimum_quantity: parseOptionalMoney(row.minimumQuantity),
    maximum_quantity: parseOptionalMoney(row.maximumQuantity),
    taxable: parseBoolean(row.taxable, true),
    active: parseBoolean(row.active, true),
  }))
}

export async function createProductService(input: unknown): Promise<ActionResult<ProductServiceRecord>> {
  const parsed = productServiceCreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  const payload = normalizeCreatePayload(parsed.data)

  if (isDevNoAuthMode()) {
    const { createDevProductService } = await import('@/lib/dev-data')
    return { ok: true, data: createDevProductService(payload) }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('product_services')
    .insert(payload)
    .select(PRODUCT_SERVICE_COLUMNS)
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: rowToProductService(data as unknown as ProductServiceRow) }
}

export async function searchProductServices(input: unknown): Promise<ActionResult<ProductServiceRecord[]>> {
  const parsed = productServiceSearchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  if (isDevNoAuthMode()) {
    const { searchDevProductServices } = await import('@/lib/dev-data')
    return { ok: true, data: searchDevProductServices(parsed.data.query, parsed.data.limit) }
  }

  const tokens = searchTokens(parsed.data.query)
  if (tokens.length === 0) return { ok: true, data: [] }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  let request = supabase
    .from('product_services')
    .select(PRODUCT_SERVICE_COLUMNS)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(parsed.data.limit)

  for (const token of tokens) {
    request = request.or(productServiceSearchOr(token))
  }

  const { data, error } = await request
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data as unknown as ProductServiceRow[]).map(rowToProductService) }
}

export async function listProductServices(input: unknown = {}): Promise<ActionResult<ProductServiceRecord[]>> {
  const parsed = productServiceSearchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  if (isDevNoAuthMode()) {
    const { listDevProductServices } = await import('@/lib/dev-data')
    return { ok: true, data: listDevProductServices(parsed.data.query, parsed.data.limit) }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const tokens = searchTokens(parsed.data.query)
  let request = supabase
    .from('product_services')
    .select(PRODUCT_SERVICE_COLUMNS)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(parsed.data.limit)

  if (tokens.length > 0) {
    for (const token of tokens) {
      request = request.or(productServiceSearchOr(token))
    }
  }

  const { data, error } = await request
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data as unknown as ProductServiceRow[]).map(rowToProductService) }
}

export async function importProductServicesCSV(input: unknown): Promise<ActionResult<ProductServicesImportResult>> {
  const parsed = productServiceImportSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  let rows: ProductServiceImportRow[]
  try {
    rows = parseProductServicesCSV(parsed.data.csvText)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid CSV format' }
  }

  if (rows.length === 0) return { ok: false, error: 'No valid rows found in CSV' }

  let insertRows: ProductServiceInsert[]
  try {
    insertRows = toProductServiceInsertPayload(rows)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid CSV format' }
  }

  if (isDevNoAuthMode()) {
    const { createDevProductServicesFromImport } = await import('@/lib/dev-data')
    const created = createDevProductServicesFromImport(insertRows)
    return { ok: true, data: { imported: created.length, productServices: created } }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('product_services')
    .upsert(insertRows, { onConflict: 'name,category' })
    .select(PRODUCT_SERVICE_COLUMNS)

  if (error) return { ok: false, error: error.message }
  const productServices = (data as unknown as ProductServiceRow[]).map(rowToProductService)
  return { ok: true, data: { imported: productServices.length, productServices } }
}

export async function updateProductService(input: unknown): Promise<ActionResult<ProductServiceRecord>> {
  const parsed = productServiceUpdateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  const { id, ...fields } = parsed.data
  const payload: Database['public']['Tables']['product_services']['Update'] = {
    ...(fields.name !== undefined ? { name: fields.name } : {}),
    ...(fields.description !== undefined ? { description: fields.description?.trim() || null } : {}),
    ...(fields.category !== undefined ? { category: fields.category?.trim() || null } : {}),
    ...(fields.unitPrice !== undefined ? { unit_price: fields.unitPrice.toFixed(2) } : {}),
    ...(fields.unitCost !== undefined ? { unit_cost: fields.unitCost === null ? null : fields.unitCost.toFixed(2) } : {}),
    ...(fields.bookable !== undefined ? { bookable: fields.bookable } : {}),
    ...(fields.durationMinutes !== undefined ? { duration_minutes: fields.durationMinutes } : {}),
    ...(fields.quantityEnabled !== undefined ? { quantity_enabled: fields.quantityEnabled } : {}),
    ...(fields.minimumQuantity !== undefined ? { minimum_quantity: fields.minimumQuantity === null ? null : fields.minimumQuantity.toFixed(2) } : {}),
    ...(fields.maximumQuantity !== undefined ? { maximum_quantity: fields.maximumQuantity === null ? null : fields.maximumQuantity.toFixed(2) } : {}),
    ...(fields.taxable !== undefined ? { taxable: fields.taxable } : {}),
    ...(fields.active !== undefined ? { active: fields.active } : {}),
    updated_at: new Date().toISOString(),
  }

  if (Object.keys(payload).length === 1) return { ok: false, error: 'No fields to update' }

  if (isDevNoAuthMode()) {
    const { updateDevProductService } = await import('@/lib/dev-data')
    const updated = updateDevProductService(id, payload)
    if (!updated) return { ok: false, error: 'Product service not found' }
    return { ok: true, data: updated }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('product_services')
    .update(payload)
    .eq('id', id)
    .select(PRODUCT_SERVICE_COLUMNS)
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: rowToProductService(data as unknown as ProductServiceRow) }
}

export async function deleteProductService(input: unknown): Promise<ActionResult<ProductServiceRecord>> {
  const parsed = productServiceDeleteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  if (isDevNoAuthMode()) {
    const { updateDevProductService } = await import('@/lib/dev-data')
    const deleted = updateDevProductService(parsed.data.id, { active: false, updated_at: new Date().toISOString() })
    if (!deleted) return { ok: false, error: 'Product service not found' }
    return { ok: true, data: deleted }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('product_services')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .select(PRODUCT_SERVICE_COLUMNS)
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: rowToProductService(data as unknown as ProductServiceRow) }
}
