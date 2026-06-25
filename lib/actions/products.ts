'use server'

import { normalizeRrpProduct, type ProductRecord } from '@/lib/products/types'
import { createClient } from '@/lib/supabase/server'
import {
  productCreateSchema,
  productDeleteSchema,
  productImportSchema,
  productSearchSchema,
  productUpdateSchema,
} from '@/lib/validators'
import type { ActionResult } from './types'
import { isDevNoAuthMode } from './types'
import type { Database } from '@/lib/supabase/types'

type ProductRow = Database['public']['Tables']['products']['Row']
type ProductCreateInput = {
  name?: string
  manufacturer?: string | null
  type?: string | null
  productLine: string
  base?: string | null
  sheen?: string | null
  unit?: string
  volumeLitres?: number
  rrpPrice: number
}
type ProductUpdateInput = {
  id: string
  name?: string
  manufacturer?: string | null
  type?: string | null
  productLine?: string | null
  base?: string | null
  sheen?: string | null
  unit?: string
  volumeLitres?: number
  rrpPrice?: number
}

type ProductImportRow = {
  manufacturer: string
  productLine: string
  base: string
  sheen: string
  volumeLitres: string
  rrpPrice: string
}

type ProductImportResult = {
  imported: number
  products: ProductRecord[]
}

type PublicProductRow = Pick<
  ProductRow,
  | 'id'
  | 'name'
  | 'manufacturer'
  | 'type'
  | 'unit'
  | 'market_price'
  | 'color_code'
  | 'active'
  | 'category'
  | 'product_line'
  | 'base'
  | 'sheen'
  | 'volume_litres'
  | 'price'
  | 'rrp_price'
  | 'product_code'
  | 'source_url'
> & {
  actual_price?: string
}

const PUBLIC_PRODUCT_COLUMNS = [
  'id',
  'name',
  'manufacturer',
  'type',
  'unit',
  'market_price',
  'color_code',
  'active',
  'category',
  'product_line',
  'base',
  'sheen',
  'volume_litres',
  'price',
  'rrp_price',
  'product_code',
  'source_url',
].join(', ')

const QUOTE_PRODUCT_COLUMNS = `${PUBLIC_PRODUCT_COLUMNS}, actual_price`

function rowToProduct(row: PublicProductRow): ProductRecord {
  return normalizeRrpProduct({
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    type: row.type,
    unit: row.unit,
    marketPrice: row.market_price,
    actualPrice: row.actual_price ?? row.market_price,
    colorCode: row.color_code,
    active: row.active,
    category: row.category,
    productLine: row.product_line,
    base: row.base,
    sheen: row.sheen,
    volumeLitres: row.volume_litres,
    price: row.price,
    rrpPrice: row.rrp_price,
    productCode: row.product_code,
    sourceUrl: row.source_url,
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

function productSearchOr(token: string): string {
  const q = `%${token}%`
  return [
    `name.ilike.${q}`,
    `manufacturer.ilike.${q}`,
    `type.ilike.${q}`,
    `category.ilike.${q}`,
    `product_line.ilike.${q}`,
    `base.ilike.${q}`,
    `sheen.ilike.${q}`,
    `product_code.ilike.${q}`,
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

const IMPORT_HEADER_MAP: Record<string, keyof ProductImportRow> = {
  brand: 'manufacturer',
  manufacturer: 'manufacturer',
  kind: 'productLine',
  type: 'productLine',
  base: 'base',
  sheen: 'sheen',
  sheenfinish: 'sheen',
  finish: 'sheen',
  sheenfinishfinish: 'sheen',
  volumel: 'volumeLitres',
  volumelitres: 'volumeLitres',
  volume: 'volumeLitres',
  price: 'rrpPrice',
  rrp: 'rrpPrice',
  rrpprice: 'rrpPrice',
}

function parseImportPrice(value: string): string {
  const cleaned = value.trim().replace(/,/g, '')
  const amount = Number(cleaned)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`invalid price: ${value}`)
  }
  return amount.toFixed(2)
}

function parseImportVolume(value: string): string {
  const cleaned = value.trim().replace(/[^0-9.]/g, '')
  if (!cleaned) {
    throw new Error(`invalid volume: ${value}`)
  }
  const amount = Number(cleaned)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`invalid volume: ${value}`)
  }
  return amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)
}

