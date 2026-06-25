import { describe, expect, it } from 'vitest'
import { createProduct, importProductsCSV, listProducts, searchProducts } from '@/lib/actions/products'
import { resetDevData } from '@/lib/dev-data'
import { beforeEach } from 'vitest'

describe('product actions', () => {
  beforeEach(() => {
    resetDevData()
  })

  it('lists all seeded paint materials for settings', async () => {
    const result = await listProducts({ limit: 200 })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toHaveLength(102)
      expect(result.data[0].manufacturer).toBe('Dulux')
      expect(result.data[0].actualPrice).toBe(result.data[0].marketPrice)
    }
  })

  it('matches material search by separate words instead of exact phrase order', async () => {
    const result = await listProducts({ query: 'monument roof', limit: 20 })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.some((product) => product.name.includes('Monument'))).toBe(true)
    }
  })

  it('returns actual material cost for quote material search in dev mode', async () => {
    const result = await searchProducts({ query: 'ceiling white 15l', limit: 8 })

    expect(result.ok).toBe(true)
    if (result.ok) {
      const product = result.data.find((item) => item.productCode === '162615')
      expect(product?.marketPrice).toBe('231.53')
      expect(product?.actualPrice).toBe('219.95')
    }
  })

  it('imports materials from csv text in dev mode', async () => {
    const csvText = [
      'Brand,Kind,Base,Sheen/Finish,Volume (L),RRP',
      'Dulux,Test Paint,Base One,Matte,5,199.5',
      'Dulux,Another Product,Base Two,Silk,10L,250.00',
    ].join('\n')

    const result = await importProductsCSV({ csvText })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.imported).toBe(2)
      expect(result.data.products).toHaveLength(2)
      expect(result.data.products[0].manufacturer).toBe('Dulux')
      expect(result.data.products[0].productLine).toBe('Test Paint')
      expect(result.data.products[1].volumeLitres).toBe('10')
      expect(result.data.products[1].rrpPrice).toBe('250.00')
    }
  })

  it('creates a single custom material or service in dev mode', async () => {
    const result = await createProduct({
      manufacturer: 'PBC',
      productLine: 'Minor drywall repair',
      base: null,
      sheen: null,
      unit: 'service',
      rrpPrice: 125,
    })

    if (!result.ok) throw new Error(result.error)
    expect(result.data.manufacturer).toBe('PBC')
    expect(result.data.productLine).toBe('Minor drywall repair')
    expect(result.data.unit).toBe('service')
    expect(result.data.rrpPrice).toBe('125.00')

    const listResult = await listProducts({ query: 'drywall repair', limit: 200 })
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      expect(listResult.data.some((product) => product.productLine === 'Minor drywall repair')).toBe(true)
    }

    const searchResult = await searchProducts({ query: 'drywall repair', limit: 8 })
    expect(searchResult.ok).toBe(true)
    if (searchResult.ok) {
      expect(searchResult.data.some((product) => product.productLine === 'Minor drywall repair')).toBe(true)
    }
  })

  it('lists a newly created material first for the quote material dropdown', async () => {
    const result = await createProduct({
      manufacturer: 'PBC',
      productLine: 'Custom cabinet touch-up',
      base: null,
      sheen: null,
      unit: 'each',
      rrpPrice: 88,
    })

    if (!result.ok) throw new Error(result.error)

    const listResult = await listProducts({ limit: 1 })
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      expect(listResult.data[0].id).toBe(result.data.id)
      expect(listResult.data[0].productLine).toBe('Custom cabinet touch-up')
    }
  })

  it('returns a readable error for malformed csv', async () => {
    const csvText = ['Brand,Kind', 'Missing fields'].join('\n')

    const result = await importProductsCSV({ csvText })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Missing required column')
    }
  })
})
