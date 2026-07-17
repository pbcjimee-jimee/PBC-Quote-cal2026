import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}))

import {
  createQuoteLineTemplate,
  listQuoteLineTemplates,
  updateQuoteLineTemplate,
} from '@/lib/actions/quote-line-templates'
import { resetDevData } from '@/lib/dev-data'

describe('quote line template actions', () => {
  beforeEach(() => {
    resetDevData()
  })

  it('creates and lists reusable quote line templates in dev mode', async () => {
    const result = await createQuoteLineTemplate({
      name: 'Standard Interior Intro',
      items: [
        {
          kind: 'text',
          name: 'Dulux Accredited Painting Company',
          description: 'Accreditation paragraph',
          clientVisible: true,
          position: 0,
        },
        {
          kind: 'line_item',
          name: 'Total',
          description: 'All labour and paints',
          quantity: 1,
          unitPrice: 2500,
          taxable: true,
          clientVisible: true,
          position: 1,
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.data.items.map((item) => item.name)).toEqual([
      'Dulux Accredited Painting Company',
      'Total',
    ])

    const listResult = await listQuoteLineTemplates()

    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      expect(listResult.data[0]).toMatchObject({
        id: result.data.id,
        name: 'Standard Interior Intro',
      })
      expect(listResult.data[0].items).toHaveLength(2)
    }
  })

  it('updates template item order and content', async () => {
    const created = await createQuoteLineTemplate({
      name: 'Original',
      items: [
        {
          kind: 'line_item',
          name: 'Walls',
          description: 'All interior walls',
          quantity: 1,
          unitPrice: 13,
          taxable: true,
          clientVisible: true,
          position: 0,
        },
      ],
    })
    if (!created.ok) throw new Error(created.error)

    const updated = await updateQuoteLineTemplate({
      id: created.data.id,
      name: 'Updated',
      items: [
        {
          kind: 'text',
          name: 'Touch up',
          description: 'Touch ups are visible.',
          clientVisible: true,
          position: 0,
        },
        {
          kind: 'line_item',
          name: 'Walls',
          description: 'All interior walls',
          quantity: 2,
          unitPrice: 13,
          taxable: true,
          clientVisible: true,
          position: 1,
        },
      ],
    })

    expect(updated.ok).toBe(true)
    if (updated.ok) {
      expect(updated.data.name).toBe('Updated')
      expect(updated.data.items.map((item) => item.kind)).toEqual(['text', 'line_item'])
      expect(updated.data.items[1].quantity).toBe('2.00')
    }
  })
})
