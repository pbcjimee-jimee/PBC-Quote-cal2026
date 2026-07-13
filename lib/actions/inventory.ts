'use server'

import { normalizeInventoryItem, type InventoryItemRecord, type InventoryStatus } from '@/lib/inventory/types'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'
import { createClient } from '@/lib/supabase/server'
import {
  inventoryCreateSchema,
  inventoryDeleteSchema,
  inventoryImportSchema,
  inventorySearchSchema,
  inventoryUpdateSchema,
} from '@/lib/validators'
import type { ActionResult } from './types'
import { isDevNoAuthMode } from './types'
import type { Database } from '@/lib/supabase/types'

type InventoryRow = Database['public']['Tables']['warehouse_inventory']['Row']
type InventoryInsert = Database['public']['Tables']['warehouse_inventory']['Insert']
type InventoryUpdate = Database['public']['Tables']['warehouse_inventory']['Update']

type InventoryImportRow = {
  name: string
  category: string
  brand: string
  modelSpecification: string
  colour: string
  sizeOrSerial: string
  quantity: string
  purchaseDate: string
  usedDate: string
  usedLocationText: string
  status: string
  notes: string
  sourceYear: string
}

type InventoryImportResult = {
  imported: number
  items: InventoryItemRecord[]
}

const INVENTORY_COLUMNS = [
  'id',
  'name',
  'category',
  'brand',
  'model_specification',
  'colour',
  'size_or_serial',
  'quantity',
  'purchase_date',
  'used_date',
  'used_location_text',
  'status',
  'notes',
  'active',
  'source_year',
  'created_at',
  'updated_at',
].join(', ')

const MONTHS: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
}

function rowToInventory(row: InventoryRow): InventoryItemRecord {
  return normalizeInventoryItem({
    id: row.id,
    name: row.name,
    category: row.category,
    brand: row.brand,
    modelSpecification: row.model_specification,
    colour: row.colour,
    sizeOrSerial: row.size_or_serial,
    quantity: row.quantity,
    purchaseDate: row.purchase_date,
    usedDate: row.used_date,
    usedLocationText: row.used_location_text,
    status: row.status,
    notes: row.notes,
    active: row.active,
    sourceYear: row.source_year,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function nullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed || null
}

function quantityString(value: number): string {
  return value.toFixed(2)
}

function normalizeDateInput(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3]
    return `${year}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`
  }

  return trimmed
}

function normalizeCreatePayload(input: {
  name: string
  category?: string | null
  brand?: string | null
  modelSpecification?: string | null
  colour?: string | null
  sizeOrSerial?: string | null
  quantity: number
  purchaseDate?: string | null
  usedDate?: string | null
  usedLocationText?: string | null
  status: InventoryStatus
  notes?: string | null
  sourceYear?: string | null
  active: boolean
}): InventoryInsert {
  return {
    name: input.name.trim(),
    category: nullableText(input.category),
    brand: nullableText(input.brand),
    model_specification: nullableText(input.modelSpecification),
    colour: nullableText(input.colour),
    size_or_serial: nullableText(input.sizeOrSerial),
    quantity: quantityString(input.quantity),
    purchase_date: normalizeDateInput(input.purchaseDate),
    used_date: normalizeDateInput(input.usedDate),
    used_location_text: nullableText(input.usedLocationText),
    status: input.status,
    notes: nullableText(input.notes),
    active: input.active,
    source_year: nullableText(input.sourceYear),
  }
}

