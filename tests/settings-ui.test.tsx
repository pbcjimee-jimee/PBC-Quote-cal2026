import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  buildMaterialUpdateInput,
  MaterialAddItemForm,
  MaterialCsvTemplate,
  MaterialProductsTable,
} from '@/components/settings/settings-form'
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

  it('renders an add item form for custom materials or services', () => {
    const markup = renderToStaticMarkup(createElement(MaterialAddItemForm))

    expect(markup).toContain('Add Item')
    expect(markup).toContain('Material or service name')
    expect(markup).toContain('Price')
    expect(markup).toContain('Unit')
  })

  it('normalizes numeric edit form values before saving', () => {
    const input = buildMaterialUpdateInput('550e8400-e29b-41d4-a716-446655440000', {
      manufacturer: ' Dulux ',
      productLine: ' Wash & Wear ',
      base: null,
      sheen: undefined,
      volumeLitres: 15,
      unit: ' 15L ',
      rrpPrice: 199.99,
    })

    expect(input).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      manufacturer: 'Dulux',
      productLine: 'Wash & Wear',
      base: null,
      sheen: null,
      volumeLitres: 15,
      unit: '15L',
      rrpPrice: 199.99,
    })
  })
})
