import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  buildMaterialUpdateInput,
  formatAreaMutationError,
  MaterialAddItemForm,
  MaterialCsvTemplate,
  MaterialProductsTable,
  ProductServiceAddItemForm,
  ProductServicesTable,
  QuoteLineTemplateEditor,
  savePricingSettingsForm,
  SettingsForm,
} from '@/components/settings/settings-form'
import type { ProductRecord } from '@/lib/products/types'
import type { ProductServiceRecord } from '@/lib/product-services/types'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import { updatePricingSettings } from '@/lib/actions/settings'
import { installTestDom } from '@/tests/helpers/test-dom'

vi.mock('@/lib/actions/settings', () => ({
  updatePricingSettings: vi.fn(),
}))

function pricingSettingsFormState(
  overrides: Partial<Parameters<typeof savePricingSettingsForm>[0]> = {}
): Parameters<typeof savePricingSettingsForm>[0] {
  return {
    f1LabourRate: '500',
    f2LabourRate: '460',
    f3LabourRate: '460',
    f4LabourRate: '380',
    f5LabourRate: '380',
    roofLabourRate: '700',
    f2Margin: '30',
    f3Margin: '30',
    f4Margin: '25',
    f5Margin: '30',
    ...overrides,
  }
}

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

  it('does not show a Jobber reconnect action in settings', () => {
    const markup = renderToStaticMarkup(createElement(SettingsForm, {
      initialAreas: [],
      initialProducts: [],
      initialQuoteLineTemplates: [],
      initialSettings: DEFAULT_PRICING_SETTINGS,
    }))

    expect(markup).not.toContain('Jobber Connection')
    expect(markup).not.toContain('Reconnect Jobber')
    expect(markup).not.toContain('/api/jobber/connect')
  })

  it('uses shared design-system form section and table classes', () => {
    const settingsMarkup = renderToStaticMarkup(createElement(SettingsForm, {
      initialAreas: [],
      initialProducts: [],
      initialQuoteLineTemplates: [],
      initialSettings: DEFAULT_PRICING_SETTINGS,
    }))
    const tableMarkup = renderToStaticMarkup(createElement(MaterialProductsTable, {
      products: [
        {
          id: 'product-1',
          name: 'Dulux Wash & Wear White 4L',
          manufacturer: 'Dulux',
          type: null,
          unit: '4L',
          marketPrice: '89.90',
          actualPrice: '89.90',
          colorCode: null,
          active: true,
          productLine: 'Wash & Wear',
          base: 'White',
          sheen: 'Low Sheen',
          volumeLitres: '4',
          rrpPrice: '89.90',
        },
      ],
      editingProductId: 'product-1',
    }))

    expect(settingsMarkup).toContain('pbc-formsection')
    expect(settingsMarkup).toContain('pbc-btn pbc-btn--primary')
    expect(tableMarkup).toContain('pbc-tablewrap')
    expect(tableMarkup).toContain('pbc-table')
    expect(tableMarkup).toContain('pbc-tableinput')
  })

  it('centers each settings tab layout with the shared section class', () => {
    const settingsMarkup = renderToStaticMarkup(createElement(SettingsForm, {
      initialAreas: [],
      initialProducts: [],
      initialQuoteLineTemplates: [],
      initialSettings: DEFAULT_PRICING_SETTINGS,
    }))
    const source = readFileSync('components/settings/settings-form.tsx', 'utf8')

    expect(settingsMarkup).toContain('pbc-formsection pbc-formsection--center')
    expect(source.match(/pbc-formsection pbc-formsection--center/g)?.length).toBeGreaterThanOrEqual(5)
  })

  it('uses the latest shared UI for labour rates', () => {
    const markup = renderToStaticMarkup(createElement(SettingsForm, {
      initialAreas: [],
      initialProducts: [],
      initialQuoteLineTemplates: [],
      initialSettings: DEFAULT_PRICING_SETTINGS,
    }))

    expect(markup).toContain('pbc-paneltitle')
    expect(markup).toContain('pbc-rate')
    expect(markup).toContain('pbc-alert pbc-alert--warning')
    expect(markup).toContain('pbc-btn pbc-btn--primary')
  })

  it('shows the maximum valid margin before settings are saved', () => {
    const markup = renderToStaticMarkup(createElement(SettingsForm, {
      initialAreas: [],
      initialProducts: [],
      initialQuoteLineTemplates: [],
      initialSettings: DEFAULT_PRICING_SETTINGS,
    }))

    expect(markup).toContain('Must be less than 100%.')
    expect(markup).not.toContain('Use 30, 0.30, or 30%')
  })

  it.each([
    ['30'],
    ['0.3'],
    ['30%'],
  ])('saves %s as a 0.3 pricing margin', async (marginInput) => {
    const updateSettings = vi.fn(async (payload: unknown) => ({ ok: true as const, data: payload }))

    const message = await savePricingSettingsForm(
      pricingSettingsFormState({ f2Margin: marginInput }),
      updateSettings
    )

    expect(message).toBe('Settings saved for future quotes.')
    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(updateSettings.mock.calls[0]?.[0]).toMatchObject({
      f2Margin: 0.3,
    })
  })

  it.each([
    ['100', 'Margins must be less than 100%.'],
    ['100%', 'Margins must be less than 100%.'],
    ['-1', 'Margins must be 0% or higher.'],
    ['not a margin', 'Margins must be valid numbers.'],
  ])('blocks invalid margin input %s before saving', async (marginInput, expectedMessage) => {
    const updateSettings = vi.fn(async (payload: unknown) => ({ ok: true as const, data: payload }))

    const message = await savePricingSettingsForm(
      pricingSettingsFormState({ f2Margin: marginInput }),
      updateSettings
    )

    expect(message).toBe(expectedMessage)
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('saves changed SettingsForm margin input through the pricing settings action', async () => {
    vi.mocked(updatePricingSettings).mockReset()
    vi.mocked(updatePricingSettings).mockResolvedValue({
      ok: true,
      data: DEFAULT_PRICING_SETTINGS,
    })
    installTestDom()
    const { createRoot } = await import('react-dom/client')
    const container = document.createElement('div')

    await act(async () => {
      createRoot(container).render(createElement(SettingsForm, {
        initialAreas: [],
        initialProducts: [],
        initialQuoteLineTemplates: [],
        initialSettings: DEFAULT_PRICING_SETTINGS,
      }))
    })

    const inputs = Array.from(container.querySelectorAll('input'))
    const f2MarginInput = inputs.find((input) => input.value === '30')
    expect(f2MarginInput).toBeDefined()

    await act(async () => {
      f2MarginInput!.value = '40'
      f2MarginInput!.dispatchEvent(new Event('input', { bubbles: true }))
      f2MarginInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Settings')
    expect(saveButton).toBeDefined()

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updatePricingSettings).toHaveBeenCalledTimes(1)
    expect(vi.mocked(updatePricingSettings).mock.calls[0]?.[0]).toMatchObject({
      f2Margin: 0.4,
    })
  })

  it('blocks invalid SettingsForm margin input before calling the pricing settings action', async () => {
    vi.mocked(updatePricingSettings).mockReset()
    vi.mocked(updatePricingSettings).mockResolvedValue({
      ok: true,
      data: DEFAULT_PRICING_SETTINGS,
    })
    installTestDom()
    const { createRoot } = await import('react-dom/client')
    const container = document.createElement('div')

    await act(async () => {
      createRoot(container).render(createElement(SettingsForm, {
        initialAreas: [],
        initialProducts: [],
        initialQuoteLineTemplates: [],
        initialSettings: DEFAULT_PRICING_SETTINGS,
      }))
    })

    const inputs = Array.from(container.querySelectorAll('input'))
    const f2MarginInput = inputs.find((input) => input.value === '30')
    expect(f2MarginInput).toBeDefined()

    await act(async () => {
      f2MarginInput!.value = '100'
      f2MarginInput!.dispatchEvent(new Event('input', { bubbles: true }))
      f2MarginInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Settings')
    expect(saveButton).toBeDefined()

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updatePricingSettings).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Margins must be less than 100%.')
  })

  it('uses shared compact action buttons in material rows', () => {
    const markup = renderToStaticMarkup(createElement(MaterialProductsTable, {
      products: [
        {
          id: 'product-1',
          name: 'Dulux Wash & Wear White 4L',
          manufacturer: 'Dulux',
          type: null,
          unit: '4L',
          marketPrice: '89.90',
          actualPrice: '89.90',
          colorCode: null,
          active: true,
          productLine: 'Wash & Wear',
          base: 'White',
          sheen: 'Low Sheen',
          volumeLitres: '4',
          rrpPrice: '89.90',
        },
      ],
    }))

    expect(markup).toContain('pbc-tableactions')
    expect(markup).toContain('pbc-btn pbc-btn--ghost pbc-btn--sm')
    expect(markup).toContain('pbc-btn pbc-btn--danger pbc-btn--sm')
  })

  it('uses shared controls for product and service settings', () => {
    const productServices: ProductServiceRecord[] = [
      {
        id: 'service-1',
        name: 'Ceiling',
        description: 'All interior ceilings',
        category: 'Service',
        unitPrice: '14.50',
        unitCost: '0.00',
        taxable: true,
        active: true,
        bookable: false,
        durationMinutes: null,
        quantityEnabled: true,
        minimumQuantity: '1',
        maximumQuantity: null,
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      },
    ]
    const addMarkup = renderToStaticMarkup(createElement(ProductServiceAddItemForm))
    const tableMarkup = renderToStaticMarkup(createElement(ProductServicesTable, { productServices }))

    expect(addMarkup).toContain('pbc-checkbox')
    expect(addMarkup).toContain('pbc-input')
    expect(tableMarkup).toContain('pbc-tablewrap')
    expect(tableMarkup).toContain('pbc-tableactions')
    expect(tableMarkup).toContain('pbc-btn pbc-btn--danger pbc-btn--sm')
  })

  it('uses shared panel, form, and list styles in the template section', () => {
    const markup = renderToStaticMarkup(createElement(QuoteLineTemplateEditor, {
      templates: [
        {
          id: 'template-1',
          name: 'Standard terms',
          active: true,
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:00.000Z',
          items: [],
        },
      ],
      productServices: [],
    }))

    expect(markup).toContain('pbc-panelhead')
    expect(markup).toContain('pbc-formgroup')
    expect(markup).toContain('pbc-input')
    expect(markup).toContain('pbc-list')
    expect(markup).toContain('pbc-listitem')
    expect(markup).toContain('pbc-btn pbc-btn--primary')
  })

  it('uses the latest shared UI for the area section', () => {
    const source = readFileSync('components/settings/settings-form.tsx', 'utf8')
    const areaStart = source.indexOf('<h2 className="pbc-paneltitle">Areas</h2>')
    const areaBranch = source.slice(areaStart)

    expect(areaStart).toBeGreaterThan(-1)
    expect(areaBranch).toContain('pbc-panelhead')
    expect(areaBranch).toContain('pbc-paneltitle')
    expect(areaBranch).toContain('pbc-formgroup')
    expect(areaBranch).toContain('pbc-field')
    expect(areaBranch).toContain('pbc-input')
    expect(areaBranch).toContain('pbc-btn pbc-btn--primary')
    expect(areaBranch).toContain('pbc-list')
    expect(areaBranch).toContain('pbc-listitem')
    expect(areaBranch).toContain('pbc-areaitem')
    expect(areaBranch).toContain('pbc-areaedit')
    expect(areaBranch).not.toContain('rounded-lg border border-slate-200')
    expect(areaBranch).not.toContain('text-slate-400')
  })

  it('provides edit and delete controls for settings areas', () => {
    const source = readFileSync('components/settings/settings-form.tsx', 'utf8')
    const areaStart = source.indexOf('<h2 className="pbc-paneltitle">Areas</h2>')
    const areaBranch = source.slice(areaStart)

    expect(areaStart).toBeGreaterThan(-1)
    expect(source).toContain('updateArea')
    expect(source).toContain('deleteArea')
    expect(areaBranch).toContain('editingAreaId')
    expect(areaBranch).toContain('Edit area')
    expect(areaBranch).toContain('Delete area')
    expect(areaBranch).toContain('Save')
    expect(areaBranch).toContain('Cancel')
    expect(areaBranch).toContain('pbc-btn pbc-btn--danger pbc-btn--sm')
    expect(areaBranch).toContain('pbc-areaedit__fields')
    expect(areaBranch).toContain('pbc-areaedit__actions')
  })

  it('formats area mutation fetch failures without exposing raw exceptions', () => {
    expect(formatAreaMutationError('update', new TypeError('fetch failed'))).toBe('Failed to update area: fetch failed')
    expect(formatAreaMutationError('delete', 'network down')).toBe('Failed to delete area: Unknown error')
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

  it('renders a template editor for reusable line and text items', () => {
    const markup = renderToStaticMarkup(createElement(QuoteLineTemplateEditor, {
      templates: [
        {
          id: 'template-1',
          name: 'Standard terms',
          active: true,
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:00.000Z',
          items: [
            {
              id: 'template-item-1',
              templateId: 'template-1',
              kind: 'text',
              name: 'Dulux Accredited Painting Company',
              description: 'Accreditation paragraph',
              quantity: null,
              unitPrice: null,
              taxable: false,
              clientVisible: true,
              linkedProductOrServiceId: null,
              position: 0,
              createdAt: '2026-05-19T00:00:00.000Z',
              updatedAt: '2026-05-19T00:00:00.000Z',
            },
          ],
        },
      ],
      productServices: [],
    }))

    expect(markup).toContain('Template')
    expect(markup).toContain('Template name')
    expect(markup).toContain('Save Template')
    expect(markup).toContain('Standard terms')
    expect(markup).toContain('Dulux Accredited Painting Company')
  })
})
