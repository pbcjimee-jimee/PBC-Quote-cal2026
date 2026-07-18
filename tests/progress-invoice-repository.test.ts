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
  type CreateStandaloneProgressInvoiceFromJobberPayload,
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

  it('preserves the authenticated Supabase rpc receiver', async () => {
    const restRpc = vi.fn().mockResolvedValue({ data: [profileRow], error: null })
    const client = {
      rest: { rpc: restRpc },
      rpc(command: string, args: { payload: unknown }) {
        return this.rest.rpc(command, args)
      },
    }
    serverMocks.createClient.mockResolvedValue(client)

    const repository = await createProgressInvoiceRepository()
    const result = await repository.call('save_business_invoice_profile', payload)

    expect(restRpc).toHaveBeenCalledWith('save_business_invoice_profile', {
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

  it('strictly parses dashboard item and whole-filter summary fields', async () => {
    const item = {
      id: '11111111-1111-4111-8111-111111111111', source_type: 'manual', quote_id: null,
      recipient_name: 'Builder', recipient_company: '', site_name: 'Site', status: 'active',
      current_adjusted_contract_ex_gst: '100.00', current_claimed_inc_gst: '55.00',
      current_actual_receipts: '-5.00', current_outstanding_receivable: '60.00',
      current_credit_balance: '0.00', current_unclaimed_inc_gst: '55.00',
      current_cumulative_percentage: '50.000000', current_payment_state: 'overdue',
      current_manifest_claim_count: 1, invoice_number: 'INV-P01', reference: 'Stage 1',
      last_successful_jobber_sync_at: null, last_jobber_sync_error_code: null, version: 1,
    }
    const summary = {
      current_adjusted_contract_ex_gst: '200.00', current_claimed_inc_gst: '110.00',
      current_actual_receipts: '-10.00', current_outstanding_receivable: '120.00',
      current_credit_balance: '0.00', current_unclaimed_inc_gst: '110.00',
    }
    const result = await new ProgressInvoiceRepository(clientReturning({
      data: { items: [item], summary, page: 1, page_size: 20, total: 2 }, error: null,
    })).call('list_progress_invoice_series', {
      query: '', statuses: [], page: 1, page_size: 20, quote_id: null,
    })

    expect(result).toEqual({
      ok: true,
      data: { items: [item], summary, page: 1, page_size: 20, total: 2 },
    })
  })

  it.each([
    ['missing summary money', (value: Record<string, unknown>) => {
      const summary = { ...(value.summary as Record<string, unknown>) }
      delete summary.current_credit_balance
      return { ...value, summary }
    }],
    ['numeric item money', (value: Record<string, unknown>) => ({
      ...value,
      items: [{ ...((value.items as Record<string, unknown>[])[0]), current_claimed_inc_gst: 55 }],
    })],
    ['malformed decimal scale', (value: Record<string, unknown>) => ({
      ...value,
      summary: { ...(value.summary as Record<string, unknown>), current_unclaimed_inc_gst: '110.0' },
    })],
    ['negative non-negative balance', (value: Record<string, unknown>) => ({
      ...value,
      items: [{ ...((value.items as Record<string, unknown>[])[0]), current_credit_balance: '-1.00' }],
    })],
    ['invalid manifest count', (value: Record<string, unknown>) => ({
      ...value,
      items: [{ ...((value.items as Record<string, unknown>[])[0]), current_manifest_claim_count: -1 }],
    })],
    ['invalid invoice text', (value: Record<string, unknown>) => ({
      ...value,
      items: [{ ...((value.items as Record<string, unknown>[])[0]), invoice_number: 123 }],
    })],
  ])('rejects %s in dashboard responses', async (_label, mutate) => {
    const item = {
      id: '11111111-1111-4111-8111-111111111111', source_type: 'manual', quote_id: null,
      recipient_name: 'Builder', recipient_company: '', site_name: 'Site', status: 'active',
      current_adjusted_contract_ex_gst: '100.00', current_claimed_inc_gst: '55.00',
      current_actual_receipts: '5.00', current_outstanding_receivable: '50.00',
      current_credit_balance: '0.00', current_unclaimed_inc_gst: '55.00',
      current_cumulative_percentage: '50.000000', current_payment_state: 'part_paid',
      current_manifest_claim_count: 1, invoice_number: 'INV-P01', reference: '',
      last_successful_jobber_sync_at: null, last_jobber_sync_error_code: null, version: 1,
    }
    const response: Record<string, unknown> = {
      items: [item],
      summary: {
        current_adjusted_contract_ex_gst: '100.00', current_claimed_inc_gst: '55.00',
        current_actual_receipts: '5.00', current_outstanding_receivable: '50.00',
        current_credit_balance: '0.00', current_unclaimed_inc_gst: '55.00',
      },
      page: 1, page_size: 20, total: 1,
    }
    const result = await new ProgressInvoiceRepository(clientReturning({ data: mutate(response), error: null }))
      .call('list_progress_invoice_series', { query: '', statuses: [], page: 1, page_size: 20, quote_id: null })
    expect(result).toEqual({ ok: false, error: 'PROGRESS_RESPONSE_INVALID' })
  })

  it('exposes the Manual command without legacy Quote create or prefill branches', () => {
    expect(repositorySource).toMatch(/create_manual_progress_invoice_series/)
    expect(repositorySource).not.toMatch(/\bcreate_progress_invoice_series\b/)
    expect(repositorySource).not.toMatch(/\bget_progress_invoice_quote_prefill\b/)
  })

  it('calls the standalone Jobber import command and parses its complete result', async () => {
    const serviceResult = {
      series_id: '11111111-1111-4111-8111-111111111111',
      version: 1,
      snapshot_id: '22222222-2222-4222-8222-222222222222',
      imported_payments: 3,
    }
    const rpc = vi.fn().mockResolvedValue({ data: [serviceResult], error: null })
    serverMocks.createServiceClient.mockReturnValue({ rpc })
    const commandPayload: CreateStandaloneProgressInvoiceFromJobberPayload = {
      actor_id: '33333333-3333-4333-8333-333333333333',
      correlation_key: '44444444-4444-4444-8444-444444444444',
      request_fingerprint: 'a'.repeat(64),
      series: {
        source_type: 'jobber_invoice',
        quote_id: null,
        base_contract_ex_gst: '17220.50',
        gst_rate: '0.10',
        recipient_name: 'Edited Builder',
        recipient_company: null,
        recipient_address: 'Edited billing address',
        recipient_email: null,
        recipient_phone: null,
        recipient_abn: null,
        site_name: 'Edited site',
        site_address: 'Edited site address',
        default_description: 'Progress painting works',
        reference: 'Jobber 2906',
        correlation_key: '44444444-4444-4444-8444-444444444444',
      },
      observation: {},
    }

    const repository = await createProgressInvoiceJobberPersistenceRepository()
    const result = await repository.call(
      'create_progress_invoice_series_from_jobber',
      commandPayload,
    )

    expect(rpc).toHaveBeenCalledWith('create_progress_invoice_series_from_jobber', {
      payload: commandPayload,
    })
    expect(result).toEqual({ ok: true, data: serviceResult })
  })

  it('preserves the service-role Supabase rpc receiver', async () => {
    const serviceResult = {
      series_id: '11111111-1111-4111-8111-111111111111',
      snapshot_id: '22222222-2222-4222-8222-222222222222',
      series_version: 2,
      inserted_payments: 1,
      revised_payments: 0,
      unconfirmed_payments: 0,
    }
    const restRpc = vi.fn().mockResolvedValue({ data: [serviceResult], error: null })
    const client = {
      rest: { rpc: restRpc },
      rpc(command: string, args: { payload: unknown }) {
        return this.rest.rpc(command, args)
      },
    }
    serverMocks.createServiceClient.mockReturnValue(client)

    const repository = await createProgressInvoiceJobberPersistenceRepository()
    const result = await repository.call('apply_progress_invoice_jobber_refresh', {
      actor_id: '33333333-3333-4333-8333-333333333333',
      series_id: serviceResult.series_id,
      expected_version: 1,
      idempotency_key: '44444444-4444-4444-8444-444444444444',
      request_fingerprint: 'a'.repeat(64),
      observation: {},
    })

    expect(restRpc).toHaveBeenCalledWith('apply_progress_invoice_jobber_refresh', {
      payload: expect.objectContaining({ actor_id: '33333333-3333-4333-8333-333333333333' }),
    })
    expect(result).toEqual({ ok: true, data: serviceResult })
  })

  it.each([
    {},
    { series_id: 'series-1', version: 1, snapshot_id: 'snapshot-1' },
    { series_id: 'series-1', version: 0, snapshot_id: 'snapshot-1', imported_payments: 0 },
    { series_id: 'series-1', version: 1, snapshot_id: 'snapshot-1', imported_payments: -1 },
    { series_id: 'series-1', version: 1, snapshot_id: 'snapshot-1', imported_payments: 1.5 },
  ])('rejects malformed standalone Jobber import result %#', async (serviceResult) => {
    const executor: ProgressInvoiceServiceRpcExecutor = {
      execute: async () => ({ data: [serviceResult], error: null }),
    }
    const repository = new ProgressInvoiceJobberPersistenceRepository(executor)
    const result = await repository.call('create_progress_invoice_series_from_jobber', {
      actor_id: '33333333-3333-4333-8333-333333333333',
      correlation_key: '44444444-4444-4444-8444-444444444444',
      request_fingerprint: 'a'.repeat(64),
      series: {} as never,
      observation: {},
    })

    expect(result).toEqual({ ok: false, error: 'PROGRESS_RESPONSE_INVALID' })
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
    ['PROGRESS_JOBBER_LINK_LOCKED', 'P0001', 'VALIDATION'],
    ['PROGRESS_DOCUMENT_ERROR', 'P0001', 'DOCUMENT_ERROR'],
    ['PROGRESS_STORAGE_ERROR', 'P0001', 'STORAGE_ERROR'],
    ['IDEMPOTENCY_KEY_REUSED', 'P0001', 'VALIDATION'],
    ['PROGRESS_UNIQUE_CONFLICT', 'P0001', 'VALIDATION'],
    ['PROGRESS_EMAIL_INVALID', '23514', 'VALIDATION'],
    ['PROGRESS_ABN_INVALID', '23514', 'VALIDATION'],
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