function parseProductsCSV(csvText: string): ProductImportRow[] {
  const parsedRows = parseCsvRows(csvText)
  if (parsedRows.length === 0) {
    return []
  }

  const header = parsedRows[0].map(normalizeCsvHeaderValue)
  const indexByField: Partial<Record<keyof ProductImportRow, number>> = {}

  for (let index = 0; index < header.length; index += 1) {
    const key = header[index]
    const mapped = IMPORT_HEADER_MAP[key]
    if (mapped) {
      indexByField[mapped] = index
    } else if (key.includes('rrp') && key.includes('price')) {
      indexByField.rrpPrice = index
    }
  }

  if (indexByField.manufacturer === undefined) {
    throw new Error('Missing required column: Brand')
  }
  if (indexByField.productLine === undefined) {
    throw new Error('Missing required column: Kind')
  }
  if (indexByField.volumeLitres === undefined) {
    throw new Error('Missing required column: Volume (L)')
  }

  const rows: ProductImportRow[] = []

  for (let rowIndex = 1; rowIndex < parsedRows.length; rowIndex += 1) {
    const row = parsedRows[rowIndex]
    const getValue = (fieldIndex?: number) => (fieldIndex === undefined ? '' : (row[fieldIndex] ?? '').trim())

    const manufacturer = getValue(indexByField.manufacturer)
    const productLine = getValue(indexByField.productLine)
    const base = getValue(indexByField.base)
    const sheen = getValue(indexByField.sheen)
    const volumeLitres = parseImportVolume(getValue(indexByField.volumeLitres))
    const rrpPrice = parseImportPrice(getValue(indexByField.rrpPrice))

    if (!manufacturer || !productLine) {
      throw new Error(`Line ${rowIndex + 1}: missing brand or kind`)
    }

    rows.push({
      manufacturer,
      productLine,
      base: base || '',
      sheen: sheen || '',
      volumeLitres,
      rrpPrice,
    })
  }

  return rows
}

function toProductInsertPayload(rows: ProductImportRow[]): Array<
  Omit<Database['public']['Tables']['products']['Insert'], 'created_at' | 'updated_at' | 'id'>
> {
  return rows.map((row) => {
    const volumeLabel = row.volumeLitres ? `${row.volumeLitres}L` : ''
    const name = [row.manufacturer, row.productLine, row.sheen, row.base, volumeLabel].filter(Boolean).join(' ')

    return {
      name: name || `${row.manufacturer} ${row.productLine}`,
      manufacturer: row.manufacturer,
      type: row.productLine,
      unit: volumeLabel || 'L',
      market_price: row.rrpPrice,
      actual_price: row.rrpPrice,
      color_code: row.base || null,
      active: true,
      category: row.productLine,
      product_line: row.productLine,
      base: row.base || null,
      sheen: row.sheen || null,
      volume_litres: row.volumeLitres || null,
      price: row.rrpPrice,
      rrp_price: row.rrpPrice,
      product_code: null,
      source_url: null,
    }
  })
}

function normalizeCreatePayload(input: ProductCreateInput) {
  const price = input.rrpPrice.toFixed(2)
  const volumeLitres = input.volumeLitres === undefined ? null : String(input.volumeLitres)
  const unit = input.unit?.trim() || (volumeLitres ? `${volumeLitres}L` : 'each')
  const manufacturer = input.manufacturer?.trim() || null
  const productLine = input.productLine.trim()
  const base = input.base?.trim() || null
  const sheen = input.sheen?.trim() || null
  const type = input.type?.trim() || productLine
  const name = input.name?.trim() || [manufacturer, productLine, sheen, base, unit].filter(Boolean).join(' ')

  return {
    devRecord: {
      name,
      manufacturer,
      type,
      productLine,
      base,
      sheen,
      unit,
      volumeLitres,
      rrpPrice: price,
    },
    row: {
      name,
      manufacturer,
      type,
      unit,
      market_price: price,
      actual_price: price,
      color_code: base,
      active: true,
      category: type,
      product_line: productLine,
      base,
      sheen,
      volume_litres: volumeLitres,
      price,
      rrp_price: price,
      product_code: null,
      source_url: null,
    } satisfies Omit<Database['public']['Tables']['products']['Insert'], 'id' | 'created_at' | 'updated_at'>,
  }
}

export async function createProduct(input: unknown): Promise<ActionResult<ProductRecord>> {
  const parsed = productCreateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  const payload = normalizeCreatePayload(parsed.data)

  if (isDevNoAuthMode()) {
    const { createDevProduct } = await import('@/lib/dev-data')
    return { ok: true, data: createDevProduct(payload.devRecord) }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .insert(payload.row)
    .select(PUBLIC_PRODUCT_COLUMNS)
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: rowToProduct(data as unknown as PublicProductRow) }
}

