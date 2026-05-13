import { describe, expect, it } from 'vitest'
import { importProductsCSV, listProducts } from '@/lib/actions/products'
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

  it('returns a readable error for malformed csv', async () => {
    const csvText = ['Brand,Kind', 'Missing fields'].join('\n')

    const result = await importProductsCSV({ csvText })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Missing required column')
    }
  })
})
