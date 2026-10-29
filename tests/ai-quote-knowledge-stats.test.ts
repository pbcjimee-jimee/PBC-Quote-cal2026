import { describe, expect, it } from 'vitest'
import {
  buildKnowledgeStats,
  normalizeAreaKey,
  type KnowledgeSourceQuote,
} from '@/lib/ai-quote/knowledge-stats'

function quote(overrides: Partial<KnowledgeSourceQuote> = {}): KnowledgeSourceQuote {
  return {
    id: 'quote-1',
    workType: 'interior',
    finalTotal: '1100',
    jobberSaveMode: 'priced_line_items',
    formulaSelections: {},
    publicLines: [],
    items: [],
    ...overrides,
  }
}

function item(overrides: Partial<KnowledgeSourceQuote['items'][number]> = {}): KnowledgeSourceQuote['items'][number] {
  return {
    areaName: 'Bedroom 1',
    areaScope: 'interior',
    productId: 'paint-1',
    productName: 'Wall paint',
    quantity: '2',
    workingDays: '1',
    labourPerDay: '2',
    ...overrides,
  }
}

function line(overrides: Partial<KnowledgeSourceQuote['publicLines'][number]> = {}): KnowledgeSourceQuote['publicLines'][number] {
  return {
    kind: 'line_item',
    name: 'Bedroom 1',
    description: 'Prepare and paint',
    quantity: '1',
    unitPrice: '1000',
    linkedProductServiceId: null,
    ...overrides,
  }
}

describe('normalizeAreaKey', () => {
  it.each([
    ['Bedroom 1', 'bedroom'],
    ['  Master Bed ', 'bedroom'],
    ['Master Bedroom #2', 'bedroom'],
    ['Ensuite 2', 'bathroom'],
    ['Bath #3', 'bathroom'],
    ['Powder Room', 'bathroom'],
    ['Living Room', 'living room'],
    ['Lounge', 'living room'],
    ['Living', 'living room'],
    ['Hallway/Entry', 'hallway entry'],
    [' Hallway-& Entry #2 ', 'hallway entry'],
    ['WC', 'wc'],
    ['Toilet', 'toilet'],
    ['Laundry', 'laundry'],
    ['2 beds', 'bedroom'],
    ['Bedrooms', 'bedroom'],
    ['Baths', 'bathroom'],
    ['Bathrooms', 'bathroom'],
    ['Ensuites', 'bathroom'],
  ])('normalizes %s to %s', (name, expected) => {
    expect(normalizeAreaKey(name)).toBe(expected)
  })
})

