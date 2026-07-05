import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isDevNoAuthMode: vi.fn(),
  requireAllowedUser: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/actions/types', async () => {
  const actual = await vi.importActual<typeof import('@/lib/actions/types')>('@/lib/actions/types')
  return {
    ...actual,
    isDevNoAuthMode: mocks.isDevNoAuthMode,
  }
})

vi.mock('@/lib/security/require-allowed-user', () => ({
  requireAllowedUser: mocks.requireAllowedUser,
}))

import {
  createProduct,
  deleteProduct,
  importProductsCSV,
  listProducts,
  searchProducts,
  updateProduct,
} from '@/lib/actions/products'

const productRow = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Dulux Weathershield Low Sheen Vivid White 10L',
  manufacturer: 'Dulux',
  type: 'Exterior',
  unit: '10L',
  market_price: '199.50',
  color_code: 'Vivid White',
  active: true,
  category: 'Exterior',
  product_line: 'Weathershield',
  base: 'Vivid White',
  sheen: 'Low Sheen',
  volume_litres: '10',
  price: '199.50',
  rrp_price: '199.50',
  product_code: 'DUL-1',
  source_url: null,
}

function createThenableProductsRequest(response: unknown) {
  const request = {
    select: vi.fn(() => request),
    eq: vi.fn(() => request),
    order: vi.fn(() => request),
    limit: vi.fn(() => request),
    or: vi.fn((filter: string) => {
      void filter
      return request
    }),
    then: (resolve: (value: unknown) => unknown) => resolve(response),
  }
  return request
}

function createSingleProductBuilder(method: 'insert' | 'update', response: unknown) {
  const builder = {
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(async () => response),
  }
  return {
    builder,
    from: vi.fn(() => ({
      [method]: method === 'insert' ? builder.insert : builder.update,
    })),
  }
}

function createImportBuilder(response: unknown) {
  const builder = {
    insert: vi.fn(() => builder),
    select: vi.fn(async () => response),
  }
  return builder
}

describe('product actions against Supabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDevNoAuthMode.mockReturnValue(false)
    mocks.requireAllowedUser.mockResolvedValue({
      ok: true,
      user: { id: 'user-1', email: 'owner@example.com' },
    })
  })

  it('creates a product row through Supabase', async () => {
    const { builder, from } = createSingleProductBuilder('insert', { data: productRow, error: null })
    mocks.createClient.mockResolvedValueOnce({ from })

    const result = await createProduct({
      manufacturer: 'Dulux',
      productLine: 'Weathershield',
      base: 'Vivid White',
      sheen: 'Low Sheen',
      volumeLitres: 10,
      rrpPrice: 199.5,
    })

    expect(result.ok).toBe(true)
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      actual_price: '199.50',
      market_price: '199.50',
      rrp_price: '199.50',
    }))
  })

  it('searches Supabase products by normalized tokens', async () => {
    const request = createThenableProductsRequest({ data: [productRow], error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => request) })

    const result = await searchProducts({ query: 'vivid, white', limit: 8 })

    expect(result.ok).toBe(true)
    expect(request.or).toHaveBeenCalledTimes(2)
    expect(request.limit).toHaveBeenCalledWith(8)
  })

  it('does not query Supabase when a search contains only wildcard or filter grammar characters', async () => {
    const result = await searchProducts({ query: '%,().__', limit: 8 })

    expect(result).toEqual({ ok: true, data: [] })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('strips PostgREST filter grammar and LIKE wildcard characters from search tokens', async () => {
    const request = createThenableProductsRequest({ data: [productRow], error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => request) })

    const result = await searchProducts({ query: 'weathershield%),active.eq.true _', limit: 8 })

    expect(result.ok).toBe(true)
    expect(request.or).toHaveBeenCalledTimes(1)
    const filter = request.or.mock.calls[0][0]
    expect(filter).not.toContain('active.eq.true')
    expect(filter).not.toContain('%_%')
    expect(filter).toContain('%weathershieldactiveeqtrue%')
  })

  it('lists Supabase products without requesting actual prices', async () => {
    const request = createThenableProductsRequest({ data: [productRow], error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => request) })

    const result = await listProducts({ query: 'weathershield', limit: 20 })

    expect(result.ok).toBe(true)
    expect(request.select).toHaveBeenCalledWith(expect.not.stringContaining('actual_price'))
    expect(request.or).toHaveBeenCalledWith(expect.stringContaining('product_line.ilike.%weathershield%'))
  })

  it('searches Supabase products with actual prices for quote material margin calculations', async () => {
    const request = createThenableProductsRequest({
      data: [{ ...productRow, actual_price: '180.00' }],
      error: null,
    })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => request) })

    const result = await searchProducts({ query: 'weathershield', limit: 8 })

    expect(result.ok).toBe(true)
    expect(request.select).toHaveBeenCalledWith(expect.stringContaining('actual_price'))
    if (result.ok) {
      expect(result.data[0].marketPrice).toBe('199.50')
      expect(result.data[0].actualPrice).toBe('180.00')
    }
  })

  it('rejects disallowed users before reading quote product prices', async () => {
    mocks.requireAllowedUser.mockResolvedValueOnce({
      ok: false,
      error: 'User is not allowed to access this app',
    })

    const result = await searchProducts({ query: 'weathershield', limit: 8 })

    expect(result).toEqual({ ok: false, error: 'User is not allowed to access this app' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('imports parsed CSV rows through Supabase', async () => {
    const builder = createImportBuilder({ data: [productRow], error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => builder) })

    const result = await importProductsCSV({
      csvText: [
        'Brand,Kind,Base,Sheen/Finish,Volume (L),RRP',
        'Dulux,Weathershield,Vivid White,Low Sheen,10L,199.50',
      ].join('\n'),
    })

    expect(result.ok).toBe(true)
    expect(builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        actual_price: '199.50',
        volume_litres: '10',
      }),
    ])
  })

  it('updates only supplied product fields through Supabase', async () => {
    const { builder, from } = createSingleProductBuilder('update', { data: productRow, error: null })
    mocks.createClient.mockResolvedValueOnce({ from })

    const result = await updateProduct({ id: '00000000-0000-4000-8000-000000000001', rrpPrice: 205 })

    expect(result.ok).toBe(true)
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      market_price: '205.00',
      actual_price: '205.00',
      rrp_price: '205.00',
    }))
    expect(builder.eq).toHaveBeenCalledWith('id', '00000000-0000-4000-8000-000000000001')
  })

  it('soft deletes products by marking them inactive', async () => {
    const { builder, from } = createSingleProductBuilder('update', { data: { ...productRow, active: false }, error: null })
    mocks.createClient.mockResolvedValueOnce({ from })

    const result = await deleteProduct({ id: '00000000-0000-4000-8000-000000000001' })

    expect(result.ok).toBe(true)
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ active: false }))
    expect(builder.eq).toHaveBeenCalledWith('id', '00000000-0000-4000-8000-000000000001')
  })
})
