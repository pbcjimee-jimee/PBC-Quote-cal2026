import { describe, expect, it } from 'vitest'
import { mapJobberDraftLineItemsToState } from '@/components/quote-form/jobber-line-state'
import type { JobberQuoteDraftLineItem } from '@/lib/jobber/mapper'

describe('Jobber line item form state', () => {
  it('maps fetched Jobber product and service line items into editable form rows', () => {
    const lines: JobberQuoteDraftLineItem[] = [
      {
        id: 'jobber-text-line',
        name: 'Scope notes',
        category: 'SERVICE',
        description: 'General quote text',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        linkedName: null,
        textOnly: true,
      },
      {
        id: 'jobber-priced-line',
        name: 'Walls',
        category: 'SERVICE',
        description: '2 coats of Dulux wall paint',
        quantity: 2,
        unitPrice: 125.5,
        totalPrice: 251,
        linkedName: 'Walls service',
        textOnly: false,
      },
    ]

    expect(mapJobberDraftLineItemsToState(lines)).toEqual([
      {
        id: 'jobber-jobber-text-line',
        kind: 'text',
        name: 'Scope notes',
        description: 'General quote text',
        quantity: '1',
        unitPrice: '0.00',
        taxable: false,
        clientVisible: true,
        jobberLineItemId: 'jobber-text-line',
      },
      {
        id: 'jobber-jobber-priced-line',
        kind: 'line_item',
        name: 'Walls',
        description: '2 coats of Dulux wall paint',
        quantity: '2',
        unitPrice: '125.50',
        taxable: true,
        clientVisible: true,
        jobberLineItemId: 'jobber-priced-line',
      },
    ])
  })
})
