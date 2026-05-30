import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Decimal from 'decimal.js'
import { describe, expect, it, vi } from 'vitest'
import { CustomerPanel } from '@/components/quote-form/customer-panel'
import { FinalSummary } from '@/components/quote-form/final-summary'
import { MaterialRow } from '@/components/quote-form/material-row'
import { MaterialsPanel, assignMaterialToActiveArea } from '@/components/quote-form/materials-panel'
import { OptionTotalsSummary } from '@/components/quote-form/option-totals-summary'
import { QuoteForm, saveQuoteFormPayload, shouldRunDraftGuard } from '@/components/quote-form/quote-form'
import type { AreaSubtotalBreakdown } from '@/components/quote-form/quote-calculation-totals'
import { QuoteDetailView } from '@/components/quote-detail/quote-detail-view'
import { QuoteCard } from '@/components/quote-list/quote-card'
import type { QuoteRecord } from '@/lib/dev-data'
import { createQuote } from '@/lib/actions/quotes'

const routerPushMock = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPushMock,
  }),
}))

vi.mock('@/lib/actions/quotes', () => ({
  createQuote: vi.fn(),
  updateQuote: vi.fn(),
}))

describe('quote form pricing UI', () => {
  const quoteRecord: QuoteRecord = {
    id: 'quote-id-1',
    customerName: 'Jane Customer',
    customerAddress: '10 Main St',
    jobberQuoteId: 'encoded-quote-id',
    jobberSaveMode: 'priced_line_items',
    jobberSyncStatus: 'not_synced',
    jobberLastSyncedAt: null,
    jobberSyncError: null,
    areaSqft: null,
    workType: 'Exterior',
    workingDays: '5.00',
    labourPerDay: '2.00',
    formula1Total: '2500.00',
    formula2Total: '2600.00',
    formula3Total: '2700.00',
    formula4Total: '2400.00',
    formula5Total: '2450.00',
    selectedMin: 4,
    selectedMax: 3,
    subtotal: '2550.00',
    finalTotal: '2550.00',
    pricingSettingsSnapshot: {
      f1LabourRate: 500,
      f2LabourRate: 460,
      f3LabourRate: 460,
      f4LabourRate: 380,
      f5LabourRate: 380,
      f2Margin: 0.3,
      f3Margin: 0.3,
      f4Margin: 0.25,
      f5Margin: 0.3,
    },
    createdAt: '2026-05-14T00:00:00Z',
    createdBy: 'user-1',
    createdByName: 'Mia Kang',
    createdByEmail: 'mia@example.com',
    items: [],
    jobberQuoteLines: [],
    options: [],
    memos: [],
    jobberSnapshot: null,
  }

  function createAreaBreakdown(
    subtotal: Decimal,
    finalTotal: Decimal = subtotal,
    unassignedCount = 0
  ): AreaSubtotalBreakdown {
    const zero = new Decimal(0)

    return {
      interior: {
        scope: 'interior',
        selectedMin: 1,
        selectedMax: 1,
        materialMarket: zero,
        materialActual: zero,
        labour: { workingDays: zero, labourPerDay: zero, labourDays: zero },
        results: [],
        subtotal,
        finalTotal,
      },
      exterior: {
        scope: 'exterior',
        selectedMin: 1,
        selectedMax: 1,
        materialMarket: zero,
        materialActual: zero,
        labour: { workingDays: zero, labourPerDay: zero, labourDays: zero },
        results: [],
        subtotal: zero,
        finalTotal: zero,
      },
      finalSubtotal: subtotal,
      finalTotal,
      unassigned: {
        count: unassignedCount,
        materialMarket: zero,
        labourDays: zero,
      },
    }
  }

  it('shows edit and delete actions on quote cards', () => {
    const markup = renderToStaticMarkup(createElement(QuoteCard, { quote: quoteRecord }))

    expect(markup).toContain('View')
    expect(markup).toContain('Edit')
    expect(markup).toContain(`/quotes/${quoteRecord.id}/edit`)
    expect(markup).toContain('Delete')
  })

  it('keeps the quote save action sticky while editing long forms', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteForm, {
        settings: quoteRecord.pricingSettingsSnapshot,
        areas: [],
        productServices: [],
        quoteLineTemplates: [],
        initialQuote: quoteRecord,
      })
    )

    expect(markup).toContain('Update Quote')
    expect(markup).toContain('sticky top-16')
  })

  it('renders the quote editor in the original two-column page-scroll layout', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteForm, {
        settings: quoteRecord.pricingSettingsSnapshot,
        areas: [],
        productServices: [],
        quoteLineTemplates: [],
        initialQuote: quoteRecord,
      })
    )

    expect(markup).toContain('grid gap-6 xl:grid-cols-[minmax(0,1.06fr)_minmax(360px,0.94fr)]')
    expect(markup).toContain('space-y-8 rounded-lg border border-white bg-white/90 p-5')
    expect(markup).toContain('space-y-6 rounded-lg border border-white bg-white/90 p-5')
    expect(markup).toContain('xl:sticky')
    expect(markup).toContain('xl:top-24')
    expect(markup).not.toContain('quote-workspace')
    expect(markup).not.toContain('quote-input-flow')
    expect(markup).not.toContain('quote-scroll-section')
    expect(markup).not.toContain('quote-info-section')
    expect(markup).not.toContain('quote-work-items-section')
    expect(markup).toContain('product-service-scroll-list')

    const customerIndex = markup.indexOf('Customer Info')
    const productIndex = markup.indexOf('Product / Service')
    const materialsIndex = markup.indexOf('Materials')
    expect(customerIndex).toBeGreaterThan(-1)
    expect(productIndex).toBeGreaterThan(customerIndex)
    expect(materialsIndex).toBeGreaterThan(productIndex)

    const calculationIndex = markup.indexOf('Calculation')
    const calculationClassChunk = markup.slice(Math.max(calculationIndex - 320, 0), calculationIndex)
    expect(calculationClassChunk).not.toContain('overflow-y-auto')
    expect(calculationClassChunk).not.toContain('max-h')
  })

  it('disables draft guard effects once navigation has been confirmed', () => {
    expect(shouldRunDraftGuard(true, false)).toBe(true)
    expect(shouldRunDraftGuard(true, true)).toBe(false)
    expect(shouldRunDraftGuard(false, false)).toBe(false)
  })

  it('shows total labour as the sum of material row working days times labour', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteForm, {
        settings: quoteRecord.pricingSettingsSnapshot,
        areas: [],
        productServices: [],
        quoteLineTemplates: [],
        initialQuote: {
          ...quoteRecord,
          items: [
            {
              id: 'item-1',
              quoteId: quoteRecord.id,
              productId: null,
              productNameSnapshot: 'Prep',
              marketPriceSnapshot: '0.00',
              actualPriceSnapshot: '0.00',
              quantity: '1.00',
              workingDays: '0.50',
              labourPerDay: '2.00',
              areaId: null,
              areaNameSnapshot: null,
              areaScopeSnapshot: null,
              isCustom: true,
              position: 0,
            },
            {
              id: 'item-2',
              quoteId: quoteRecord.id,
              productId: null,
              productNameSnapshot: 'Coats',
              marketPriceSnapshot: '0.00',
              actualPriceSnapshot: '0.00',
              quantity: '1.00',
              workingDays: '2.00',
              labourPerDay: '3.00',
              areaId: null,
              areaNameSnapshot: null,
              areaScopeSnapshot: null,
              isCustom: true,
              position: 1,
            },
            {
              id: 'item-3',
              quoteId: quoteRecord.id,
              productId: null,
              productNameSnapshot: 'Finish',
              marketPriceSnapshot: '0.00',
              actualPriceSnapshot: '0.00',
              quantity: '1.00',
              workingDays: '2.50',
              labourPerDay: '2.00',
              areaId: null,
              areaNameSnapshot: null,
              areaScopeSnapshot: null,
              isCustom: true,
              position: 2,
            },
          ],
        },
      })
    )

    expect(markup).toContain('Total Working Days')
    expect(markup).toContain('value="5.00"')
    expect(markup).toContain('Total Labour')
    expect(markup).toContain('value="12.00"')
  })

  it('shows interior, exterior, and final subtotal ex GST in the quote form summary', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteForm, {
        settings: quoteRecord.pricingSettingsSnapshot,
        areas: [],
        productServices: [],
        quoteLineTemplates: [],
        initialQuote: {
          ...quoteRecord,
          items: [
            {
              id: 'item-interior',
              quoteId: quoteRecord.id,
              productId: null,
              productNameSnapshot: 'Interior paint',
              marketPriceSnapshot: '100.00',
              actualPriceSnapshot: '100.00',
              quantity: '1.00',
              workingDays: '2.00',
              labourPerDay: '1.00',
              areaId: null,
              areaNameSnapshot: 'Bedroom',
              areaScopeSnapshot: 'interior',
              isCustom: true,
              position: 0,
            },
            {
              id: 'item-exterior',
              quoteId: quoteRecord.id,
              productId: null,
              productNameSnapshot: 'Exterior paint',
              marketPriceSnapshot: '200.00',
              actualPriceSnapshot: '200.00',
              quantity: '1.00',
              workingDays: '3.00',
              labourPerDay: '1.00',
              areaId: null,
              areaNameSnapshot: 'Fence',
              areaScopeSnapshot: 'exterior',
              isCustom: true,
              position: 1,
            },
          ],
        },
      })
    )

    expect(markup).toContain('Interior subtotal')
    expect(markup).toContain('$1188.00')
    expect(markup).toContain('Exterior subtotal')
    expect(markup).toContain('$1839.50')
    expect(markup).toContain('Final subtotal')
    expect(markup).toContain('$3027.50')
    expect(markup).toContain('Ex GST')
  })

  it('shows only the active area formula selector and sums area subtotals', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteForm, {
        settings: quoteRecord.pricingSettingsSnapshot,
        areas: [],
        productServices: [],
        quoteLineTemplates: [],
        initialQuote: {
          ...quoteRecord,
          selectedMin: 1,
          selectedMax: 1,
          interiorSelectedMin: 5,
          interiorSelectedMax: 5,
          exteriorSelectedMin: 1,
          exteriorSelectedMax: 1,
          items: [
            {
              id: 'item-interior',
              quoteId: quoteRecord.id,
              productId: null,
              productNameSnapshot: 'Interior wall paint',
              marketPriceSnapshot: '100.00',
              actualPriceSnapshot: '100.00',
              quantity: '1.00',
              workingDays: '2.00',
              labourPerDay: '1.00',
              areaId: null,
              areaNameSnapshot: 'Bedroom',
              areaScopeSnapshot: 'interior',
              isCustom: true,
              position: 0,
            },
            {
              id: 'item-exterior',
              quoteId: quoteRecord.id,
              productId: null,
              productNameSnapshot: 'Exterior trim paint',
              marketPriceSnapshot: '200.00',
              actualPriceSnapshot: '200.00',
              quantity: '1.00',
              workingDays: '3.00',
              labourPerDay: '1.00',
              areaId: null,
              areaNameSnapshot: 'Fence',
              areaScopeSnapshot: 'exterior',
              isCustom: true,
              position: 1,
            },
          ],
        },
      })
    )

    expect(markup).toContain('Interior Formula Results')
    expect(markup).not.toContain('Exterior Formula Results')
    expect(markup).toContain('$1118.00')
    expect(markup).toContain('$2818.00')
  })

  it('saves material actual price snapshots from actual price, not RRP', async () => {
    const createQuoteMock = vi.mocked(createQuote)
    createQuoteMock.mockResolvedValueOnce({ ok: true, data: { id: 'created-quote-id' } })

    await saveQuoteFormPayload({
      settings: quoteRecord.pricingSettingsSnapshot,
      customerName: 'Jane Customer',
      customerAddress: '10 Main St',
      jobberQuoteId: '',
      jobberQuoteLookup: '',
      jobberQuoteDraft: null,
      deletedJobberLineItemIds: [],
      jobberQuoteLines: [],
      workType: 'Interior',
      selectedMin: 4,
      selectedMax: 3,
      materials: [
        {
          id: 'material-1',
          name: 'Actual price paint',
          marketPrice: '100.00',
          actualPrice: '42.25',
          quantity: '1',
          workingDays: '1',
          labourPerDay: '1',
          isCustom: true,
        },
      ],
      options: [],
      memos: [],
    })

    expect(createQuoteMock).toHaveBeenCalledWith(expect.objectContaining({
      items: [
        expect.objectContaining({
          marketPriceSnapshot: 100,
          actualPriceSnapshot: 42.25,
        }),
      ],
    }))
  })

  it('passes saved templates into the Product / Service editor', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteForm, {
        settings: quoteRecord.pricingSettingsSnapshot,
        areas: [],
        productServices: [],
        quoteLineTemplates: [
          {
            id: 'template-1',
            name: 'Standard terms',
            active: true,
            createdAt: '2026-05-19T00:00:00.000Z',
            updatedAt: '2026-05-19T00:00:00.000Z',
            items: [],
          },
        ],
      })
    )

    expect(markup).toContain('Template')
    expect(markup).toContain('Standard terms')
  })

  it('shows the app final total as the GST-exclusive subtotal with GST at the end', () => {
    const markup = renderToStaticMarkup(
      createElement(FinalSummary, {
        labourTotal: new Decimal('1200'),
        materialTotal: new Decimal('255.74'),
        areaBreakdown: createAreaBreakdown(new Decimal('1455.74'), new Decimal('1601.31')),
        jobberFinancialSummary: null,
      })
    )

    expect(markup).toContain('Labour total')
    expect(markup).toContain('$1200.00')
    expect(markup).toContain('Material total')
    expect(markup).toContain('$255.74')
    expect(markup).toContain('GST 10%')
    expect(markup).toContain('$145.57')
    expect(markup).toContain('Final subtotal')
    expect(markup).toContain('$1455.74')
    expect(markup).toContain('Ex GST')
    expect(markup).not.toContain('$1601.31')
    expect(markup.lastIndexOf('GST 10%')).toBeGreaterThan(markup.lastIndexOf('Material total'))
  })

  it('does not show the legacy overall subtotal when grouped area subtotals differ', () => {
    const markup = renderToStaticMarkup(
      createElement(FinalSummary, {
        labourTotal: new Decimal('500'),
        materialTotal: new Decimal('100'),
        areaBreakdown: createAreaBreakdown(new Decimal('600.00'), new Decimal('660.00')),
        jobberFinancialSummary: null,
      })
    )

    expect(markup).toContain('Final subtotal')
    expect(markup).toContain('$600.00')
    expect(markup).not.toContain('Subtotal price')
    expect(markup).not.toContain('Total price')
    expect(markup).not.toContain('$999.99')
  })

  it('warns when material rows are not assigned to interior or exterior subtotals', () => {
    const markup = renderToStaticMarkup(
      createElement(FinalSummary, {
        labourTotal: new Decimal('1200'),
        materialTotal: new Decimal('255.74'),
        areaBreakdown: createAreaBreakdown(new Decimal('1455.74'), new Decimal('1601.31'), 2),
        jobberFinancialSummary: null,
      })
    )

    expect(markup).toContain('2 material rows need')
    expect(markup).toContain('Interior or Exterior area')
  })

  it('shows Jobber quote total, expenses total, and profit margin in the right summary', () => {
    const markup = renderToStaticMarkup(
      createElement(FinalSummary, {
        labourTotal: new Decimal('1200'),
        materialTotal: new Decimal('255.74'),
        areaBreakdown: createAreaBreakdown(new Decimal('1455.74')),
        jobberFinancialSummary: {
          quoteTotal: 1500,
          expensesTotal: 300,
          profit: 1200,
          profitMarginPercent: 80,
        },
      })
    )

    expect(markup).toContain('Jobber profit')
    expect(markup).toContain('Quote total')
    expect(markup).toContain('$1,500.00')
    expect(markup).toContain('Expenses total')
    expect(markup).toContain('$300.00')
    expect(markup).toContain('Profit')
    expect(markup).toContain('$1,200.00')
    expect(markup).toContain('Profit margin')
    expect(markup).toContain('80.0%')
  })

  it('shows option totals separately from the main quote final total', () => {
    const markup = renderToStaticMarkup(
      createElement(OptionTotalsSummary, {
        options: [
          { id: 'option-1', title: 'Option 1 - Garage door repaint', subtotal: new Decimal('550'), finalTotal: new Decimal('550') },
          { id: 'option-2', title: 'Option 2 - Fence staining', subtotal: new Decimal('1240'), finalTotal: new Decimal('1240') },
        ],
      })
    )

    expect(markup).toContain('Optional Add-ons')
    expect(markup).toContain('Option 1 - Garage door repaint')
    expect(markup).toContain('$550.00')
    expect(markup).toContain('Option 2 - Fence staining')
    expect(markup).toContain('$1240.00')
    expect(markup).toContain('not included in main total')
  })

  it('shows option subtotal ex GST instead of GST-inclusive option final total', () => {
    const markup = renderToStaticMarkup(
      createElement(OptionTotalsSummary, {
        options: [
          {
            id: 'option-1',
            title: 'Option 1 - Garage door repaint',
            subtotal: new Decimal('500.00'),
            finalTotal: new Decimal('550.00'),
          },
        ],
      })
    )

    expect(markup).toContain('$500.00')
    expect(markup).not.toContain('$550.00')
    expect(markup).toContain('Ex GST')
  })

  it('edits only a single RRP price for material rows', () => {
    const markup = renderToStaticMarkup(
      createElement(MaterialRow, {
        item: {
          id: 'item-1',
          name: 'Dulux Acratex Roof Membrane Satin Monument 15L',
          manufacturer: 'Dulux',
          unit: '15L',
          marketPrice: '255.74',
          actualPrice: '255.74',
          quantity: '1',
          workingDays: '2',
          labourPerDay: '1',
          areaId: 'area-eaves',
          areaName: 'Eaves',
          areaScope: 'exterior',
          isCustom: false,
        },
        areas: [
          { id: 'area-eaves', scope: 'exterior', name: 'Eaves', active: true, position: 0 },
          { id: 'area-fascia', scope: 'exterior', name: 'Fascia', active: true, position: 1 },
        ],
        onChange: () => undefined,
        onRemove: () => undefined,
      })
    )

    expect(markup).toContain('RRP')
    expect(markup).toContain('Area')
    expect(markup).toContain('Working Days')
    expect(markup).toContain('Labour / Day')
    expect(markup).toContain('Eaves')
    expect(markup).toContain('Fascia')
    expect(markup).not.toContain('Market')
    expect(markup).not.toContain('Actual')
  })

  it('filters quote area dropdowns by the selected interior or exterior scope', () => {
    const markup = renderToStaticMarkup(
      createElement(MaterialsPanel, {
        materials: [
          {
            id: 'item-1',
            name: 'Dulux Wash&Wear Low Sheen Vivid White 4L',
            marketPrice: '82',
            actualPrice: '82',
            quantity: '1',
            workingDays: '1',
            labourPerDay: '1',
            areaId: 'area-bedroom',
            areaName: 'Bedroom',
            areaScope: 'interior',
            isCustom: false,
          },
        ],
        areas: [
          { id: 'area-bedroom', scope: 'interior', name: 'Bedroom', active: true, position: 0 },
          { id: 'area-eaves', scope: 'exterior', name: 'Eaves', active: true, position: 0 },
        ],
        onAdd: () => undefined,
        onChange: () => undefined,
        onRemove: () => undefined,
      })
    )

    expect(markup).toContain('Interior')
    expect(markup).toContain('Exterior')
    expect(markup).toContain('Bedroom')
    expect(markup).not.toContain('Eaves')
  })

  it('shows only the active material section when materials span interior and exterior scopes', () => {
    const markup = renderToStaticMarkup(
      createElement(MaterialsPanel, {
        materials: [
          {
            id: 'item-1',
            name: 'Interior paint',
            marketPrice: '82',
            actualPrice: '82',
            quantity: '1',
            workingDays: '1',
            labourPerDay: '1',
            areaId: 'area-bedroom',
            areaName: 'Bedroom',
            areaScope: 'interior',
            isCustom: false,
          },
          {
            id: 'item-2',
            name: 'Exterior paint',
            marketPrice: '95',
            actualPrice: '95',
            quantity: '1',
            workingDays: '1',
            labourPerDay: '1',
            areaId: 'area-eaves',
            areaName: 'Eaves',
            areaScope: 'exterior',
            isCustom: false,
          },
        ],
        areas: [
          { id: 'area-bedroom', scope: 'interior', name: 'Bedroom', active: true, position: 0 },
          { id: 'area-eaves', scope: 'exterior', name: 'Eaves', active: true, position: 0 },
        ],
        onAdd: () => undefined,
        onChange: () => undefined,
        onRemove: () => undefined,
      })
    )

    expect(markup).toContain('Interior - Bedroom')
    expect(markup).not.toContain('Exterior - Eaves')
    expect(markup).toContain('1 material row is hidden by the Interior filter')
  })

  it('filters visible material rows to the active interior or exterior material section', () => {
    const markup = renderToStaticMarkup(
      createElement(MaterialsPanel, {
        materials: [
          {
            id: 'item-1',
            name: 'Interior paint',
            marketPrice: '82',
            actualPrice: '82',
            quantity: '1',
            workingDays: '1',
            labourPerDay: '1',
            areaId: 'area-bedroom',
            areaName: 'Bedroom',
            areaScope: 'interior',
            isCustom: false,
          },
          {
            id: 'item-2',
            name: 'Exterior paint',
            marketPrice: '95',
            actualPrice: '95',
            quantity: '1',
            workingDays: '1',
            labourPerDay: '1',
            areaId: 'area-eaves',
            areaName: 'Eaves',
            areaScope: 'exterior',
            isCustom: false,
          },
        ],
        areas: [
          { id: 'area-bedroom', scope: 'interior', name: 'Bedroom', active: true, position: 0 },
          { id: 'area-eaves', scope: 'exterior', name: 'Eaves', active: true, position: 0 },
        ],
        areaBreakdown: createAreaBreakdown(new Decimal('1188.00')),
        onAdd: () => undefined,
        onChange: () => undefined,
        onRemove: () => undefined,
      })
    )

    expect(markup).toContain('Interior paint')
    expect(markup).not.toContain('Exterior paint')
    expect(markup).toContain('Interior material')
    expect(markup).toContain('$82.00')
    expect(markup).toContain('Interior subtotal')
    expect(markup).toContain('$1188.00')
    expect(markup).toContain('Interior Labour Days')
    expect(markup).not.toContain('Final subtotal')
    expect(markup).toContain('Collapse')
  })

  it('assigns new materials to the active material area before adding them', () => {
    const material = assignMaterialToActiveArea(
      {
        id: 'item-1',
        name: 'New exterior paint',
        marketPrice: '95',
        actualPrice: '95',
        quantity: '1',
        workingDays: '0',
        labourPerDay: '0',
        isCustom: true,
      },
      'exterior',
      [
        { id: 'area-bedroom', scope: 'interior', name: 'Bedroom', active: true, position: 0 },
        { id: 'area-eaves', scope: 'exterior', name: 'Eaves', active: true, position: 0 },
      ]
    )

    expect(material.areaId).toBe('area-eaves')
    expect(material.areaName).toBe('Eaves')
    expect(material.areaScope).toBe('exterior')
  })

  it('shows only the active area labour summary under Materials', () => {
    const markup = renderToStaticMarkup(
      createElement(MaterialsPanel, {
        materials: [
          {
            id: 'item-1',
            name: 'Interior prep',
            marketPrice: '0',
            actualPrice: '0',
            quantity: '1',
            workingDays: '2',
            labourPerDay: '1.5',
            areaScope: 'interior',
            isCustom: true,
          },
          {
            id: 'item-2',
            name: 'Exterior prep',
            marketPrice: '0',
            actualPrice: '0',
            quantity: '1',
            workingDays: '3',
            labourPerDay: '2',
            areaScope: 'exterior',
            isCustom: true,
          },
        ],
        areas: [],
        onAdd: () => undefined,
        onChange: () => undefined,
        onRemove: () => undefined,
      })
    )

    expect(markup).toContain('Labour by area')
    expect(markup).toContain('Interior labour')
    expect(markup).not.toContain('Exterior labour')
    expect(markup).toContain('Working Days')
    expect(markup).toContain('Labour / Day')
    expect(markup).toContain('Labour Days')
    expect(markup).toContain('2.00')
    expect(markup).toContain('1.50')
    expect(markup).toContain('3.00')
    expect(markup).not.toContain('6.00')
    expect(markup).not.toContain('Assigned labour total')
    expect(markup).not.toContain('9.00')
  })

  it('keeps area labour details out of the right Calculation panel', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteForm, {
        settings: quoteRecord.pricingSettingsSnapshot,
        areas: [],
        productServices: [],
        quoteLineTemplates: [],
        initialQuote: {
          ...quoteRecord,
          items: [
            {
              id: 'item-interior',
              quoteId: quoteRecord.id,
              productId: null,
              productNameSnapshot: 'Interior labour',
              marketPriceSnapshot: '0.00',
              actualPriceSnapshot: '0.00',
              quantity: '1.00',
              workingDays: '2.00',
              labourPerDay: '1.50',
              areaId: null,
              areaNameSnapshot: null,
              areaScopeSnapshot: 'interior',
              isCustom: true,
              position: 0,
            },
            {
              id: 'item-exterior',
              quoteId: quoteRecord.id,
              productId: null,
              productNameSnapshot: 'Exterior labour',
              marketPriceSnapshot: '0.00',
              actualPriceSnapshot: '0.00',
              quantity: '1.00',
              workingDays: '3.00',
              labourPerDay: '2.00',
              areaId: null,
              areaNameSnapshot: null,
              areaScopeSnapshot: 'exterior',
              isCustom: true,
              position: 1,
            },
          ],
        },
      })
    )

    expect(markup).toContain('Total Working Days')
    expect(markup).toContain('Total Labour Days')
    expect(markup).not.toContain('Area labour')
    expect(markup).not.toContain('Interior total')
    expect(markup).not.toContain('Exterior total')
  })

  it('renders material names as editable fields', () => {
    const markup = renderToStaticMarkup(
      createElement(MaterialRow, {
        item: {
          id: 'item-1',
          name: 'Custom material',
          marketPrice: '10',
          actualPrice: '10',
          quantity: '1',
          workingDays: '1',
          labourPerDay: '1',
          isCustom: true,
        },
        areas: [],
        onChange: () => undefined,
        onRemove: () => undefined,
      })
    )

    expect(markup).toContain('aria-label="Material name"')
    expect(markup).toContain('value="Custom material"')
  })

  it('shows Jobber customer type without the area sqft field', () => {
    const markup = renderToStaticMarkup(
      createElement(CustomerPanel, {
        customerName: 'Jane Customer',
        customerAddress: '10 Main St',
        jobberLookupType: 'quote',
        jobberQuoteId: '2345',
        workType: 'Exterior',
        customerType: 'Real Estate',
        onCustomerNameChange: () => undefined,
        onCustomerAddressChange: () => undefined,
        onJobberQuoteIdChange: () => undefined,
        onJobberLookupTypeChange: () => undefined,
        onFetchJobberQuote: () => undefined,
        onWorkTypeChange: () => undefined,
        isFetchingJobberQuote: false,
        jobberFetchError: null,
        jobberQuoteDraft: null,
      })
    )

    expect(markup).toContain('Customer Type')
    expect(markup).toContain('Real Estate')
    expect(markup).not.toContain('Area Sqft')
    expect(markup).not.toContain('Area sqft')
  })

  it('lets the user choose whether the Jobber lookup is a quote or job number', () => {
    const markup = renderToStaticMarkup(
      createElement(CustomerPanel, {
        customerName: 'Jane Customer',
        customerAddress: '10 Main St',
        jobberLookupType: 'job',
        jobberQuoteId: '6789',
        workType: 'Exterior',
        customerType: 'Residential',
        onCustomerNameChange: () => undefined,
        onCustomerAddressChange: () => undefined,
        onJobberLookupTypeChange: () => undefined,
        onJobberQuoteIdChange: () => undefined,
        onFetchJobberQuote: () => undefined,
        onWorkTypeChange: () => undefined,
        isFetchingJobberQuote: false,
        jobberFetchError: null,
        jobberQuoteDraft: null,
      })
    )

    expect(markup).toContain('Quote')
    expect(markup).toContain('Job')
    expect(markup).toContain('Jobber Job Number or URL')
  })

  it('shows a reconnect action when Jobber quote fetch needs a reconnect', () => {
    const markup = renderToStaticMarkup(
      createElement(CustomerPanel, {
        customerName: 'Jane Customer',
        customerAddress: '10 Main St',
        jobberLookupType: 'quote',
        jobberQuoteId: '2345',
        workType: 'Exterior',
        customerType: 'Residential',
        onCustomerNameChange: () => undefined,
        onCustomerAddressChange: () => undefined,
        onJobberLookupTypeChange: () => undefined,
        onJobberQuoteIdChange: () => undefined,
        onFetchJobberQuote: () => undefined,
        onWorkTypeChange: () => undefined,
        isFetchingJobberQuote: false,
        jobberFetchError: 'Jobber connection expired. Reconnect Jobber from Settings.',
        jobberQuoteDraft: null,
      })
    )

    expect(markup).toContain('Reconnect Jobber')
    expect(markup).toContain('/api/jobber/connect')
  })

  it('keeps the customer and Jobber lookup fields aligned in the first customer row', () => {
    const markup = renderToStaticMarkup(
      createElement(CustomerPanel, {
        customerName: 'Jane Customer',
        customerAddress: '10 Main St',
        jobberLookupType: 'quote',
        jobberQuoteId: '2345',
        workType: 'Exterior',
        customerType: 'Residential',
        onCustomerNameChange: () => undefined,
        onCustomerAddressChange: () => undefined,
        onJobberLookupTypeChange: () => undefined,
        onJobberQuoteIdChange: () => undefined,
        onFetchJobberQuote: () => undefined,
        onWorkTypeChange: () => undefined,
        isFetchingJobberQuote: false,
        jobberFetchError: null,
        jobberQuoteDraft: null,
      })
    )

    expect(markup).toContain('items-end')
    expect(markup).toContain('min-h-8')
  })

  it('shows expenses from a converted Jobber job in the quote summary', () => {
    const markup = renderToStaticMarkup(
      createElement(CustomerPanel, {
        customerName: 'Jane Customer',
        customerAddress: '10 Main St',
        jobberLookupType: 'quote',
        jobberQuoteId: '2345',
        workType: 'Exterior',
        customerType: 'Real Estate',
        onCustomerNameChange: () => undefined,
        onCustomerAddressChange: () => undefined,
        onJobberQuoteIdChange: () => undefined,
        onJobberLookupTypeChange: () => undefined,
        onFetchJobberQuote: () => undefined,
        onWorkTypeChange: () => undefined,
        isFetchingJobberQuote: false,
        jobberFetchError: null,
        jobberQuoteDraft: {
          jobberQuoteId: 'encoded-quote-id',
          sourceType: 'quote',
          quoteNumber: '2345',
          createdAt: '2026-05-13T01:23:45Z',
          customerName: 'Jane Customer',
          customerAddress: '10 Main St',
          workType: 'Exterior',
          areaSqft: null,
          customerType: 'Real Estate',
          sourceUrl: 'https://secure.getjobber.com/quotes/2345',
          productsAndServices: [],
          jobExpensesError: null,
          financialSummary: {
            quoteTotal: 0,
            expensesTotal: 245.5,
            profit: -245.5,
            profitMarginPercent: null,
          },
          jobExpenses: [
            {
              jobId: 'job-id-1',
              jobNumber: 6789,
              jobTitle: 'Exterior repaint job',
              jobStatus: 'ACTIVE',
              jobUrl: 'https://secure.getjobber.com/jobs/6789',
              expenses: [
                {
                  id: 'expense-id-1',
                  title: 'Paint supplies',
                  description: 'Primer and rollers',
                  date: '2026-05-14T00:00:00Z',
                  total: 245.5,
                  enteredBy: 'Admin User',
                  paidBy: 'Painter One',
                  reimbursableTo: null,
                },
              ],
            },
          ],
        },
      })
    )

    expect(markup).toContain('Job Expenses')
    expect(markup).toContain('Job #6789')
    expect(markup).toContain('Paint supplies')
    expect(markup).toContain('$245.50')
  })

  it('shows a reconnect action when Jobber hides job expenses due to permissions', () => {
    const markup = renderToStaticMarkup(
      createElement(CustomerPanel, {
        customerName: 'Jane Customer',
        customerAddress: '10 Main St',
        jobberLookupType: 'quote',
        jobberQuoteId: '2345',
        workType: 'Exterior',
        customerType: 'Real Estate',
        onCustomerNameChange: () => undefined,
        onCustomerAddressChange: () => undefined,
        onJobberQuoteIdChange: () => undefined,
        onJobberLookupTypeChange: () => undefined,
        onFetchJobberQuote: () => undefined,
        onWorkTypeChange: () => undefined,
        isFetchingJobberQuote: false,
        jobberFetchError: null,
        jobberQuoteDraft: {
          jobberQuoteId: 'encoded-quote-id',
          sourceType: 'quote',
          quoteNumber: '2345',
          createdAt: '2026-05-13T01:23:45Z',
          customerName: 'Jane Customer',
          customerAddress: '10 Main St',
          workType: 'Exterior',
          areaSqft: null,
          customerType: 'Real Estate',
          sourceUrl: 'https://secure.getjobber.com/quotes/2345',
          productsAndServices: [],
          jobExpenses: [],
          jobExpensesError: 'Jobber hid Job or Expense data due to permissions. Turn on Jobs Read and Expenses Read, save the app, then Reconnect Jobber so the current token receives the new access.',
          financialSummary: {
            quoteTotal: 0,
            expensesTotal: 0,
            profit: 0,
            profitMarginPercent: null,
          },
        },
      })
    )

    expect(markup).toContain('Reconnect Jobber')
    expect(markup).toContain('/api/jobber/connect')
  })

  it('shows saved Jobber fetch data on quote detail pages', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteDetailView, {
        quote: {
          ...quoteRecord,
          jobberSnapshot: {
            jobberQuoteId: 'encoded-quote-id',
            sourceType: 'quote',
            quoteNumber: '2345',
            createdAt: '2026-05-13T01:23:45Z',
            customerName: 'Jane Customer',
            customerAddress: '10 Main St',
            workType: 'Exterior',
            areaSqft: null,
            customerType: 'Real Estate',
            sourceUrl: 'https://secure.getjobber.com/quotes/2345',
            productsAndServices: [
              {
                id: 'line-item-1',
                name: 'Exterior repaint',
                category: 'SERVICE',
                description: 'Walls and trim',
                quantity: 1,
                unitPrice: 2500,
                totalPrice: 2500,
                linkedName: null,
              },
            ],
            jobExpenses: [
              {
                jobId: 'job-id-1',
                jobNumber: 6789,
                jobTitle: 'Exterior repaint job',
                jobStatus: 'ACTIVE',
                jobUrl: 'https://secure.getjobber.com/jobs/6789',
                expenses: [
                  {
                    id: 'expense-id-1',
                    title: 'Paint supplies',
                    description: 'Primer',
                    date: '2026-05-14T00:00:00Z',
                    total: 245.5,
                    enteredBy: 'Admin User',
                    paidBy: 'Painter One',
                    reimbursableTo: null,
                  },
                ],
              },
            ],
            jobExpensesError: null,
            financialSummary: {
              quoteTotal: 2500,
              expensesTotal: 245.5,
              profit: 2254.5,
              profitMarginPercent: 90.2,
            },
          },
        },
      })
    )

    expect(markup).toContain('Jobber Data')
    expect(markup).toContain('Created date')
    expect(markup).toContain('Product / Service')
    expect(markup).toContain('Exterior repaint')
    expect(markup).toContain('Job Expenses')
    expect(markup).toContain('Paint supplies')
    expect(markup).toContain('Jobber profit')
    expect(markup).toContain('90.2%')
  })

  it('hides Jobber profit on quote detail pages when job expenses are unavailable', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteDetailView, {
        quote: {
          ...quoteRecord,
          jobberSnapshot: {
            jobberQuoteId: 'encoded-quote-id',
            sourceType: 'quote',
            quoteNumber: '2345',
            createdAt: '2026-05-13T01:23:45Z',
            customerName: 'Jane Customer',
            customerAddress: '10 Main St',
            workType: 'Exterior',
            areaSqft: null,
            customerType: 'Real Estate',
            sourceUrl: 'https://secure.getjobber.com/quotes/2345',
            productsAndServices: [],
            jobExpenses: [],
            jobExpensesError: 'Jobber hid Job or Expense data due to permissions.',
            financialSummary: {
              quoteTotal: 2500,
              expensesTotal: 245.5,
              profit: 2254.5,
              profitMarginPercent: 90.2,
            },
          },
        },
      })
    )

    expect(markup).not.toContain('Jobber profit')
    expect(markup).not.toContain('Profit margin')
    expect(markup).not.toContain('90.2%')
  })

  it('shows app-saved Product / Service line items on quote detail pages', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteDetailView, {
        quote: {
          ...quoteRecord,
          jobberQuoteLines: [
            {
              id: 'app-line-1',
              quoteId: quoteRecord.id,
              kind: 'text',
              name: 'Ceiling',
              description: 'All interior ceiling\n2 coats of Dulux ceiling paint',
              quantity: '1.00',
              unitPrice: '0.00',
              totalPrice: '0.00',
              taxable: false,
              clientVisible: true,
              jobberLineItemId: 'jobber-line-1',
              linkedProductOrServiceId: null,
              position: 0,
              createdAt: '2026-05-19T00:00:00Z',
              updatedAt: '2026-05-19T00:00:00Z',
            },
            {
              id: 'app-line-2',
              quoteId: quoteRecord.id,
              kind: 'line_item',
              name: 'Total',
              description: 'Public quote total',
              quantity: '1.00',
              unitPrice: '3478.93',
              totalPrice: '3478.93',
              taxable: true,
              clientVisible: true,
              jobberLineItemId: 'jobber-line-2',
              linkedProductOrServiceId: null,
              position: 1,
              createdAt: '2026-05-19T00:00:00Z',
              updatedAt: '2026-05-19T00:00:00Z',
            },
          ],
        },
      })
    )

    expect(markup).toContain('App Product / Service')
    expect(markup).toContain('Ceiling')
    expect(markup).toContain('All interior ceiling')
    expect(markup).toContain('Total')
    expect(markup).toContain('$3478.93')
  })

  it('shows saved internal memos on quote detail pages', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteDetailView, {
        quote: {
          ...quoteRecord,
          memos: [
            {
              id: 'memo-1',
              quoteId: quoteRecord.id,
              body: 'Call before arriving.\nUse the side gate.',
              position: 0,
              createdAt: '2026-05-28T00:00:00Z',
              updatedAt: '2026-05-28T00:00:00Z',
              createdBy: 'user-1',
            },
          ],
        },
      })
    )

    expect(markup).toContain('Internal Memos')
    expect(markup).toContain('Memo 1')
    expect(markup).toContain('Call before arriving.')
    expect(markup).toContain('Use the side gate.')
  })

  it('shows saved option totals on quote detail pages without changing the main final total', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteDetailView, {
        quote: {
          ...quoteRecord,
          finalTotal: '2550.00',
          options: [
            {
              id: 'option-1',
              quoteId: quoteRecord.id,
              title: 'Option 1 - Garage door repaint',
              workingDays: '1.00',
              labourPerDay: '1.00',
              materialMarket: '50.00',
              materialActual: '50.00',
              formula1Total: '550.00',
              formula2Total: '648.00',
              formula3Total: '663.00',
              formula4Total: '525.00',
              formula5Total: '559.00',
              selectedMin: 1,
              selectedMax: 1,
              subtotal: '550.00',
              finalTotal: '550.00',
              position: 0,
              items: [],
            },
          ],
        },
      })
    )

    expect(markup).toContain('Final')
    expect(markup).toContain('$2550.00')
    expect(markup).toContain('Optional Add-ons')
    expect(markup).toContain('Option 1 - Garage door repaint')
    expect(markup).toContain('$550.00')
    expect(markup).toContain('not included in main total')
  })

  it('shows edit and delete actions on quote detail pages', () => {
    const markup = renderToStaticMarkup(createElement(QuoteDetailView, { quote: quoteRecord }))

    expect(markup).toContain('Edit')
    expect(markup).toContain(`/quotes/${quoteRecord.id}/edit`)
    expect(markup).toContain('Delete')
  })

  it('shows who created each quote on quote cards and detail pages', () => {
    const cardMarkup = renderToStaticMarkup(createElement(QuoteCard, { quote: quoteRecord }))
    const detailMarkup = renderToStaticMarkup(createElement(QuoteDetailView, { quote: quoteRecord }))

    expect(cardMarkup).toContain('Created by Mia Kang')
    expect(detailMarkup).toContain('Created by')
    expect(detailMarkup).toContain('Mia Kang')
  })

  it('uses saved subtotal, not GST-inclusive final total, as the visible quote amount', () => {
    const quoteWithGstIncludedTotal = {
      ...quoteRecord,
      subtotal: '1455.74',
      finalTotal: '1601.31',
    }

    const cardMarkup = renderToStaticMarkup(createElement(QuoteCard, { quote: quoteWithGstIncludedTotal }))
    const detailMarkup = renderToStaticMarkup(createElement(QuoteDetailView, { quote: quoteWithGstIncludedTotal }))

    expect(cardMarkup).toContain('$1455.74')
    expect(cardMarkup).not.toContain('$1601.31')
    expect(detailMarkup).toContain('$1455.74')
    expect(detailMarkup).not.toContain('$1601.31')
  })

  it('uses grouped area subtotal as the detail final subtotal when unassigned rows exist', () => {
    const quoteWithUnassignedRows = {
      ...quoteRecord,
      subtotal: '999.99',
      finalTotal: '1099.99',
      selectedMin: 1 as const,
      selectedMax: 1 as const,
      items: [
        {
          id: 'item-interior',
          quoteId: quoteRecord.id,
          productId: null,
          productNameSnapshot: 'Interior assigned row',
          marketPriceSnapshot: '10.00',
          actualPriceSnapshot: '10.00',
          quantity: '1.00',
          workingDays: '1.00',
          labourPerDay: '1.00',
          areaId: null,
          areaNameSnapshot: 'Bedroom',
          areaScopeSnapshot: 'interior' as const,
          isCustom: true,
          position: 0,
        },
        {
          id: 'item-unassigned',
          quoteId: quoteRecord.id,
          productId: null,
          productNameSnapshot: 'Unassigned row',
          marketPriceSnapshot: '400.00',
          actualPriceSnapshot: '400.00',
          quantity: '1.00',
          workingDays: '1.00',
          labourPerDay: '1.00',
          areaId: null,
          areaNameSnapshot: null,
          areaScopeSnapshot: null,
          isCustom: true,
          position: 1,
        },
      ],
    }

    const markup = renderToStaticMarkup(createElement(QuoteDetailView, { quote: quoteWithUnassignedRows }))

    expect(markup).toContain('Final subtotal ex GST')
    expect(markup).toContain('$510.00')
    expect(markup).not.toContain('$999.99')
    expect(markup).not.toContain('$1099.99')
  })
})