function normalizeUpdatePayload(input: {
  name?: string
  category?: string | null
  brand?: string | null
  modelSpecification?: string | null
  colour?: string | null
  sizeOrSerial?: string | null
  quantity?: number
  purchaseDate?: string | null
  usedDate?: string | null
  usedLocationText?: string | null
  status?: InventoryStatus
  notes?: string | null
  sourceYear?: string | null
  active?: boolean
}): InventoryUpdate {
  const payload: InventoryUpdate = {}

  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.category !== undefined) payload.category = nullableText(input.category)
  if (input.brand !== undefined) payload.brand = nullableText(input.brand)
  if (input.modelSpecification !== undefined) payload.model_specification = nullableText(input.modelSpecification)
  if (input.colour !== undefined) payload.colour = nullableText(input.colour)
  if (input.sizeOrSerial !== undefined) payload.size_or_serial = nullableText(input.sizeOrSerial)
  if (input.quantity !== undefined) payload.quantity = quantityString(input.quantity)
  if (input.purchaseDate !== undefined) payload.purchase_date = normalizeDateInput(input.purchaseDate)
  if (input.usedDate !== undefined) payload.used_date = normalizeDateInput(input.usedDate)
  if (input.usedLocationText !== undefined) payload.used_location_text = nullableText(input.usedLocationText)
  if (input.status !== undefined) payload.status = input.status
  if (input.notes !== undefined) payload.notes = nullableText(input.notes)
  if (input.sourceYear !== undefined) payload.source_year = nullableText(input.sourceYear)
  if (input.active !== undefined) payload.active = input.active

  return payload
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

function inventorySearchOr(token: string): string {
  const q = `%${token}%`
  return [
    `name.ilike.${q}`,
    `category.ilike.${q}`,
    `brand.ilike.${q}`,
    `model_specification.ilike.${q}`,
    `colour.ilike.${q}`,
    `size_or_serial.ilike.${q}`,
    `used_location_text.ilike.${q}`,
    `notes.ilike.${q}`,
  ].join(',')
}

function normalizeCsvHeaderValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[().:]/g, '')
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

const IMPORT_HEADER_MAP: Record<string, keyof InventoryImportRow> = {
  name: 'name',
  item: 'name',
  category: 'category',
  brand: 'brand',
  manufacturer: 'brand',
  modelspecification: 'modelSpecification',
  model: 'modelSpecification',
  specification: 'modelSpecification',
  colour: 'colour',
  color: 'colour',
  serialnum: 'sizeOrSerial',
  serialnumber: 'sizeOrSerial',
  sizeserial: 'sizeOrSerial',
  sizeorserial: 'sizeOrSerial',
  sizecapacity: 'sizeOrSerial',
  quantity: 'quantity',
  qty: 'quantity',
  purchasedate: 'purchaseDate',
  useddate: 'usedDate',
  usedlocation: 'usedLocationText',
  usedlocationplace: 'usedLocationText',
  usedlocationtext: 'usedLocationText',
  place: 'usedLocationText',
  location: 'usedLocationText',
  price: 'usedLocationText',
  status: 'status',
  notes: 'notes',
  note: 'notes',
  unnamed9: 'notes',
  sourceyear: 'sourceYear',
}

function parseInventoryDate(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3]
    return `${year}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`
  }

  return null
}

function extractUsedDate(value: string, sourceYear: string | null): string | null {
  const match = value.match(/\b(\d{1,2})\/\s*([A-Za-z]{3,})\b/)
  if (!match) return null

  const month = MONTHS[match[2].toLowerCase()]
  if (!month) return null

  const year = sourceYear?.match(/^\d{4}$/) ? sourceYear : String(new Date().getFullYear())
  return `${year}-${month}-${match[1].padStart(2, '0')}`
}

function normalizeInventoryStatus(value: string): InventoryStatus | null {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!normalized) return null
  if (normalized === 'in_stock' || normalized === 'instock') return 'in_stock'
  if (normalized === 'out' || normalized === 'used' || normalized === 'disposal' || normalized === 'disposed') return 'out'
  if (normalized === 'unknown') return 'unknown'
  return null
}

