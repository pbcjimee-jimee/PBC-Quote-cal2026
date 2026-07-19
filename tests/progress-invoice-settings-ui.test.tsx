import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InvoiceProfileForm } from '@/components/progress-invoices/invoice-profile-form'
import type { BusinessInvoiceProfileDto } from '@/lib/progress-invoices/series-service'
import { installTestDom } from '@/tests/helpers/test-dom'

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  get: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock('@/lib/actions/progress-invoice-series', () => ({
  saveBusinessInvoiceProfile: mocks.save,
  getBusinessInvoiceProfile: mocks.get,
}))

const profile: BusinessInvoiceProfileDto = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  legalName: 'Harbour Example Co Pty Ltd',
  tradingName: 'Harbour Example Co',
  abn: '99000000000',
  contractorLicence: '',
  address: '1 Sample Street, Sydney NSW 2000',
  phone: '0400000000',
  email: 'accounts@example.test',
  bankName: 'Sample Bank',
  bsb: '000-000',
  bankAccountName: 'Harbour Example Co',
  accountNumber: '12345678',
  gstRate: '0.10',
  businessTimezone: 'Australia/Sydney',
  defaultPaymentTermDays: 14,
  version: 3,
}

async function mount(initialProfile: BusinessInvoiceProfileDto | null = profile) {
  const dom = installTestDom()
  const { createRoot } = await import('react-dom/client')
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => root.render(createElement(InvoiceProfileForm, { initialProfile })))
  return {
    container: container as unknown as HTMLElement,
    cleanup: async () => {
      try { await act(async () => root.unmount()) } finally { dom.cleanup() }
    },
  }
}

function input(container: HTMLElement, name: string): HTMLInputElement | HTMLTextAreaElement {
  const field = [
    ...Array.from(container.querySelectorAll('input')),
    ...Array.from(container.querySelectorAll('textarea')),
  ].find((candidate) => (
    candidate.getAttribute('name') === name
      || (candidate as HTMLInputElement | HTMLTextAreaElement).name === name
  ))
  if (!field) {
    throw new Error(`Missing field ${name}`)
  }
  return field as HTMLInputElement | HTMLTextAreaElement
}

async function change(container: HTMLElement, name: string, value: string): Promise<void> {
  const field = input(container, name)
  await act(async () => {
    field.value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function submit(container: HTMLElement): Promise<void> {
  const form = Array.from(container.querySelectorAll('form'))[0]
  if (!form) throw new Error('Missing Invoice Profile form')
  const propsKey = Object.keys(form).find((key) => key.startsWith('__reactProps$'))
  if (!propsKey) throw new Error('Missing React form props')
  const props = (form as unknown as Record<string, unknown>)[propsKey] as {
    onSubmit?: (event: { preventDefault: () => void }) => void
  }
  await act(async () => {
    props.onSubmit?.({ preventDefault: () => undefined })
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('Progress Invoice profile Settings UI', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders every approved field with fixed GST/timezone displays', () => {
    const markup = renderToStaticMarkup(createElement(InvoiceProfileForm, { initialProfile: profile }))

    for (const label of [
      'Legal name', 'Trading name', 'ABN', 'Contractor licence', 'Business address',
      'Phone', 'Email', 'Bank name', 'BSB', 'Account name', 'Account number',
      'Payment terms', 'GST rate', 'Business timezone',
    ]) expect(markup).toContain(label)
    expect(markup).toContain('10%')
    expect(markup).toContain('Australia/Sydney')
    expect(markup).not.toContain('name="gstRate"')
    expect(markup).not.toContain('name="businessTimezone"')
  })

  it('shows an accessible validation summary and field errors without calling the Action', async () => {
    const mounted = await mount(null)
    try {
      await submit(mounted.container)
      expect(mounted.container.textContent).toContain('Review the highlighted fields')
      expect(input(mounted.container, 'legalName').getAttribute('aria-invalid')).toBe('true')
      expect(input(mounted.container, 'abn').getAttribute('aria-describedby')).toBeTruthy()
      expect(mocks.save).not.toHaveBeenCalled()
    } finally {
      await mounted.cleanup()
    }
  })

  it('uses canonical returned state after a successful first save and refreshes', async () => {
    const saved = { ...profile, version: 1, abn: '99000000000' }
    mocks.save.mockResolvedValue({ ok: true, data: saved })
    const mounted = await mount(null)
    try {
      for (const [name, value] of Object.entries({
        legalName: profile.legalName, abn: '99 000 000 000', address: profile.address,
        phone: profile.phone, email: profile.email, bankName: profile.bankName, bsb: profile.bsb,
        bankAccountName: profile.bankAccountName, accountNumber: profile.accountNumber,
        defaultPaymentTermDays: '14',
      })) await change(mounted.container, name, value)
      await submit(mounted.container)

      expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
        abn: '99000000000',
        bsb: '000-000',
        accountNumber: '12345678',
        gstRate: '0.10',
        businessTimezone: 'Australia/Sydney',
      }))
      expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty('expectedVersion')
      expect(input(mounted.container, 'abn').value).toBe('99000000000')
      expect(mocks.refresh).toHaveBeenCalledTimes(1)
    } finally {
      await mounted.cleanup()
    }
  })

  it('preserves unsaved input on conflict and requires an explicit reload before retry', async () => {
    mocks.save.mockResolvedValue({
      ok: false,
      error: 'PROGRESS_VERSION_CONFLICT',
      code: 'VERSION_CONFLICT',
    })
    const mounted = await mount()
    try {
      await change(mounted.container, 'legalName', 'Unsaved Legal Name')
      await submit(mounted.container)

      expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 3 }))
      expect(input(mounted.container, 'legalName').value).toBe('Unsaved Legal Name')
      expect(mounted.container.textContent).toContain('changed since you loaded it')
      const reload = Array.from(mounted.container.querySelectorAll('button'))
        .find((button) => button.textContent.includes('Reload saved profile'))
      expect(reload).toBeDefined()
      expect(Array.from(mounted.container.querySelectorAll('button'))
        .find((button) => button.textContent.includes('Save Invoice Profile'))?.disabled).toBe(true)
    } finally {
      await mounted.cleanup()
    }
  })

  it('keeps bank/profile data out of URL, browser storage, analytics, and console paths', () => {
    const source = readFileSync(join(
      process.cwd(), 'components/progress-invoices/invoice-profile-form.tsx',
    ), 'utf8')
    expect(source).not.toMatch(/localStorage|sessionStorage|URLSearchParams|searchParams|analytics|console\./)
    expect(source).not.toMatch(/router\.(?:push|replace)\s*\(/)
    expect(source).not.toMatch(/JSON\.stringify\s*\(\s*(?:form|profile|payload)/)
  })

  it('links Settings to the dedicated Invoice Profile without nesting Progress Invoices under Inventory', () => {
    const source = readFileSync(join(process.cwd(), 'app/(app)/settings/page.tsx'), 'utf8')
    expect(source).toContain('href="/settings/invoice"')
    expect(source).toContain('Invoice Profile')
    expect(source.indexOf('href="/settings/invoice"')).not.toBe(source.indexOf('href="/settings/inventory"'))
  })
})
