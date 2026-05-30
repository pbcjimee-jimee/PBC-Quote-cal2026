import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  applyQuoteLineTemplateToDrafts,
  applyProductServiceToLine,
  getProductServiceDragScrollStep,
  getProductServiceMatches,
  JobberProductServiceEditor,
  moveJobberQuoteLine,
  reorderJobberQuoteLines,
} from '@/components/quote-form/jobber-product-service-editor'
import type { JobberQuoteLineItemDraft } from '@/components/quote-form/types'
import type { ProductServiceRecord } from '@/lib/product-services/types'

describe('JobberProductServiceEditor', () => {
  const lines: JobberQuoteLineItemDraft[] = [
    {
      id: 'line-1',
      kind: 'line_item',
      name: 'Exterior repaint',
      description: 'Prepare, prime, and paint exterior walls',
      quantity: '2',
      unitPrice: '1500.00',
      taxable: true,
      clientVisible: true,
    },
    {
      id: 'text-1',
      kind: 'text',
      name: 'Access notes',
      description: 'Crew needs side gate access.',
      quantity: '1',
      unitPrice: '0',
      taxable: false,
      clientVisible: false,
    },
  ]

  it('renders priced line item editor without Description + Total or Build Option Set modes', () => {
    const markup = renderToStaticMarkup(createElement(JobberProductServiceEditor, {
      value: lines,
      onChange: () => undefined,
    }))

    expect(markup).toContain('Product / Service')
    expect(markup).not.toContain('Priced Line Items')
    expect(markup).not.toContain('Description + Total')
    expect(markup).not.toContain('Build Option Set')
  })

  it('renders editable priced line item fields and text rows without price fields', () => {
    const markup = renderToStaticMarkup(createElement(JobberProductServiceEditor, {
      value: lines,
      onChange: () => undefined,
    }))

    expect(markup).toContain('aria-label="Line item name"')
    expect(markup).toContain('value="Exterior repaint"')
    expect(markup).toContain('Prepare, prime, and paint exterior walls')
    expect(markup).toContain('Qty')
    expect(markup).toContain('Unit price')
    expect(markup).toContain('Taxable')
    expect(markup).toContain('Client visible')
    expect(markup).toContain('aria-label="Text title"')
    expect(markup).toContain('Access notes')
    expect(markup).toContain('Crew needs side gate access.')
    expect(markup).not.toContain('aria-label="Text unit price"')
  })

  it('keeps only the Product Service row list as an internal scroll area', () => {
    const markup = renderToStaticMarkup(createElement(JobberProductServiceEditor, {
      value: lines,
      onChange: () => undefined,
    }))

    expect(markup).toContain('product-service-scroll-list')
    expect(markup).toContain('max-h-[30rem]')
    expect(markup).toContain('overflow-y-auto')
  })

  it('calculates Product Service drag auto-scroll only near the row list edges', () => {
    const container = { top: 100, bottom: 500, height: 400 }

    expect(getProductServiceDragScrollStep(container, 120)).toBeLessThan(0)
    expect(getProductServiceDragScrollStep(container, 480)).toBeGreaterThan(0)
    expect(getProductServiceDragScrollStep(container, 300)).toBe(0)
  })

  it('renders Add Line Item and Add Text controls', () => {
    const markup = renderToStaticMarkup(createElement(JobberProductServiceEditor, {
      value: [],
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
      onChange: () => undefined,
    }))

    expect(markup).toContain('Template')
    expect(markup).toContain('Standard terms')
    expect(markup).toContain('Add Line Item')
    expect(markup).toContain('Add Text')
    expect(markup).toContain('Add the public Jobber-facing product and service lines for this quote.')
  })

  it('renders drag handles for reordering line items', () => {
    const markup = renderToStaticMarkup(createElement(JobberProductServiceEditor, {
      value: lines,
      onChange: () => undefined,
    }))

    expect(markup).toContain('draggable="true"')
    expect(markup).toContain('aria-label="Drag Exterior repaint"')
    expect(markup).toContain('aria-label="Drag Access notes"')
    expect(markup).toContain('touch-none')
    expect(markup).toContain('cursor-grab')
  })

  it('renders compact move controls for priced and text rows with edge controls disabled', () => {
    const markup = renderToStaticMarkup(createElement(JobberProductServiceEditor, {
      value: lines,
      onChange: () => undefined,
    }))

    expect(markup).toContain('aria-label="Move Exterior repaint to top"')
    expect(markup).toContain('aria-label="Move Exterior repaint up"')
    expect(markup).toContain('aria-label="Move Exterior repaint down"')
    expect(markup).toContain('aria-label="Move Exterior repaint to bottom"')
    expect(markup).toContain('aria-label="Move Access notes to top"')
    expect(markup).toContain('aria-label="Move Access notes up"')
    expect(markup).toContain('aria-label="Move Access notes down"')
    expect(markup).toContain('aria-label="Move Access notes to bottom"')
    expect(markup).toMatch(/aria-label="Move Exterior repaint to top"[^>]*disabled/)
    expect(markup).toMatch(/aria-label="Move Exterior repaint up"[^>]*disabled/)
    expect(markup).toMatch(/aria-label="Move Access notes down"[^>]*disabled/)
    expect(markup).toMatch(/aria-label="Move Access notes to bottom"[^>]*disabled/)
  })

  it('does not open product service matches until the line item name field is active', () => {
    const productServices: ProductServiceRecord[] = [
      {
        id: 'service-1',
        name: 'Ceiling',
        description: 'All interior ceilings',
        category: 'Service',
        unitPrice: '14.50',
        unitCost: '0.00',
        bookable: false,
        durationMinutes: null,
        quantityEnabled: true,
        minimumQuantity: null,
        maximumQuantity: null,
        taxable: true,
        active: true,
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      },
      {
        id: 'service-2',
        name: 'Walls',
        description: 'All interior ceilings',
        category: 'Service',
        unitPrice: '13.00',
        unitCost: '0.00',
        bookable: false,
        durationMinutes: null,
        quantityEnabled: true,
        minimumQuantity: null,
        maximumQuantity: null,
        taxable: true,
        active: true,
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      },
    ]
    const markup = renderToStaticMarkup(createElement(JobberProductServiceEditor, {
      value: [{ ...lines[0], name: 'ceil' }],
      productServices,
      onChange: () => undefined,
    }))

    expect(markup).not.toContain('Product / Service dropdown')
    expect(markup).not.toContain('Walls')
    expect(markup).not.toContain('Search Product &amp; Service')
    expect(markup).not.toContain('aria-label="Search product or service catalog"')
  })

  it('does not open product service matches until the text title field is active', () => {
    const productServices: ProductServiceRecord[] = [
      {
        id: 'service-1',
        name: 'Dulux Accredited Painting Company',
        description: 'Accreditation paragraph',
        category: 'Service',
        unitPrice: '0.00',
        unitCost: '0.00',
        bookable: false,
        durationMinutes: null,
        quantityEnabled: false,
        minimumQuantity: null,
        maximumQuantity: null,
        taxable: false,
        active: true,
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      },
      {
        id: 'service-2',
        name: 'Touch up',
        description: 'Dulux Accredited Painting Company',
        category: 'Service',
        unitPrice: '0.00',
        unitCost: '0.00',
        bookable: false,
        durationMinutes: null,
        quantityEnabled: false,
        minimumQuantity: null,
        maximumQuantity: null,
        taxable: false,
        active: true,
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      },
    ]
    const markup = renderToStaticMarkup(createElement(JobberProductServiceEditor, {
      value: [{ ...lines[1], name: 'accredited' }],
      productServices,
      onChange: () => undefined,
    }))

    expect(markup).not.toContain('Product / Service dropdown')
    expect(markup).not.toContain('Touch up')
    expect(markup).not.toContain('Unit price')
  })

  it('filters product services by title tokens only', () => {
    const matches = getProductServiceMatches('ceil', [
      {
        id: 'service-1',
        name: 'Ceiling',
        description: 'All interior ceilings',
        category: 'Service',
        unitPrice: '14.50',
        unitCost: '0.00',
        bookable: false,
        durationMinutes: null,
        quantityEnabled: true,
        minimumQuantity: null,
        maximumQuantity: null,
        taxable: true,
        active: true,
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      },
      {
        id: 'service-2',
        name: 'Walls',
        description: 'All interior ceilings',
        category: 'Service',
        unitPrice: '13.00',
        unitCost: '0.00',
        bookable: false,
        durationMinutes: null,
        quantityEnabled: true,
        minimumQuantity: null,
        maximumQuantity: null,
        taxable: true,
        active: true,
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      },
    ])

    expect(matches.map((match) => match.name)).toEqual(['Ceiling'])
  })

  it('returns an exact product service name match so a fully typed catalog entry can still be applied', () => {
    const matches = getProductServiceMatches('Ceiling', [
      {
        id: 'service-1',
        name: 'Ceiling',
        description: 'All interior ceilings',
        category: 'Service',
        unitPrice: '14.50',
        unitCost: '0.00',
        bookable: false,
        durationMinutes: null,
        quantityEnabled: true,
        minimumQuantity: null,
        maximumQuantity: null,
        taxable: true,
        active: true,
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      },
      {
        id: 'service-2',
        name: 'Walls',
        description: 'Ceiling paint description',
        category: 'Service',
        unitPrice: '13.00',
        unitCost: '0.00',
        bookable: false,
        durationMinutes: null,
        quantityEnabled: true,
        minimumQuantity: null,
        maximumQuantity: null,
        taxable: true,
        active: true,
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      },
    ])

    expect(matches.map((match) => match.name)).toEqual(['Ceiling'])
  })

  it('fills a priced line from a product service without linking an internal id to Jobber', () => {
    const filled = applyProductServiceToLine(lines[0], {
      id: 'service-1',
      name: 'Ceiling',
      description: 'All interior ceilings',
      category: 'Service',
      unitPrice: '14.50',
      unitCost: '0.00',
      bookable: false,
      durationMinutes: null,
      quantityEnabled: true,
      minimumQuantity: '1.00',
      maximumQuantity: null,
      taxable: true,
      active: true,
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
    })

    expect(filled).toMatchObject({
      name: 'Ceiling',
      description: 'All interior ceilings',
      quantity: '1.00',
      unitPrice: '14.50',
      taxable: true,
    })
    expect(filled.linkedProductOrServiceId).toBeUndefined()
  })

  it('fills a text line from a product service without carrying price or tax into the text item', () => {
    const filled = applyProductServiceToLine(lines[1], {
      id: 'service-1',
      name: 'Dulux Accredited Painting Company',
      description: 'Accreditation paragraph',
      category: 'Service',
      unitPrice: '14.50',
      unitCost: '0.00',
      bookable: false,
      durationMinutes: null,
      quantityEnabled: true,
      minimumQuantity: '2.00',
      maximumQuantity: null,
      taxable: true,
      active: true,
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
    })

    expect(filled).toMatchObject({
      kind: 'text',
      name: 'Dulux Accredited Painting Company',
      description: 'Accreditation paragraph',
      quantity: '1',
      unitPrice: '0',
      taxable: false,
    })
  })

  it('reorders line items by dragged and dropped ids', () => {
    const reordered = reorderJobberQuoteLines(lines, 'text-1', 'line-1')

    expect(reordered.map((line) => line.id)).toEqual(['text-1', 'line-1'])
    expect(lines.map((line) => line.id)).toEqual(['line-1', 'text-1'])
  })

  it('moves line items to top, up, down, and bottom without mutating the original list', () => {
    const moveLines = [
      lines[0],
      { ...lines[1], id: 'text-1' },
      { ...lines[0], id: 'line-2', name: 'Final clean' },
    ]

    expect(moveJobberQuoteLine(moveLines, 'line-2', 'top').map((line) => line.id)).toEqual(['line-2', 'line-1', 'text-1'])
    expect(moveJobberQuoteLine(moveLines, 'line-2', 'up').map((line) => line.id)).toEqual(['line-1', 'line-2', 'text-1'])
    expect(moveJobberQuoteLine(moveLines, 'line-1', 'down').map((line) => line.id)).toEqual(['text-1', 'line-1', 'line-2'])
    expect(moveJobberQuoteLine(moveLines, 'line-1', 'bottom').map((line) => line.id)).toEqual(['text-1', 'line-2', 'line-1'])
    expect(moveLines.map((line) => line.id)).toEqual(['line-1', 'text-1', 'line-2'])
  })

  it('returns the original line item list when a move cannot change the order', () => {
    expect(moveJobberQuoteLine(lines, 'missing-line', 'top')).toBe(lines)
    expect(moveJobberQuoteLine(lines, 'line-1', 'up')).toBe(lines)
    expect(moveJobberQuoteLine(lines, 'text-1', 'down')).toBe(lines)
  })

  it('appends template items to existing quote lines without removing saved lines', () => {
    const nextLines = applyQuoteLineTemplateToDrafts(lines, {
      id: 'template-1',
      name: 'Common inclusions',
      active: true,
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
      items: [
        {
          id: 'template-item-1',
          templateId: 'template-1',
          kind: 'line_item',
          name: 'Total',
          description: 'All labour and materials',
          quantity: '1',
          unitPrice: '3459.83',
          taxable: true,
          clientVisible: true,
          linkedProductOrServiceId: null,
          position: 0,
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:00.000Z',
        },
        {
          id: 'template-item-2',
          templateId: 'template-1',
          kind: 'text',
          name: 'Contract / Disclaimer',
          description: 'Quote terms',
          quantity: null,
          unitPrice: null,
          taxable: false,
          clientVisible: true,
          linkedProductOrServiceId: null,
          position: 1,
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:00.000Z',
        },
      ],
    })

    expect(nextLines).toHaveLength(4)
    expect(nextLines[0]).toEqual(lines[0])
    expect(nextLines[1]).toEqual(lines[1])
    expect(nextLines.map((line) => line.name)).toEqual([
      'Exterior repaint',
      'Access notes',
      'Total',
      'Contract / Disclaimer',
    ])
    expect(nextLines.slice(2).every((line) => line.jobberLineItemId === undefined)).toBe(true)
  })
})
