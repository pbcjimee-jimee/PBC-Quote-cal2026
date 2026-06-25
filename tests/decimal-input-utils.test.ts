import { describe, expect, it } from 'vitest'
import {
  getNextDecimalInputValue,
  isDecimalInputValue,
  isCompleteDecimalInputValue,
} from '@/components/quote-form/decimal-input-utils'

describe('decimal input validation', () => {
  it('allows empty strings, digits, and one decimal point while typing', () => {
    expect(isDecimalInputValue('')).toBe(true)
    expect(isDecimalInputValue('0')).toBe(true)
    expect(isDecimalInputValue('12.50')).toBe(true)
    expect(isDecimalInputValue('.')).toBe(true)
    expect(isDecimalInputValue('12/')).toBe(false)
    expect(isDecimalInputValue('12.5.0')).toBe(false)
    expect(isDecimalInputValue('-1')).toBe(false)
  })

  it('distinguishes incomplete decimal typing values from numeric values', () => {
    expect(isCompleteDecimalInputValue('')).toBe(false)
    expect(isCompleteDecimalInputValue('.')).toBe(false)
    expect(isCompleteDecimalInputValue('0.')).toBe(true)
    expect(isCompleteDecimalInputValue('0.5')).toBe(true)
  })

  it('builds the proposed value for keypress and paste validation', () => {
    expect(getNextDecimalInputValue('12', '3', 2, 2)).toBe('123')
    expect(getNextDecimalInputValue('12', '.5', 2, 2)).toBe('12.5')
    expect(getNextDecimalInputValue('12.5', '8', 3, 4)).toBe('12.8')
  })

  it('handles runtime numeric values when validating replacement input', () => {
    expect(getNextDecimalInputValue(99, '0', 0, 2)).toBe('0')
  })
})
