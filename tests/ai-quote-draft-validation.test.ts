import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { aiDraftModelOutputSchema, type AiDraftModelOutput } from '@/lib/ai-quote/draft-schema'
import { validateAiQuoteDraft } from '@/lib/ai-quote/draft-validation'
import type { DraftCatalog } from '@/lib/ai-quote/data'

const catalog: DraftCatalog = {
  productServices: [{ id: 'service', name: 'Painting', category: null, unitPrice: '321.09', taxable: false, description: null }],
  products: [{ id: 'paint', name: 'Paint', manufacturer: 'Brand', type: 'Interior', unit: 'tin',
    marketPrice: '100.25', actualPrice: '61.13', colorCode: null, active: true }],
}
function raw(): AiDraftModelOutput {
  return {
    summary: 'Paint the bedroom', findings: [{ area: 'Bedroom', issue: 'Peeling', evidence: 'Memo', confidence: 'medium' }],
    questions: ['Confirm colour?'], areas: [{ scope: 'interior', name: 'Bedroom' }],
    publicLines: [{ kind: 'line_item', productServiceId: 'service', name: 'Bedroom painting', description: 'Prepare and paint',
      quantity: '1', priceSource: 'catalog', priceWeight: 50, areaName: 'Bedroom', rationale: 'Requested in memo.' }],
    optionalItems: [],
    workItems: [{ productId: 'paint', optionalKey: null, areaScope: 'interior', areaName: 'Bedroom', quantity: '2',
      workingDays: '1.5', labourPerDay: '2', rationale: 'Walls need preparation.', photoAdjustment: null }],
    formulaSelections: [{ scope: 'interior', selectedMin: 1, selectedMax: 5, rationale: 'Suitable range.' }],
  }
}
function validate(input = raw(), data = catalog) {
  let id = 0
  return validateAiQuoteDraft(input, data, () => `id-${++id}`)
}

describe('draft output schema', () => {
  it('requires optional items and nullable work-item keys without accepting model prices', () => {
    const input = { ...raw(), optionalItems: [{ key: 'doors', name: 'Doors', description: 'Paint doors',
      areaName: null, rationale: 'Optional in memo.', unitPrice: '500', total: '1000' }] }
    const parsed = aiDraftModelOutputSchema.parse(input)
    expect(parsed.optionalItems).toEqual([{ key: 'doors', name: 'Doors', description: 'Paint doors',
      areaName: null, rationale: 'Optional in memo.' }])
    expect(aiDraftModelOutputSchema.safeParse({ ...input, optionalItems: undefined }).success).toBe(false)
    expect(aiDraftModelOutputSchema.safeParse({ ...input, workItems: [{ ...input.workItems[0], optionalKey: undefined }] }).success).toBe(false)
    expect(aiDraftModelOutputSchema.safeParse({ ...input, workItems: [{ ...input.workItems[0], optionalKey: 'doors' }] }).success).toBe(true)
  })

  it('requires a nullable photo adjustment with structured evidence on each work item', () => {
    const input = raw()
    input.workItems[0].photoAdjustment = { workingDays: '3', labourPerDay: '3', reason: 'High walls', photoRefs: [1] }
    expect(aiDraftModelOutputSchema.safeParse(input).success).toBe(true)
    expect(aiDraftModelOutputSchema.safeParse({ ...input, workItems: [{ ...input.workItems[0], photoAdjustment: undefined }] }).success).toBe(false)
    expect(aiDraftModelOutputSchema.safeParse({ ...input, workItems: [{ ...input.workItems[0], photoAdjustment: { photoRefs: ['1'] } }] }).success).toBe(false)
  })

  it('defaults photo findings and work adjustments for memo-only drafts', () => {
    const draft = validate()
    expect(draft.photoFindings).toEqual([])
    expect(draft.workItems[0].photoAdjustment).toBeNull()
  })

  it('accepts the structured shape without bounds and omits server fields', () => {
    const input = raw()
    input.publicLines[0].quantity = '-100'
    input.publicLines[0].name = 'x'.repeat(300)
    expect(aiDraftModelOutputSchema.safeParse(input).success).toBe(true)
    const schema = JSON.stringify(z.toJSONSchema(aiDraftModelOutputSchema))
    expect(schema).not.toMatch(/minLength|maxLength|minimum|maximum|pattern/)
    expect(schema).not.toContain('catalogUnitPrice')
    expect(aiDraftModelOutputSchema.safeParse({ ...input, workItems: null }).success).toBe(false)
  })
})

