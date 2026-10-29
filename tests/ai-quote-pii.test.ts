import { describe, expect, it } from 'vitest'
import { redactContactDetails } from '@/lib/ai-quote/pii'

describe('redactContactDetails', () => {
  it('masks local and international phone numbers', () => {
    expect(redactContactDetails('call 0412 345 678 or +61 2 9876 5432'))
      .toBe('call [phone] or [phone]')
  })

  it('masks phone numbers with parentheses and hyphens', () => {
    expect(redactContactDetails('(02) 9876-5432')).toBe('[phone]')
  })

  it('masks numbers at the eight-digit threshold', () => {
    expect(redactContactDetails('1234567, 12345678, 1234-5678'))
      .toBe('1234567, [phone], [phone]')
  })

  it('masks emails before phone-like digits in their local part', () => {
    expect(redactContactDetails('email jo@ex.com.au or Jo.12345678+paint@EXAMPLE.com'))
      .toBe('email [email] or [email]')
  })

  it('preserves quote numbers, amounts and work measurements', () => {
    const text = 'Quote #1234, $1,200, 2.5 days, 3 coats, 45 sqm'
    expect(redactContactDetails(text)).toBe(text)
  })

  it('preserves line breaks and punctuation around contact details', () => {
    expect(redactContactDetails('Call (02) 9876-5432.\nEmail: jo@ex.com.au!'))
      .toBe('Call [phone].\nEmail: [email]!')
  })

  it('accepts empty text and already redacted text', () => {
    expect(redactContactDetails('')).toBe('')
    expect(redactContactDetails('[phone] [email]')).toBe('[phone] [email]')
  })
})
