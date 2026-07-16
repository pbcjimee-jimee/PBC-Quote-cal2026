import { readFileSync } from 'node:fs'

import { act, createElement } from 'react'
import type { Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import NewProgressInvoicePage from '@/app/(app)/progress-invoices/new/page'
import { StandaloneProgressInvoiceForm } from '@/components/progress-invoices/standalone-progress-invoice-form'
import {
  buildStandaloneDraft,
  formatJobberAddress,
  parseJobberInvoicePreviewResponse,
  parseJobberInvoiceSearchResponse,
} from '@/lib/progress-invoices/standalone-import-contract'
import { installTestDom } from '@/tests/helpers/test-dom'

const mocks = vi.hoisted(() => ({
  createStandaloneProgressInvoiceFromJobber: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    prefetch: vi.fn(),
  }),
}))

vi.mock('@/lib/actions/progress-invoice-jobber', () => ({
  createStandaloneProgressInvoiceFromJobber:
    mocks.createStandaloneProgressInvoiceFromJobber,
}))

const billingAddress = {
  street1: '1 Billing Street',
  street2: null,
  city: 'Sydney',
  province: 'NSW',
  postalCode: '2000',
  country: 'Australia',
} as const

const siteAddress = {
  street1: '4 Curra Close',
  street2: null,
  city: 'Frenchs Forest',
  province: 'NSW',
  postalCode: '2086',
  country: 'Australia',
} as const

const searchResponse = {
  ok: true,
  data: {
    accountId: 'account-1',
    invoices: [{
      id: 'invoice-2906',
      invoiceNumber: '2906',
      rawStatus: 'PAID',
      normalizedStatus: 'paid',
      jobberWebUri: 'https://secure.getjobber.com/invoices/invoice-2906',
      warnings: [],
    }],
  },
} as const

const previewResponse = {
  ok: true,
  data: {
    invoiceId: 'invoice-2906',
    invoiceNumber: '2906',
    rawStatus: 'PAID',
    normalizedStatus: 'paid',
    jobberWebUri: 'https://secure.getjobber.com/invoices/invoice-2906',
    amounts: {
      subtotal: '39507.08',
      taxAmount: '3950.71',
      total: '43457.79',
      invoiceBalance: '0.00',
      paymentsTotal: '4914.08',
    },
    issuedDate: '2026-07-08',
    dueDate: '2026-07-22',
    receivedDate: '2026-07-08',
    client: {
      name: 'Example Builder',
      companyName: 'Example Builder Pty Ltd',
      emails: ['accounts@example.test', 'owner@example.test'],
      phones: [
        { number: '0400 000 000', primary: true },
        { number: '02 9000 0000', primary: false },
      ],
    },
    billingAddress,
    jobs: [{ id: 'job-1' }],
    properties: [{ id: 'property-1', address: siteAddress }],
    selectedJobberJobId: 'job-1',
    selectedJobberPropertyId: 'property-1',
    selectionRequired: { job: false, property: false },
  },
} as const

function inputByName(container: HTMLElement, name: string): HTMLInputElement {
  const input = Array.from(container.querySelectorAll('input')).find((candidate) => (
    candidate.getAttribute('name') === name
      || (candidate as HTMLInputElement).name === name
  ))
  if (!input) throw new Error(`Input ${name} was not rendered`)
  return input
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => (
    candidate.textContent.includes(text)
  ))
  if (!button) throw new Error(`Button ${text} was not rendered`)
  return button
}

