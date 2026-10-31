import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import {
  createAiDraftMaterialItem,
  planAiDraftApplication,
  reallocateAiLinePrices,
  type AiDraftSelection,
} from '@/components/quote-form/ai-draft-apply'
import type { AreaFormulaSelections, JobberQuoteLineItemDraft } from '@/components/quote-form/types'
import type { AiQuoteDraft, AiQuoteDraftPublicLine, AiQuoteDraftWorkItem } from '@/lib/ai-quote/types'
import type { AreaRecord } from '@/lib/areas/types'
import type { QuoteLineTemplateRecord } from '@/lib/quote-line-templates/types'

const product: AiQuoteDraftWorkItem['product'] = {
  id: 'paint-1', name: 'Wall paint', manufacturer: 'Dulux', type: 'Paint', unit: '4L',
  marketPrice: '80.00', rrpPrice: '90.00', actualPrice: '50.00',
  colorCode: null, active: true, productCode: 'WALL',
}

function workItem(overrides: Partial<AiQuoteDraftWorkItem> = {}): AiQuoteDraftWorkItem {
  return {
    id: 'work-1', product, areaScope: 'interior', areaName: 'Bedroom 1',
    quantity: '2.50', workingDays: '3.25', labourPerDay: '2.00', rationale: 'Two coats', photoAdjustment: null,
    ...overrides,
  }
}

function publicLine(overrides: Partial<AiQuoteDraftPublicLine> = {}): AiQuoteDraftPublicLine {
  return {
    id: 'draft-line-1', kind: 'text', productServiceId: 'service-1',
    name: 'Paint walls', description: 'Prepare and paint walls', quantity: '2.00',
    priceSource: 'none', priceWeight: 0, catalogUnitPrice: null,
    taxable: false, areaName: 'Bedroom 1', rationale: 'Requested work',
    ...overrides,
  }
}

function draft(overrides: Partial<AiQuoteDraft> = {}): AiQuoteDraft {
  return {
    summary: 'Paint bedroom', findings: [], photoFindings: [], questions: [], warnings: [],
    areas: [{ scope: 'interior', name: 'Bedroom 1' }],
    publicLines: [publicLine()], workItems: [workItem()],
    formulaSelections: [{ scope: 'interior', selectedMin: 3, selectedMax: 5, rationale: 'Typical work' }],
    ...overrides,
  }
}

function selection(overrides: Partial<AiDraftSelection> = {}): AiDraftSelection {
  return {
    areas: new Set(['interior:Bedroom 1']), publicLines: new Set(['draft-line-1']),
    workItems: new Set(['work-1']), formulaScopes: new Set(['interior']), photoAdjustments: new Set(),
    ...overrides,
  }
}

function current() {
  const areaFormulaSelections: AreaFormulaSelections = {
    interior: { selectedMin: 1, selectedMax: 2 },
    exterior: { selectedMin: 2, selectedMax: 4 },
    roof: { selectedMin: 4, selectedMax: 5 },
  }
  return { materials: [], jobberQuoteLines: [], areaFormulaSelections, areas: [] as AreaRecord[] }
}

function formLine(overrides: Partial<JobberQuoteLineItemDraft> = {}): JobberQuoteLineItemDraft {
  return {
    id: 'manual-1', kind: 'line_item', name: 'Manual line', description: '',
    quantity: '1', unitPrice: '17.25', taxable: true, clientVisible: true,
    ...overrides,
  }
}

const bedroom: AreaRecord = {
  id: 'area-1', scope: 'interior', name: 'Bedroom 1', active: true, position: 0,
}

function template(names = ['Vivid white', 'EXCEPTIONS']): QuoteLineTemplateRecord {
  return {
    id: 'basic', name: 'Basic tam', active: true, createdAt: '', updatedAt: '',
    items: names.map((name, position) => ({
      id: `item-${position}`, templateId: 'basic', kind: 'text', name,
      description: position === 0 ? 'Saved template wording\n  Keep spacing' : null,
      quantity: null, unitPrice: null, taxable: true, clientVisible: true,
      linkedProductOrServiceId: position === 0 ? 'template-service' : null,
      position, createdAt: '', updatedAt: '',
    })),
  }
}

