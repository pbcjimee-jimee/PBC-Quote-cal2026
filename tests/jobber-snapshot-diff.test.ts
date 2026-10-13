import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import { diffJobberSnapshots } from '@/lib/jobber/snapshot-diff'
import type { JobberQuoteDraft, JobberQuoteDraftLineItem } from '@/lib/jobber/mapper'

function line(overrides: Partial<JobberQuoteDraftLineItem> = {}): JobberQuoteDraftLineItem {
  return {
    id: 'line-1',
    name: 'Walls',
    category: 'SERVICE',
    description: 'Two coats',
    quantity: 1,
    unitPrice: 120,
    totalPrice: 120,
    linkedName: null,
    textOnly: false,
    ...overrides,
  }
}

function snapshot(overrides: Partial<JobberQuoteDraft> = {}): JobberQuoteDraft {
  const productsAndServices = overrides.productsAndServices ?? [line()]
  const quoteTotal = sumLineTotals(productsAndServices)

  return {
    jobberQuoteId: 'jobber-quote-1',
    sourceType: 'quote',
    quoteNumber: '1001',
    createdAt: '2026-06-29T00:00:00.000Z',
    customerName: 'Jane Customer',
    customerAddress: '10 Main St',
    workType: 'Interior',
    areaSqft: null,
    customerType: 'Residential',
    sourceUrl: 'https://secure.getjobber.com/quotes/1001',
    productsAndServices,
    jobExpenses: [],
    jobExpensesError: null,
    financialSummary: {
      quoteTotal,
      expensesTotal: 0,
      profit: quoteTotal,
      profitMarginPercent: 100,
    },
    ...overrides,
  }
}

function sumLineTotals(productsAndServices: JobberQuoteDraftLineItem[]): number {
  return productsAndServices
    .reduce((total, item) => total.add(item.totalPrice), new Decimal(0))
    .toNumber()
}