function parseInventoryCSV(csvText: string, sourceYear?: string | null): InventoryImportRow[] {
  const parsedRows = parseCsvRows(csvText)
  if (parsedRows.length === 0) return []

  const header = parsedRows[0].map(normalizeCsvHeaderValue)
  const indexByField: Partial<Record<keyof InventoryImportRow, number>> = {}

  for (let index = 0; index < header.length; index += 1) {
    const mapped = IMPORT_HEADER_MAP[header[index]]
    if (mapped) indexByField[mapped] = index
  }

  if (indexByField.name === undefined) {
    throw new Error('Missing required column: Name')
  }

  const rows: InventoryImportRow[] = []
  let currentWorkbookCategory: string | null = null

  for (let rowIndex = 1; rowIndex < parsedRows.length; rowIndex += 1) {
    const row = parsedRows[rowIndex]
    const getValue = (fieldIndex?: number) => (fieldIndex === undefined ? '' : (row[fieldIndex] ?? '').trim())
    const name = getValue(indexByField.name)
    if (!name) {
      throw new Error(`Line ${rowIndex + 1}: missing name`)
    }

    const category = getValue(indexByField.category)
    const brandValue = getValue(indexByField.brand)
    const modelSpecification = getValue(indexByField.modelSpecification)
    const colour = getValue(indexByField.colour)
    const sizeOrSerial = getValue(indexByField.sizeOrSerial)
    const quantity = getValue(indexByField.quantity)
    const purchaseDate = getValue(indexByField.purchaseDate)
    const usedDate = getValue(indexByField.usedDate)
    const usedLocationText = getValue(indexByField.usedLocationText)
    const status = getValue(indexByField.status)
    const notes = getValue(indexByField.notes)
    const rowSourceYear = getValue(indexByField.sourceYear)

    const isWorkbookSectionRow = !category
      && !brandValue
      && !modelSpecification
      && !colour
      && !sizeOrSerial
      && !quantity
      && !purchaseDate
      && !usedDate
      && !usedLocationText
      && !status
      && !notes
      && !rowSourceYear

    if (isWorkbookSectionRow) {
      currentWorkbookCategory = name
      continue
    }

    const brand = brandValue || modelSpecification

    rows.push({
      name,
      category: currentWorkbookCategory ?? category,
      brand,
      modelSpecification: brand === modelSpecification ? '' : modelSpecification,
      colour,
      sizeOrSerial,
      quantity: quantity || '1',
      purchaseDate,
      usedDate,
      usedLocationText,
      status,
      notes,
      sourceYear: rowSourceYear || sourceYear?.trim() || '',
    })
  }

  return rows
}

function importRowToInsert(row: InventoryImportRow): InventoryInsert {
  const sourceYear = nullableText(row.sourceYear)
  const purchaseDate = parseInventoryDate(row.purchaseDate)
  const purchaseMarker = row.purchaseDate.trim().toLowerCase()
  const purchaseMarkerStatus = normalizeInventoryStatus(row.purchaseDate)
  const purchaseLocationText = !purchaseDate && !purchaseMarkerStatus ? row.purchaseDate.trim() : ''
  const usedLocationText = [row.usedLocationText.trim(), purchaseLocationText].filter(Boolean).join(' | ')
  const explicitStatus = normalizeInventoryStatus(row.status)
  const usedDate = parseInventoryDate(row.usedDate) ?? extractUsedDate(usedLocationText, sourceYear)
  const quantity = Number(row.quantity.replace(/,/g, ''))

  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error(`invalid quantity: ${row.quantity}`)
  }

  const status = purchaseMarkerStatus === 'out'
    ? 'out'
    : explicitStatus ?? (usedDate || usedLocationText ? 'out' : purchaseMarker && !purchaseDate ? 'unknown' : 'in_stock')

  return {
    name: row.name.trim(),
    category: nullableText(row.category),
    brand: nullableText(row.brand),
    model_specification: nullableText(row.modelSpecification),
    colour: nullableText(row.colour),
    size_or_serial: nullableText(row.sizeOrSerial),
    quantity: quantity.toFixed(2),
    purchase_date: purchaseDate,
    used_date: usedDate,
    used_location_text: nullableText(usedLocationText),
    status,
    notes: nullableText(row.notes),
    active: true,
    source_year: sourceYear,
  }
}

function toInventoryInsertPayload(rows: InventoryImportRow[]): InventoryInsert[] {
  return rows.map(importRowToInsert)
}

