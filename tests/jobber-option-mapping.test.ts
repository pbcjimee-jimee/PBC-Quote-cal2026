import { describe, expect, it } from 'vitest'
import type { JobberQuoteDraftLineItem } from '@/lib/jobber/mapper'
import {
  buildJobberOptionImportCandidates,
  convertJobberOptionCandidateToQuoteOption,
  isJobberOptionCandidateAlreadyImported,
} from '@/components/quote-form/jobber-option-mapping'
import type { QuoteOptionItem } from '@/components/quote-form/types'

function line(overrides: Partial<JobberQuoteDraftLineItem> = {}): JobberQuoteDraftLineItem {
  return {
    id: 'line-1',
    name: 'Interior painting',
    category: 'SERVICE',
    description: '',
    quantity: 1,
    unitPrice: 100,
    totalPrice: 100,
    linkedName: null,
    textOnly: false,
    ...overrides,
  }
}

describe('jobber option import mapping', () => {
  it('treats a same-title calculated option with materials as imported without changing import fingerprints', () => {
    const candidate = buildJobberOptionImportCandidates([line({ name: 'Optional ceiling', totalPrice: 250 })])[0]
    const option: QuoteOptionItem = {
      id: 'calculated-option', title: '  OPTIONAL   ceiling ', selectedMin: 4, selectedMax: 1, isExpanded: true,
      materials: [{ id: 'paint', name: 'Ceiling paint', marketPrice: '80', actualPrice: '50', quantity: '2', workingDays: '1', labourPerDay: '2', isCustom: false }],
    }
    expect(isJobberOptionCandidateAlreadyImported(candidate, [option])).toBe(true)
    expect(isJobberOptionCandidateAlreadyImported(candidate, [{ ...option, materials: [] }])).toBe(false)
    expect(isJobberOptionCandidateAlreadyImported(candidate, [{ ...option, title: 'Different option' }])).toBe(false)
    const imported = convertJobberOptionCandidateToQuoteOption(candidate, prefix => `${prefix}-imported`)
    imported.sourceJobberLineItemIds = []
    imported.materials[0].marketPrice = '999'
    imported.materials[0].actualPrice = '999'
    expect(isJobberOptionCandidateAlreadyImported(candidate, [imported])).toBe(false)
  })
  it('groups priced lines after a text option heading', () => {
    const candidates = buildJobberOptionImportCandidates([
      line({
        id: 'heading-1',
        name: 'Option 1',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        textOnly: true,
      }),
      line({ id: 'line-1', name: 'Garage repaint', totalPrice: 350 }),
      line({ id: 'line-2', name: 'Fence repaint', totalPrice: 125.55 }),
    ])

    expect(candidates).toMatchObject([
      {
        id: 'heading-1|line-1|line-2',
        title: 'Option 1',
        sourceLineIds: ['heading-1', 'line-1', 'line-2'],
        total: 475.55,
      },
    ])
    expect(candidates[0]?.lines.map((candidateLine) => candidateLine.id)).toEqual(['line-1', 'line-2'])
  })

  it('starts a new group at the next option heading', () => {
    const candidates = buildJobberOptionImportCandidates([
      line({
        id: 'heading-1',
        name: 'Option 1',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        textOnly: true,
      }),
      line({ id: 'line-1', name: 'Garage repaint', totalPrice: 350 }),
      line({
        id: 'heading-2',
        name: 'Alternative 2',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        textOnly: true,
      }),
      line({ id: 'line-2', name: 'Fence repaint', totalPrice: 125 }),
    ])

    expect(candidates.map((candidate) => ({
      title: candidate.title,
      sourceLineIds: candidate.sourceLineIds,
      total: candidate.total,
    }))).toEqual([
      { title: 'Option 1', sourceLineIds: ['heading-1', 'line-1'], total: 350 },
      { title: 'Alternative 2', sourceLineIds: ['heading-2', 'line-2'], total: 125 },
    ])
  })

  it('creates one candidate from a priced line whose name starts with an option marker', () => {
    const candidates = buildJobberOptionImportCandidates([
      line({ id: 'line-1', name: 'Optional garage repaint', totalPrice: 450 }),
    ])

    expect(candidates).toMatchObject([
      {
        id: 'line-1',
        title: 'Optional garage repaint',
        sourceLineIds: ['line-1'],
        total: 450,
      },
    ])
  })

  it('does not create a candidate from an ordinary public line', () => {
    expect(buildJobberOptionImportCandidates([
      line({ id: 'line-1', name: 'Interior painting', totalPrice: 450 }),
    ])).toEqual([])
  })

  it('ignores text-only option candidates without priced lines', () => {
    expect(buildJobberOptionImportCandidates([
      line({
        id: 'heading-1',
        name: 'Option 1',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        textOnly: true,
      }),
    ])).toEqual([])
  })

  it('does not start an option group from ordinary text that only mentions optional work', () => {
    const candidates = buildJobberOptionImportCandidates([
      line({
        id: 'text-1',
        name: 'No optional work selected',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        textOnly: true,
      }),
      line({ id: 'line-1', name: 'Interior painting', totalPrice: 450 }),
    ])

    expect(candidates).toEqual([])
  })

  it('stops grouping option lines at ordinary text boundaries', () => {
    const candidates = buildJobberOptionImportCandidates([
      line({
        id: 'heading-1',
        name: 'Option 1',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        textOnly: true,
      }),
      line({ id: 'line-1', name: 'Garage repaint', totalPrice: 350 }),
      line({
        id: 'text-1',
        name: 'Base scope continues below',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        textOnly: true,
      }),
      line({ id: 'line-2', name: 'Interior painting', totalPrice: 900 }),
    ])

    expect(candidates.map((candidate) => ({
      title: candidate.title,
      sourceLineIds: candidate.sourceLineIds,
      total: candidate.total,
    }))).toEqual([
      { title: 'Option 1', sourceLineIds: ['heading-1', 'line-1'], total: 350 },
    ])
  })

  it('converts a candidate to a F1-F1 option with custom zero-labour material rows and source ids', () => {
    const candidate = buildJobberOptionImportCandidates([
      line({
        id: 'heading-1',
        name: 'Option 1',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        textOnly: true,
      }),
      line({ id: 'line-1', name: 'Garage repaint', totalPrice: 450 }),
      line({ id: 'line-2', name: 'Door repaint', totalPrice: 75.5 }),
    ])[0]
    let nextId = 0

    const option = convertJobberOptionCandidateToQuoteOption(candidate, (prefix) => {
      nextId += 1
      return `${prefix}-${nextId}`
    })

    expect(option).toEqual({
      id: 'option-1',
      title: 'Option 1',
      selectedMin: 1,
      selectedMax: 1,
      isExpanded: true,
      sourceJobberLineItemIds: ['heading-1', 'line-1', 'line-2'],
      materials: [
        {
          id: 'option-item-2',
          name: 'Garage repaint',
          marketPrice: '450.00',
          actualPrice: '450.00',
          quantity: '1',
          workingDays: '0',
          labourPerDay: '0',
          isCustom: true,
        },
        {
          id: 'option-item-3',
          name: 'Door repaint',
          marketPrice: '75.50',
          actualPrice: '75.50',
          quantity: '1',
          workingDays: '0',
          labourPerDay: '0',
          isCustom: true,
        },
      ],
    })
  })

  it('matches a saved imported option by normalized title, line names, and totals without source ids', () => {
    const candidate = buildJobberOptionImportCandidates([
      line({
        id: 'heading-1',
        name: 'Option 1',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        textOnly: true,
      }),
      line({ id: 'line-1', name: 'Garage repaint', totalPrice: 450.25 }),
    ])[0]
    const restoredOption: QuoteOptionItem = {
      id: 'option-1',
      title: '  option   1  ',
      selectedMin: 1,
      selectedMax: 1,
      isExpanded: false,
      materials: [
        {
          id: 'option-item-1',
          name: '  Garage   repaint  ',
          marketPrice: '450.25',
          actualPrice: '450.25',
          quantity: '1.00',
          workingDays: '0.00',
          labourPerDay: '0.00',
          isCustom: true,
        },
      ],
    }

    expect(isJobberOptionCandidateAlreadyImported(candidate, [restoredOption])).toBe(true)
  })

  it('does not fingerprint-match a restored option when the imported material total differs', () => {
    const candidate = buildJobberOptionImportCandidates([
      line({
        id: 'heading-1',
        name: 'Option 1',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        textOnly: true,
      }),
      line({ id: 'line-1', name: 'Garage repaint', totalPrice: 450.25 }),
    ])[0]
    const restoredOption: QuoteOptionItem = {
      id: 'option-1',
      title: 'Option 1',
      selectedMin: 1,
      selectedMax: 1,
      isExpanded: false,
      materials: [
        {
          id: 'option-item-1',
          name: 'Garage repaint',
          marketPrice: '451.25',
          actualPrice: '451.25',
          quantity: '1.00',
          workingDays: '0.00',
          labourPerDay: '0.00',
          isCustom: true,
        },
      ],
    }

    expect(isJobberOptionCandidateAlreadyImported(candidate, [restoredOption])).toBe(false)
  })
})
