import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isDevNoAuthMode: vi.fn(),
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

import { listProducts } from '@/lib/actions/products'

function createThenableProductsRequest(row: Record<string, unknown>) {
  const request = {
    select: vi.fn(() => request),
    eq: vi.fn(() => request),
    order: vi.fn(() => request),
    limit: vi.fn(() => request),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: [row], error: null }),
  }
  return request
}

describe('product action security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDevNoAuthMode.mockReturnValue(false)
  })

  it('does not request actual product cost when listing products', async () => {
    const request = createThenableProductsRequest({
      id: 'product-id',
      name: 'Dulux Test Paint',
      manufacturer: 'Dulux',
      type: 'Exterior',
      unit: '10L',
      market_price: '120.00',
      color_code: null,
      active: true,
      category: 'Exterior',
      product_line: 'Test Paint',
      base: null,
      sheen: null,
      volume_litres: '10',
      price: '120.00',
      rrp_price: '120.00',
      product_code: null,
      source_url: null,
    })
    mocks.createClient.mockResolvedValue({
      from: vi.fn(() => request),
    })

    const result = await listProducts({ limit: 20 })

    expect(request.select).toHaveBeenCalledWith(expect.stringContaining('market_price'))
    expect(request.select).toHaveBeenCalledWith(expect.not.stringContaining('actual_price'))
    expect(request.select).toHaveBeenCalledWith(expect.not.stringContaining('*'))
    expect(result).toEqual({
      ok: true,
      data: [
        expect.objectContaining({
          marketPrice: '120.00',
          actualPrice: '120.00',
        }),
      ],
    })
  })
})