describe('draft server validation', () => {
  function optional(key = 'doors', name = 'Doors'): AiDraftModelOutput['optionalItems'][number] {
    return { key, name, description: 'Paint doors', areaName: 'Bedroom', rationale: 'Optional in memo.' }
  }

  it('links optional calculations to generated IDs and leaves main calculations separate', () => {
    const input = raw()
    input.optionalItems = [optional()]
    input.workItems.push({ ...input.workItems[0], optionalKey: 'doors' })
    const result = validate(input)
    expect(result.optionalItems).toEqual([{ id: expect.any(String), name: 'Doors', description: 'Paint doors',
      areaName: 'Bedroom', rationale: 'Optional in memo.' }])
    expect(result.workItems.map(item => item.optionalItemId)).toEqual([null, result.optionalItems[0].id])
    expect(result.warnings).toEqual([])
  })

  it('caps optional items at ten and removes work for an item beyond the cap', () => {
    const input = raw()
    input.optionalItems = Array.from({ length: 11 }, (_, i) => optional(`option-${i}`, `Option ${i}`))
    input.workItems = input.optionalItems.map(item => ({ ...input.workItems[0], optionalKey: item.key }))
    const result = validate(input)
    expect(result.optionalItems).toHaveLength(10)
    expect(result.workItems).toHaveLength(10)
    expect(result.warnings).toEqual(['Optional items limited to 10.', 'A work item for an unknown optional item was removed.'])
  })

  it('cleans optional text, trims names and areas, and limits field lengths', () => {
    const input = raw()
    input.optionalItems = [{ ...optional('do\u0000ors', `  ${'n'.repeat(201)}  `),
      description: `Prepare:\r\n- sand\tthen paint\u0007${'d'.repeat(4000)}`,
      areaName: `  ${'a'.repeat(81)}  `, rationale: 'Extra\u0000 in memo.' },
    { ...optional('garage', 'Garage'), areaName: '  ' }]
    input.workItems[0].optionalKey = 'do\u0000ors'
    const result = validate(input)
    expect(result.optionalItems[0]).toEqual({ id: expect.any(String), name: 'n'.repeat(200),
      description: `Prepare:\n- sand\tthen paint${'d'.repeat(4000)}`.slice(0, 4000),
      areaName: 'a'.repeat(80), rationale: 'Extra in memo.' })
    expect(result.optionalItems[1].areaName).toBeNull()
    expect(result.workItems[0].optionalItemId).toBe(result.optionalItems[0].id)
  })

  it.each(['  ', ' Total ', 'TOTAL ex GST', 'Total: painting'])('removes invalid optional name %j with a warning', name => {
    const input = raw()
    input.optionalItems = [optional('invalid', name), optional('valid', 'Totally painted')]
    input.workItems[0].optionalKey = 'valid'
    const result = validate(input)
    expect(result.optionalItems.map(item => item.name)).toEqual(['Totally painted'])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/optional item.*removed/i)
  })

  it('keeps the first duplicate key or name ignoring name case and whitespace', () => {
    const input = raw()
    input.optionalItems = [optional('first', 'Garage doors'), optional('first', 'Ceilings'),
      optional('duplicate-name', ' GARAGE\t DOORS '), optional('third', 'Fences')]
    input.workItems = ['first', 'duplicate-name', 'third'].map(optionalKey => ({ ...input.workItems[0], optionalKey }))
    const result = validate(input)
    expect(result.optionalItems.map(item => item.name)).toEqual(['Garage doors', 'Fences'])
    expect(result.workItems.map(item => item.optionalItemId)).toEqual(result.optionalItems.map(item => item.id))
    expect(result.warnings).toContain('A work item for an unknown optional item was removed.')
  })

  it('removes unknown optional work before it can add areas or enter main calculations', () => {
    const input = raw()
    input.workItems.push({ ...input.workItems[0], optionalKey: 'unknown', areaName: 'Unknown area' })
    const result = validate(input)
    expect(result.workItems).toHaveLength(1)
    expect(result.workItems[0].optionalItemId).toBeNull()
    expect(result.areas).toEqual([{ scope: 'interior', name: 'Bedroom' }])
    expect(result.warnings).toEqual(['A work item for an unknown optional item was removed.'])
  })

  it('warns when optional calculations are absent or removed by product validation', () => {
    const input = raw()
    input.optionalItems = [optional(), optional('garage', 'Garage')]
    input.workItems.push({ ...input.workItems[0], optionalKey: 'garage', productId: 'missing' })
    const result = validate(input)
    expect(result.warnings).toEqual(['A work item with an unavailable product was removed.',
      'Optional item "Doors" has no calculation. Enter its price manually.',
      'Optional item "Garage" has no calculation. Enter its price manually.'])
  })

  it('applies quantity validation, labour clamping, photo caps and area creation to optional work', () => {
    const input = raw()
    input.areas = []
    input.optionalItems = [optional()]
    input.workItems = [{ ...input.workItems[0], optionalKey: 'doors', areaName: ' Garage ', quantity: '2.345',
      workingDays: '2', labourPerDay: '1',
      photoAdjustment: { workingDays: '10', labourPerDay: '10', reason: 'Photo 1 access', photoRefs: [0, 1, 2] } },
    { ...input.workItems[0], optionalKey: 'doors', areaName: 'Garage', workingDays: '61', labourPerDay: '-1' },
    { ...input.workItems[0], optionalKey: 'doors', quantity: '0' }]
    const result = validateAiQuoteDraft(input, catalog, undefined, 1)
    expect(result.workItems).toHaveLength(2)
    expect(result.workItems[0]).toMatchObject({ optionalItemId: result.optionalItems[0].id, quantity: '2.35',
      areaName: 'Garage', photoAdjustment: { workingDays: '3', labourPerDay: '3', photoRefs: [1] } })
    expect(result.workItems[1]).toMatchObject({ workingDays: '60', labourPerDay: '0' })
    expect(result.areas).toEqual([{ scope: 'interior', name: 'Garage' }])
  })

  it('removes duplicate optional Text lines including linked catalog names', () => {
    const input = raw()
    input.optionalItems = [optional('doors', 'Garage doors'), optional('painting', 'Painting')]
    input.workItems = []
    input.publicLines.push({ ...input.publicLines[0], kind: 'text', productServiceId: null, name: ' GARAGE\t DOORS ' },
      { ...input.publicLines[0], kind: 'text', productServiceId: null, name: 'Main walls' })
    expect(validate(input).publicLines.map(line => line.name)).toEqual(['Main walls'])
  })

  it('caps photo increases while preserving the base values and filtering photo references', () => {
    const input = raw()
    input.workItems[0] = { ...input.workItems[0], workingDays: '2', labourPerDay: '1',
      photoAdjustment: { workingDays: '4', labourPerDay: '5', reason: 'High walls\u0000', photoRefs: [0, 1, 2, 3, 31, 1.5] } }
    expect(validateAiQuoteDraft(input, catalog, undefined, 2).workItems[0]).toMatchObject({
      workingDays: '2', labourPerDay: '1',
      photoAdjustment: { workingDays: '3', labourPerDay: '3', reason: 'High walls', photoRefs: [1, 2] },
    })
  })

  it.each([
    ['2', '1', 2], ['1', '0', 2], ['4', '5', 0], ['bad', 'NaN', 2],
  ])('drops ineffective or unavailable photo adjustments (%s days, %s people, %s photos)', (days, labour, photoCount) => {
    const input = raw()
    input.workItems[0] = { ...input.workItems[0], workingDays: '2', labourPerDay: '1',
      photoAdjustment: { workingDays: days, labourPerDay: labour, reason: 'Access', photoRefs: [1] } }
    expect(validateAiQuoteDraft(input, catalog, undefined, photoCount).workItems[0].photoAdjustment).toBeNull()
  })

  it.each([
    ['2', '1', '1', '2', '2', '2'],
    ['2', '1', '3', '0', '3', '1'],
    ['50', '11', '100', '100', '60', '12'],
    ['1.01', '1', '10', '10', '1.51', '3'],
    ['0', '0', '10', '10', '0', '2'],
  ])('keeps increases within all limits for base %s days and %s people', (baseDays, baseLabour, days, labour, expectedDays, expectedLabour) => {
    const input = raw()
    input.workItems[0] = { ...input.workItems[0], workingDays: baseDays, labourPerDay: baseLabour,
      photoAdjustment: { workingDays: days, labourPerDay: labour, reason: 'Access', photoRefs: [1] } }
    expect(validateAiQuoteDraft(input, catalog, undefined, 1).workItems[0].photoAdjustment)
      .toMatchObject({ workingDays: expectedDays, labourPerDay: expectedLabour })
  })

  it('nulls unknown productServiceId and keeps text pricing with a warning', () => {
    const input = raw()
    input.publicLines[0].productServiceId = 'unknown'
    const result = validate(input)
    expect(result.publicLines[0]).toMatchObject({ productServiceId: null, priceSource: 'none', catalogUnitPrice: null })
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('drops work items whose productId is missing or inactive with a warning', () => {
    const input = raw()
    input.workItems.push({ ...input.workItems[0], productId: 'missing' }, { ...input.workItems[0], productId: 'inactive' })
    const result = validate(input, { ...catalog, products: [...catalog.products, { ...catalog.products[0], id: 'inactive', active: false }] })
    expect(result.workItems).toHaveLength(1)
    expect(result.warnings).toHaveLength(2)
  })

  it('uses the linked service stored name and description verbatim', () => {
    const service = { ...catalog.productServices[0], name: 'Interior  Painting ', description: 'Walls:\n  - two coats\r\n\nCeilings\tone coat' }
    const line = validate(raw(), { ...catalog, productServices: [service] }).publicLines[0]
    expect(line).toMatchObject({ name: 'Interior  Painting ', description: 'Walls:\n  - two coats\r\n\nCeilings\tone coat' })
  })

  it('keeps AI line breaks on unlinked lines and strips other control characters', () => {
    const input = raw()
    input.publicLines[0] = { ...input.publicLines[0], productServiceId: null, priceSource: 'allocated',
      description: 'Prepare:\r\n- fill cracks\u0007\n\n- sand\tsmooth' }
    expect(validate(input).publicLines[0].description).toBe('Prepare:\n- fill cracks\n\n- sand\tsmooth')
  })

  it('keeps the AI description when the linked service has none', () => {
    expect(validate().publicLines[0]).toMatchObject({ name: 'Painting', description: 'Prepare and paint' })
  })

  it('forces public lines to descriptive text without catalog prices or tax', () => {
    const input = raw()
    input.publicLines.push({ ...input.publicLines[0], productServiceId: null, priceSource: 'allocated' })
    const result = validate(input, { ...catalog, productServices: [{ ...catalog.productServices[0], taxable: true }] })
    expect(result.publicLines).toHaveLength(2)
    for (const line of result.publicLines) {
      expect(line).toMatchObject({ kind: 'text', priceSource: 'none', priceWeight: 0, catalogUnitPrice: null, taxable: false })
    }
  })

  it('silently drops Total lines including linked services named Total', () => {
    const input = raw()
    input.publicLines.push(...[' Total ', 'TOTAL ex GST', 'Total: painting'].map(name => ({ ...input.publicLines[0], productServiceId: null, name })))
    input.publicLines.push({ ...input.publicLines[0], productServiceId: 'total-service' })
    input.publicLines.push({ ...input.publicLines[0], productServiceId: null, name: 'Totally painted' })
    const result = validate(input, { ...catalog, productServices: [...catalog.productServices,
      { ...catalog.productServices[0], id: 'total-service', name: 'Total' }] })
    expect(result.publicLines.map(line => line.name)).toEqual(['Painting', 'Totally painted'])
    expect(result.warnings).toEqual([])
  })

  it('attaches the full ProductRecord to each work item', () => {
    expect(validate().workItems[0].product).toEqual(catalog.products[0])
    expect(validateAiQuoteDraft(raw(), catalog).workItems[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('truncates name to 200 and description to 4000 characters', () => {
    const input = raw()
    input.publicLines[0].productServiceId = null
    input.publicLines[0].name = 'n'.repeat(201)
    input.publicLines[0].description = 'd'.repeat(4001)
    expect(validate(input).publicLines[0]).toMatchObject({ name: 'n'.repeat(200), description: 'd'.repeat(4000) })
  })

  it('drops items with quantity <= 0 or > 1000', () => {
    const input = raw()
    for (const quantity of ['0', '-1', '1000.001', 'NaN', 'Infinity', 'bad', '0.001']) {
      input.publicLines.push({ ...input.publicLines[0], quantity })
      input.workItems.push({ ...input.workItems[0], quantity })
    }
    const result = validate(input)
    expect(result.publicLines).toHaveLength(1)
    expect(result.workItems).toHaveLength(1)
    expect(result.warnings).toHaveLength(14)
  })

  it('clamps workingDays to 0..60 and labourPerDay to 0..12 with warnings', () => {
    const input = raw()
    input.workItems[0].workingDays = '61'
    input.workItems[0].labourPerDay = '-1'
    input.workItems.push({ ...input.workItems[0], workingDays: '-2', labourPerDay: '13' })
    const result = validate(input)
    expect(result.workItems.map(item => [item.workingDays, item.labourPerDay])).toEqual([['60', '0'], ['0', '12']])
    expect(result.warnings).toHaveLength(4)
  })

  it('rounds decimals to 2 places', () => {
    const input = raw()
    input.publicLines[0].quantity = '1.235'
    input.workItems[0] = { ...input.workItems[0], quantity: '2.345', workingDays: '1.005', labourPerDay: '2.335' }
    const result = validate(input)
    expect(result.publicLines[0].quantity).toBe('1.24')
    expect(result.workItems[0]).toMatchObject({ quantity: '2.35', workingDays: '1.01', labourPerDay: '2.34' })
  })

  it('zeros priceWeight regardless of model kind or weight', () => {
    const input = raw()
    input.publicLines[0].priceWeight = 110
    input.publicLines.push({ ...input.publicLines[0], priceWeight: -1 }, { ...input.publicLines[0], kind: 'text' })
    const result = validate(input)
    expect(result.publicLines.map(line => line.priceWeight)).toEqual([0, 0, 0])
    expect(result.publicLines[2]).toMatchObject({ priceSource: 'none', catalogUnitPrice: null })
  })

  it('dedupes areas by scope and case-insensitive trimmed name and trims to 80 chars', () => {
    const input = raw()
    input.areas.push({ scope: 'interior', name: ' bedroom ' }, { scope: 'exterior', name: 'Bedroom' },
      { scope: 'roof', name: 'x'.repeat(81) }, { scope: 'roof', name: '  ' })
    expect(validate(input).areas).toEqual([{ scope: 'interior', name: 'Bedroom' },
      { scope: 'exterior', name: 'Bedroom' }, { scope: 'roof', name: 'x'.repeat(80) }])
  })

  it('drops formula selections outside 1..5', () => {
    const input = raw()
    input.formulaSelections.push({ scope: 'roof', selectedMin: 0, selectedMax: 6, rationale: '' },
      { scope: 'exterior', selectedMin: 1.5, selectedMax: 2, rationale: '' })
    expect(validate(input).formulaSelections).toEqual([input.formulaSelections[0]])
  })

  it('caps list sizes and records warnings', () => {
    const input = raw()
    input.findings = Array.from({ length: 31 }, () => input.findings[0])
    input.questions = Array.from({ length: 21 }, () => 'Question?')
    input.areas = Array.from({ length: 41 }, (_, i) => ({ scope: 'interior', name: i ? `Area ${i}` : 'Bedroom' }))
    input.publicLines = Array.from({ length: 61 }, () => input.publicLines[0])
    input.workItems = Array.from({ length: 151 }, () => input.workItems[0])
    const result = validate(input)
    expect([result.findings.length, result.questions.length, result.areas.length, result.publicLines.length, result.workItems.length])
      .toEqual([30, 20, 40, 60, 150])
    expect(result.warnings).toHaveLength(5)
  })

  it('strips control characters from all strings', () => {
    const input = JSON.parse(JSON.stringify(raw()).replaceAll('Bedroom', 'Bed\\u0000room')) as AiDraftModelOutput
    input.summary += '\u007f'
    input.questions[0] += '\u0085'
    input.publicLines[0].productServiceId = 'ser\u0000vice'
    input.workItems[0].productId = 'pa\u0000int'
    const result = validate(input)
    expect(JSON.stringify(result)).not.toMatch(/\\u0000|\\u007f|\u0085/)
    expect(result.workItems).toHaveLength(1)
    expect(result.publicLines[0].productServiceId).toBe('service')
  })

  it('adds an area for every work item area missing from areas', () => {
    const input = raw()
    input.areas = []
    input.workItems[0].areaName = '  Bedroom  '
    expect(validate(input).areas).toEqual([{ scope: 'interior', name: 'Bedroom' }])
  })

  it('prioritizes work-item areas over unreferenced declared areas at the cap', () => {
    const input = raw()
    input.areas = Array.from({ length: 40 }, (_, i) => ({ scope: 'roof', name: `Roof ${i}` }))
    const result = validate(input)
    expect(result.areas).toHaveLength(40)
    expect(result.areas[0]).toEqual({ scope: 'interior', name: 'Bedroom' })
    expect(result.areas[1]).toEqual({ scope: 'roof', name: 'Roof 0' })
    expect(result.workItems).toHaveLength(1)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('drops work items only when referenced areas alone exceed 40', () => {
    const input = raw()
    input.areas = []
    input.workItems = Array.from({ length: 41 }, (_, i) => ({ ...input.workItems[0], areaName: `Area ${i}` }))
    const result = validate(input)
    expect(result.areas).toHaveLength(40)
    expect(result.areas[0].name).toBe('Area 0')
    expect(result.areas[39].name).toBe('Area 39')
    expect(result.workItems).toHaveLength(40)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('dedupes declared areas before applying the final area cap', () => {
    const input = raw()
    input.workItems = []
    input.areas = [...Array.from({ length: 40 }, () => ({ scope: 'interior' as const, name: 'Bedroom' })),
      { scope: 'exterior', name: 'Garage' }]
    expect(validate(input).areas).toEqual([{ scope: 'interior', name: 'Bedroom' }, { scope: 'exterior', name: 'Garage' }])
  })

  it('drops blank names and areas and handles malformed labour decimals without throwing', () => {
    const input = raw()
    input.publicLines.push({ ...input.publicLines[0], name: '  ' })
    input.workItems.push({ ...input.workItems[0], areaName: '' })
    input.workItems[0].workingDays = 'bad'
    input.workItems[0].labourPerDay = 'Infinity'
    const result = validate(input)
    expect(result.publicLines).toHaveLength(1)
    expect(result.workItems).toHaveLength(1)
    expect(result.workItems[0]).toMatchObject({ workingDays: '0', labourPerDay: '0' })
  })
})
