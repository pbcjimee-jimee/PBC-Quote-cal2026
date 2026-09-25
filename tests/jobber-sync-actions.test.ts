import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireRole: vi.fn(),
  isDevNoAuthMode: vi.fn(),
  getOperation: vi.fn(),
  checkOperation: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/actions/types', async () => {
  const actual = await vi.importActual<typeof import('@/lib/actions/types')>('@/lib/actions/types')
  return { ...actual, isDevNoAuthMode: mocks.isDevNoAuthMode }
})
vi.mock('@/lib/jobber/sync-runner', () => ({
  getJobberSyncOperationForQuote: mocks.getOperation,
  checkJobberSyncOperation: mocks.checkOperation,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { checkJobberQuoteSync, getJobberSyncState } from '@/lib/actions/jobber-sync'

const quoteId = '00000000-0000-4000-8000-000000000101'
const operationId = '00000000-0000-4000-8000-000000000701'
const reconciliationMessages = {
  remoteRead: 'Jobber could not be checked. No changes were sent. This sync remains blocked; try again or inspect it manually.',
  mismatch: 'Jobber does not match the recorded sync result. Nothing was resent. This sync remains blocked for manual inspection.',
  resolve: 'Jobber was verified, but the local sync result could not be saved. Nothing was resent. This sync remains blocked; try again or inspect it manually.',
  readback: 'The local sync result could not be confirmed after checking Jobber. Nothing was resent. Refresh and inspect the current status before taking further action.',
  blocked: 'This sync could not be confirmed safely. Nothing was resent. It remains blocked for manual inspection.',
}

function quoteVersionClient(version = 4) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    single: vi.fn(async () => ({ data: { id: quoteId, version }, error: null })),
  }
  return { client: { from: vi.fn(() => builder), rpc: vi.fn() }, builder }
}

function operation(overrides: Record<string, unknown> = {}) {
  return {
    id: operationId,
    quote_id: quoteId,
    quote_version: 4,
    jobber_quote_id: 'remote-1',
    desired_payload: { saveMode: 'priced_line_items', finalTotal: '100.00', finalTotalIncludesGst: true, lines: [] },
    status: 'retryable',
    lease_expires_at: null,
    attempt_count: 1,
    failure_code: 'preflight_failed',
    result: null,
    steps: [],
    ...overrides,
  }
}

describe('Jobber sync status actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDevNoAuthMode.mockReturnValue(false)
    mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'admin-1' } })
    mocks.getOperation.mockResolvedValue(operation())
    mocks.checkOperation.mockResolvedValue({ status: 'blocked', reason: 'reconciliation_incomplete', operation: operation() })
    mocks.createClient.mockResolvedValue(quoteVersionClient().client)
  })

  it('blocks status and Check Jobber in Vercel Preview before quote or operation reads', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')

    try {
      await expect(getJobberSyncState(quoteId)).resolves.toEqual({
        ok: false,
        error: 'Jobber is disabled in this preview environment.',
      })
      await expect(checkJobberQuoteSync(quoteId)).resolves.toEqual({
        ok: false,
        error: 'Jobber is disabled in this preview environment.',
      })
    } finally {
      vi.unstubAllEnvs()
    }

    expect(mocks.requireRole).not.toHaveBeenCalled()
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.getOperation).not.toHaveBeenCalled()
    expect(mocks.checkOperation).not.toHaveBeenCalled()
  })

  it('returns a minimal retryable state only when quote identity and version both match', async () => {
    await expect(getJobberSyncState(quoteId)).resolves.toEqual({
      ok: true,
      data: {
        operationId,
        status: 'retryable',
        failureCode: 'preflight_failed',
        isCurrentVersion: true,
        canRetry: true,
      },
    })
  })

  it('shows a same-remote predecessor from another quote as non-current and non-retryable', async () => {
    mocks.getOperation.mockResolvedValueOnce(operation({
      quote_id: '00000000-0000-4000-8000-000000000202',
      quote_version: 4,
      status: 'succeeded',
      failure_code: null,
    }))

    await expect(getJobberSyncState(quoteId)).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        status: 'succeeded',
        isCurrentVersion: false,
        canRetry: false,
      }),
    })
  })

  it('reports success only after an existing uncertain operation is authoritatively confirmed', async () => {
    const uncertain = operation({ status: 'reconciliation_required', failure_code: 'lease_expired' })
    const succeeded = operation({ status: 'succeeded', failure_code: null })
    mocks.getOperation.mockResolvedValueOnce(uncertain)
    mocks.checkOperation.mockResolvedValueOnce({ status: 'succeeded', operation: succeeded })

    await expect(checkJobberQuoteSync(quoteId)).resolves.toEqual({ ok: true, data: { id: quoteId } })
    expect(mocks.checkOperation).toHaveBeenCalledWith(uncertain, expect.any(Object))
  })

  it.each([
    [{ status: 'blocked', reason: 'remote_read_failed' }, reconciliationMessages.remoteRead],
    [{ status: 'blocked', reason: 'remote_state_mismatch' }, reconciliationMessages.mismatch],
    [{ status: 'blocked', reason: 'resolve_failed' }, reconciliationMessages.resolve],
    [{ status: 'failed', reason: 'readback_failed' }, reconciliationMessages.readback],
    [{ status: 'failed', reason: 'invalid_operation_readback' }, reconciliationMessages.readback],
    [{ status: 'blocked', reason: 'resolve_not_confirmed' }, reconciliationMessages.readback],
    [{ status: 'blocked', reason: 'unexpected_internal_reason' }, reconciliationMessages.blocked],
  ])('returns a fixed safe failure for reconciliation outcome %#', async (result, message) => {
    const uncertain = operation({ status: 'reconciliation_required', failure_code: 'lease_expired' })
    mocks.getOperation.mockResolvedValueOnce(uncertain)
    mocks.checkOperation.mockResolvedValueOnce({ ...result, operation: uncertain })

    await expect(checkJobberQuoteSync(quoteId)).resolves.toEqual({ ok: false, error: message })
    expect(mocks.checkOperation).toHaveBeenCalledWith(uncertain, expect.any(Object))
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/quotes/${quoteId}`)
  })

  it('does not claim or remotely inspect a still-running operation', async () => {
    mocks.getOperation.mockResolvedValueOnce(operation({ status: 'running', failure_code: null }))

    await expect(checkJobberQuoteSync(quoteId)).resolves.toEqual({ ok: true, data: { id: quoteId } })
    expect(mocks.checkOperation).not.toHaveBeenCalled()
  })

  it('fails closed with generic messages for malformed input, dev preview, and lookup errors', async () => {
    await expect(getJobberSyncState('not-a-uuid')).resolves.toEqual({ ok: false, error: 'Invalid quote id' })
    expect(mocks.requireRole).not.toHaveBeenCalled()

    mocks.isDevNoAuthMode.mockReturnValueOnce(true)
    await expect(getJobberSyncState(quoteId)).resolves.toEqual({
      ok: false,
      error: 'Jobber sync status is unavailable in preview mode',
    })
    expect(mocks.createClient).not.toHaveBeenCalled()

    mocks.isDevNoAuthMode.mockReturnValue(false)
    mocks.getOperation.mockRejectedValueOnce(new Error('raw database failure with token'))
    await expect(getJobberSyncState(quoteId)).resolves.toEqual({
      ok: false,
      error: 'Unable to check Jobber sync status. Please try again.',
    })
  })
})
