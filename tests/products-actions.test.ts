import { describe, expect, it } from 'vitest'
import { listProducts } from '@/lib/actions/products'

describe('product actions', () => {
  it('lists all seeded paint materials for settings', async () => {
    const result = await listProducts({ limit: 200 })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toHaveLength(102)
      expect(result.data[0].manufacturer).toBe('Dulux')
      expect(result.data[0].actualPrice).toBe(result.data[0].marketPrice)
    }
  })
})
