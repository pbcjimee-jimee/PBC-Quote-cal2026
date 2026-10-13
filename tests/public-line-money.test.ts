import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { parsePublicLineMoney, signedPublicDecimalFromInput } from '@/lib/public-line-money'
import { decimalFromInput } from '@/lib/quote-labour'

describe('signed public price input', () => {
  it('keeps a valid negative price for persistence', () => {
    const result = parsePublicLineMoney('-150.25')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.toFixed(2)).toBe('-150.25')
  })

  it.each(['', '-', 'abc', 'NaN', 'Infinity', '1e3', null, undefined])('rejects malformed saved price %s instead of saving zero', (input) => {
    expect(parsePublicLineMoney(input)).toEqual({ ok: false, error: 'invalid_money' })
  })

  it.each(['100000000', '-100000000'])('rejects stored NUMERIC(10,2) overflow %s', (input) => {
    expect(parsePublicLineMoney(input)).toEqual({ ok: false, error: 'money_out_of_range' })
  })

  it('accepts both signed database boundary prices without losing cents', () => {
    for (const input of ['99999999.99', '-99999999.99']) {
      const result = parsePublicLineMoney(input)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.toFixed(2)).toBe(input)
    }
  })
  it.each([
    ['-150.25', '-150.25'], ['+400.00', '400'], ['  -0.01 ', '-0.01'],
    ['0.005', '0.005'], ['-0', '0'], ['400.', '400'],
  ])('preserves signed decimal %s as %s', (input, expected) => {
    expect(signedPublicDecimalFromInput(input).toString()).toBe(expected)
  })

  it.each(['', '-', '+', '.', '1e3', 'NaN', 'Infinity', '--4', '-.5', '1,000'])('does not treat malformed %s as a price', (input) => {
    expect(signedPublicDecimalFromInput(input).isZero()).toBe(true)
  })

  it('retains Decimal cents without a native number conversion', () => {
    expect(signedPublicDecimalFromInput(new Decimal('-99999999.99')).toFixed(2)).toBe('-99999999.99')
    expect(signedPublicDecimalFromInput(new Decimal(Infinity)).isZero()).toBe(true)
  })

  it('keeps negative material and labour input excluded by the unsigned parser', () => {
    expect(decimalFromInput('-150.25').toString()).toBe('0')
  })
})
