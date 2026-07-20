import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

import { ProgressInvoiceRepository } from '@/lib/progress-invoices/repository'
import * as seriesService from '@/lib/progress-invoices/series-service'
import * as validators from '@/lib/progress-invoices/validators'

const SERIES_ID = '11111111-1111-4111-8111-111111111111'
const SET_ID = '22222222-2222-4222-8222-222222222222'
const CORRELATION_KEY = '33333333-3333-4333-8333-333333333333'
const HASH = 'A'.repeat(64)

const validInput = {
  seriesId: SERIES_ID,
  expectedVersion: 4,
  expectedCurrentRevisionSetId: SET_ID,
  expectedCurrentManifestHash: HASH,
  preparedRevisionSetId: null,
  reason: '  Duplicate series created in error  ',
  correlationKey: CORRELATION_KEY,
}

function getVoidSchema(): { safeParse: (value: unknown) => {
  success: boolean
  data?: Record<string, unknown>
} } {
  const schema = Reflect.get(validators, 'voidProgressInvoiceSeriesSchema')
  expect(schema).toBeTypeOf('object')
  return schema as ReturnType<typeof getVoidSchema>
}

describe('Progress Invoice Series lifecycle boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('strictly validates and normalizes the exact direct-Void command', () => {
    const parsed = getVoidSchema().safeParse(validInput)

    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual({
      ...validInput,
      expectedCurrentManifestHash: HASH.toLowerCase(),
      reason: 'Duplicate series created in error',
    })
    expect(getVoidSchema().safeParse({ ...validInput, unexpected: true }).success).toBe(false)
    expect(getVoidSchema().safeParse({ ...validInput, reason: 'x'.repeat(501) }).success).toBe(false)
    expect(getVoidSchema().safeParse({ ...validInput, expectedVersion: 0 }).success).toBe(false)
  })

  it.each([
    [{ ...validInput, expectedCurrentRevisionSetId: null }, 'set without hash'],
    [{ ...validInput, expectedCurrentManifestHash: null }, 'hash without set'],
    [{ ...validInput, expectedCurrentManifestHash: 'g'.repeat(64) }, 'non-SHA hash'],
  ])('rejects an invalid Current-set expectation: %s (%s)', (input, label) => {
    expect(label).toBeTypeOf('string')
    expect(getVoidSchema().safeParse(input).success).toBe(false)
  })

  it('allows a nullable prepared set at validation while preserving it for server rejection', () => {
    const parsed = getVoidSchema().safeParse({
      ...validInput,
      expectedCurrentRevisionSetId: null,
      expectedCurrentManifestHash: null,
      preparedRevisionSetId: SET_ID,
    })

    expect(parsed).toMatchObject({
      success: true,
      data: { preparedRevisionSetId: SET_ID },
    })
  })

  it('strictly parses the direct-Void RPC result and rejects extra or malformed fields', async () => {
    const payload = {
      series_id: SERIES_ID,
      expected_version: 4,
      expected_current_revision_set_id: SET_ID,
      expected_current_manifest_hash: HASH.toLowerCase(),
      prepared_revision_set_id: null,
      reason: 'Duplicate series created in error',
      correlation_key: CORRELATION_KEY,
    }
    const callVoid = (data: unknown) => {
      const repository = new ProgressInvoiceRepository({
        execute: async () => ({ data, error: null }),
      })
      return (repository.call as unknown as (
        command: string,
        commandPayload: typeof payload,
      ) => Promise<unknown>)('void_progress_invoice_series', payload)
    }
    const result = {
      series_id: SERIES_ID,
      version: 5,
      mode: 'direct',
      revision_set_id: null,
    }

    await expect(callVoid([result])).resolves.toEqual({ ok: true, data: result })
    await expect(callVoid([{ ...result, unexpected: true }])).resolves.toEqual({
      ok: false,
      error: 'PROGRESS_RESPONSE_INVALID',
    })
    await expect(callVoid([{ ...result, mode: 'published' }])).resolves.toEqual({
      ok: false,
      error: 'PROGRESS_RESPONSE_INVALID',
    })
    await expect(callVoid([{ ...result, revision_set_id: SET_ID }])).resolves.toEqual({
      ok: false,
      error: 'PROGRESS_RESPONSE_INVALID',
    })
    await expect(callVoid([{ ...result, version: 0 }])).resolves.toEqual({
      ok: false,
      error: 'PROGRESS_RESPONSE_INVALID',
    })
  })

  it('maps the service command to the exact RPC payload and safe result', async () => {
    const rpcResult = {
      series_id: SERIES_ID,
      version: 5,
      mode: 'direct',
      revision_set_id: null,
    }
    const rpc = vi.fn().mockResolvedValue({ data: [rpcResult], error: null })
    mocks.createClient.mockResolvedValue({ rpc })
    const service = Reflect.get(seriesService, 'voidProgressInvoiceSeries')

    expect(service).toBeTypeOf('function')
    await expect((service as (input: typeof validInput) => Promise<unknown>)(validInput))
      .resolves.toEqual({
        ok: true,
        data: {
          seriesId: SERIES_ID,
          version: 5,
          mode: 'direct',
          revisionSetId: null,
        },
      })
    expect(rpc).toHaveBeenCalledWith('void_progress_invoice_series', {
      payload: {
        series_id: SERIES_ID,
        expected_version: 4,
        expected_current_revision_set_id: SET_ID,
        expected_current_manifest_hash: HASH.toLowerCase(),
        prepared_revision_set_id: null,
        reason: 'Duplicate series created in error',
        correlation_key: CORRELATION_KEY,
      },
    })
  })

  it.each([
    ['PROGRESS_BASE_CONTRACT_LOCKED', 'VALIDATION'],
    ['PROGRESS_NUMBERING_BASE_CONFLICT', 'VALIDATION'],
    ['PROGRESS_SERIES_VOID', 'VALIDATION'],
    ['PROGRESS_VERSION_CONFLICT', 'VERSION_CONFLICT'],
    ['PROGRESS_CURRENT_SET_CONFLICT', 'VERSION_CONFLICT'],
    ['PROGRESS_CLAIM_VOID_REQUIRED', 'RECONCILIATION_REQUIRED'],
  ] as const)('maps %s to %s without leaking database detail', async (message, code) => {
    const repository = new ProgressInvoiceRepository({
      execute: async () => ({ data: null, error: { message, code: 'P0001' } }),
    })

    await expect((repository.call as unknown as (
      command: string,
      payload: Record<string, unknown>,
    ) => Promise<unknown>)('void_progress_invoice_series', {})).resolves.toEqual({
      ok: false,
      error: message,
      code,
    })
  })

  it('has no Series hard-delete Action or repository command surface', () => {
    const actionSource = readFileSync(join(
      process.cwd(), 'lib', 'actions', 'progress-invoice-series.ts',
    ), 'utf8')
    const repositorySource = readFileSync(join(
      process.cwd(), 'lib', 'progress-invoices', 'repository.ts',
    ), 'utf8')

    expect(actionSource).not.toMatch(/deleteProgressInvoiceSeries|\.delete\s*\(/)
    expect(repositorySource).not.toMatch(/delete_progress_invoice_series/)
  })
})