export async function listInventory(input: unknown = {}): Promise<ActionResult<InventoryItemRecord[]>> {
  const parsed = inventorySearchSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  const { query, limit, status, category } = parsed.data

  if (isDevNoAuthMode()) {
    const { listDevInventory } = await import('@/lib/dev-data')
    return { ok: true, data: listDevInventory(query, limit, status, category) }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const tokens = searchTokens(query)
  let request = supabase
    .from('warehouse_inventory')
    .select(INVENTORY_COLUMNS)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) request = request.eq('status', status)
  if (category?.trim()) request = request.eq('category', category.trim())

  for (const token of tokens) {
    request = request.or(inventorySearchOr(token))
  }

  const { data, error } = await request
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data as unknown as InventoryRow[]).map(rowToInventory) }
}

export async function createInventoryItem(input: unknown): Promise<ActionResult<InventoryItemRecord>> {
  const parsed = inventoryCreateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  const payload = normalizeCreatePayload(parsed.data)

  if (isDevNoAuthMode()) {
    const { createDevInventoryItem } = await import('@/lib/dev-data')
    return { ok: true, data: createDevInventoryItem(payload) }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('warehouse_inventory')
    .insert(payload)
    .select(INVENTORY_COLUMNS)
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: rowToInventory(data as unknown as InventoryRow) }
}

export async function updateInventoryItem(input: unknown): Promise<ActionResult<InventoryItemRecord>> {
  const parsed = inventoryUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  const { id, ...updateInput } = parsed.data
  const payload = normalizeUpdatePayload(updateInput)
  if (Object.keys(payload).length === 0) {
    return { ok: false, error: 'No fields to update' }
  }
  payload.updated_at = new Date().toISOString()

  if (isDevNoAuthMode()) {
    const { updateDevInventoryItem } = await import('@/lib/dev-data')
    const updated = updateDevInventoryItem(id, payload)
    if (!updated) return { ok: false, error: 'Inventory item not found' }
    return { ok: true, data: updated }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('warehouse_inventory')
    .update(payload)
    .eq('id', id)
    .select(INVENTORY_COLUMNS)
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: rowToInventory(data as unknown as InventoryRow) }
}

export async function deleteInventoryItem(input: unknown): Promise<ActionResult<InventoryItemRecord>> {
  const parsed = inventoryDeleteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  const payload = {
    active: false,
    updated_at: new Date().toISOString(),
  } satisfies InventoryUpdate

  if (isDevNoAuthMode()) {
    const { deleteDevInventoryItem } = await import('@/lib/dev-data')
    const deleted = deleteDevInventoryItem(parsed.data.id)
    if (!deleted) return { ok: false, error: 'Inventory item not found' }
    return { ok: true, data: deleted }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('warehouse_inventory')
    .update(payload)
    .eq('id', parsed.data.id)
    .select(INVENTORY_COLUMNS)
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: rowToInventory(data as unknown as InventoryRow) }
}

export async function importInventoryCSV(input: unknown): Promise<ActionResult<InventoryImportResult>> {
  const parsed = inventoryImportSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  let rows: InventoryImportRow[]
  try {
    rows = parseInventoryCSV(parsed.data.csvText, parsed.data.sourceYear)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid CSV format'
    return { ok: false, error: message }
  }

  if (rows.length === 0) {
    return { ok: false, error: 'No valid rows found in CSV' }
  }

  let insertRows: InventoryInsert[]
  try {
    insertRows = toInventoryInsertPayload(rows)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid inventory data'
    return { ok: false, error: message }
  }

  if (isDevNoAuthMode()) {
    const { createDevInventoryItemsFromImport } = await import('@/lib/dev-data')
    const created = createDevInventoryItemsFromImport(insertRows)
    return { ok: true, data: { imported: created.length, items: created } }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('warehouse_inventory')
    .insert(insertRows)
    .select(INVENTORY_COLUMNS)

  if (error) return { ok: false, error: error.message }
  const inventoryRows = data as unknown as InventoryRow[]
  return { ok: true, data: { imported: inventoryRows.length, items: inventoryRows.map(rowToInventory) } }
}
