import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MaterialCsvTemplate, MaterialProductsTable } from '@/components/settings/settings-form'
import type { ProductRecord } from '@/lib/products/types'

describe('settings material UI', () => {
  it('shows paint kind without the full product name subtitle', () => {
    const products: ProductRecord[] = [
      {
        id: 'product-1',
        name: 'Dulux AcraTex AcraShield Advance Low Gloss Deep Base 15L',
        manufacturer: 'Dulux',
        type: 'Acratex Acrashield Low Gloss',
        unit: '15L',
        marketPrice: '305.21',
        actualPrice: '305.21',
        colorCode: 'Deep Base',
        active: true,
        productLine: 'Acratex AcraShield Advance',
        base: 'Deep Base',
        sheen: 'Low Gloss',
        volumeLitres: '15',
        rrpPrice: '305.21',
        productCode: '167094',
      },
      {
        id: 'product-2',
        name: 'Dulux Full Fallback Name 10L',
        manufacturer: 'Dulux',
        type: null,
        unit: '10L',
        marketPrice: '100.00',
        actualPrice: '100.00',
        colorCode: null,
        active: true,
        productLine: null,
        base: null,
        sheen: null,
        volumeLitres: '10',
        rrpPrice: '100.00',
      },
    ]

    const markup = renderToStaticMarkup(createElement(MaterialProductsTable, { products }))

    expect(markup).toContain('Acratex AcraShield Advance')
    expect(markup).not.toContain('Dulux AcraTex AcraShield Advance Low Gloss Deep Base 15L')
    expect(markup).not.toContain('Dulux Full Fallback Name 10L')
  })

  it('provides a CSV template with header and sample rows', () => {
    const template = MaterialCsvTemplate()

    expect(template).toContain('Brand,Kind,Base,Sheen/Finish,Volume (L),Price (RRP)')
    expect(template).toContain('Dulux,Acratex,Monument,Low Sheen,15,199.99')
    expect(template).toContain('Bunnings,Wall Paint,White,Matte,4,89.90')
  })
})
