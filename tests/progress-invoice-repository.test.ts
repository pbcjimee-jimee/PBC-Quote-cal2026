import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

const serverMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: serverMocks.createClient,
}))

import {
  ProgressInvoiceRepository,
  createProgressInvoiceRepository,
  createProgressInvoiceRpcExecutor,
  type ProgressInvoiceRpcExecutor,
  type SaveBusinessInvoiceProfilePayload,
} from '@/lib/progress-invoices/repository'
import type { createClient as createAuthenticatedClient } from '@/lib/supabase/server'

const repositorySource = readFileSync(
  join(process.cwd(), 'lib', 'progress-invoices', 'repository.ts'),
  'utf8'
)

const payload: SaveBusinessInvoiceProfilePayload = {
  legal_name: 'Paint Buddy & Co Pty Ltd',
  trading_name: '',
  abn: '12345678901',
  contractor_licence: '',
  business_address: '1 Test Street, Sydney NSW 2000',
  phone: '0400000000',
  email: 'accounts@example.test',
  bank_name: 'Test Bank',
  bsb: '000-000',
  bank_account_name: 'Paint Buddy & Co',
  bank_account_number: '00000000',
  gst_rate: '0.10',
  business_timezone: 'Australia/Sydney',
  default_payment_term_days: 14,
}

const profileRow = {
  id: '00000000-0000-0000-0000-000000000001',
  legal_name: payload.legal_name,
  trading_name: payload.trading_name,
  abn: payload.abn,
  contractor_licence: payload.contractor_licence,
  business_address: payload.business_address,
  phone: payload.phone,
  email: payload.email,
  bank_name: payload.bank_name,
  bsb: payload.bsb,
  bank_account_name: payload.bank_account_name,
  bank_account_number: payload.bank_account_number,
  gst_rate: '0.10',
  business_timezone: payload.business_timezone,
  default_payment_term_days: 14,
  version: 1,
  created_by: '00000000-0000-0000-0000-000000000002',
  updated_by: '00000000-0000-0000-0000-000000000002',
  created_at: '2026-07-15T00:00:00+00:00',
  updated_at: '2026-07-15T00:00:00+00:00',
}

function clientReturning(
  response: Awaited<ReturnType<ProgressInvoiceRpcExecutor['execute']>>
): ProgressInvoiceRpcExecutor {
  return {
    execute: async () => response,
  }
}

describe('ProgressInvoiceRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the typed command and safely parses its result', async () => {
    let observedCommand = ''
    let observedPayload: unknown
    const client: ProgressInvoiceRpcExecutor = {
      execute: async (command, commandPayload) => {
        observedCommand = command
        observedPayload = commandPayload
        return { data: [profileRow], error: null }
      },
    }

    const result = await new ProgressInvoiceRepository(client).call(
      'save_business_invoice_profile',
      payload
    )

    expect(observedCommand).toBe('save_business_invoice_profile')
    expect(observedPayload).toEqual(payload)
    expect(result).toEqual({ ok: true, data: profileRow })
  })

  it('creates a production repository from the request-authenticated Supabase client', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [profileRow], error: null })
    serverMocks.createClient.mockResolvedValue({ rpc })

    const repository = await createProgressInvoiceRepository()
    const result = await repository.call('save_business_invoice_profile', payload)

    expect(serverMocks.createClient).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('save_business_invoice_profile', {
      payload,
    })
    expect(result).toEqual({ ok: true, data: profileRow })
  })

  it('accepts the actual authenticated createClient shape through the production adapter', () => {
    type AuthenticatedClient = Awaited<ReturnType<typeof createAuthenticatedClient>>
    type AdapterInput = Parameters<typeof createProgressInvoiceRpcExecutor>[0]

    expectTypeOf<AuthenticatedClient>().toMatchTypeOf<AdapterInput>()
    expectTypeOf(createProgressInvoiceRpcExecutor).returns.toMatchTypeOf<ProgressInvoiceRpcExecutor>()
  })

  it('keeps the production adapter authenticated and free of sensitive logging', () => {
    expect(repositorySource).toMatch(
      /import\s*\{\s*createClient\s*\}\s*from\s*'@\/lib\/supabase\/server'/
    )
    expect(repositorySource).not.toMatch(/createServiceClient|SUPABASE_SERVICE_ROLE_KEY/)
    expect(repositorySource).not.toMatch(/console\.|JSON\.stringify\s*\(\s*payload/)
  })

  it.each([
    ['PROGRESS_AUTH_REQUIRED', 'P0001', 'AUTH_REQUIRED'],
    ['PROGRESS_FORBIDDEN', '42501', 'FORBIDDEN'],
    ['PROGRESS_VERSION_CONFLICT', 'P0001', 'VERSION_CONFLICT'],
    ['PROGRESS_NOT_FOUND', 'P0001', 'NOT_FOUND'],
    ['PROGRESS_RECONCILIATION_REQUIRED', 'P0001', 'RECONCILIATION_REQUIRED'],
    ['PROGRESS_JOBBER_ERROR', 'P0001', 'JOBBER_ERROR'],
    ['PROGRESS_DOCUMENT_ERROR', 'P0001', 'DOCUMENT_ERROR'],
    ['PROGRESS_STORAGE_ERROR', 'P0001', 'STORAGE_ERROR'],
    ['IDEMPOTENCY_KEY_REUSED', 'P0001', 'VALIDATION'],
  ] as const)('maps %s to a safe domain result', async (message, code, expectedCode) => {
    const result = await new ProgressInvoiceRepository(
      clientReturning({ data: null, error: { message, code } })
    ).call('save_business_invoice_profile', payload)

    expect(result).toEqual({ ok: false, error: message, code: expectedCode })
  })

  it.each(['23502', '23505', '23514', '22P02', '22003', '22023'])(
    'maps database validation code %s without leaking details',
    async (code) => {
      const result = await new ProgressInvoiceRepository(
        clientReturning({
          data: null,
          error: {
            message: 'sensitive database detail',
            code,
            details: 'do not expose this',
          },
        })
      ).call('save_business_invoice_profile', payload)

      expect(result).toEqual({
        ok: false,
        error: code === '23505' ? 'PROGRESS_UNIQUE_CONFLICT' : 'PROGRESS_VALIDATION_FAILED',
        code: 'VALIDATION',
      })
    }
  )

  it('returns a generic safe error for unknown database failures', async () => {
    const result = await new ProgressInvoiceRepository(
      clientReturning({
        data: null,
        error: { message: 'secret row and storage detail', code: 'XX000' },
      })
    ).call('save_business_invoice_profile', payload)

    expect(result).toEqual({
      ok: false,
      error: 'PROGRESS_REQUEST_FAILED',
    })
  })

  it.each(['0.1000', '0.1', '10%', 0.1])(
    'rejects non-canonical RPC GST output %s instead of exposing an untyped row',
    async (gstRate) => {
      const result = await new ProgressInvoiceRepository(
        clientReturning({ data: [{ ...profileRow, gst_rate: gstRate }], error: null })
      ).call('save_business_invoice_profile', payload)

      expect(result).toEqual({
        ok: false,
        error: 'PROGRESS_RESPONSE_INVALID',
      })
    }
  )
})
