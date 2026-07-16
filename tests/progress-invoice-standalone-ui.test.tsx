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

function textareaByName(container: HTMLElement, name: string): HTMLTextAreaElement {
  const textarea = Array.from(container.querySelectorAll('textarea')).find((candidate) => (
    candidate.getAttribute('name') === name
      || (candidate as HTMLTextAreaElement).name === name
  ))
  if (!textarea) throw new Error(`Textarea ${name} was not rendered`)
  return textarea
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body }
}

function candidate(id: string, invoiceNumber: string) {
  return {
    id,
    invoiceNumber,
    rawStatus: 'PAID',
    normalizedStatus: 'paid',
    jobberWebUri: `https://secure.getjobber.com/invoices/${id}`,
    warnings: [],
  }
}

function previewFixture({
  invoiceId,
  invoiceNumber,
  recipientName,
  jobIds = [`job-${invoiceId}`],
  propertyIds = [`property-${invoiceId}`],
  selectedJobberJobId = jobIds.length === 1 ? jobIds[0]! : null,
  selectedJobberPropertyId = propertyIds.length === 1 ? propertyIds[0]! : null,
  jobSelectionRequired = selectedJobberJobId === null,
  propertySelectionRequired = selectedJobberPropertyId === null,
}: {
  invoiceId: string
  invoiceNumber: string
  recipientName: string
  jobIds?: string[]
  propertyIds?: string[]
  selectedJobberJobId?: string | null
  selectedJobberPropertyId?: string | null
  jobSelectionRequired?: boolean
  propertySelectionRequired?: boolean
}) {
  return {
    ok: true,
    data: {
      ...previewResponse.data,
      invoiceId,
      invoiceNumber,
      jobberWebUri: `https://secure.getjobber.com/invoices/${invoiceId}`,
      client: {
        ...previewResponse.data.client,
        name: recipientName,
        companyName: `${recipientName} Pty Ltd`,
      },
      jobs: jobIds.map((id) => ({ id })),
      properties: propertyIds.map((id, index) => ({
        id,
        address: {
          ...siteAddress,
          street1: `${index + 1} ${id} Street`,
        },
      })),
      selectedJobberJobId,
      selectedJobberPropertyId,
      selectionRequired: {
        job: jobSelectionRequired,
        property: propertySelectionRequired,
      },
    },
  }
}

async function mountStandaloneForm() {
  const dom = installTestDom()
  const { createRoot } = await import('react-dom/client')
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(StandaloneProgressInvoiceForm))
  })
  return {
    container: container as unknown as HTMLElement,
    cleanup: async () => {
      try {
        await act(async () => root.unmount())
      } finally {
        dom.cleanup()
        vi.unstubAllGlobals()
      }
    },
  }
}

