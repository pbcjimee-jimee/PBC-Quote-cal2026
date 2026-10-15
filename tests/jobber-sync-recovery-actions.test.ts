import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncOperation } from '@/lib/jobber/sync-types'
import { getJobberSyncRecovery, recoverJobberQuoteSync } from '@/lib/actions/jobber-sync-recovery'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), requireRole: vi.fn(), isDevNoAuthMode: vi.fn(),
  getOperation: vi.fn(), read: vi.fn(), sync: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/actions/types', async () => ({
  ...await vi.importActual<typeof import('@/lib/actions/types')>('@/lib/actions/types'), isDevNoAuthMode: mocks.isDevNoAuthMode,
}))
vi.mock('@/lib/jobber/sync-runner', () => ({ getJobberSyncOperationForQuote: mocks.getOperation,
  createDurableJobberTransport: () => ({ read: mocks.read, sync: mocks.sync }) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const quoteId = '00000000-0000-4000-8000-000000000101'
const operationId = '00000000-0000-4000-8000-000000000701'
const lineId = '00000000-0000-4000-8000-000000000301'
const quote = { id: quoteId, version: 6, jobber_quote_id: 'remote', jobber_save_mode: 'priced_line_items' }
const lines = [{ id: lineId, kind: 'text', position: 1, name: 'Edited locally', description: 'Keep me',
  client_visible: true, jobber_line_item_id: null }]
const remote = [{ id: 'known', name: 'Old name', description: 'Old detail', textOnly: true,
  category: 'SERVICE', quantity: 1, unitPrice: 0, totalPrice: 0, linkedProductOrService: null }]
function operation(): SyncOperation {
  return { id: operationId, quote_id: quoteId, quote_version: 1, jobber_quote_id: 'remote',
    desired_payload: { saveMode: 'priced_line_items', finalTotal: '100', finalTotalIncludesGst: true, lines: [] },
    status: 'reconciliation_required', lease_expires_at: null, attempt_count: 1, failure_code: 'quote_changed', result: null,
    steps: [{ id: 'step', operation_id: operationId, step_key: 'create:0', sequence: 0, kind: 'create', status: 'applied',
      request_payload: { lineItems: [{ kind: 'text', name: 'Old name', description: 'Old detail' }] },
      result_payload: { createdLineItemIds: ['known'] } }],
  }
}
function client() {
  const builder = (data: unknown) => {
    const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), is: vi.fn(() => chain),
      single: vi.fn(async () => ({ data, error: null })), order: vi.fn(async () => ({ data, error: null })) }
    return chain
  }
  const quoteBuilder = builder(quote)
  const lineBuilder = builder(lines)
  return { from: vi.fn((table: string) => table === 'quotes' ? quoteBuilder : lineBuilder),
    rpc: vi.fn(async () => ({ data: { id: quoteId, version: 7 }, error: null })), quoteBuilder, lineBuilder }
}

describe('admin reviewed Jobber recovery actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    mocks.isDevNoAuthMode.mockReturnValue(false)
    mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'admin' } })
    mocks.getOperation.mockResolvedValue(operation())
    mocks.read.mockResolvedValue(remote)
    mocks.createClient.mockResolvedValue(client())
  })

  async function input() {
    const result = await getJobberSyncRecovery(quoteId)
    if (!result.ok) throw new Error(result.error)
    return { quoteId, operationId, expectedVersion: 6, remoteFingerprint: result.data.remoteFingerprint,
      mappings: [{ lineId, jobberLineItemId: 'known' }] }
  }

  it('returns public current content without a journal and recovers only explicit UUID mappings', async () => {
    const db = client()
    mocks.createClient.mockResolvedValue(db)
    const preview = await getJobberSyncRecovery(quoteId)
    expect(preview).toMatchObject({ ok: true, data: { expectedVersion: 6,
      lines: [{ lineId, name: 'Edited locally', description: 'Keep me', suggestedJobberLineItemId: null }] } })
    expect(JSON.stringify(preview)).not.toContain('request_payload')
    await expect(recoverJobberQuoteSync(await input())).resolves.toEqual({ ok: true, data: { id: quoteId, version: 7 } })
    expect(db.rpc).toHaveBeenCalledWith('recover_jobber_sync_operation', {
      operation_id: operationId, target_quote_id: quoteId, expected_version: 6,
      line_mappings: [{ lineId, jobberLineItemId: 'known' }], observed_remote_ids: ['known'],
    })
    expect(mocks.sync).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/quotes/${quoteId}/edit`)
  })

  it('loads hidden links and existing pending deletes for the exact next-sync deletion preview', async () => {
    const db = client()
    db.quoteBuilder.single.mockResolvedValue({ data: { ...quote, jobber_pending_deleted_line_item_ids: ['prior-delete'] }, error: null })
    db.lineBuilder.order.mockResolvedValue({ data: [...lines, { ...lines[0], id: 'hidden-local', client_visible: false, jobber_line_item_id: 'hidden-remote' }], error: null })
    mocks.createClient.mockResolvedValue(db)
    mocks.read.mockResolvedValue([...remote, { ...remote[0], id: 'hidden-remote' }, { ...remote[0], id: 'prior-delete' }])
    const result = await getJobberSyncRecovery(quoteId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(new Set(result.data.deletionCandidateIds)).toEqual(new Set(['known', 'hidden-remote', 'prior-delete']))
    expect(result.data.lines).toHaveLength(1)
    expect(result.data.remoteLines.filter((line) => line.ownedByOperation).map((line) => line.id)).toEqual(['known'])
    expect(db.lineBuilder.eq).not.toHaveBeenCalledWith('client_visible', true)
    expect(db.quoteBuilder.select).toHaveBeenCalledWith(expect.stringContaining('jobber_pending_deleted_line_item_ids'))
  })

  it.each(['remote', 'version', 'operation'])('refuses %s changes after review', async (change) => {
    const request = await input()
    const db = client()
    if (change === 'remote') mocks.read.mockResolvedValue([{ ...remote[0], description: 'changed' }])
    if (change === 'version') db.quoteBuilder.single.mockResolvedValue({ data: { ...quote, version: 7 }, error: null })
    if (change === 'operation') mocks.getOperation.mockResolvedValue({ ...operation(), id: 'other' })
    mocks.createClient.mockResolvedValue(db)
    expect((await recoverJobberQuoteSync(request)).ok).toBe(false)
    expect(db.rpc).not.toHaveBeenCalled()
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it.each(['unknown-remote', 'unknown-local', 'duplicate-local', 'duplicate-remote'])('refuses invalid mapping: %s', async (change) => {
    const request = await input()
    const db = client()
    mocks.createClient.mockResolvedValue(db)
    if (change === 'unknown-remote') request.mappings[0].jobberLineItemId = 'unknown'
    if (change === 'unknown-local') request.mappings[0].lineId = '00000000-0000-4000-8000-000000000399'
    if (change.startsWith('duplicate')) request.mappings.push({ ...request.mappings[0] })
    expect((await recoverJobberQuoteSync(request)).ok).toBe(false)
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('accepts explicit association to a freshly observed unrelated Jobber row without guessing it', async () => {
    mocks.read.mockResolvedValue([...remote, { ...remote[0], id: 'external', name: 'Sliding Door' }])
    const request = await input()
    request.mappings[0].jobberLineItemId = 'external'
    const db = client()
    mocks.createClient.mockResolvedValue(db)
    expect((await recoverJobberQuoteSync(request)).ok).toBe(true)
    expect(db.rpc).toHaveBeenCalledWith('recover_jobber_sync_operation', expect.objectContaining({
      line_mappings: [{ lineId, jobberLineItemId: 'external' }], observed_remote_ids: ['known', 'external'],
    }))
  })

  it('requires existing confirmed links to remain explicitly mapped', async () => {
    const request = await input()
    request.mappings = []
    const db = client()
    db.lineBuilder.order.mockResolvedValue({ data: [{ ...lines[0], jobber_line_item_id: 'known' }], error: null })
    mocks.createClient.mockResolvedValue(db)
    expect((await recoverJobberQuoteSync(request)).ok).toBe(false)
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('allows a new local row to remain unmapped for the separate later sync', async () => {
    const request = await input()
    request.mappings = []
    expect((await recoverJobberQuoteSync(request)).ok).toBe(true)
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it.each(['no-operation', 'quote-read', 'line-read', 'remote-read', 'sending'])('fails safely for %s', async (scenario) => {
    const db = client()
    if (scenario === 'no-operation') mocks.getOperation.mockResolvedValue(null)
    if (scenario === 'quote-read') db.quoteBuilder.single.mockResolvedValue({ data: null, error: { message: 'secret' } } as never)
    if (scenario === 'line-read') db.lineBuilder.order.mockResolvedValue({ data: null, error: { message: 'secret' } } as never)
    if (scenario === 'remote-read') mocks.read.mockRejectedValue(new Error('secret'))
    if (scenario === 'sending') {
      const op = operation()
      op.steps[0].status = 'sending'
      mocks.getOperation.mockResolvedValue(op)
    }
    mocks.createClient.mockResolvedValue(db)
    const result = await getJobberSyncRecovery(quoteId)
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(db.rpc).not.toHaveBeenCalled()
    if (scenario !== 'remote-read') expect(mocks.read).not.toHaveBeenCalled()
  })

  it('applies preview and authorization gates to recovery writes too', async () => {
    const request = await input()
    mocks.read.mockClear()
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect((await recoverJobberQuoteSync(request)).ok).toBe(false)
    vi.unstubAllEnvs()
    mocks.isDevNoAuthMode.mockReturnValueOnce(true)
    expect((await recoverJobberQuoteSync(request)).ok).toBe(false)
    mocks.requireRole.mockResolvedValue({ ok: false, error: 'Forbidden' })
    expect(await recoverJobberQuoteSync(request)).toEqual({ ok: false, error: 'Forbidden' })
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('blocks invalid arguments, preview environment, noauth, and non-admin before remote reads', async () => {
    expect((await getJobberSyncRecovery('bad')).ok).toBe(false)
    expect((await recoverJobberQuoteSync({ quoteId, operationId, expectedVersion: 0, remoteFingerprint: '', mappings: [] })).ok).toBe(false)
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect((await getJobberSyncRecovery(quoteId)).ok).toBe(false)
    vi.unstubAllEnvs()
    mocks.isDevNoAuthMode.mockReturnValueOnce(true)
    expect((await getJobberSyncRecovery(quoteId)).ok).toBe(false)
    mocks.requireRole.mockResolvedValue({ ok: false, error: 'Forbidden' })
    expect(await getJobberSyncRecovery(quoteId)).toEqual({ ok: false, error: 'Forbidden' })
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('hides RPC errors and never sends external writes on failure', async () => {
    const request = await input()
    const db = client()
    db.rpc.mockResolvedValue({ data: { id: quoteId, version: 7 }, error: { message: 'private secret' } } as never)
    mocks.createClient.mockResolvedValue(db)
    const result = await recoverJobberQuoteSync(request)
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('private secret')
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(mocks.sync).not.toHaveBeenCalled()
  })
})
