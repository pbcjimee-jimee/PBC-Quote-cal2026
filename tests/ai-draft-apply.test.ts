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

const product: AiQuoteDraftWorkItem['product'] = {
  id: 'paint-1', name: 'Wall paint', manufacturer: 'Dulux', type: 'Paint', unit: '4L',
  marketPrice: '80.00', rrpPrice: '90.00', actualPrice: '50.00',
  colorCode: null, active: true, productCode: 'WALL',
}

function workItem(overrides: Partial<AiQuoteDraftWorkItem> = {}): AiQuoteDraftWorkItem {
  return {
    id: 'work-1', product, areaScope: 'interior', areaName: 'Bedroom 1',
    quantity: '2.50', workingDays: '3.25', labourPerDay: '2.00', rationale: 'Two coats',
    ...overrides,
  }
}

function publicLine(overrides: Partial<AiQuoteDraftPublicLine> = {}): AiQuoteDraftPublicLine {
  return {
    id: 'draft-line-1', kind: 'line_item', productServiceId: 'service-1',
    name: 'Paint walls', description: 'Prepare and paint walls', quantity: '2.00',
    priceSource: 'catalog', priceWeight: 0, catalogUnitPrice: '50.00',
    taxable: false, areaName: 'Bedroom 1', rationale: 'Requested work',
    ...overrides,
  }
}

function draft(overrides: Partial<AiQuoteDraft> = {}): AiQuoteDraft {
  return {
    summary: 'Paint bedroom', findings: [], questions: [], warnings: [],
    areas: [{ scope: 'interior', name: 'Bedroom 1' }],
    publicLines: [publicLine()], workItems: [workItem()],
    formulaSelections: [{ scope: 'interior', selectedMin: 3, selectedMax: 5, rationale: 'Typical work' }],
    ...overrides,
  }
}

function selection(overrides: Partial<AiDraftSelection> = {}): AiDraftSelection {
  return {
    areas: new Set(['interior:Bedroom 1']), publicLines: new Set(['draft-line-1']),
    workItems: new Set(['work-1']), formulaScopes: new Set(['interior']),
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

describe('planAiDraftApplication', () => {
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
      current: { ...current(), materials: [existing] }, generateId: () => 'new-line',
    })
    const result = plan.build([bedroom])

    expect(plan.areasToCreate).toEqual([{ scope: 'interior', name: 'Bedroom 1' }])
    expect(result.materials).toHaveLength(2)
    expect(result.materials[0]).toBe(existing)
    expect(result.jobberQuoteLines.map((line) => line.id)).toEqual(['new-line'])
    expect(result.areaFormulaSelections).toEqual(current().areaFormulaSelections)
  })

  it('appends public lines after existing lines with fresh injectable ids', () => {
    const existing = formLine()
    const plan = planAiDraftApplication({
      draft: draft(), selection: selection(), mode: 'append',
      current: { ...current(), jobberQuoteLines: [existing] }, generateId: () => 'new-line',
    })
    const result = plan.build([bedroom])

    expect(result.jobberQuoteLines.map((line) => line.id)).toEqual(['manual-1', 'new-line'])
    expect(result.jobberQuoteLines[0]).toBe(existing)
    expect(result.appliedLineIds).toEqual(['new-line'])
  })

  it('replaces only non-Jobber-linked lines in replace mode', () => {
    const linked = formLine({ id: 'linked-1', jobberLineItemId: 'jobber-line-1', optional: true })
    const plan = planAiDraftApplication({
      draft: draft(), selection: selection(), mode: 'replace',
      current: { ...current(), jobberQuoteLines: [formLine(), linked, formLine({ id: 'manual-2' })] },
      generateId: () => 'new-line',
    })
    const result = plan.build([bedroom])

    expect(result.jobberQuoteLines.map((line) => line.id)).toEqual(['linked-1', 'new-line'])
    expect(result.jobberQuoteLines[0]).toBe(linked)
  })

  it('copies catalog linking and tax flags while leaving initial unit prices zero', () => {
    const result = planAiDraftApplication({
      draft: draft({ publicLines: [publicLine(), publicLine({ id: 'text-1', kind: 'text', productServiceId: null, taxable: true })] }),
      selection: selection({ publicLines: new Set(['draft-line-1', 'text-1']) }), mode: 'append', current: current(),
    }).build([bedroom])

    expect(result.jobberQuoteLines[0]).toMatchObject({
      kind: 'line_item', name: 'Paint walls', description: 'Prepare and paint walls', quantity: '2.00',
      linkedProductOrServiceId: 'service-1', taxable: false, clientVisible: true, unitPrice: '0.00',
    })
    expect(result.jobberQuoteLines[1]).toMatchObject({ kind: 'text', taxable: true, clientVisible: true, unitPrice: '0.00' })
    expect(result.jobberQuoteLines[1].linkedProductOrServiceId).toBeUndefined()
    expect(result.jobberQuoteLines.every((line) => !line.jobberLineItemId)).toBe(true)
    expect(result.appliedLineIds).toEqual(result.jobberQuoteLines.map((line) => line.id))
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
