import { readFileSync } from 'node:fs'

import { act, createElement } from 'react'
import type { Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import NewProgressInvoicePage from '@/app/(app)/progress-invoices/new/page'
import { ProgressInvoiceCreateWorkspace } from '@/components/progress-invoices/progress-invoice-create-workspace'
import {
  buildStandaloneDraft,
  formatJobberAddress,
  parseJobberInvoicePreviewResponse,
  parseJobberInvoiceSearchResponse,
} from '@/lib/progress-invoices/standalone-import-contract'
import { installTestDom } from '@/tests/helpers/test-dom'

const mocks = vi.hoisted(() => ({
  createStandaloneProgressInvoiceFromJobber: vi.fn(),
  createManualProgressInvoiceSeries: vi.fn(),
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

vi.mock('@/lib/actions/progress-invoice-series', () => ({
  createManualProgressInvoiceSeries: mocks.createManualProgressInvoiceSeries,
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

function spanTextById(container: HTMLElement, id: string): string | undefined {
  return Array.from(container.querySelectorAll('span')).find((candidate) => (
    candidate.getAttribute('id') === id
  ))?.textContent
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

async function mountCreateWorkspace() {
  const dom = installTestDom()
  const { createRoot } = await import('react-dom/client')
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(ProgressInvoiceCreateWorkspace))
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

async function changeInput(
  container: HTMLElement,
  name: string,
  value: string,
): Promise<void> {
  const field = inputByName(container, name)
  await act(async () => {
    field.value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function changeTextarea(
  container: HTMLElement,
  name: string,
  value: string,
): Promise<void> {
  const field = textareaByName(container, name)
  await act(async () => {
    field.value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function selectMode(container: HTMLElement, label: string): Promise<void> {
  await act(async () => {
    buttonByText(container, label).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function pressKey(element: HTMLElement, key: string): Promise<void> {
  const event = new Event('keydown', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'key', { configurable: true, value: key })
  await act(async () => {
    element.dispatchEvent(event)
  })
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

async function submitManual(container: HTMLElement): Promise<void> {
  const form = Array.from(container.querySelectorAll('form')).find((candidateForm) => (
    candidateForm.getAttribute('aria-label') === 'Create manual Progress Invoice series'
  ))
  if (!form) throw new Error('Manual create series form was not rendered')
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await flushReact()
}

async function completeManualDraft(container: HTMLElement): Promise<void> {
  await changeInput(container, 'acceptedNumberingBase', '2906')
  await changeInput(container, 'baseContractExGst', '17220.50')
  await changeInput(container, 'recipientName', 'Manual Builder')
  await changeTextarea(container, 'recipientAddress', '1 Billing Street')
  await changeInput(container, 'siteName', 'Manual Site')
  await changeTextarea(container, 'siteAddress', '4 Site Street')
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
      'Import from Jobber',
      'Create manually',
      'Jobber Invoice Number',
      'Fetch invoice',
      'Base contract Ex GST',
      'Enter the original accepted contract amount before Variations or Credits, excluding GST.',
      'Jobber amounts are for comparison only',
      'Recipient',
      'Site',
      'Create Progress Invoice series',
    ]) expect(markup).toContain(copy)
    expect(markup).not.toContain('Existing PBC Quote')
    expect(markup).not.toContain('Browse PBC Quotes')
    expect(markup).not.toContain('Start from a PBC Quote')
    expect(markup).not.toContain('href="/quotes"')
    expect(markup).not.toContain('guided landing page is read-only')
    expect(markup).not.toContain('next implementation step')
    expect(markup).not.toContain('Refresh Jobber')
    expect(markup).not.toContain('Sync Jobber')
    expect(markup).not.toContain('Auto sync')
  })

  it('defaults to an accessible Jobber tab and associates each mode with its panel', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const mounted = await mountCreateWorkspace()

    try {
      const tabs = Array.from(mounted.container.querySelectorAll('button')).filter((button) => (
        button.getAttribute('role') === 'tab'
      ))
      expect(tabs).toHaveLength(2)
      expect(tabs[0]?.textContent).toContain('Import from Jobber')
      expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
      expect(tabs[0]?.getAttribute('aria-controls')).toBe('progress-invoice-jobber-panel')
      expect(tabs[1]?.textContent).toContain('Create manually')
      expect(tabs[1]?.getAttribute('aria-selected')).toBe('false')
      expect(tabs[1]?.getAttribute('aria-controls')).toBe('progress-invoice-manual-panel')
      const panel = Array.from(mounted.container.querySelectorAll('section')).find((section) => (
        section.getAttribute('role') === 'tabpanel'
      ))
      expect(panel?.getAttribute('id')).toBe('progress-invoice-jobber-panel')
      expect(panel?.getAttribute('aria-labelledby')).toBe('progress-invoice-jobber-tab')
      expect(inputByName(mounted.container, 'jobberInvoiceNumber')).toBeDefined()
    } finally {
      await mounted.cleanup()
    }
  })

  it('moves tab focus, selection, and panel linkage with ArrowRight and ArrowLeft', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const mounted = await mountCreateWorkspace()

    try {
      let jobberTab = buttonByText(mounted.container, 'Import from Jobber')
      let manualTab = buttonByText(mounted.container, 'Create manually')
      const manualFocus = vi.fn()
      Object.defineProperty(manualTab, 'focus', { configurable: true, value: manualFocus })

      await pressKey(jobberTab, 'ArrowRight')

      jobberTab = buttonByText(mounted.container, 'Import from Jobber')
      manualTab = buttonByText(mounted.container, 'Create manually')
      expect(manualFocus).toHaveBeenCalledTimes(1)
      expect(jobberTab.getAttribute('aria-selected')).toBe('false')
      expect(jobberTab.getAttribute('tabindex')).toBe('-1')
      expect(manualTab.getAttribute('aria-selected')).toBe('true')
      expect(manualTab.getAttribute('tabindex')).toBe('0')
      let panel = Array.from(mounted.container.querySelectorAll('section')).find((section) => (
        section.getAttribute('role') === 'tabpanel'
      ))
      expect(panel?.getAttribute('id')).toBe('progress-invoice-manual-panel')
      expect(panel?.getAttribute('aria-labelledby')).toBe('progress-invoice-manual-tab')

      const jobberFocus = vi.fn()
      Object.defineProperty(jobberTab, 'focus', { configurable: true, value: jobberFocus })
      await pressKey(manualTab, 'ArrowLeft')

      jobberTab = buttonByText(mounted.container, 'Import from Jobber')
      manualTab = buttonByText(mounted.container, 'Create manually')
      expect(jobberFocus).toHaveBeenCalledTimes(1)
      expect(jobberTab.getAttribute('aria-selected')).toBe('true')
      expect(jobberTab.getAttribute('tabindex')).toBe('0')
      expect(manualTab.getAttribute('aria-selected')).toBe('false')
      expect(manualTab.getAttribute('tabindex')).toBe('-1')
      panel = Array.from(mounted.container.querySelectorAll('section')).find((section) => (
        section.getAttribute('role') === 'tabpanel'
      ))
      expect(panel?.getAttribute('id')).toBe('progress-invoice-jobber-panel')
      expect(panel?.getAttribute('aria-labelledby')).toBe('progress-invoice-jobber-tab')
    } finally {
      await mounted.cleanup()
    }
  })

  it('keeps native Jobber form validation and its email input type enabled', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const mounted = await mountCreateWorkspace()
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceCreateWorkspace))

    try {
      const createForm = Array.from(mounted.container.querySelectorAll('form')).find((form) => (
        form.getAttribute('aria-label') === 'Create standalone Progress Invoice series'
      ))
      expect(createForm).toBeDefined()
      const createFormTag = markup.match(
        /<form class="pbc-progress-series-form" aria-label="Create standalone Progress Invoice series"[^>]*>/,
      )?.[0]
      expect(createFormTag).toBeDefined()
      expect(createFormTag).not.toMatch(/novalidate/i)
      expect(markup).toContain('type="email"')
    } finally {
      await mounted.cleanup()
    }
  })

  it('creates a Jobber series on LAN HTTP when crypto.randomUUID is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(searchResponse))
      .mockResolvedValueOnce(jsonResponse(previewResponse)))
    mocks.createStandaloneProgressInvoiceFromJobber.mockResolvedValue({
      ok: true,
      data: { seriesId: 'series-lan', version: 1, importedPayments: 0 },
    })
    const mounted = await mountCreateWorkspace()

    try {
      await submitSearch(mounted.container, '2906')
      await flushReact()
      await selectCandidate(mounted.container, '2906')
      await flushReact()
      vi.stubGlobal('crypto', {
        getRandomValues(bytes: Uint8Array) {
          bytes.fill(0xab)
          return bytes
        },
      })

      await saveDraft(mounted.container)

      expect(mocks.createStandaloneProgressInvoiceFromJobber).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationKey: 'abababab-abab-4bab-abab-abababababab',
        }),
      )
      expect(mocks.push).toHaveBeenCalledWith('/progress-invoices')
    } finally {
      await mounted.cleanup()
    }
  })

  it('switches to Manual without fetching and renders the accepted base and shared fields', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const mounted = await mountCreateWorkspace()

    try {
      await selectMode(mounted.container, 'Create manually')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(() => inputByName(mounted.container, 'jobberInvoiceNumber')).toThrow()
      expect(inputByName(mounted.container, 'acceptedNumberingBase').value).toBe('')
      expect(inputByName(mounted.container, 'recipientName').value).toBe('')
      const manualTab = buttonByText(mounted.container, 'Create manually')
      expect(manualTab.getAttribute('aria-selected')).toBe('true')
      const panel = Array.from(mounted.container.querySelectorAll('section')).find((section) => (
        section.getAttribute('role') === 'tabpanel'
      ))
      expect(panel?.getAttribute('id')).toBe('progress-invoice-manual-panel')
      expect(panel?.getAttribute('aria-labelledby')).toBe('progress-invoice-manual-tab')
    } finally {
      await mounted.cleanup()
    }
  })

  it('preserves independent Jobber and Manual drafts across unmount and remount', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(searchResponse))
      .mockResolvedValueOnce(jsonResponse(previewResponse)))
    const mounted = await mountCreateWorkspace()

    try {
      await submitSearch(mounted.container, '2906')
      await flushReact()
      await selectCandidate(mounted.container, '2906')
      await flushReact()
      await changeInput(mounted.container, 'recipientName', 'Jobber Draft Builder')
      await changeInput(mounted.container, 'baseContractExGst', '17220.50')

      await selectMode(mounted.container, 'Create manually')
      await changeInput(mounted.container, 'recipientName', 'Manual Draft Builder')
      await changeInput(mounted.container, 'acceptedNumberingBase', 'MAN-2906')
      expect(inputByName(mounted.container, 'recipientName').value).toBe('Manual Draft Builder')
      expect(mounted.container.textContent).not.toContain('Save was interrupted')

      await selectMode(mounted.container, 'Import from Jobber')
      expect(inputByName(mounted.container, 'recipientName').value).toBe('Jobber Draft Builder')
      expect(inputByName(mounted.container, 'baseContractExGst').value).toBe('17220.50')
      expect(() => inputByName(mounted.container, 'acceptedNumberingBase')).toThrow()

      await selectMode(mounted.container, 'Create manually')
      expect(inputByName(mounted.container, 'recipientName').value).toBe('Manual Draft Builder')
      expect(inputByName(mounted.container, 'acceptedNumberingBase').value).toBe('MAN-2906')
      expect(mounted.container.textContent).not.toContain('Save was interrupted')
    } finally {
      await mounted.cleanup()
    }
  })

  it('routes a late Jobber preview only to its origin mode and preserves the Manual draft', async () => {
    const latePreview = deferred<ReturnType<typeof jsonResponse>>()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(searchResponse))
      .mockReturnValueOnce(latePreview.promise))
    const mounted = await mountCreateWorkspace()

    try {
      await submitSearch(mounted.container, '2906')
      await flushReact()
      await selectCandidate(mounted.container, '2906')
      await selectMode(mounted.container, 'Create manually')
      await changeInput(mounted.container, 'recipientName', 'Manual Stays Here')

      await act(async () => {
        latePreview.resolve(jsonResponse(previewResponse))
        await latePreview.promise
      })
      await flushReact()

      expect(inputByName(mounted.container, 'recipientName').value).toBe('Manual Stays Here')
      expect(mounted.container.textContent).not.toContain('Jobber invoice 2906')
      await selectMode(mounted.container, 'Import from Jobber')
      expect(inputByName(mounted.container, 'recipientName').value).toBe('Example Builder')
    } finally {
      await mounted.cleanup()
    }
  })

  it('ignores a stale Jobber search response after a newer search completes', async () => {
    const oldSearch = deferred<ReturnType<typeof jsonResponse>>()
    const newSearch = deferred<ReturnType<typeof jsonResponse>>()
    vi.stubGlobal('fetch', vi.fn()
      .mockReturnValueOnce(oldSearch.promise)
      .mockReturnValueOnce(newSearch.promise))
    const mounted = await mountCreateWorkspace()

    try {
      await submitSearch(mounted.container, 'OLD')
      await submitSearch(mounted.container, 'NEW')
      await act(async () => {
        newSearch.resolve(jsonResponse({
          ok: true,
          data: { accountId: 'account-1', invoices: [candidate('invoice-new', 'NEW')] },
        }))
        await newSearch.promise
      })
      await flushReact()
      await act(async () => {
        oldSearch.resolve(jsonResponse({
          ok: true,
          data: { accountId: 'account-1', invoices: [candidate('invoice-old', 'OLD')] },
        }))
        await oldSearch.promise
      })
      await flushReact()

      expect(mounted.container.textContent).toContain('Invoice NEW')
      expect(mounted.container.textContent).not.toContain('Invoice OLD')
    } finally {
      await mounted.cleanup()
    }
  })

  it('reports every invalid Manual field locally without clearing entered values or calling the action', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const mounted = await mountCreateWorkspace()

    try {
      await selectMode(mounted.container, 'Create manually')
      await changeInput(mounted.container, 'baseContractExGst', '17220.501')
      await changeInput(mounted.container, 'recipientName', 'Keep this value')
      await submitManual(mounted.container)

      expect(mocks.createManualProgressInvoiceSeries).not.toHaveBeenCalled()
      expect(inputByName(mounted.container, 'recipientName').value).toBe('Keep this value')
      expect(inputByName(mounted.container, 'baseContractExGst').value).toBe('17220.501')
      for (const name of [
        'acceptedNumberingBase',
        'baseContractExGst',
        'recipientAddress',
        'siteName',
        'siteAddress',
      ]) {
        const field = name === 'recipientAddress' || name === 'siteAddress'
          ? textareaByName(mounted.container, name)
          : inputByName(mounted.container, name)
        expect(field.getAttribute('aria-invalid')).toBe('true')
        const messageId = field.getAttribute('aria-describedby')
        expect(messageId).toBeTruthy()
        expect(mounted.container.textContent).toContain(
          name === 'baseContractExGst'
            ? 'Enter a positive amount with up to two decimals.'
            : 'This field is required.',
        )
      }
    } finally {
      await mounted.cleanup()
    }
  })

  it('reports invalid optional Manual email and ABN fields locally without clearing raw values', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const mounted = await mountCreateWorkspace()

    try {
      await selectMode(mounted.container, 'Create manually')
      await completeManualDraft(mounted.container)
      await changeInput(mounted.container, 'recipientEmail', 'not-an-email')
      await changeInput(mounted.container, 'recipientAbn', '12 34 invalid')
      await submitManual(mounted.container)

      expect(mocks.createManualProgressInvoiceSeries).not.toHaveBeenCalled()
      for (const [name, rawValue, message] of [
        ['recipientEmail', 'not-an-email', 'Enter a valid email address.'],
        ['recipientAbn', '12 34 invalid', 'Enter an 11-digit ABN.'],
      ] as const) {
        const field = inputByName(mounted.container, name)
        expect(field.value).toBe(rawValue)
        expect(field.getAttribute('aria-invalid')).toBe('true')
        const messageId = field.getAttribute('aria-describedby')
        expect(messageId).toBeTruthy()
        expect(spanTextById(mounted.container, messageId!)).toBe(message)
      }
    } finally {
      await mounted.cleanup()
    }
  })

  it.each([
    ['recipientEmail', 'accounts@example.test', 'PROGRESS_EMAIL_INVALID', 'Enter a valid email address.'],
    ['recipientAbn', '11 222 333 444', 'PROGRESS_ABN_INVALID', 'Enter an 11-digit ABN.'],
  ] as const)(
    'maps server %s validation to its Manual field and replays the unchanged attempt key',
    async (fieldName, rawValue, error, message) => {
      vi.stubGlobal('fetch', vi.fn())
      mocks.createManualProgressInvoiceSeries
        .mockResolvedValueOnce({ ok: false, error, code: 'VALIDATION' })
        .mockResolvedValueOnce({ ok: true, data: { id: 'series-manual', version: 1 } })
      const mounted = await mountCreateWorkspace()

      try {
        await selectMode(mounted.container, 'Create manually')
        await completeManualDraft(mounted.container)
        await changeInput(mounted.container, fieldName, rawValue)
        await submitManual(mounted.container)

        const field = inputByName(mounted.container, fieldName)
        expect(field.value).toBe(rawValue)
        expect(field.getAttribute('aria-invalid')).toBe('true')
        const messageId = field.getAttribute('aria-describedby')
        expect(messageId).toBeTruthy()
        expect(spanTextById(mounted.container, messageId!)).toBe(message)
        expect(mocks.push).not.toHaveBeenCalled()
        const firstKey = mocks.createManualProgressInvoiceSeries.mock.calls[0]?.[0]
          .correlationKey

        await submitManual(mounted.container)

        expect(mocks.createManualProgressInvoiceSeries.mock.calls[1]?.[0]
          .correlationKey).toBe(firstKey)
        expect(mocks.push).toHaveBeenCalledTimes(1)
        expect(mocks.push).toHaveBeenCalledWith('/progress-invoices')
        expect(mocks.refresh).toHaveBeenCalledTimes(1)
      } finally {
        await mounted.cleanup()
      }
    },
  )

  it('submits only Manual local fields, reuses an unchanged retry key, and rotates it after an edit', async () => {
    vi.stubGlobal('fetch', vi.fn())
    mocks.createManualProgressInvoiceSeries
      .mockRejectedValueOnce(new Error('transient transport failure'))
      .mockResolvedValueOnce({ ok: false, error: 'PROGRESS_TEMPORARY_FAILURE' })
      .mockResolvedValueOnce({ ok: true, data: { id: 'series-manual', version: 1 } })
    const mounted = await mountCreateWorkspace()

    try {
      await selectMode(mounted.container, 'Create manually')
      await completeManualDraft(mounted.container)
      await changeInput(mounted.container, 'recipientCompany', 'Manual Builder Pty Ltd')
      await changeInput(mounted.container, 'recipientEmail', 'accounts@example.test')
      await changeInput(mounted.container, 'recipientPhone', '0400 000 000')
      await changeInput(mounted.container, 'recipientAbn', '11 222 333 444')
      await changeInput(mounted.container, 'reference', 'Manual reference')

      await submitManual(mounted.container)
      await submitManual(mounted.container)
      const firstPayload = mocks.createManualProgressInvoiceSeries.mock.calls[0]?.[0]
      const retryPayload = mocks.createManualProgressInvoiceSeries.mock.calls[1]?.[0]
      expect(firstPayload).toEqual({
        acceptedNumberingBase: '2906',
        baseContractExGst: '17220.50',
        recipientName: 'Manual Builder',
        recipientCompany: 'Manual Builder Pty Ltd',
        recipientAddress: '1 Billing Street',
        recipientEmail: 'accounts@example.test',
        recipientPhone: '0400 000 000',
        recipientAbn: '11 222 333 444',
        siteName: 'Manual Site',
        siteAddress: '4 Site Street',
        defaultDescription: 'Progress painting works',
        reference: 'Manual reference',
        correlationKey: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
      })
      expect(retryPayload.correlationKey).toBe(firstPayload.correlationKey)
      for (const forbidden of [
        'sourceType',
        'gstRate',
        'quoteId',
        'pbcQuoteId',
        'jobberInvoiceId',
        'observation',
        'payments',
        'amounts',
      ]) expect(firstPayload).not.toHaveProperty(forbidden)

      await changeInput(mounted.container, 'reference', 'Edited reference')
      await submitManual(mounted.container)
      const editedPayload = mocks.createManualProgressInvoiceSeries.mock.calls[2]?.[0]
      expect(editedPayload.correlationKey).not.toBe(firstPayload.correlationKey)
      expect(mocks.push).toHaveBeenCalledWith('/progress-invoices')
      expect(mocks.refresh).toHaveBeenCalledTimes(1)
    } finally {
      await mounted.cleanup()
    }
  })

  it('shows a stable duplicate-number error without clearing the Manual draft', async () => {
    vi.stubGlobal('fetch', vi.fn())
    mocks.createManualProgressInvoiceSeries.mockResolvedValueOnce({
      ok: false,
      error: 'PROGRESS_UNIQUE_CONFLICT',
      code: 'VALIDATION',
    })
    const mounted = await mountCreateWorkspace()

    try {
      await selectMode(mounted.container, 'Create manually')
      await completeManualDraft(mounted.container)
      await submitManual(mounted.container)

      expect(mounted.container.textContent).toContain(
        'That Invoice number base is already used by an active series.',
      )
      expect(inputByName(mounted.container, 'acceptedNumberingBase').value).toBe('2906')
      expect(inputByName(mounted.container, 'recipientName').value).toBe('Manual Builder')
      expect(mocks.push).not.toHaveBeenCalled()
    } finally {
      await mounted.cleanup()
    }
  })

  it('invalidates pending mode-scoped saves without changing either unchanged retry key', async () => {
    const jobberSave = deferred<{ ok: false; error: string }>()
    const manualSave = deferred<{ ok: false; error: string }>()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(searchResponse))
      .mockResolvedValueOnce(jsonResponse(previewResponse)))
    mocks.createStandaloneProgressInvoiceFromJobber
      .mockReturnValueOnce(jobberSave.promise)
      .mockResolvedValueOnce({ ok: false, error: 'PROGRESS_TEMPORARY_FAILURE' })
    mocks.createManualProgressInvoiceSeries
      .mockReturnValueOnce(manualSave.promise)
      .mockResolvedValueOnce({ ok: false, error: 'PROGRESS_TEMPORARY_FAILURE' })
    const mounted = await mountCreateWorkspace()

    try {
      await submitSearch(mounted.container, '2906')
      await flushReact()
      await selectCandidate(mounted.container, '2906')
      await flushReact()
      await saveDraft(mounted.container)
      const firstJobberKey = mocks.createStandaloneProgressInvoiceFromJobber.mock.calls[0]?.[0]
        .correlationKey

      await selectMode(mounted.container, 'Create manually')
      await completeManualDraft(mounted.container)
      await submitManual(mounted.container)
      const firstManualKey = mocks.createManualProgressInvoiceSeries.mock.calls[0]?.[0]
        .correlationKey

      await selectMode(mounted.container, 'Import from Jobber')
      await act(async () => {
        jobberSave.resolve({ ok: false, error: 'JOBBER_LATE_FAILURE' })
        manualSave.resolve({ ok: false, error: 'MANUAL_LATE_FAILURE' })
        await Promise.all([jobberSave.promise, manualSave.promise])
      })
      await flushReact()
      expect(mocks.push).not.toHaveBeenCalled()

      await saveDraft(mounted.container)
      expect(mocks.createStandaloneProgressInvoiceFromJobber.mock.calls[1]?.[0]
        .correlationKey).toBe(firstJobberKey)
      await selectMode(mounted.container, 'Create manually')
      await submitManual(mounted.container)
      expect(mocks.createManualProgressInvoiceSeries.mock.calls[1]?.[0]
        .correlationKey).toBe(firstManualKey)
      expect(inputByName(mounted.container, 'acceptedNumberingBase').value).toBe('2906')
    } finally {
      await mounted.cleanup()
    }
  })

  it('ignores a late Jobber save success after switching modes and replays its key once active', async () => {
    const lateJobberSave = deferred<{
      ok: true
      data: { seriesId: string; version: number; importedPayments: number }
    }>()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(searchResponse))
      .mockResolvedValueOnce(jsonResponse(previewResponse)))
    mocks.createStandaloneProgressInvoiceFromJobber
      .mockReturnValueOnce(lateJobberSave.promise)
      .mockResolvedValueOnce({
        ok: true,
        data: { seriesId: 'series-jobber-replay', version: 1, importedPayments: 0 },
      })
    const mounted = await mountCreateWorkspace()

    try {
      await submitSearch(mounted.container, '2906')
      await flushReact()
      await selectCandidate(mounted.container, '2906')
      await flushReact()
      await saveDraft(mounted.container)
      const firstKey = mocks.createStandaloneProgressInvoiceFromJobber.mock.calls[0]?.[0]
        .correlationKey

      await selectMode(mounted.container, 'Create manually')
      await changeInput(mounted.container, 'recipientName', 'Manual mode stays active')
      await act(async () => {
        lateJobberSave.resolve({
          ok: true,
          data: { seriesId: 'series-jobber-late', version: 1, importedPayments: 0 },
        })
        await lateJobberSave.promise
      })
      await flushReact()

      expect(inputByName(mounted.container, 'recipientName').value).toBe(
        'Manual mode stays active',
      )
      expect(mocks.push).not.toHaveBeenCalled()
      expect(mocks.refresh).not.toHaveBeenCalled()

      await selectMode(mounted.container, 'Import from Jobber')
      expect(inputByName(mounted.container, 'baseContractExGst').value).toBe('17220.50')
      expect(mounted.container.textContent).toContain(
        'Save was interrupted when you changed creation method. Retry to confirm the result.',
      )
      await saveDraft(mounted.container)

      expect(mocks.createStandaloneProgressInvoiceFromJobber.mock.calls[1]?.[0]
        .correlationKey).toBe(firstKey)
      expect(mocks.push).toHaveBeenCalledTimes(1)
      expect(mocks.push).toHaveBeenCalledWith('/progress-invoices')
      expect(mocks.refresh).toHaveBeenCalledTimes(1)
    } finally {
      await mounted.cleanup()
    }
  })

  it('ignores a late Manual save success after switching modes and replays its key once active', async () => {
    const lateManualSave = deferred<{
      ok: true
      data: { id: string; version: number }
    }>()
    vi.stubGlobal('fetch', vi.fn())
    mocks.createManualProgressInvoiceSeries
      .mockReturnValueOnce(lateManualSave.promise)
      .mockResolvedValueOnce({ ok: true, data: { id: 'series-manual-replay', version: 1 } })
    const mounted = await mountCreateWorkspace()

    try {
      await changeInput(mounted.container, 'jobberInvoiceNumber', 'JOBBER-STAYS')
      await selectMode(mounted.container, 'Create manually')
      await completeManualDraft(mounted.container)
      await submitManual(mounted.container)
      const firstKey = mocks.createManualProgressInvoiceSeries.mock.calls[0]?.[0]
        .correlationKey

      await selectMode(mounted.container, 'Import from Jobber')
      expect(inputByName(mounted.container, 'jobberInvoiceNumber').value).toBe('JOBBER-STAYS')
      await act(async () => {
        lateManualSave.resolve({
          ok: true,
          data: { id: 'series-manual-late', version: 1 },
        })
        await lateManualSave.promise
      })
      await flushReact()

      expect(inputByName(mounted.container, 'jobberInvoiceNumber').value).toBe('JOBBER-STAYS')
      expect(mocks.push).not.toHaveBeenCalled()
      expect(mocks.refresh).not.toHaveBeenCalled()

      await selectMode(mounted.container, 'Create manually')
      expect(inputByName(mounted.container, 'acceptedNumberingBase').value).toBe('2906')
      expect(inputByName(mounted.container, 'recipientName').value).toBe('Manual Builder')
      expect(mounted.container.textContent).toContain(
        'Save was interrupted when you changed creation method. Retry to confirm the result.',
      )
      await submitManual(mounted.container)

      expect(mocks.createManualProgressInvoiceSeries.mock.calls[1]?.[0]
        .correlationKey).toBe(firstKey)
      expect(mocks.push).toHaveBeenCalledTimes(1)
      expect(mocks.push).toHaveBeenCalledWith('/progress-invoices')
      expect(mocks.refresh).toHaveBeenCalledTimes(1)
    } finally {
      await mounted.cleanup()
    }
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
        root!.render(createElement(ProgressInvoiceCreateWorkspace))
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

  it('retains edited values and offers the existing series when duplicate import is rejected', async () => {
    const encodedInvoiceNumber = 'INV 29/06'
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ...searchResponse,
        data: {
          ...searchResponse.data,
          invoices: [{
            ...searchResponse.data.invoices[0],
            invoiceNumber: encodedInvoiceNumber,
          }],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        ...previewResponse,
        data: { ...previewResponse.data, invoiceNumber: encodedInvoiceNumber },
      })))
    mocks.createStandaloneProgressInvoiceFromJobber.mockResolvedValueOnce({
      ok: false,
      error: 'PROGRESS_JOBBER_ALREADY_IMPORTED',
      code: 'VALIDATION',
      current: { seriesId: 'existing-series', version: 4 },
    })
    const mounted = await mountCreateWorkspace()

    try {
      await submitSearch(mounted.container, encodedInvoiceNumber)
      await flushReact()
      await selectCandidate(mounted.container, encodedInvoiceNumber)
      await flushReact()
      await saveDraft(mounted.container)

      expect(mocks.push).not.toHaveBeenCalled()
      expect(mocks.refresh).not.toHaveBeenCalled()
      expect(inputByName(mounted.container, 'baseContractExGst').value).toBe('17220.50')
      expect(inputByName(mounted.container, 'recipientName').value).toBe('Example Builder')
      expect(mounted.container.textContent).toContain(
        'This Jobber invoice already has a Progress Invoice series. The values entered here were not saved.',
      )
      const openExisting = Array.from(mounted.container.querySelectorAll('a')).find((link) => (
        link.textContent?.trim() === 'Open existing series'
      ))
      expect(openExisting?.getAttribute('href')).toBe(
        '/progress-invoices?q=INV%2029%2F06#progress-invoice-existing-series',
      )
    } finally {
      await mounted.cleanup()
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
    const mounted = await mountCreateWorkspace()

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
    const mounted = await mountCreateWorkspace()

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
    const mounted = await mountCreateWorkspace()

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
    const sharedCss = readFileSync('app/styles/components.css', 'utf8')
    const globalCss = readFileSync('app/globals.css', 'utf8')
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceCreateWorkspace))

    expect(markup).toContain('pbc-card pbc-card--pad')
    expect(markup).toContain('pbc-input')
    expect(markup).toContain('pbc-progress-standalone')
    expect(sharedCss).toContain('.pbc-progress-form-grid')
    expect(sharedCss).toContain('.pbc-progress-comparison-grid')
    expect(globalCss).toMatch(
      /\.pbc-progress-create-grid--workspace\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);\s*\}/,
    )
    expect(globalCss).toMatch(
      /\.pbc-progress-create-workspace,\s*\.pbc-progress-create-workspace > \[role="tabpanel"\]\s*\{\s*width:\s*100%;\s*min-width:\s*0;\s*\}/,
    )
    expect(globalCss).toContain('.pbc-progress-create-modes')
    expect(globalCss).toContain('.pbc-progress-create-workspace .pbc-field__error')
    expect(globalCss).not.toMatch(/(?:^|\n)\.pbc-field__error\s*\{/)
    expect(globalCss).toContain('@media (max-width: 720px)')
  })
})