async function flushReact(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('Standalone Progress Invoice browser contract', () => {
  it('strictly parses valid search and preview responses', () => {
    expect(parseJobberInvoiceSearchResponse(searchResponse)).toEqual(searchResponse)
    expect(parseJobberInvoicePreviewResponse(previewResponse)).toEqual(previewResponse)
    expect(parseJobberInvoiceSearchResponse({
      ok: false,
      error: 'Jobber is temporarily unavailable',
      code: 'JOBBER_TEMPORARY_FAILURE',
    })).toEqual({
      ok: false,
      error: 'Jobber is temporarily unavailable',
      code: 'JOBBER_TEMPORARY_FAILURE',
    })
  })

  it('rejects malformed or over-broad browser responses', () => {
    expect(() => parseJobberInvoiceSearchResponse({
      ...searchResponse,
      accessToken: 'must-never-reach-browser-contract',
    })).toThrow()
    expect(() => parseJobberInvoicePreviewResponse({
      ...previewResponse,
      data: {
        ...previewResponse.data,
        payments: [{ id: 'payment-secret' }],
      },
    })).toThrow()
    expect(() => parseJobberInvoicePreviewResponse({
      ...previewResponse,
      data: {
        ...previewResponse.data,
        amounts: { ...previewResponse.data.amounts, subtotal: 39507.08 },
      },
    })).toThrow()
  })

  it('formats Australian addresses without blank separators', () => {
    expect(formatJobberAddress(billingAddress)).toBe(
      '1 Billing Street, Sydney NSW 2000, Australia',
    )
    expect(formatJobberAddress({
      street1: '10 Example Road',
      street2: 'Unit 2',
      city: null,
      province: 'NSW',
      postalCode: '2000',
      country: null,
    })).toBe('10 Example Road, Unit 2, NSW 2000')
    expect(formatJobberAddress(null)).toBe('')
  })

  it('builds editable recipient and site prefill while leaving the base contract blank', () => {
    const parsed = parseJobberInvoicePreviewResponse(previewResponse)
    if (!parsed.ok) throw new Error('Expected a valid preview fixture')
    const draft = buildStandaloneDraft(parsed.data)

    expect(draft).toMatchObject({
      recipientName: 'Example Builder',
      recipientCompany: 'Example Builder Pty Ltd',
      recipientAddress: '1 Billing Street, Sydney NSW 2000, Australia',
      recipientEmail: '',
      recipientPhone: '0400 000 000',
      siteName: '4 Curra Close, Frenchs Forest NSW 2086, Australia',
      siteAddress: '4 Curra Close, Frenchs Forest NSW 2086, Australia',
      reference: 'Jobber 2906',
      baseContractExGst: '',
    })
  })
})

describe('Standalone Progress Invoice workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders accessible creation copy and removes the placeholder and sync controls', () => {
    const markup = renderToStaticMarkup(createElement(NewProgressInvoicePage))

    for (const copy of [
      'Jobber Invoice Number',
      'Fetch invoice',
      'Base contract Ex GST',
      'Jobber amounts are for comparison only',
      'Recipient',
      'Site',
      'Create Progress Invoice series',
      'Existing PBC Quote',
    ]) expect(markup).toContain(copy)
    expect(markup).toContain('href="/quotes"')
    expect(markup).not.toContain('guided landing page is read-only')
    expect(markup).not.toContain('next implementation step')
    expect(markup).not.toContain('Refresh Jobber')
    expect(markup).not.toContain('Sync Jobber')
    expect(markup).not.toContain('Auto sync')
  })

  it('keeps Jobber observations out of the action payload and reuses a failed attempt key', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => searchResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => previewResponse })
    vi.stubGlobal('fetch', fetchMock)
    mocks.createStandaloneProgressInvoiceFromJobber
      .mockRejectedValueOnce(new Error('transient server action transport failure'))
      .mockResolvedValueOnce({
        ok: true,
        data: { seriesId: 'series-1', version: 1, importedPayments: 3 },
      })
    const { cleanup } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = document.createElement('div')
      root = createRoot(container)

      await act(async () => {
        root!.render(createElement(StandaloneProgressInvoiceForm))
      })

      const searchInput = inputByName(container as unknown as HTMLElement, 'jobberInvoiceNumber')
      await act(async () => {
        searchInput.value = '2906'
        searchInput.dispatchEvent(new Event('input', { bubbles: true }))
        searchInput.dispatchEvent(new Event('change', { bubbles: true }))
      })
      const searchForm = Array.from(container.querySelectorAll('form')).find((form) => (
        form.getAttribute('aria-label') === 'Find a Jobber invoice'
      ))
      expect(searchForm).toBeDefined()
      await act(async () => {
        searchForm!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      })
      await flushReact()

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        '/api/jobber/progress-invoices/invoices/search?term=2906',
        expect.objectContaining({ cache: 'no-store' }),
      )
      await act(async () => {
        buttonByText(container as unknown as HTMLElement, '2906')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await flushReact()

      const baseContract = inputByName(
        container as unknown as HTMLElement,
        'baseContractExGst',
      )
      expect(baseContract.value).toBe('')
      expect(container.textContent).toContain('$39,507.08')

      await act(async () => {
        baseContract.value = '17220.50'
        baseContract.dispatchEvent(new Event('input', { bubbles: true }))
        baseContract.dispatchEvent(new Event('change', { bubbles: true }))
      })
      const createForm = Array.from(container.querySelectorAll('form')).find((form) => (
        form.getAttribute('aria-label') === 'Create standalone Progress Invoice series'
      ))
      expect(createForm).toBeDefined()

      await act(async () => {
        createForm!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      })
      await flushReact()
      await act(async () => {
        createForm!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      })
      await flushReact()

      expect(mocks.createStandaloneProgressInvoiceFromJobber).toHaveBeenCalledTimes(2)
      const firstPayload = mocks.createStandaloneProgressInvoiceFromJobber.mock.calls[0]?.[0]
      const retryPayload = mocks.createStandaloneProgressInvoiceFromJobber.mock.calls[1]?.[0]
      expect(firstPayload).toMatchObject({
        selectedJobberInvoiceId: 'invoice-2906',
        selectedJobberJobId: 'job-1',
        selectedJobberPropertyId: 'property-1',
        baseContractExGst: '17220.50',
        gstRate: '0.10',
        recipientName: 'Example Builder',
        recipientAddress: '1 Billing Street, Sydney NSW 2000, Australia',
        siteAddress: '4 Curra Close, Frenchs Forest NSW 2086, Australia',
        reference: 'Jobber 2906',
      })
      expect(firstPayload.correlationKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
      expect(retryPayload.correlationKey).toBe(firstPayload.correlationKey)
      for (const forbidden of [
        'accountId',
        'amounts',
        'payments',
        'paymentsTotal',
        'responseFingerprint',
      ]) expect(firstPayload).not.toHaveProperty(forbidden)
      expect(mocks.push).toHaveBeenCalledWith('/progress-invoices')
      expect(mocks.refresh).toHaveBeenCalledTimes(1)
    } finally {
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        cleanup()
        vi.unstubAllGlobals()
      }
    }
  })

  it('uses responsive shared component classes for the standalone workspace', () => {
    const css = readFileSync('app/styles/components.css', 'utf8')
    const markup = renderToStaticMarkup(createElement(StandaloneProgressInvoiceForm))

    expect(markup).toContain('pbc-card pbc-card--pad')
    expect(markup).toContain('pbc-input')
    expect(markup).toContain('pbc-progress-standalone')
    expect(css).toContain('.pbc-progress-form-grid')
    expect(css).toContain('.pbc-progress-comparison-grid')
    expect(css).toContain('@media (max-width: 720px)')
  })
})
