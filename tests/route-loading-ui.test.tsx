import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import NewQuoteLoading from '@/app/(app)/quotes/new/loading'
import QuoteDetailLoading from '@/app/(app)/quotes/[id]/loading'
import QuoteEditLoading from '@/app/(app)/quotes/[id]/edit/loading'
import JobDetailLoading from '@/app/(app)/jobs/[jobberJobId]/loading'
import InventoryLoading from '@/app/(app)/inventory/loading'

describe('route-specific loading UI', () => {
  it.each([
    ['New Quote workspace', NewQuoteLoading],
    ['quote detail', QuoteDetailLoading],
    ['quote edit workspace', QuoteEditLoading],
    ['Job financial detail', JobDetailLoading],
    ['Inventory rows/filters', InventoryLoading],
  ])('announces the %s loading shape', (label, LoadingComponent) => {
    const markup = renderToStaticMarkup(createElement(LoadingComponent))

    expect(markup).toContain('role="status"')
    expect(markup).toContain(`aria-label="Loading ${label}"`)
  })
})