export async function searchProducts(input: unknown): Promise<ActionResult<ProductRecord[]>> {
  const parsed = productSearchSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  if (isDevNoAuthMode()) {
    const { searchDevProducts } = await import('@/lib/dev-data')
    return {
      ok: true,
      data: searchDevProducts(parsed.data.query, parsed.data.limit),
    }
  }

  const tokens = searchTokens(parsed.data.query)
  if (tokens.length === 0) {
    return { ok: true, data: [] }
  }

  const supabase = await createClient()
  let request = supabase
    .from('products')
    .select(QUOTE_PRODUCT_COLUMNS)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(parsed.data.limit)

  for (const token of tokens) {
    request = request.or(productSearchOr(token))
  }

  const { data, error } = await request
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data as unknown as PublicProductRow[]).map(rowToProduct) }
}

export async function listProducts(input: unknown = {}): Promise<ActionResult<ProductRecord[]>> {
  const parsed = productSearchSchema.partial({ query: true }).safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  const query = parsed.data.query ?? ''
  const limit = parsed.data.limit ?? 200

  if (isDevNoAuthMode()) {
    const { listDevProducts } = await import('@/lib/dev-data')
    return { ok: true, data: listDevProducts(query, limit) }
  }

  const supabase = await createClient()
  const tokens = searchTokens(query)
  let request = supabase
    .from('products')
    .select(PUBLIC_PRODUCT_COLUMNS)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (query.trim() && tokens.length > 0) {
    for (const token of tokens) {
      request = request.or(productSearchOr(token))
    }
  }

  const { data, error } = await request
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data as unknown as PublicProductRow[]).map(rowToProduct) }
}

export async function importProductsCSV(input: unknown): Promise<ActionResult<ProductImportResult>> {
  const parsed = productImportSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  let rows: ProductImportRow[]
  try {
    rows = parseProductsCSV(parsed.data.csvText)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid CSV format'
    return { ok: false, error: message }
  }

  if (rows.length === 0) {
    return { ok: false, error: 'No valid rows found in CSV' }
  }

  const insertRows = toProductInsertPayload(rows)

  if (isDevNoAuthMode()) {
    const { createDevProductsFromImport } = await import('@/lib/dev-data')
    const created = createDevProductsFromImport(
      rows.map((row) => ({
        manufacturer: row.manufacturer,
        productLine: row.productLine,
        base: row.base,
        sheen: row.sheen,
        volumeLitres: row.volumeLitres,
        rrpPrice: row.rrpPrice,
      }))
    )
    return { ok: true, data: { imported: created.length, products: created } }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.from('products').insert(insertRows).select(PUBLIC_PRODUCT_COLUMNS)
  if (error) {
    return { ok: false, error: error.message }
  }

  const productRows = data as unknown as PublicProductRow[]
  return { ok: true, data: { imported: productRows.length, products: productRows.map(rowToProduct) } }
}

function normalizeUpdatePayload(input: ProductUpdateInput) {
  const { id, name, manufacturer, type, productLine, base, sheen, unit, volumeLitres, rrpPrice } = input

  const price = typeof rrpPrice === 'number' ? rrpPrice.toFixed(2) : undefined

  return {
    id,
    payload: {
      ...(name !== undefined ? { name } : {}),
      ...(manufacturer !== undefined ? { manufacturer } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(productLine !== undefined ? { product_line: productLine } : {}),
      ...(base !== undefined ? { base } : {}),
      ...(sheen !== undefined ? { sheen } : {}),
      ...(unit !== undefined ? { unit } : {}),
      ...(volumeLitres !== undefined ? { volume_litres: String(volumeLitres) } : {}),
      ...(price !== undefined
        ? {
            market_price: price,
            actual_price: price,
            rrp_price: price,
          }
        : {}),
      updated_at: new Date().toISOString(),
    } as Partial<ProductRow>,
  }
}

export async function updateProduct(input: unknown): Promise<ActionResult<ProductRecord>> {
  const parsed = productUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  const { id, payload } = normalizeUpdatePayload(parsed.data)
  if (Object.keys(payload).length === 1) {
    return { ok: false, error: 'No fields to update' }
  }

  if (isDevNoAuthMode()) {
    const { updateDevProduct } = await import('@/lib/dev-data')
    const updated = updateDevProduct(id, payload)
    if (!updated) return { ok: false, error: 'Product not found' }
    return { ok: true, data: updated }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .update(payload)
    .eq('id', id)
    .select(PUBLIC_PRODUCT_COLUMNS)
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: rowToProduct(data as unknown as PublicProductRow) }
}

export async function deleteProduct(input: unknown): Promise<ActionResult<ProductRecord>> {
  const parsed = productDeleteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  if (isDevNoAuthMode()) {
    const { deleteDevProduct } = await import('@/lib/dev-data')
    const deleted = deleteDevProduct(parsed.data.id)
    if (!deleted) return { ok: false, error: 'Product not found' }
    return { ok: true, data: deleted }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .select(PUBLIC_PRODUCT_COLUMNS)
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: rowToProduct(data as unknown as PublicProductRow) }
}