describe('diffJobberSnapshots', () => {
  it.each(['optional', 'recommended', 'selected'] as const)('detects a remote %s-only change without conflating unknown and false', (field) => {
    const before = snapshot({ productsAndServices: [line({ [field]: false })] })
    const after = snapshot({ productsAndServices: [line({ [field]: true })] })
    const diff = diffJobberSnapshots(before, after)
    expect(diff.status).toBe('changed')
    expect(diff.summary[0].label).toContain('status')
    expect(diff.summary[0].before).not.toEqual(diff.summary[0].after)
    expect(diffJobberSnapshots(snapshot(), before).status).toBe('changed')
  })
  it('returns unchanged with an empty summary for equivalent normalized snapshots', () => {
    const previous = snapshot({
      customerName: ' Jane   Customer ',
      customerAddress: '10   Main St',
      workType: 'Interior',
      customerType: 'Residential',
      productsAndServices: [
        line({ name: ' Walls ', description: 'Two   coats' }),
      ],
    })
    const next = snapshot({
      customerName: 'Jane Customer',
      customerAddress: '10 Main St',
      productsAndServices: [
        line({ name: 'Walls', description: 'Two coats' }),
      ],
    })

    expect(diffJobberSnapshots(previous, next)).toEqual({
      status: 'unchanged',
      summary: [],
    })
  })

  it('summarizes customer and address changes after whitespace normalization', () => {
    const previous = snapshot({
      customerName: 'Jane Customer',
      customerAddress: '10 Main St',
    })
    const next = snapshot({
      customerName: 'Jane A. Customer',
      customerAddress: '12 Main St',
    })

    expect(diffJobberSnapshots(previous, next)).toEqual({
      status: 'changed',
      summary: [
        {
          field: 'customer',
          label: 'Customer changed',
          before: 'Jane Customer',
          after: 'Jane A. Customer',
        },
        {
          field: 'address',
          label: 'Address changed',
          before: '10 Main St',
          after: '12 Main St',
        },
      ],
    })
  })

  it('summarizes line item amount changes as a Product / Service total change', () => {
    const previous = snapshot({
      productsAndServices: [line({ unitPrice: 120, totalPrice: 120 })],
    })
    const next = snapshot({
      productsAndServices: [line({ unitPrice: 180, totalPrice: 180 })],
    })

    expect(diffJobberSnapshots(previous, next)).toEqual({
      status: 'changed',
      summary: [
        {
          field: 'financialSummary',
          label: 'Jobber quote total changed',
          before: '$120.00',
          after: '$180.00',
        },
        {
          field: 'lineItems',
          label: 'Product / Service total changed',
          before: '$120.00',
          after: '$180.00',
        },
      ],
    })
  })

  it('summarizes unit price changes when line totals and quote total are unchanged', () => {
    const previous = snapshot({
      productsAndServices: [line({ unitPrice: 120, totalPrice: 120 })],
    })
    const next = snapshot({
      productsAndServices: [line({ unitPrice: 150, totalPrice: 120 })],
    })

    expect(diffJobberSnapshots(previous, next)).toEqual({
      status: 'changed',
      summary: [
        {
          field: 'lineItems',
          label: 'Product / Service line pricing changed',
          before: 'Walls (qty 1, unit $120.00, total $120.00)',
          after: 'Walls (qty 1, unit $150.00, total $120.00)',
        },
      ],
    })
  })

  it('summarizes per-line total changes when aggregate line total is unchanged', () => {
    const previous = snapshot({
      productsAndServices: [
        line({ id: 'line-1', name: 'Walls', unitPrice: 100, totalPrice: 100 }),
        line({ id: 'line-2', name: 'Trim', unitPrice: 200, totalPrice: 200 }),
      ],
    })
    const next = snapshot({
      productsAndServices: [
        line({ id: 'line-1', name: 'Walls', unitPrice: 150, totalPrice: 150 }),
        line({ id: 'line-2', name: 'Trim', unitPrice: 150, totalPrice: 150 }),
      ],
    })

    expect(diffJobberSnapshots(previous, next)).toEqual({
      status: 'changed',
      summary: [
        {
          field: 'lineItems',
          label: 'Product / Service line pricing changed',
          before: 'Walls (qty 1, unit $100.00, total $100.00)',
          after: 'Walls (qty 1, unit $150.00, total $150.00)',
        },
      ],
    })
  })

  it('summarizes added, removed, and reordered line items via signature comparison', () => {
    const textA = line({
      id: 'text-a',
      name: 'Scope A',
      description: 'Details A',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      textOnly: true,
    })
    const textB = line({
      id: 'text-b',
      name: 'Scope B',
      description: 'Details B',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      textOnly: true,
    })
    const previous = snapshot({ productsAndServices: [line(), textA] })

    expect(diffJobberSnapshots(previous, snapshot({ productsAndServices: [line(), textA, textB] })).summary).toEqual([
      {
        field: 'lineItems',
        label: 'Product / Service lines changed',
        before: '2 lines',
        after: '3 lines',
      },
    ])
    expect(diffJobberSnapshots(previous, snapshot({ productsAndServices: [line()] })).summary).toEqual([
      {
        field: 'lineItems',
        label: 'Product / Service lines changed',
        before: '2 lines',
        after: '1 line',
      },
    ])
    expect(diffJobberSnapshots(previous, snapshot({ productsAndServices: [textA, line()] })).summary).toEqual([
      {
        field: 'lineItems',
        label: 'Product / Service lines changed',
        before: '2 lines',
        after: '2 lines',
      },
    ])
  })

  it('returns unknown with an empty summary when the previous snapshot is null', () => {
    expect(diffJobberSnapshots(null, snapshot())).toEqual({
      status: 'unknown',
      summary: [],
    })
  })

  it('caps the summary at 8 items', () => {
    const previous = snapshot({
      customerName: 'Old Customer',
      customerAddress: 'Old Address',
      workType: 'Interior',
      customerType: 'Residential',
      financialSummary: {
        quoteTotal: 100,
        expensesTotal: 0,
        profit: 100,
        profitMarginPercent: 100,
      },
      productsAndServices: [
        line({ id: 'line-1', name: 'Line 1', totalPrice: 10 }),
        line({ id: 'line-2', name: 'Line 2', totalPrice: 10 }),
        line({ id: 'line-3', name: 'Line 3', totalPrice: 10 }),
        line({ id: 'line-4', name: 'Line 4', totalPrice: 10 }),
        line({ id: 'line-5', name: 'Line 5', totalPrice: 10 }),
        line({ id: 'line-6', name: 'Line 6', totalPrice: 10 }),
        line({ id: 'line-7', name: 'Line 7', totalPrice: 10 }),
        line({ id: 'line-8', name: 'Line 8', totalPrice: 10 }),
        line({ id: 'line-9', name: 'Line 9', totalPrice: 20 }),
      ],
    })
    const next = snapshot({
      customerName: 'New Customer',
      customerAddress: 'New Address',
      workType: 'Exterior',
      customerType: 'Commercial',
      financialSummary: {
        quoteTotal: 200,
        expensesTotal: 0,
        profit: 200,
        profitMarginPercent: 100,
      },
      productsAndServices: [
        line({ id: 'line-1', name: 'Changed 1', totalPrice: 15 }),
        line({ id: 'line-2', name: 'Changed 2', totalPrice: 15 }),
        line({ id: 'line-3', name: 'Changed 3', totalPrice: 15 }),
        line({ id: 'line-4', name: 'Changed 4', totalPrice: 15 }),
        line({ id: 'line-5', name: 'Changed 5', totalPrice: 15 }),
        line({ id: 'line-6', name: 'Changed 6', totalPrice: 15 }),
        line({ id: 'line-7', name: 'Changed 7', totalPrice: 15 }),
        line({ id: 'line-8', name: 'Changed 8', totalPrice: 15 }),
        line({ id: 'line-9', name: 'Changed 9', totalPrice: 80 }),
      ],
    })

    const result = diffJobberSnapshots(previous, next)

    expect(result.status).toBe('changed')
    expect(result.summary).toHaveLength(8)
  })
})
