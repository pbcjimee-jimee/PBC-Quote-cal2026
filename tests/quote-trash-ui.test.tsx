import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestDom, type TestElement } from './helpers/test-dom'

const mocks = vi.hoisted(() => ({ search: vi.fn(), restore: vi.fn(), move: vi.fn(), refresh: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/actions/quote-lifecycle', () => ({ searchDeletedQuotes: mocks.search, restoreQuote: mocks.restore, moveQuoteToTrash: mocks.move }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }))
vi.mock('next/link', () => ({ default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => createElement('a', { href, className }, children) }))
import QuoteTrashPage from '@/app/(app)/quotes/trash/page'
import { QuoteTrashList } from '@/components/quote-list/quote-trash-list'
import { QuoteDeleteButton } from '@/components/quote-list/quote-delete-button'

const quote = { id: 'quote-id', version: 4, customerName: 'Recovery client', customerAddress: '1 Paint St',
  quoteNumber: '3345', subtotal: '123.45', deletedAt: '2026-09-16T01:00:00Z', deletedByName: 'Admin' }
let dom: ReturnType<typeof installTestDom> | undefined
let root: Root | undefined
let container: TestElement

async function mount(node: React.ReactNode) {
  dom = installTestDom()
  container = dom.document.createElement('div')
  dom.document.body.appendChild(container)
  root = createRoot(container as unknown as HTMLElement)
  await act(async () => root!.render(node))
}

function button(label: string) {
  const found = container.querySelectorAll('button').find((element) => element.textContent === label)
  if (!found) throw new Error('Missing button: ' + label)
  return found
}
async function click(label: string) {
  await act(async () => button(label).dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

describe('admin quote trash UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.search.mockResolvedValue({ ok: true, data: { items: [quote], page: 2, hasNextPage: true } })
    mocks.restore.mockResolvedValue({ ok: true, data: { id: quote.id } })
    mocks.move.mockResolvedValue({ ok: true, data: { id: quote.id } })
  })
  afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; dom?.cleanup(); dom = undefined })

  it('shows identifying information and stable pagination that retains the search', async () => {
    const html = renderToStaticMarkup(await QuoteTrashPage({ searchParams: Promise.resolve({ q: '3345', page: '2' }) }))
    expect(html).toContain('Recovery client')
    expect(html).toContain('3345')
    expect(html).toContain('Admin')
    expect(html).toContain('123.45')
    expect(html).toContain('q=3345&amp;page=3')
    expect(html).toContain('q=3345&amp;page=1')
    expect(html).not.toContain('Permanently delete')
    expect(mocks.search).toHaveBeenCalledWith({ query: '3345', page: 2 })
  })

  it('distinguishes an empty trash, no matches, and a load error', async () => {
    mocks.search.mockResolvedValue({ ok: true, data: { items: [], page: 1, hasNextPage: false } })
    expect(renderToStaticMarkup(await QuoteTrashPage({}))).toContain('Trash is empty')
    expect(renderToStaticMarkup(await QuoteTrashPage({ searchParams: Promise.resolve({ q: 'missing' }) }))).toContain('No deleted quotes match')
    mocks.search.mockResolvedValue({ ok: false, error: 'Unable to load Trash.' })
    const html = renderToStaticMarkup(await QuoteTrashPage({}))
    expect(html).toContain('Unable to load Trash.')
    expect(html).not.toContain('Trash is empty')
  })

  it('restores with the displayed version and offers the restored quote', async () => {
    await mount(createElement(QuoteTrashList, { items: [quote] }))
    await click('Restore')
    expect(mocks.restore).toHaveBeenCalledWith({ id: quote.id, expectedVersion: 4 })
    expect(container.textContent).toContain('Quote restored')
    expect(container.querySelectorAll('a').some((a) => a.getAttribute('href') === '/quotes/quote-id')).toBe(true)
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('retains the row and exposes errors when restoration fails', async () => {
    mocks.restore.mockResolvedValueOnce({ ok: false, error: 'Resolve the duplicate before restoring.' })
    await mount(createElement(QuoteTrashList, { items: [quote] }))
    await click('Restore')
    expect(container.textContent).toContain('Resolve the duplicate')
    expect(container.textContent).toContain('Recovery client')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('explains recovery and only archives after confirmation', async () => {
    await mount(createElement(QuoteDeleteButton, { quoteId: quote.id, quoteVersion: 4, redirectToQuotes: true }))
    await click('Delete')
    expect(container.textContent).toContain('restore it from Trash')
    expect(mocks.move).not.toHaveBeenCalled()
    await click('Cancel')
    expect(mocks.move).not.toHaveBeenCalled()
    await click('Delete')
    await click('Move to Trash')
    expect(mocks.move).toHaveBeenCalledWith({ id: quote.id, expectedVersion: 4 })
    expect(mocks.push).toHaveBeenCalledWith('/quotes')
  })

  it('keeps a failed deletion visible and retryable', async () => {
    mocks.move.mockResolvedValueOnce({ ok: false, error: 'Refresh and try again.' })
    await mount(createElement(QuoteDeleteButton, { quoteId: quote.id, quoteVersion: 4 }))
    await click('Delete')
    await click('Move to Trash')
    expect(container.textContent).toContain('Refresh and try again.')
    expect(container.textContent).toContain('Move to Trash')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('disables restore while a request is pending and reports network errors', async () => {
    let reject!: (reason: Error) => void
    mocks.restore.mockReturnValueOnce(new Promise((_, rejectPromise) => { reject = rejectPromise }))
    await mount(createElement(QuoteTrashList, { items: [quote] }))
    await click('Restore')
    expect(button('Restoring...').hasAttribute('disabled')).toBe(true)
    await act(async () => reject(new Error('network')))
    expect(container.textContent).toContain('Unable to restore')
    expect(button('Restore').hasAttribute('disabled')).toBe(false)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
