'use server'

import { normalizeRrpProduct, type ProductRecord } from '@/lib/products/types'
import { createClient } from '@/lib/supabase/server'
import { productSearchSchema } from '@/lib/validators'
import type { ActionResult } from './types'
import { isDevNoAuthMode } from './types'

function rowToProduct(row: {
  id: string
  name: string
  manufacturer: string | null
  type: string | null
  unit: string
  market_price: string
  actual_price: string
  color_code: string | null
  active: boolean
  category: string | null
  product_line: string | null
  base: string | null
  sheen: string | null
  volume_litres: string | null
  price: string | null
  rrp_price: string | null
  product_code: string | null
  source_url: string | null
}): ProductRecord {
  return normalizeRrpProduct({
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    type: row.type,
    unit: row.unit,
    marketPrice: row.market_price,
    actualPrice: row.actual_price,
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

  const supabase = await createClient()
  const q = `%${parsed.data.query}%`
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('active', true)
    .or(
      [
        `name.ilike.${q}`,
        `manufacturer.ilike.${q}`,
        `type.ilike.${q}`,
        `category.ilike.${q}`,
        `product_line.ilike.${q}`,
        `base.ilike.${q}`,
        `sheen.ilike.${q}`,
        `product_code.ilike.${q}`,
      ].join(',')
    )
    .limit(parsed.data.limit)

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data.map(rowToProduct) }
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
  let request = supabase
    .from('products')
    .select('*')
    .eq('active', true)
    .order('manufacturer', { ascending: true })
    .order('name', { ascending: true })
    .limit(limit)

  if (query.trim()) {
    const q = `%${query.trim()}%`
    request = request.or(
      [
        `name.ilike.${q}`,
        `manufacturer.ilike.${q}`,
        `type.ilike.${q}`,
        `category.ilike.${q}`,
        `product_line.ilike.${q}`,
        `base.ilike.${q}`,
        `sheen.ilike.${q}`,
        `product_code.ilike.${q}`,
      ].join(',')
    )
  }

  const { data, error } = await request
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data.map(rowToProduct) }
}

export async function importProductsCSV(): Promise<ActionResult<{ imported: number }>> {
  return {
    ok: false,
    error: 'CSV import UI is not enabled in the login-free test build.',
  }
}