describe('buildKnowledgeStats', () => {
  it('computes p25, median and p75 with linear interpolation and decimal arithmetic', () => {
    const stats = buildKnowledgeStats(['1', '2', '3', '4'].map(workingDays => quote({
      items: [item({ workingDays })],
    })))

    expect(stats.areas['interior:bedroom']).toMatchObject({
      scope: 'interior',
      workingDays: { n: 4, p25: '1.75', median: '2.50', p75: '3.25', lowSample: false },
      labourPerDayMedian: '2.00',
    })
  })

  it('flags fewer than three samples and handles a single value', () => {
    const stats = buildKnowledgeStats([quote({ items: [item({ workingDays: '0.1' })] })])

    expect(stats.areas['interior:bedroom'].workingDays).toEqual({
      n: 1, p25: '0.10', median: '0.10', p75: '0.10', lowSample: true,
    })
  })

  it('returns safe empty statistics', () => {
    expect(buildKnowledgeStats([])).toEqual({
      areas: {},
      formulaSelections: { interior: [], exterior: [], roof: [] },
      publicLines: {},
      publicVsCalculator: { n: 0, p25: '0.00', median: '0.00', p75: '0.00', lowSample: true },
      quoteCount: 0,
    })
  })

  it('ranks formula selection pairs per scope and keeps the top three', () => {
    const stats = buildKnowledgeStats([
      ...Array.from({ length: 3 }, () => quote({ formulaSelections: { interior: { min: 4, max: 1 } } })),
      quote({ formulaSelections: { interior: { min: 5, max: 2 }, roof: { min: 3, max: 5 } } }),
      quote({ formulaSelections: { interior: { min: 2, max: 3 } } }),
      quote({ formulaSelections: { interior: { min: 1, max: 5 } } }),
    ])

    expect(stats.formulaSelections.interior[0]).toEqual({ min: 4, max: 1, count: 3 })
    expect(stats.formulaSelections.interior).toHaveLength(3)
    expect(stats.formulaSelections.roof).toEqual([{ min: 3, max: 5, count: 1 }])
    expect(stats.formulaSelections.exterior).toEqual([])
    expect(stats.quoteCount).toBe(6)
  })

  it('summarizes the three most used catalog products and quantity medians', () => {
    const stats = buildKnowledgeStats([quote({ items: [
      item({ quantity: '1', labourPerDay: '1' }),
      item({ quantity: '4', labourPerDay: '3' }),
      item({ productId: 'paint-2', productName: 'Primer' }),
      item({ productId: 'paint-3', productName: 'Trim' }),
      item({ productId: 'paint-4', productName: 'Ceiling' }),
      item({ productId: null, productName: 'Custom paint' }),
    ] })])

    expect(stats.areas['interior:bedroom'].topProducts[0]).toEqual({
      productId: 'paint-1', productName: 'Wall paint', count: 2, medianQuantity: '2.50',
    })
    expect(stats.areas['interior:bedroom'].topProducts).toHaveLength(3)
    expect(stats.areas['interior:bedroom'].labourPerDayMedian).toBe('2.00')
  })

  it('sums days per quote, scope and normalized area while keeping scopes separate', () => {
    const stats = buildKnowledgeStats([
      quote({ items: [item({ workingDays: '0.1' }), item({ areaName: 'Bed 2', workingDays: '0.2' })] }),
      quote({ items: [item({ workingDays: '0.5' }), item({ areaScope: 'exterior', workingDays: '8' })] }),
    ])

    expect(stats.areas['interior:bedroom'].workingDays).toEqual({
      n: 2, p25: '0.35', median: '0.40', p75: '0.45', lowSample: true,
    })
    expect(stats.areas['exterior:bedroom'].workingDays.median).toBe('8.00')
  })

  it('excludes zero-day items from the labour median but includes their product usage', () => {
    const stats = buildKnowledgeStats([quote({ items: [
      item({ workingDays: '0', labourPerDay: '12' }), item({ labourPerDay: '1.5' }),
    ] })])

    expect(stats.areas['interior:bedroom'].labourPerDayMedian).toBe('1.50')
    expect(stats.areas['interior:bedroom'].topProducts[0].count).toBe(2)
  })

  it('skips items without an area name or scope', () => {
    const stats = buildKnowledgeStats([quote({ items: [
      item({ areaName: null }), item({ areaName: ' ' }), item({ areaScope: null }),
    ] })])

    expect(stats.areas).toEqual({})
  })

  it('excludes description_total quotes from publicVsCalculator', () => {
    const stats = buildKnowledgeStats([
      quote({ publicLines: [line()] }),
      quote({ jobberSaveMode: 'description_total', publicLines: [line({ unitPrice: '9000' })] }),
    ])

    expect(stats.publicVsCalculator).toEqual({
      n: 1, p25: '1.00', median: '1.00', p75: '1.00', lowSample: true,
    })
  })

  it('computes quantity times unit price divided by the GST-exclusive calculator total', () => {
    const stats = buildKnowledgeStats([quote({ publicLines: [
      line({ quantity: '2.5', unitPrice: '400' }),
      line({ kind: 'text', unitPrice: '9999' }),
    ] })])

    expect(stats.publicVsCalculator.median).toBe('1.00')
  })

  it('skips zero calculator totals instead of producing an infinite ratio', () => {
    const stats = buildKnowledgeStats([quote({ finalTotal: '0', publicLines: [line()] })])

    expect(stats.publicVsCalculator.n).toBe(0)
    expect(stats.publicVsCalculator.median).toBe('0.00')
  })

  it('ignores text lines and groups normalized line prices with catalog linkage ratios', () => {
    const stats = buildKnowledgeStats([quote({ publicLines: [
      line({ name: 'Bedroom 1', unitPrice: '0.1', linkedProductServiceId: 'catalog-1' }),
      line({ name: 'Master Bed', unitPrice: '0.2' }),
      line({ name: 'Bed #3', unitPrice: '0.3' }),
      line({ kind: 'text', unitPrice: '9000' }),
    ] })])

    expect(stats.publicLines).toEqual({ bedroom: {
      unitPrice: { n: 3, p25: '0.15', median: '0.20', p75: '0.25', lowSample: false },
      catalogLinkedRatio: '0.33',
    } })
  })

  it('does not mutate source quotes', () => {
    const quotes = [quote({ items: [item()], publicLines: [line()] })]
    const original = structuredClone(quotes)

    buildKnowledgeStats(quotes)

    expect(quotes).toEqual(original)
  })
})
