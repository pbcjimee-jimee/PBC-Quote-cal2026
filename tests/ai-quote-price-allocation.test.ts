import { describe, expect, it } from 'vitest'
import {
  allocatePublicLinePrices,
  type AllocatableLine,
} from '@/lib/ai-quote/price-allocation'

function line(id: string, overrides: Partial<AllocatableLine> = {}): AllocatableLine {
  return {
    id,
    kind: 'line_item',
    quantity: '1',
    priceSource: 'allocated',
    priceWeight: 1,
    catalogUnitPrice: null,
    ...overrides,
  }
}

describe('allocatePublicLinePrices', () => {
  it('splits the GST-exclusive total by weight and quantity', () => {
    expect(allocatePublicLinePrices([
      line('a', { priceWeight: 60 }),
      line('b', { priceWeight: 40, quantity: '2' }),
    ], '1100')).toEqual({
      status: 'allocated', unitPrices: { a: '600.00', b: '200.00' }, residual: '0.00',
    })
  })

  it('keeps catalog prices and allocates the remainder', () => {
    expect(allocatePublicLinePrices([
      line('c', { priceSource: 'catalog', catalogUnitPrice: '150.00', quantity: '2', priceWeight: 0 }),
      line('a'),
    ], '1100').unitPrices).toEqual({ c: '150.00', a: '700.00' })
  })

  it('reserves existing public line totals before allocating AI prices', () => {
    expect(allocatePublicLinePrices([
      line('a', { priceWeight: 60 }), line('b', { priceWeight: 40 }),
    ], '1100', '300')).toEqual({
      status: 'allocated', unitPrices: { a: '420.00', b: '280.00' }, residual: '0.00',
    })
  })

  it('rounds the GST-exclusive target and reserved amount separately before subtraction', () => {
    expect(allocatePublicLinePrices([line('a')], '1.15', '0.005')).toEqual({
      status: 'allocated', unitPrices: { a: '1.04' }, residual: '0.00',
    })
  })

  it.each(['1000', '1001'])('skips when reserved amount %s exhausts the target and keeps catalog prices', (reserved) => {
    expect(allocatePublicLinePrices([
      line('c', { priceSource: 'catalog', catalogUnitPrice: '150' }), line('a'),
    ], '1100', reserved)).toEqual({
      status: 'skipped', reason: 'no_total', unitPrices: { c: '150.00', a: '0.00' },
    })
  })

  it('checks catalog prices against the remaining target after reservation', () => {
    expect(allocatePublicLinePrices([
      line('c', { priceSource: 'catalog', catalogUnitPrice: '150' }), line('a'),
    ], '1100', '900')).toEqual({
      status: 'skipped', reason: 'catalog_exceeds_total', unitPrices: { c: '150.00', a: '0.00' },
    })
  })

  it('puts the rounding remainder on the first heaviest quantity-one line', () => {
    expect(allocatePublicLinePrices([line('a'), line('b'), line('c')], '1100'))
      .toEqual({
        status: 'allocated', unitPrices: { a: '333.34', b: '333.33', c: '333.33' }, residual: '0.00',
      })
  })

  it('selects by weight among eligible lines rather than using the first line', () => {
    expect(allocatePublicLinePrices([
      line('a'), line('b', { priceWeight: 3 }), line('c', { priceWeight: 3 }),
    ], '1100.01').unitPrices).toEqual({ a: '142.86', b: '428.57', c: '428.58' })
  })

  it('reports a residual when no quantity-one line can receive it', () => {
    expect(allocatePublicLinePrices([line('a', { quantity: '3' })], '1100'))
      .toEqual({ status: 'allocated', unitPrices: { a: '333.33' }, residual: '0.01' })
  })

  it('removes a negative rounding residual from an eligible line', () => {
    expect(allocatePublicLinePrices([line('a'), line('b'), line('c')], '1100.11'))
      .toEqual({
        status: 'allocated', unitPrices: { a: '333.36', b: '333.37', c: '333.37' }, residual: '0.00',
      })
  })

  it('skips when catalog lines exceed the total and preserves catalog prices', () => {
    expect(allocatePublicLinePrices([
      line('c', { priceSource: 'catalog', catalogUnitPrice: '2000', priceWeight: 0 }),
      line('a'),
    ], '1100')).toEqual({
      status: 'skipped', reason: 'catalog_exceeds_total', unitPrices: { c: '2000.00', a: '0.00' },
    })
  })

  it.each(['0', '-110'])('skips a nonpositive total %s and keeps catalog prices', (total) => {
    expect(allocatePublicLinePrices([
      line('c', { priceSource: 'catalog', catalogUnitPrice: '150' }), line('a'),
    ], total)).toEqual({
      status: 'skipped', reason: 'no_total', unitPrices: { c: '150.00', a: '0.00' },
    })
  })

  it('skips zero weights', () => {
    expect(allocatePublicLinePrices([line('a', { priceWeight: 0 })], '1100'))
      .toEqual({ status: 'skipped', reason: 'no_weights', unitPrices: { a: '0.00' } })
  })

  it('skips when no allocated lines exist', () => {
    expect(allocatePublicLinePrices([
      line('c', { priceSource: 'catalog', catalogUnitPrice: '150' }),
    ], '1100')).toEqual({
      status: 'skipped', reason: 'no_weights', unitPrices: { c: '150.00' },
    })
    expect(allocatePublicLinePrices([], '1100'))
      .toEqual({ status: 'skipped', reason: 'no_weights', unitPrices: {} })
  })

  it('excludes text, none and zero-weight lines from allocation', () => {
    expect(allocatePublicLinePrices([
      line('t', { kind: 'text', priceSource: 'catalog', catalogUnitPrice: '2000', quantity: '0' }),
      line('n', { priceSource: 'none', priceWeight: 100 }),
      line('z', { priceWeight: 0 }),
      line('a'),
    ], '1100').unitPrices).toEqual({ t: '0.00', n: '0.00', z: '0.00', a: '1000.00' })
  })

  it('supports fractional quantities and weights', () => {
    expect(allocatePublicLinePrices([
      line('a', { quantity: '2.5', priceWeight: 0.1 }),
      line('b', { priceWeight: 0.2 }),
    ], '99')).toEqual({
      status: 'allocated', unitPrices: { a: '12.00', b: '60.00' }, residual: '0.00',
    })
  })

  it('rounds the GST-exclusive target to cents before allocation', () => {
    expect(allocatePublicLinePrices([line('a')], '1.15')).toEqual({
      status: 'allocated', unitPrices: { a: '1.05' }, residual: '0.00',
    })
  })

  it('allocates a zero pool without changing catalog prices or input lines', () => {
    const lines = [
      line('c', { priceSource: 'catalog', catalogUnitPrice: '1000' }), line('a'),
    ]
    const original = structuredClone(lines)
    expect(allocatePublicLinePrices(lines, '1100')).toEqual({
      status: 'allocated', unitPrices: { c: '1000.00', a: '0.00' }, residual: '0.00',
    })
    expect(lines).toEqual(original)
  })
})
