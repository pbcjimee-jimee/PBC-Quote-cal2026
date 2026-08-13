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
    expect(renderToStaticMarkup(createElement(LoadingComponent))).toBe(markup)
  })

  it.each([
    ['New Quote workspace', NewQuoteLoading, ['pbc-editgrid', 'pbc-workspace']],
    ['quote detail', QuoteDetailLoading, ['pbc-dgrid', 'pbc-dspan']],
    ['quote edit workspace', QuoteEditLoading, ['pbc-editgrid', 'pbc-workspace']],
    ['Inventory rows/filters', InventoryLoading, ['pbc-tablewrap', 'flex flex-wrap gap-3']],
  ] as const)('preserves the route-specific %s layout structure', (_label, LoadingComponent, classes) => {
    const markup = renderToStaticMarkup(createElement(LoadingComponent))

    for (const className of classes) expect(markup).toContain(className)
  })

  it('uses one row-based financial card followed by expenses for Job detail', () => {
    const markup = renderToStaticMarkup(createElement(JobDetailLoading))

    expect(markup).toContain('pbc-jobfinancial__row')
    expect(markup).toContain('pbc-jobfinancial__bar')
    expect(markup.indexOf('pbc-jobfinancial__row')).toBeLessThan(markup.indexOf('pbc-tablewrap'))
    expect(markup).not.toContain('pbc-stats')
    expect(markup).not.toContain('pbc-stat')
    expect(markup).not.toContain('pbc-jobcalendar')
  })
})
