import { describe, expect, it } from 'vitest'
import {
  clearLocalQuoteDrafts,
  createEmptyQuoteFormDraft,
  getQuoteDraftStorageKey,
  hasMeaningfulQuoteDraft,
  isLocalDraftJobberQuoteDraft,
  parseQuoteFormDraft,
  readQuoteFormDraftFromStorage,
  sanitizeQuoteFormDraftForStorage,
} from '@/components/quote-form/quote-draft'

describe('quote form draft persistence', () => {
  it('uses separate draft keys for new and existing quotes', () => {
    expect(getQuoteDraftStorageKey()).toBe('pbc-quote-draft:new')
    expect(getQuoteDraftStorageKey('quote-1')).toBe('pbc-quote-draft:quote-1')
  })

  it('ignores empty drafts but keeps meaningful quote input', () => {
    expect(hasMeaningfulQuoteDraft(createEmptyQuoteFormDraft())).toBe(false)
    expect(hasMeaningfulQuoteDraft({
      ...createEmptyQuoteFormDraft(),
      customerName: 'Jane Customer',
    })).toBe(true)
    expect(hasMeaningfulQuoteDraft({
      ...createEmptyQuoteFormDraft(),
      options: [
        {
          id: 'option-1',
          title: 'Option 1',
          materials: [],
          selectedMin: 4,
          selectedMax: 1,
          isExpanded: true,
        },
      ],
    })).toBe(true)
    expect(hasMeaningfulQuoteDraft({
      ...createEmptyQuoteFormDraft(),
      memos: [{ id: 'memo-1', body: 'Internal access note' }],
    })).toBe(true)
    expect(hasMeaningfulQuoteDraft({
      ...createEmptyQuoteFormDraft(),
      areaFormulaSelections: {
        interior: { selectedMin: 5, selectedMax: 5 },
        exterior: { selectedMin: 4, selectedMax: 1 },
        roof: { selectedMin: 4, selectedMax: 1 },
      },
    })).toBe(true)
  })

  it('parses valid saved drafts and rejects invalid stored payloads', () => {
    const draft = {
      ...createEmptyQuoteFormDraft(),
      customerName: 'Jane Customer',
      workingDays: '2.5',
      materials: [
        {
          id: 'item-1',
          name: 'Primer',
          marketPrice: '55.50',
          actualPrice: '55.50',
          quantity: '2',
          workingDays: '0',
          labourPerDay: '0',
          isCustom: true,
        },
      ],
      options: [
        {
          id: 'option-1',
          title: 'Option 1',
          selectedMin: 4,
          selectedMax: 1,
          isExpanded: true,
          materials: [
            {
              id: 'option-item-1',
              name: 'Door paint',
              marketPrice: '88.00',
              actualPrice: '88.00',
              quantity: '1',
              workingDays: '0',
              labourPerDay: '0',
              isCustom: true,
            },
          ],
        },
      ],
      memos: [
        { id: 'memo-1', body: 'Call before arriving.' },
        { id: 'memo-2', body: 'Use side gate access.' },
      ],
      areaFormulaSelections: {
        interior: { selectedMin: 5 as const, selectedMax: 5 as const },
        exterior: { selectedMin: 1 as const, selectedMax: 1 as const },
        roof: { selectedMin: 4 as const, selectedMax: 1 as const },
      },
      updatedAt: '2026-05-15T00:00:00.000Z',
    }

    expect(parseQuoteFormDraft(JSON.stringify(draft), new Date('2026-05-16T00:00:00.000Z'))).toEqual(draft)
    expect(parseQuoteFormDraft('not json')).toBeNull()
    expect(parseQuoteFormDraft(JSON.stringify({ ...draft, workingDays: '/' }))).toBeNull()
    expect(parseQuoteFormDraft(JSON.stringify({
      ...draft,
      memos: [{ id: 'memo-1', body: 123 }],
    }))).toBeNull()
  })

  it('preserves Jobber public line editor state', () => {
    const draft = {
      ...createEmptyQuoteFormDraft(),
      jobberSaveMode: 'description_total' as const,
      jobberQuoteLines: [
        {
          id: 'jobber-line-1',
          kind: 'line_item' as const,
          name: 'Exterior deck',
          description: 'Public Jobber line',
          quantity: '1',
          unitPrice: '2500.00',
          taxable: true,
          clientVisible: true,
          linkedProductOrServiceId: 'product-or-service-1',
        },
        {
          id: 'jobber-text-1',
          kind: 'text' as const,
          name: 'Scope notes',
          description: 'Material prices stay internal.',
          quantity: '1',
          unitPrice: '0',
          taxable: false,
          clientVisible: true,
        },
      ],
      updatedAt: '2026-05-19T00:00:00.000Z',
    }

    expect(parseQuoteFormDraft(JSON.stringify(draft), new Date('2026-05-20T00:00:00.000Z'))).toEqual(draft)
    expect(hasMeaningfulQuoteDraft(draft)).toBe(true)
    expect(parseQuoteFormDraft(JSON.stringify({
      ...draft,
      jobberQuoteLines: [{ ...draft.jobberQuoteLines[0], unitPrice: '/' }],
    }))).toBeNull()
  })

  it('rejects drafts with missing, invalid, or expired updatedAt metadata', () => {
    const now = new Date('2026-06-26T00:00:00.000Z')
    const freshDraft = {
      ...createEmptyQuoteFormDraft(),
      customerName: 'Jane Customer',
      updatedAt: '2026-06-20T00:00:00.000Z',
    }

    expect(parseQuoteFormDraft(JSON.stringify(freshDraft), now)).toEqual(freshDraft)
    expect(parseQuoteFormDraft(JSON.stringify({ ...freshDraft, updatedAt: '2026-06-18T23:59:59.999Z' }), now)).toBeNull()
    expect(parseQuoteFormDraft(JSON.stringify({ ...freshDraft, updatedAt: '2026-06-27T00:00:00.000Z' }), now)).toBeNull()
    expect(parseQuoteFormDraft(JSON.stringify({ ...freshDraft, updatedAt: 'not a date' }), now)).toBeNull()

    const missingUpdatedAt: Record<string, unknown> = { ...freshDraft }
    delete missingUpdatedAt.updatedAt
    expect(parseQuoteFormDraft(JSON.stringify(missingUpdatedAt), now)).toBeNull()
  })

  it('purges invalid or expired raw draft payloads from local storage when read', () => {
    const key = getQuoteDraftStorageKey('quote-1')
    const entries = new Map<string, string>([
      [key, JSON.stringify({
        ...createEmptyQuoteFormDraft(),
        customerName: 'Expired Customer',
        updatedAt: '2026-06-18T23:59:59.999Z',
        jobberQuoteDraft: {
          financialSummary: { profit: 123 },
          jobExpenses: [{ expenses: [{ title: 'Old private expense' }] }],
        },
      })],
    ])
    const storage = {
      getItem(storageKey: string) {
        return entries.get(storageKey) ?? null
      },
      removeItem(storageKey: string) {
        entries.delete(storageKey)
      },
    }

    expect(readQuoteFormDraftFromStorage(storage, key, new Date('2026-06-26T00:00:00.000Z'))).toBeNull()
    expect(entries.has(key)).toBe(false)
  })

  it('sanitizes Jobber fetch-only expense and financial data before local storage persistence', () => {
    const draft = {
      ...createEmptyQuoteFormDraft(),
      jobberQuoteDraft: {
        jobberQuoteId: 'encoded-quote-id',
        sourceType: 'quote' as const,
        quoteNumber: '2345',
        createdAt: '2026-05-13T01:23:45Z',
        customerName: 'Jane Customer',
        customerAddress: '10 Main St',
        workType: 'Exterior',
        areaSqft: null,
        customerType: 'Real Estate',
        sourceUrl: 'https://secure.getjobber.com/quotes/2345',
        productsAndServices: [
          {
            id: 'line-item-1',
            name: 'Exterior repaint',
            category: 'SERVICE',
            description: 'Walls and trim',
            quantity: 1,
            unitPrice: 2500,
            totalPrice: 2500,
            linkedName: null,
            textOnly: false,
          },
        ],
        jobExpenses: [
          {
            jobId: 'job-id-1',
            jobNumber: 6789,
            jobTitle: 'Exterior repaint job',
            jobStatus: 'ACTIVE',
            jobUrl: 'https://secure.getjobber.com/jobs/6789',
            expenses: [
              {
                id: 'expense-id-1',
                title: 'Paint supplies',
                description: 'Primer',
                date: '2026-05-14T00:00:00Z',
                total: 245.5,
                enteredBy: 'Admin User',
                paidBy: 'Painter One',
                reimbursableTo: null,
              },
            ],
          },
        ],
        jobExpensesError: null,
        financialSummary: {
          quoteTotal: 2500,
          expensesTotal: 245.5,
          profit: 2254.5,
          profitMarginPercent: 90.2,
        },
      },
      updatedAt: '2026-06-25T00:00:00.000Z',
    }

    const storedDraft = sanitizeQuoteFormDraftForStorage(draft)
    const storedJson = JSON.stringify(storedDraft)

    expect(storedJson).toContain('Exterior repaint')
    expect(storedJson).toContain('Jane Customer')
    expect(storedJson).not.toContain('jobExpenses')
    expect(storedJson).not.toContain('financialSummary')
    expect(storedJson).not.toContain('Paint supplies')
    expect(storedJson).not.toContain('profitMarginPercent')

    const parsedDraft = parseQuoteFormDraft(storedJson, new Date('2026-06-26T00:00:00.000Z'))
    expect(parsedDraft?.jobberQuoteDraft).toMatchObject({
      jobberQuoteId: 'encoded-quote-id',
      productsAndServices: [
        expect.objectContaining({ id: 'line-item-1', name: 'Exterior repaint' }),
      ],
      jobExpenses: [],
      jobExpensesError: expect.any(String),
    })
    expect(isLocalDraftJobberQuoteDraft(parsedDraft?.jobberQuoteDraft ?? null)).toBe(true)
  })

  it('removes all local quote draft keys without touching unrelated local storage', () => {
    const entries = new Map<string, string>([
      ['pbc-quote-draft:new', 'new draft'],
      ['pbc-quote-draft:quote-1', 'quote draft'],
      ['pbc-sidebar-collapsed', 'true'],
    ])
    const storage = {
      get length() {
        return entries.size
      },
      key(index: number) {
        return Array.from(entries.keys())[index] ?? null
      },
      removeItem(key: string) {
        entries.delete(key)
      },
    }

    expect(clearLocalQuoteDrafts(storage)).toBe(2)
    expect(Array.from(entries.keys())).toEqual(['pbc-sidebar-collapsed'])
  })
})