function generateLineIds() {
  let id = 0
  return () => `new-line-${++id}`
}

describe('planAiDraftApplication', () => {
  it.each([true, false])('applies photo-adjusted labour only when selected (%s)', include => {
    const item = workItem({ workingDays: '2', labourPerDay: '1', photoAdjustment: { workingDays: '3', labourPerDay: '3', reason: 'High ceiling', photoRefs: [7, 8] } })
    const result = planAiDraftApplication({ draft: draft({ workItems: [item] }), selection: selection({ photoAdjustments: new Set(include ? ['work-1'] : []) }), mode: 'append', current: current() }).build([bedroom])
    expect(result.materials[0]).toMatchObject({ workingDays: include ? '3' : '2', labourPerDay: include ? '3' : '1', memo: include ? 'AI: Two coats · Photo: High ceiling (photo 07, 08)' : 'AI: Two coats' })
    expect(item.workingDays).toBe('2')
  })
  it('reuses existing areas regardless of case and surrounding spaces', () => {
    const plan = planAiDraftApplication({
      draft: draft({ areas: [{ scope: 'interior', name: 'bedroom 1 ' }], workItems: [workItem({ areaName: ' BEDROOM 1 ' })] }),
      selection: selection({ areas: new Set(['interior:bedroom 1 ']) }), mode: 'append',
      current: { ...current(), areas: [bedroom] },
    })

    expect(plan.areasToCreate).toEqual([])
    expect(plan.build([bedroom]).materials[0]).toMatchObject({
      areaId: 'area-1', areaName: 'Bedroom 1', areaScope: 'interior',
    })
  })

  it('deduplicates missing areas and keeps identical names in different scopes distinct', () => {
    const plan = planAiDraftApplication({
      draft: draft({
        areas: [{ scope: 'interior', name: ' Bedroom 1 ' }, { scope: 'interior', name: 'bedroom 1' }, { scope: 'exterior', name: 'Bedroom 1' }],
      }),
      selection: selection({ areas: new Set(['interior: Bedroom 1 ', 'interior:bedroom 1', 'exterior:Bedroom 1']) }),
      mode: 'append', current: current(),
    })

    expect(plan.areasToCreate).toEqual([
      { scope: 'interior', name: 'Bedroom 1' }, { scope: 'exterior', name: 'Bedroom 1' },
    ])
  })

  it('creates an unselected missing area required by a selected work item', () => {
    const plan = planAiDraftApplication({
      draft: draft(), selection: selection({ areas: new Set() }), mode: 'append', current: current(),
    })

    expect(plan.areasToCreate).toEqual([{ scope: 'interior', name: 'Bedroom 1' }])
    expect(plan.build([bedroom]).materials[0].areaId).toBe('area-1')
  })

  it('only applies selected items and keeps existing materials', () => {
    const existing = createAiDraftMaterialItem(workItem(), bedroom)
    const plan = planAiDraftApplication({
      draft: draft({
        areas: [{ scope: 'roof', name: 'Roof' }],
        workItems: [workItem(), workItem({ id: 'unselected-work', areaScope: 'roof', areaName: 'Roof' })],
        publicLines: [publicLine(), publicLine({ id: 'unselected-line' })],
      }),
      selection: selection({ areas: new Set(), formulaScopes: new Set() }), mode: 'append',
      current: { ...current(), materials: [existing] }, generateId: generateLineIds(),
    })
    const result = plan.build([bedroom])

    expect(plan.areasToCreate).toEqual([{ scope: 'interior', name: 'Bedroom 1' }])
    expect(result.materials).toHaveLength(2)
    expect(result.materials[0]).toBe(existing)
    expect(result.jobberQuoteLines.map((line) => line.id)).toEqual(['new-line-1', 'new-line-2'])
    expect(result.appliedLineIds).toEqual(['new-line-1'])
    expect(result.areaFormulaSelections).toEqual(current().areaFormulaSelections)
  })

  it('appends public lines after existing lines with fresh injectable ids', () => {
    const existing = formLine()
    const plan = planAiDraftApplication({
      draft: draft(), selection: selection(), mode: 'append',
      current: { ...current(), jobberQuoteLines: [existing] }, generateId: generateLineIds(),
    })
    const result = plan.build([bedroom])

    expect(result.jobberQuoteLines.map((line) => line.id)).toEqual(['manual-1', 'new-line-1', 'new-line-2'])
    expect(result.jobberQuoteLines[0]).toBe(existing)
    expect(result.appliedLineIds).toEqual(['new-line-1'])
  })

  it('replaces only non-Jobber-linked lines in replace mode', () => {
    const linked = formLine({ id: 'linked-1', jobberLineItemId: 'jobber-line-1', optional: true })
    const plan = planAiDraftApplication({
      draft: draft(), selection: selection(), mode: 'replace',
      current: { ...current(), jobberQuoteLines: [formLine(), linked, formLine({ id: 'manual-2' })] },
      generateId: generateLineIds(),
    })
    const result = plan.build([bedroom])

    expect(result.jobberQuoteLines.map((line) => line.id)).toEqual(['linked-1', 'new-line-1', 'new-line-2'])
    expect(result.jobberQuoteLines[0]).toBe(linked)
  })

  it('copies catalog linking and tax flags while leaving initial unit prices zero', () => {
    const result = planAiDraftApplication({
      draft: draft({ publicLines: [publicLine(), publicLine({ id: 'text-1', name: 'Eaves', productServiceId: null })] }),
      selection: selection({ publicLines: new Set(['draft-line-1', 'text-1']) }), mode: 'append', current: current(),
    }).build([bedroom])

    expect(result.jobberQuoteLines[0]).toMatchObject({
      kind: 'text', name: 'Paint walls', description: 'Prepare and paint walls', quantity: '2.00',
      linkedProductOrServiceId: 'service-1', taxable: false, clientVisible: true, unitPrice: '0.00',
    })
    expect(result.jobberQuoteLines[1]).toMatchObject({ kind: 'text', taxable: false, clientVisible: true, unitPrice: '0.00' })
    expect(result.jobberQuoteLines[1].linkedProductOrServiceId).toBeUndefined()
    expect(result.jobberQuoteLines.every((line) => !line.jobberLineItemId)).toBe(true)
    expect(result.appliedLineIds).toEqual(result.jobberQuoteLines.slice(0, 2).map((line) => line.id))
  })

  it('appends AI scope, the first Basic template in supplied order and one priced Total last', () => {
    const result = planAiDraftApplication({
      draft: draft(), selection: selection(), mode: 'append', current: current(),
      templates: [{ ...template(['Other terms']), name: 'Other' }, template(), template(['Later basic terms'])],
    }).build([bedroom])

    expect(result.jobberQuoteLines.map(line => line.name)).toEqual(['Paint walls', 'Vivid white', 'EXCEPTIONS', 'Total'])
    expect(result.jobberQuoteLines[1]).toMatchObject({
      kind: 'text', description: 'Saved template wording\n  Keep spacing', quantity: '1', unitPrice: '0',
      taxable: false, clientVisible: true, linkedProductOrServiceId: 'template-service',
    })
    expect(result.jobberQuoteLines[2]).toMatchObject({ description: '', linkedProductOrServiceId: undefined })
    expect(result.jobberQuoteLines.at(-1)).toMatchObject({
      id: result.totalLineId, kind: 'line_item', name: 'Total', description: '', quantity: '1',
      unitPrice: '0.00', taxable: true, clientVisible: true,
    })
    expect(result).toMatchObject({ basicTemplateApplied: true, removedDuplicateCount: 0 })
    expect(result.appliedLineIds).toEqual([result.jobberQuoteLines[0].id])
  })

  it('keeps the saved template version instead of an AI duplicate and preserves applied id order', () => {
    const lines = [publicLine({ id: 'terms', name: ' vivid  WHITE ' }), publicLine(),
      publicLine({ id: 'duplicate', name: ' paint\tWALLS ' }), publicLine({ id: 'eaves', name: 'Eaves' })]
    const result = planAiDraftApplication({
      draft: draft({ publicLines: lines }), selection: selection({ publicLines: new Set(lines.map(line => line.id)) }),
      mode: 'append', current: current(), templates: [template()], generateId: generateLineIds(),
    }).build([bedroom])

    expect(result.jobberQuoteLines.map(line => line.name)).toEqual(['Paint walls', 'Eaves', 'Vivid white', 'EXCEPTIONS', 'Total'])
    expect(result.jobberQuoteLines[2].description).toBe('Saved template wording\n  Keep spacing')
    expect(result.appliedLineIds).toEqual(['new-line-1', 'new-line-2'])
    expect(result.removedDuplicateCount).toBe(2)
  })

  it('reuses and moves a kept Jobber-linked Total line to the end without losing its identities', () => {
    const total = formLine({ id: 'existing-total', name: ' TOTAL ex GST ', jobberLineItemId: 'jobber-total' })
    const linked = formLine({ id: 'linked-scope', kind: 'text', name: 'Existing scope', jobberLineItemId: 'jobber-scope' })
    const result = planAiDraftApplication({
      draft: draft(), selection: selection(), mode: 'replace',
      current: { ...current(), jobberQuoteLines: [total, formLine(), linked] }, templates: [template()],
    }).build([bedroom])

    expect(result.jobberQuoteLines.map(line => line.name)).toEqual(['Existing scope', 'Paint walls', 'Vivid white', 'EXCEPTIONS', ' TOTAL ex GST '])
    expect(result.jobberQuoteLines.at(-1)).toBe(total)
    expect(result.totalLineId).toBe('existing-total')
  })

  it('drops later unlinked current duplicates but preserves every Jobber-linked duplicate', () => {
    const first = formLine({ name: ' Existing  scope ' })
    const linked = formLine({ id: 'linked', name: 'existing scope', jobberLineItemId: 'jobber-scope' })
    const result = planAiDraftApplication({
      draft: draft({ publicLines: [publicLine({ name: 'existing scope' })] }), selection: selection(), mode: 'append',
      current: { ...current(), jobberQuoteLines: [first, formLine({ id: 'duplicate', name: 'existing\tscope' }), linked] },
      templates: [template(['EXISTING SCOPE'])],
    }).build([bedroom])

    expect(result.jobberQuoteLines.slice(0, 2)).toEqual([first, linked])
    expect(result.jobberQuoteLines.map(line => line.id)).toEqual(['manual-1', 'linked', result.totalLineId])
    expect(result.removedDuplicateCount).toBe(3)
    expect(result.appliedLineIds).toEqual([])
  })

  it.each([
    { label: 'omitted', templates: undefined }, { label: 'empty', templates: [] },
    { label: 'unmatched', templates: [{ ...template(), name: 'Other' }] },
  ])('adds Total safely without a Basic template: $label', ({ templates }) => {
    const result = planAiDraftApplication({
      draft: draft(), selection: selection(), mode: 'append', current: current(), templates,
    }).build([bedroom])

    expect(result.jobberQuoteLines.map(line => line.name)).toEqual(['Paint walls', 'Total'])
    expect(result.basicTemplateApplied).toBe(false)
  })

  it('keeps an optional Total separate from the main Total line', () => {
    const optional = formLine({ name: 'Total (option)', optional: true, jobberLineItemId: 'jobber-option' })
    const result = planAiDraftApplication({
      draft: draft(), selection: selection(), mode: 'append', current: { ...current(), jobberQuoteLines: [optional] },
    }).build([bedroom])

    expect(result.jobberQuoteLines[0]).toBe(optional)
    expect(result.jobberQuoteLines.at(-1)?.name).toBe('Total')
    expect(result.totalLineId).not.toBe(optional.id)
  })

  it('generates fresh public and material identities each time a draft is applied', () => {
    const plan = planAiDraftApplication({ draft: draft(), selection: selection(), mode: 'append', current: current() })
    const first = plan.build([bedroom])
    const second = plan.build([bedroom])

    expect(first.jobberQuoteLines[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(first.jobberQuoteLines[0].id).not.toBe(second.jobberQuoteLines[0].id)
    expect(first.jobberQuoteLines[0].id).not.toBe('draft-line-1')
    expect(first.materials[0].id).not.toBe(second.materials[0].id)
    expect(first.materials[0].logicalKey).toBe(first.materials[0].id)
  })

  it('overrides formula selections only for selected scopes without mutating the current state', () => {
    const state = current()
    const result = planAiDraftApplication({
      draft: draft({ formulaSelections: [
        { scope: 'interior', selectedMin: 3, selectedMax: 5, rationale: '' },
        { scope: 'roof', selectedMin: 1, selectedMax: 2, rationale: '' },
      ] }),
      selection: selection(), mode: 'append', current: state,
    }).build([bedroom])

    expect(result.areaFormulaSelections).toEqual({
      interior: { selectedMin: 3, selectedMax: 5 },
      exterior: { selectedMin: 2, selectedMax: 4 }, roof: { selectedMin: 4, selectedMax: 5 },
    })
    expect(state).toEqual(current())
  })
})

describe('createAiDraftMaterialItem', () => {
  it('uses product snapshots with AI quantity, labour, canonical area and rationale memo', () => {
    const item = createAiDraftMaterialItem(workItem(), bedroom)

    expect(item).toMatchObject({
      productId: 'paint-1', name: 'Wall paint', manufacturer: 'Dulux', type: 'Paint', unit: '4L',
      productCode: 'WALL', marketPrice: '90.00', actualPrice: '90.00', isCustom: false,
      timberRole: 'none', quantity: '2.50', workingDays: '3.25', labourPerDay: '2.00',
      areaId: 'area-1', areaName: 'Bedroom 1', areaScope: 'interior', memo: 'AI: Two coats',
    })
  })

  it('limits the entire memo including its prefix to 500 characters and supports area without id', () => {
    const item = createAiDraftMaterialItem(workItem({ rationale: 'a'.repeat(600) }), { scope: 'roof', name: 'Roof' })

    expect(item.memo).toBe(`AI: ${'a'.repeat(496)}`)
    expect(item.areaId).toBeUndefined()
    expect(item.areaName).toBe('Roof')
    expect(item.areaScope).toBe('roof')
  })
})

describe('reallocateAiLinePrices', () => {
  it('puts the whole allocatable ex-GST amount on Total and keeps AI text at zero on recalculation', () => {
    const built = planAiDraftApplication({
      draft: draft(), selection: selection(), mode: 'append', templates: [template()],
      current: { ...current(), jobberQuoteLines: [formLine({ unitPrice: '300.00' }), formLine({ id: 'option', name: 'Extra option', optional: true, unitPrice: '50.00' })] },
    }).build([bedroom])
    const metadata = {
      [built.appliedLineIds[0]]: { priceSource: 'none' as const, priceWeight: 0, catalogUnitPrice: null },
      [built.totalLineId]: { priceSource: 'allocated' as const, priceWeight: 100, catalogUnitPrice: null },
    }
    const allocated = reallocateAiLinePrices(built.jobberQuoteLines, metadata, '1100')
    expect(allocated.lines.map(line => line.unitPrice)).toEqual(['300.00', '50.00', '0.00', '0', '0', '700.00'])
    expect(allocated.result.status).toBe('allocated')
    expect(reallocateAiLinePrices(allocated.lines, metadata, '2200').lines.at(-1)?.unitPrice).toBe('1700.00')
  })
  it('only reallocates AI lines, preserving manual prices and ignoring stale metadata', () => {
    const manual = formLine({ unitPrice: '900.00' })
    const lines = [manual, formLine({ id: 'ai-catalog', quantity: '2' }), formLine({ id: 'ai-weighted' }), formLine({ id: 'ai-text', kind: 'text' })]
    const original = structuredClone(lines)
    const result = reallocateAiLinePrices(lines, {
      'ai-catalog': { priceSource: 'catalog', catalogUnitPrice: '20.00', priceWeight: 0 },
      'ai-weighted': { priceSource: 'allocated', catalogUnitPrice: null, priceWeight: 2 },
      'ai-text': { priceSource: 'none', catalogUnitPrice: null, priceWeight: 100 },
      stale: { priceSource: 'catalog', catalogUnitPrice: '9999.00', priceWeight: 0 },
    }, new Decimal('1100.00'))

    expect(result.result).toEqual({
      status: 'allocated', unitPrices: { 'ai-catalog': '20.00', 'ai-weighted': '60.00', 'ai-text': '0.00' }, residual: '0.00',
    })
    expect(result.lines.map((line) => line.unitPrice)).toEqual(['900.00', '20.00', '60.00', '0.00'])
    expect(result.lines[0]).toBe(manual)
    expect(lines).toEqual(original)
  })

  it('reserves a manual line total and allocates only the remaining total by AI weights', () => {
    const manual = formLine({ unitPrice: '300.00' })
    const lines = [manual, formLine({ id: 'ai-a' }), formLine({ id: 'ai-b' })]
    const original = structuredClone(lines)
    const result = reallocateAiLinePrices(lines, {
      'ai-a': { priceSource: 'allocated', catalogUnitPrice: null, priceWeight: 60 },
      'ai-b': { priceSource: 'allocated', catalogUnitPrice: null, priceWeight: 40 },
    }, '1100')

    expect(result.result).toEqual({
      status: 'allocated', unitPrices: { 'ai-a': '420.00', 'ai-b': '280.00' }, residual: '0.00',
    })
    expect(result.lines.map((line) => line.unitPrice)).toEqual(['300.00', '420.00', '280.00'])
    expect(result.lines[0]).toBe(manual)
    expect(lines).toEqual(original)
  })

  it('sums manual unit prices times fractional quantities using decimal arithmetic', () => {
    const result = reallocateAiLinePrices([
      formLine({ unitPrice: '100.10', quantity: '2.5' }),
      formLine({ id: 'manual-2', unitPrice: '49.75', jobberLineItemId: 'jobber-line-2' }),
      formLine({ id: 'ai-a' }),
    ], {
      'ai-a': { priceSource: 'allocated', catalogUnitPrice: null, priceWeight: 1 },
    }, '1100')

    expect(result.lines.map((line) => line.unitPrice)).toEqual(['100.10', '49.75', '700.00'])
  })

  it.each([
    { kind: 'text' as const },
    { clientVisible: false },
    { optional: true, selected: true },
  ])('excludes manual text, hidden or optional lines from the reserved amount: %j', (overrides) => {
    const manual = formLine({ unitPrice: '300.00', ...overrides })
    const result = reallocateAiLinePrices([manual, formLine({ id: 'ai-a' })], {
      'ai-a': { priceSource: 'allocated', catalogUnitPrice: null, priceWeight: 1 },
    }, '1100')

    expect(result.lines[0]).toBe(manual)
    expect(result.lines[1].unitPrice).toBe('1000.00')
  })

  it.each([false, null, undefined])('reserves manual lines unless optional is explicitly true: %s', (optional) => {
    const result = reallocateAiLinePrices([
      formLine({ unitPrice: '300.00', optional }), formLine({ id: 'ai-a' }),
    ], {
      'ai-a': { priceSource: 'allocated', catalogUnitPrice: null, priceWeight: 1 },
    }, '1100')

    expect(result.lines[1].unitPrice).toBe('700.00')
  })

  it('returns allocation warnings without changing unrelated manual lines', () => {
    const manual = formLine()
    const result = reallocateAiLinePrices([manual, formLine({ id: 'ai-catalog' })], {
      'ai-catalog': { priceSource: 'catalog', catalogUnitPrice: '200.00', priceWeight: 0 },
    }, '110.00')

    expect(result.result).toEqual({ status: 'skipped', reason: 'catalog_exceeds_total', unitPrices: { 'ai-catalog': '200.00' } })
    expect(result.lines[0]).toBe(manual)
    expect(result.lines[1].unitPrice).toBe('200.00')
  })

  it('leaves every line untouched when no line id is present in AI metadata', () => {
    const manual = formLine()
    const result = reallocateAiLinePrices([manual], {}, '110.00')

    expect(result.lines).toEqual([manual])
    expect(result.lines[0]).toBe(manual)
    expect(result.result).toEqual({ status: 'skipped', reason: 'no_weights', unitPrices: {} })
  })
})