async function submitSearch(container: HTMLElement, term: string): Promise<void> {
  const input = inputByName(container, 'jobberInvoiceNumber')
  await act(async () => {
    input.value = term
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const form = Array.from(container.querySelectorAll('form')).find((candidateForm) => (
    candidateForm.getAttribute('aria-label') === 'Find a Jobber invoice'
  ))
  if (!form) throw new Error('Search form was not rendered')
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

async function selectCandidate(container: HTMLElement, invoiceNumber: string): Promise<void> {
  await act(async () => {
    buttonByText(container, `Invoice ${invoiceNumber}`)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function saveDraft(container: HTMLElement, baseContract = '17220.50'): Promise<void> {
  const baseContractInput = inputByName(container, 'baseContractExGst')
  await act(async () => {
    baseContractInput.value = baseContract
    baseContractInput.dispatchEvent(new Event('input', { bubbles: true }))
    baseContractInput.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const form = Array.from(container.querySelectorAll('form')).find((candidateForm) => (
    candidateForm.getAttribute('aria-label') === 'Create standalone Progress Invoice series'
  ))
  if (!form) throw new Error('Create series form was not rendered')
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await flushReact()
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

  it('ignores a slower stale candidate preview and saves the latest selected invoice', async () => {
    const previewA = deferred<ReturnType<typeof jsonResponse>>()
    const previewB = deferred<ReturnType<typeof jsonResponse>>()
    const candidatesResponse = {
      ok: true,
      data: {
        accountId: 'account-1',
        invoices: [candidate('invoice-a', 'A'), candidate('invoice-b', 'B')],
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(candidatesResponse))
      .mockReturnValueOnce(previewA.promise)
      .mockReturnValueOnce(previewB.promise)
    vi.stubGlobal('fetch', fetchMock)
    mocks.createStandaloneProgressInvoiceFromJobber.mockResolvedValue({
      ok: true,
      data: { seriesId: 'series-b', version: 1, importedPayments: 0 },
    })
    const mounted = await mountStandaloneForm()

    try {
      await submitSearch(mounted.container, 'A or B')
      await flushReact()
      await selectCandidate(mounted.container, 'A')
      await selectCandidate(mounted.container, 'B')

      await act(async () => {
        previewB.resolve(jsonResponse(previewFixture({
          invoiceId: 'invoice-b',
          invoiceNumber: 'B',
          recipientName: 'Builder B',
        })))
        await previewB.promise
      })
      await flushReact()
      expect(inputByName(mounted.container, 'recipientName').value).toBe('Builder B')

      await act(async () => {
        previewA.resolve(jsonResponse(previewFixture({
          invoiceId: 'invoice-a',
          invoiceNumber: 'A',
          recipientName: 'Builder A',
        })))
        await previewA.promise
      })
      await flushReact()

      expect(inputByName(mounted.container, 'recipientName').value).toBe('Builder B')
      await saveDraft(mounted.container)
      expect(mocks.createStandaloneProgressInvoiceFromJobber).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedJobberInvoiceId: 'invoice-b',
          selectedJobberJobId: 'job-invoice-b',
          selectedJobberPropertyId: 'property-invoice-b',
          recipientName: 'Builder B',
        }),
      )
    } finally {
      await mounted.cleanup()
    }
  })

  it('ignores a slower stale relation preview and saves the latest property selection', async () => {
    const propertyOne = deferred<ReturnType<typeof jsonResponse>>()
    const propertyTwo = deferred<ReturnType<typeof jsonResponse>>()
    const initialPreview = previewFixture({
      invoiceId: 'invoice-relations',
      invoiceNumber: 'REL',
      recipientName: 'Relations Builder',
      jobIds: ['job-1'],
      propertyIds: ['property-1', 'property-2'],
      selectedJobberJobId: 'job-1',
      selectedJobberPropertyId: null,
      jobSelectionRequired: false,
      propertySelectionRequired: true,
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        data: {
          accountId: 'account-1',
          invoices: [candidate('invoice-relations', 'REL')],
        },
      }))
      .mockResolvedValueOnce(jsonResponse(initialPreview))
      .mockReturnValueOnce(propertyOne.promise)
      .mockReturnValueOnce(propertyTwo.promise)
    vi.stubGlobal('fetch', fetchMock)
    mocks.createStandaloneProgressInvoiceFromJobber.mockResolvedValue({
      ok: true,
      data: { seriesId: 'series-relations', version: 1, importedPayments: 0 },
    })
    const mounted = await mountStandaloneForm()

    try {
      await submitSearch(mounted.container, 'REL')
      await flushReact()
      await selectCandidate(mounted.container, 'REL')
      await flushReact()

      const propertySelect = mounted.container.querySelectorAll('select')[0]
      expect(propertySelect).toBeDefined()
      await act(async () => {
        propertySelect!.value = 'property-1'
        propertySelect!.dispatchEvent(new Event('change', { bubbles: true }))
        propertySelect!.value = 'property-2'
        propertySelect!.dispatchEvent(new Event('change', { bubbles: true }))
      })

      await act(async () => {
        propertyTwo.resolve(jsonResponse(previewFixture({
          invoiceId: 'invoice-relations',
          invoiceNumber: 'REL',
          recipientName: 'Relations Builder',
          jobIds: ['job-1'],
          propertyIds: ['property-1', 'property-2'],
          selectedJobberJobId: 'job-1',
          selectedJobberPropertyId: 'property-2',
          jobSelectionRequired: false,
          propertySelectionRequired: false,
        })))
        await propertyTwo.promise
      })
      await flushReact()
      expect(textareaByName(mounted.container, 'siteAddress').value).toContain(
        '2 property-2 Street',
      )

      await act(async () => {
        propertyOne.resolve(jsonResponse(previewFixture({
          invoiceId: 'invoice-relations',
          invoiceNumber: 'REL',
          recipientName: 'Relations Builder',
          jobIds: ['job-1'],
          propertyIds: ['property-1', 'property-2'],
          selectedJobberJobId: 'job-1',
          selectedJobberPropertyId: 'property-1',
          jobSelectionRequired: false,
          propertySelectionRequired: false,
        })))
        await propertyOne.promise
      })
      await flushReact()

      expect(textareaByName(mounted.container, 'siteAddress').value).toContain(
        '2 property-2 Street',
      )
      await saveDraft(mounted.container)
      expect(mocks.createStandaloneProgressInvoiceFromJobber).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedJobberInvoiceId: 'invoice-relations',
          selectedJobberJobId: 'job-1',
          selectedJobberPropertyId: 'property-2',
        }),
      )
    } finally {
      await mounted.cleanup()
    }
  })

  it('invalidates an unresolved preview when a new invoice search begins', async () => {
    const stalePreview = deferred<ReturnType<typeof jsonResponse>>()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        data: { accountId: 'account-1', invoices: [candidate('invoice-old', 'OLD')] },
      }))
      .mockReturnValueOnce(stalePreview.promise)
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        data: { accountId: 'account-1', invoices: [candidate('invoice-new', 'NEW')] },
      }))
    vi.stubGlobal('fetch', fetchMock)
    const mounted = await mountStandaloneForm()

    try {
      await submitSearch(mounted.container, 'OLD')
      await flushReact()
      await selectCandidate(mounted.container, 'OLD')
      await submitSearch(mounted.container, 'NEW')
      await flushReact()

      await act(async () => {
        stalePreview.resolve(jsonResponse(previewFixture({
          invoiceId: 'invoice-old',
          invoiceNumber: 'OLD',
          recipientName: 'Stale Builder',
        })))
        await stalePreview.promise
      })
      await flushReact()

      expect(mounted.container.textContent).toContain('Invoice NEW')
      expect(mounted.container.textContent).not.toContain('Jobber invoice OLD')
      expect(inputByName(mounted.container, 'recipientName').value).toBe('')
      expect(inputByName(mounted.container, 'recipientName').disabled).toBe(true)
    } finally {
      await mounted.cleanup()
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
