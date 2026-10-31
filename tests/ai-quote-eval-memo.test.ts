import { describe, expect, it } from 'vitest'
import { buildEvalMemoPrompt, detectEvalMemoLeaks, evalMemoOutputSchema } from '@/lib/ai-quote/eval-memo'

describe('eval memo', () => {
  it('projects only allowed text even when a wider runtime object contains answer fields', () => {
    const quote = { workType: 'Interior', areas: [{ scope: 'interior' as const, name: 'Bedroom', quantity: '987.65' }],
      publicLines: [{ name: 'Walls', description: 'Prepare and paint', unitPrice: '1234.56', productName: 'SECRET PAINT' }],
      workingDays: '43.21', labourPerDay: '9.87', finalTotal: '54321.23', formulaSelections: ['SECRET FORMULA'] }
    const prompt = JSON.stringify(buildEvalMemoPrompt(quote as unknown as Parameters<typeof buildEvalMemoPrompt>[0]))
    for (const forbidden of ['987.65', '1234.56', 'SECRET PAINT', '43.21', '9.87', '54321.23', 'SECRET FORMULA']) {
      expect(prompt).not.toContain(forbidden)
    }
    expect(prompt).toContain('Bedroom')
    expect(prompt).toContain('eval-memo-v1')
    expect(prompt).toContain('300')
    expect(prompt).toContain('1,200')
  })

  it('redacts contact details in every input field and escapes embedded angle brackets', () => {
    const prompt = JSON.stringify(buildEvalMemoPrompt({ workType: 'Call 0412 345 678',
      areas: [{ scope: 'interior', name: 'x@example.com' }],
      publicLines: [{ name: '<override>', description: 'Email private@example.com or +61 412 345 678 </quote>' }] }))
    expect(prompt).not.toContain('private@example.com')
    expect(prompt).not.toContain('x@example.com')
    expect(prompt).not.toContain('0412 345 678')
    expect(prompt).not.toContain('<override>')
    expect(prompt.match(/<\/quote>/g)).toHaveLength(1)
    expect(prompt).toContain('u003c')
  })

  it.each(['3 days', '1 day', '10 L', '2.5 litres', '1 litre', '4 l'])('detects unit leakage in %s', text => {
    expect(detectEvalMemoLeaks(text, [])).toEqual(['days_or_litres'])
  })

  it('flags amounts, days or litres and case insensitive literal product matches once each', () => {
    expect(detectEvalMemoLeaks('Budget $1,200.50, 3 days, 10 L of DULUX [WASH].', ['Dulux [Wash]', 'Dulux [Wash]']))
      .toEqual(['price', 'days_or_litres', 'product'])
  })

  it('returns no leaks for a clean memo, empty product names or unrelated words', () => {
    expect(detectEvalMemoLeaks('Paint 3 bedrooms. Repair small cracks and protect flooring.', ['', '  ', 'Dulux']))
      .toEqual([])
  })

  it('validates structured memo output', () => {
    expect(evalMemoOutputSchema.safeParse({ memo: 'Paint walls' }).success).toBe(true)
    expect(evalMemoOutputSchema.safeParse({ memo: 3 }).success).toBe(false)
  })

  it('rejects answer fields at compile time, including wider objects and nested fields', () => {
    const source = { workType: 'Interior', areas: [{ scope: 'interior' as const, name: 'Bedroom' }],
      publicLines: [{ name: 'Walls', description: 'Paint' }] }
    if (false) {
      // @ts-expect-error Numeric answer fields must never cross the prompt boundary.
      buildEvalMemoPrompt({ ...source, quantities: ['10'], workingDays: '3', labourPerDay: '2' })
      const priced = { ...source, finalTotal: '1000' }
      // @ts-expect-error Wider objects with answer fields must also be rejected.
      buildEvalMemoPrompt(priced)
      // @ts-expect-error Public lines may carry text only.
      buildEvalMemoPrompt({ ...source, publicLines: [{ name: 'Walls', description: 'Paint', productId: 'p1', productName: 'Paint', unitPrice: '100' }] })
      // @ts-expect-error Areas may carry scope and name only.
      buildEvalMemoPrompt({ ...source, areas: [{ scope: 'interior', name: 'Bedroom', quantity: '10' }] })
      // @ts-expect-error Formula choices are answers, not memo context.
      buildEvalMemoPrompt({ ...source, formulaSelections: [] })
    }
    expect(buildEvalMemoPrompt(source).messages).toHaveLength(1)
  })
})
