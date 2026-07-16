import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const serverMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: serverMocks.createClient,
  createServiceClient: serverMocks.createServiceClient,
}))

import {
  ProgressInvoiceRepository,
  ProgressInvoiceJobberPersistenceRepository,
  createProgressInvoiceJobberPersistenceRepository,
  createProgressInvoiceRepository,
  createProgressInvoiceRpcExecutor,
  createProgressInvoiceServiceRpcExecutor,
  type ProgressInvoiceRpcExecutor,
  type ProgressInvoiceServiceRpcExecutor,
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
      /import\s*\{[^}]*createClient[^}]*createServiceClient[^}]*\}\s*from\s*'@\/lib\/supabase\/server'/
    )
    expect(repositorySource).toMatch(/class\s+ProgressInvoiceJobberPersistenceRepository/)
    expect(repositorySource).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
    expect(repositorySource).not.toMatch(/console\.|JSON\.stringify\s*\(\s*payload/)
  })

  it('keeps authoritative Jobber commands behind a separate service-role repository', async () => {
    const serviceResult = {
      series_id: '11111111-1111-4111-8111-111111111111',
      snapshot_id: '22222222-2222-4222-8222-222222222222',
      series_version: 2,
      inserted_payments: 1,
      revised_payments: 0,
      unconfirmed_payments: 0,
    }
    const rpc = vi.fn().mockResolvedValue({ data: [serviceResult], error: null })
    serverMocks.createServiceClient.mockReturnValue({ rpc })

    const repository = await createProgressInvoiceJobberPersistenceRepository()
    const result = await repository.call('apply_progress_invoice_jobber_refresh', {
      actor_id: '33333333-3333-4333-8333-333333333333',
      series_id: serviceResult.series_id,
      expected_version: 1,
      idempotency_key: '44444444-4444-4444-8444-444444444444',
      request_fingerprint: 'a'.repeat(64),
      observation: {},
    })

    expect(serverMocks.createServiceClient).toHaveBeenCalledOnce()
    expect(serverMocks.createClient).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('apply_progress_invoice_jobber_refresh', {
      payload: expect.objectContaining({ actor_id: '33333333-3333-4333-8333-333333333333' }),
    })
    expect(result).toEqual({ ok: true, data: serviceResult })
  })

  it('types authenticated and service-role executors as disjoint command sets', () => {
    type ServiceExecutorInput = Parameters<typeof createProgressInvoiceServiceRpcExecutor>[0]

    expectTypeOf(createProgressInvoiceServiceRpcExecutor).returns.toMatchTypeOf<ProgressInvoiceServiceRpcExecutor>()
    expectTypeOf<ServiceExecutorInput>().toHaveProperty('rpc')
    expectTypeOf<ProgressInvoiceRepository>().not.toMatchTypeOf<ProgressInvoiceJobberPersistenceRepository>()
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
