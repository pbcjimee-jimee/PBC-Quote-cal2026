import { describe, expect, it } from 'vitest'

import {
  ProgressInvoiceRepository,
  type ProgressInvoiceRpcClient,
  type SaveBusinessInvoiceProfilePayload,
} from '@/lib/progress-invoices/repository'

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
  gst_rate: '0.1000',
  business_timezone: payload.business_timezone,
  default_payment_term_days: 14,
  version: 1,
  created_by: '00000000-0000-0000-0000-000000000002',
  updated_by: '00000000-0000-0000-0000-000000000002',
  created_at: '2026-07-15T00:00:00+00:00',
  updated_at: '2026-07-15T00:00:00+00:00',
}

function clientReturning(
  response: Awaited<ReturnType<ProgressInvoiceRpcClient['rpc']>>
): ProgressInvoiceRpcClient {
  return {
    rpc: async () => response,
  }
}

describe('ProgressInvoiceRepository', () => {
  it('calls the typed command and safely parses its result', async () => {
    let observedCommand = ''
    let observedArgs: unknown
    const client: ProgressInvoiceRpcClient = {
      rpc: async (command, args) => {
        observedCommand = command
        observedArgs = args
        return { data: [profileRow], error: null }
      },
    }

    const result = await new ProgressInvoiceRepository(client).call(
      'save_business_invoice_profile',
      payload
    )

    expect(observedCommand).toBe('save_business_invoice_profile')
    expect(observedArgs).toEqual({ payload })
    expect(result).toEqual({ ok: true, data: profileRow })
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

  it('rejects malformed RPC data instead of exposing an untyped row', async () => {
    const result = await new ProgressInvoiceRepository(
      clientReturning({ data: [{ ...profileRow, gst_rate: 0.1 }], error: null })
    ).call('save_business_invoice_profile', payload)

    expect(result).toEqual({
      ok: false,
      error: 'PROGRESS_RESPONSE_INVALID',
    })
  })
})
