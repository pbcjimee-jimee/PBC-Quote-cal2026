import { beforeEach, describe, expect, it } from 'vitest'
import {
  createProductService,
  importProductServicesCSV,
  listProductServices,
  searchProductServices,
} from '@/lib/actions/product-services'
import { resetDevData } from '@/lib/dev-data'

describe('product service actions', () => {
  beforeEach(() => {
    resetDevData()
  })

  it('imports Jobber Products and Services CSV rows in dev mode', async () => {
    const csvText = [
      'Name,Description,Category,Unit Price,Unit Cost,Bookable,Duration Minutes,Quantity Enabled,Minimum Quantity,Maximum Quantity,Taxable,Active',
      '"Ceiling","All interior ceilings\n\n2 coats of Dulux ceiling paint",Service,14.5,0.0,false,,true,1,,true,true',
      '"Touch up","Patch and repaint visible marks",Service,120,80,false,60,false,,,true,true',
    ].join('\n')

    const result = await importProductServicesCSV({ csvText })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.imported).toBe(2)
      expect(result.data.productServices[0]).toMatchObject({
        name: 'Ceiling',
        category: 'Service',
        unitPrice: '14.50',
        unitCost: '0.00',
        quantityEnabled: true,
        minimumQuantity: '1.00',
        taxable: true,
        active: true,
      })
      expect(result.data.productServices[0].description).toContain('2 coats of Dulux ceiling paint')
    }
  })

  it('searches imported product services by name and description', async () => {
    await importProductServicesCSV({
      csvText: [
        'Name,Description,Category,Unit Price,Unit Cost,Bookable,Duration Minutes,Quantity Enabled,Minimum Quantity,Maximum Quantity,Taxable,Active',
        '"Skirting","All interior skirtings with oil-based undercoat",Service,8.5,0,false,,true,,,true,true',
      ].join('\n'),
    })

    const result = await searchProductServices({ query: 'oil undercoat', limit: 8 })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].name).toBe('Skirting')
    }
  })

  it('searches only product service names for quote title suggestions', async () => {
    await importProductServicesCSV({
      csvText: [
        'Name,Description,Category,Unit Price,Unit Cost,Bookable,Duration Minutes,Quantity Enabled,Minimum Quantity,Maximum Quantity,Taxable,Active',
        '"Wall painting","Two coats on prepared surfaces",Service,25,0,false,,true,,,true,true',
        '"Surface preparation","Prepare walls before painting",Service,15,0,false,,true,,,true,true',
      ].join('\n'),
    })

    const result = await searchProductServices({ query: 'wall', limit: 300, match: 'name' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.map((productService) => productService.name)).toEqual(['Wall painting'])
    }
  })

  it('creates a manual product service and lists it first', async () => {
    const result = await createProductService({
      name: 'Detailed prep',
      description: 'Wash, sand, patch, and prime.',
      category: 'Service',
      unitPrice: 250,
      unitCost: 0,
      taxable: true,
    })

    if (!result.ok) throw new Error(result.error)

    const listResult = await listProductServices({ limit: 1 })
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      expect(listResult.data[0].id).toBe(result.data.id)
      expect(listResult.data[0].unitPrice).toBe('250.00')
    }
  })
})
