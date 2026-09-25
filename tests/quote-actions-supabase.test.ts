import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'

const mocks = vi.hoisted(() => {
  class MockJobberApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message)
      this.name = 'JobberApiError'
    }
  }
  class MockJobberLineSyncPartialError extends Error {
    constructor(message: string, readonly syncedLineItems: Array<{ sourcePosition: number; jobberLineItemId: string }>) {
      super(message)
      this.name = 'JobberLineSyncPartialError'
    }
  }

  return {
    createClient: vi.fn(),
    createServiceClient: vi.fn(),
    getPricingSettings: vi.fn(),
    isDevNoAuthMode: vi.fn(),
    requireAllowedUser: vi.fn(),
    revalidatePath: vi.fn(),
    after: vi.fn(),
    runJobberSyncOperation: vi.fn(),
    getJobberSyncOperationForQuote: vi.fn(),
    requestJobberSyncOperation: vi.fn(),
    getJobberConfig: vi.fn(),
    getMissingGraphqlConfigKeys: vi.fn(),
    getUsableSharedJobberConnectionToken: vi.fn(),
    refreshSharedJobberConnectionToken: vi.fn(),
    requireSharedJobberConnectionOwnerId: vi.fn((token: { ownerUserId?: string }) => {
      if (!token.ownerUserId) throw new Error('Unable to identify Jobber connection owner')
      return token.ownerUserId
    }),
    fetchJobberQuote: vi.fn(),
    syncJobberQuoteLineItems: vi.fn(),
    mapJobberQuoteToDraft: vi.fn(),
    JobberApiError: MockJobberApiError,
    JobberLineSyncPartialError: MockJobberLineSyncPartialError,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
  createServiceClient: mocks.createServiceClient,
}))

vi.mock('@/lib/actions/settings', () => ({
  getPricingSettings: mocks.getPricingSettings,
}))

vi.mock('@/lib/actions/types', async () => {
  const actual = await vi.importActual<typeof import('@/lib/actions/types')>('@/lib/actions/types')
  return {
    ...actual,
    isDevNoAuthMode: mocks.isDevNoAuthMode,
  }
})

vi.mock('@/lib/security/require-app-user', () => ({
  requireRole: mocks.requireAllowedUser,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next/server', () => ({
  after: mocks.after,
}))

vi.mock('@/lib/jobber/sync-runner', () => ({
  runJobberSyncOperation: mocks.runJobberSyncOperation,
  getJobberSyncOperationForQuote: mocks.getJobberSyncOperationForQuote,
  requestJobberSyncOperation: mocks.requestJobberSyncOperation,
}))

vi.mock('@/lib/jobber/config', () => ({
  getJobberConfig: mocks.getJobberConfig,
  getMissingGraphqlConfigKeys: mocks.getMissingGraphqlConfigKeys,
}))

vi.mock('@/lib/jobber/tokens', () => ({
  getUsableSharedJobberConnectionToken: mocks.getUsableSharedJobberConnectionToken,
  refreshSharedJobberConnectionToken: mocks.refreshSharedJobberConnectionToken,
  requireSharedJobberConnectionOwnerId: mocks.requireSharedJobberConnectionOwnerId,
}))

vi.mock('@/lib/jobber/client', () => ({
  fetchJobberQuote: mocks.fetchJobberQuote,
  syncJobberQuoteLineItems: mocks.syncJobberQuoteLineItems,
  JobberApiError: mocks.JobberApiError,
  JobberLineSyncPartialError: mocks.JobberLineSyncPartialError,
}))

vi.mock('@/lib/jobber/mapper', () => ({
  mapJobberQuoteToDraft: mocks.mapJobberQuoteToDraft,
}))

import type { JobberQuoteDraft } from '@/lib/jobber/mapper'
import { createQuote, deleteQuote, duplicateQuote, getQuote, refreshJobberQuoteSnapshot, retryJobberQuoteSync, searchQuotes, updateQuote } from '@/lib/actions/quotes'

const quoteId = '00000000-0000-4000-8000-000000000101'

const previousJobberSnapshot: JobberQuoteDraft = {
  jobberQuoteId: 'jobber-quote-id',
  sourceType: 'quote',
  quoteNumber: '3535',
  createdAt: '2026-05-19T00:00:00Z',
  customerName: 'Supabase Customer',
  customerAddress: '1 Paint St',
  workType: 'Interior',
  areaSqft: null,
  customerType: 'Residential',
  sourceUrl: 'https://secure.getjobber.com/quotes/3535',
  productsAndServices: [
    {
      id: 'line-1',
      name: 'Interior repaint',
      category: 'SERVICE',
      description: 'Walls',
      quantity: 1,
      unitPrice: 100,
      totalPrice: 100,
      linkedName: null,
    },
  ],
  jobExpenses: [],
  jobExpensesError: null,
  financialSummary: {
    quoteTotal: 100,
    expensesTotal: 0,
    profit: 100,
    profitMarginPercent: 100,
  },
}

const changedJobberSnapshot: JobberQuoteDraft = {
  ...previousJobberSnapshot,
  productsAndServices: [
    {
      ...previousJobberSnapshot.productsAndServices[0],
      unitPrice: 180,
      totalPrice: 180,
    },
  ],
  financialSummary: {
    ...previousJobberSnapshot.financialSummary,
    quoteTotal: 180,
    profit: 180,
  },
}

const quoteRow = {
  id: quoteId,
  version: 1,
  customer_name: 'Supabase Customer',
  customer_address: '1 Paint St',
  jobber_quote_id: null,
  jobber_snapshot: null,
  jobber_save_mode: 'priced_line_items',
  jobber_sync_status: 'not_synced',
  jobber_last_synced_at: null,
  jobber_sync_error: null,
  area_sqft: null,
  work_type: null,
  working_days: '1.00',
  labour_per_day: '1.00',
  formula1_total: '510.00',
  formula2_total: '608.00',
  formula3_total: '611.00',
  formula4_total: '485.00',
  formula5_total: '507.00',
  selected_min: 1,
  selected_max: 1,
  interior_selected_min: 1,
  interior_selected_max: 1,
  exterior_selected_min: 1,
  exterior_selected_max: 1,
  roof_selected_min: 1,
  roof_selected_max: 1,
  subtotal: '510.00',
  final_total: '561.00',
  pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS,
  created_by: 'user-1',
  created_at: '2026-05-15T00:00:00.000Z',
  updated_by: 'user-1',
  updated_at: '2026-05-15T00:00:00.000Z',
  quote_items: [
    {
      id: '00000000-0000-4000-8000-000000000201',
      quote_id: quoteId,
      product_id: null,
      product_name_snapshot: 'Brush',
      market_price_snapshot: '10.00',
      actual_price_snapshot: '10.00',
      quantity: '1.00',
      working_days: null,
      labour_per_day: null,
      area_id: null,
      area_name_snapshot: null,
      area_scope_snapshot: null,
      is_custom: true,
      position: 0,
    },
  ],
  jobber_quote_lines: [
    {
      id: '00000000-0000-4000-8000-000000000301',
      quote_id: quoteId,
      kind: 'line_item',
      name: 'Public painting service',
      description: 'Visible Jobber line',
      quantity: '2.00',
      unit_price: '1250.00',
      total_price: '2500.00',
      taxable: true,
      client_visible: true,
      jobber_line_item_id: null,
      linked_product_or_service_id: 'jobber-product-1',
      position: 0,
      created_at: '2026-05-15T00:00:00.000Z',
      updated_at: '2026-05-15T00:00:00.000Z',
    },
  ],
  quote_options: [],
  quote_memos: [],
  quote_price_revisions: [
    {
      id: '00000000-0000-4000-8000-000000000601',
      quote_id: quoteId,
      revision_number: 1,
      event_type: 'created',
      previous_subtotal: null,
      previous_final_total: null,
      new_subtotal: '510.00',
      new_final_total: '561.00',
      previous_jobber_lines_total: null,
      new_jobber_lines_total: '2500.00',
      changed_by: 'user-1',
      changed_at: '2026-05-15T00:00:00.000Z',
    },
  ],
}

const quoteInput = {
  expectedVersion: 1,
  customerName: 'Supabase Customer',
  customerAddress: '1 Paint St',
  workingDays: 1,
  labourPerDay: 1,
  materialMarket: 10,
  materialActual: 10,
  selectedMin: 1,
  selectedMax: 1,
  areaFormulaSelections: {
    interior: { selectedMin: 1, selectedMax: 1 },
    exterior: { selectedMin: 1, selectedMax: 1 },
    roof: { selectedMin: 2, selectedMax: 5 },
  },
  items: [
    {
      productNameSnapshot: 'Brush',
      marketPriceSnapshot: 10,
      actualPriceSnapshot: 10,
      quantity: 1,
      isCustom: true,
      position: 0,
    },
  ],
}

const quoteInputWithJobberLines = {
  ...quoteInput,
  jobberSaveMode: 'priced_line_items',
  jobberQuoteLines: [
    {
      kind: 'line_item',
      name: 'Public painting service',
      description: 'Visible Jobber line',
      quantity: 2,
      unitPrice: 1250,
      taxable: true,
      clientVisible: true,
      linkedProductOrServiceId: 'jobber-product-1',
      position: 0,
    },
    {
      kind: 'text',
      name: 'Scope notes',
      description: 'No internal materials in Jobber',
      taxable: false,
      clientVisible: true,
      position: 1,
    },
  ],
}

function createAuthUser(user: unknown = { id: 'user-1' }) {
  return {
    getUser: vi.fn(async () => ({ data: { user }, error: null })),
  }
}

function createSelectSingleBuilder(response: unknown) {
  const builder = {
    select: vi.fn((columns?: string) => {
      void columns
      return builder
    }),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    single: vi.fn(async () => response),
    maybeSingle: vi.fn(async () => response),
  }
  return builder
}

function createThenableBuilder(response: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    or: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) => resolve(response),
  }
  return builder
}


function persistenceFixture(row: unknown = quoteRow) {
  const quote = createSelectSingleBuilder({ data: row, error: null })
  const revisions = createThenableBuilder({ data: [{ revision_number: 1 }], error: null })
  const from = vi.fn((table: string) => {
    if (table === 'quotes') return quote
    if (table === 'quote_price_revisions') return revisions
    throw new Error('Unexpected direct database access: ' + table)
  })
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> => {
    void args
    return {
      data: name === 'find_quote_by_jobber_identity'
        ? []
        : name === 'create_quote_with_jobber_sync'
          ? quoteId
          : name === 'get_jobber_sync_operation'
            ? { id: '00000000-0000-4000-8000-000000000701', status: 'queued' }
            : [{ id: quoteId, version: 2 }],
      error: null,
    }
  })
  mocks.createClient.mockResolvedValue({ from, rpc })
  return { quote, from, rpc }
}

function rpcPayload(rpc: ReturnType<typeof persistenceFixture>['rpc'], name = 'update_quote_with_jobber_sync'): Record<string, unknown> {
  return rpc.mock.calls.find(([called]) => called === name)?.[1].payload as Record<string, unknown>
}

describe('quote actions against Supabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.syncJobberQuoteLineItems.mockReset()
    mocks.fetchJobberQuote.mockReset()
    mocks.createClient.mockReset()
    mocks.createServiceClient.mockReset()
    mocks.after.mockReset()
    mocks.runJobberSyncOperation.mockReset()
    mocks.getJobberSyncOperationForQuote.mockReset()
    mocks.requestJobberSyncOperation.mockReset()
    mocks.isDevNoAuthMode.mockReturnValue(false)
    mocks.requireAllowedUser.mockResolvedValue({
      ok: true,
      user: {
        id: 'user-1',
        email: 'owner@example.com',
        userMetadata: { full_name: 'Mia Kang' },
        appMetadata: {},
      },
    })
    mocks.getPricingSettings.mockResolvedValue({ ok: true, data: DEFAULT_PRICING_SETTINGS })
    mocks.getJobberConfig.mockReturnValue({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'http://localhost:3000/api/jobber/callback',
      graphqlVersion: '2025-04-16',
      accessToken: '',
    })
    mocks.getMissingGraphqlConfigKeys.mockReturnValue([])
    mocks.getUsableSharedJobberConnectionToken.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: null,
      ownerUserId: 'user-1',
    })
    mocks.refreshSharedJobberConnectionToken.mockResolvedValue({
      accessToken: 'refreshed-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: null,
      ownerUserId: 'user-1',
    })
    mocks.syncJobberQuoteLineItems.mockResolvedValue({
      deletedLineItemIds: ['old-line-1'],
      createdLineItemIds: ['new-line-1'],
      editedLineItemIds: [],
      syncedLineItems: [],
    })
    mocks.fetchJobberQuote.mockResolvedValue({ id: 'jobber-quote-id', lineItems: { nodes: [] } })
    mocks.mapJobberQuoteToDraft.mockReturnValue({
      jobberQuoteId: 'jobber-quote-id',
      sourceType: 'quote',
      quoteNumber: '3535',
      createdAt: '2026-05-19T00:00:00Z',
      customerName: 'Supabase Customer',
      customerAddress: '1 Paint St',
      workType: 'Interior',
      areaSqft: null,
      customerType: 'Residential',
      sourceUrl: 'https://secure.getjobber.com/quotes/3535',
      productsAndServices: [
        {
          id: 'new-line-1',
          name: 'Synced product',
          category: 'SERVICE',
          description: 'Updated after write-back',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
          linkedName: null,
        },
      ],
      jobExpenses: [],
      jobExpensesError: null,
      financialSummary: {
        quoteTotal: 100,
        expensesTotal: 0,
        profit: 100,
        profitMarginPercent: 100,
      },
    })
    mocks.getJobberSyncOperationForQuote.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000701',
      quote_id: quoteId,
      quote_version: 1,
      jobber_quote_id: 'jobber-quote-id',
      desired_payload: {},
      status: 'queued',
      lease_expires_at: null,
      attempt_count: 0,
      failure_code: null,
      result: null,
      steps: [],
    })
    mocks.createServiceClient.mockResolvedValue({
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: {
              user: {
                id: 'user-1',
                email: 'owner@example.com',
                user_metadata: { full_name: 'Mia Kang' },
                app_metadata: {},
              },
            },
            error: null,
          })),
        },
      },
    })
  })


  it('creates the parent, materials, public lines, memos and initial revision in one RPC', async () => {
    const { rpc, from } = persistenceFixture()
    expect(await createQuote({ ...quoteInputWithJobberLines, memos: [{ body: '  Call before arriving.  ', position: 0 }] })).toEqual({ ok: true, data: { id: quoteId } })
    const payload = rpcPayload(rpc, 'create_quote_with_jobber_sync')
    expect(payload).toMatchObject({
      quote: { customer_name: 'Supabase Customer', created_by: 'user-1', final_total: '561.00', roof_selected_min: 2, roof_selected_max: 5, jobber_sync_status: 'not_synced' },
      items: [{ product_name_snapshot: 'Brush' }],
      memos: [{ body: 'Call before arriving.', created_by: 'user-1', position: 0 }],
      jobber_lines: [{ name: 'Public painting service', unit_price: '1250.00', total_price: '2500.00' }, { name: 'Scope notes', unit_price: null, total_price: null }],
      price_revision: { revision_number: 1, event_type: 'created', previous_final_total: null, new_final_total: '561.00', changed_by: 'user-1' },
      sync_requested: false,
      deleted_jobber_line_item_ids: [],
    })
    expect(payload.jobber_lines).not.toEqual(expect.arrayContaining([expect.objectContaining({ actual_price_snapshot: expect.anything() })]))
    expect(from).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/quotes')
  })

  it('updates the existing identity using its observed version and the same parent ID', async () => {
    const { rpc } = persistenceFixture()
    rpc.mockResolvedValueOnce({ data: [{ id: quoteId, version: 8, deleted_at: null }], error: null })
    expect((await createQuote({ ...quoteInput, jobberQuoteId: 'encoded-jobber-id', jobberSnapshot: previousJobberSnapshot })).ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('find_quote_by_jobber_identity', { jobber_id: 'encoded-jobber-id', snapshot: previousJobberSnapshot })
    expect(rpcPayload(rpc)).toMatchObject({ id: quoteId, expected_version: 8, quote: { jobber_quote_id: 'encoded-jobber-id' } })
    expect(rpc.mock.calls.some(([name]) => name === 'create_quote_with_jobber_sync')).toBe(false)
  })

  it.each([
    [[{ id: quoteId, version: 2, deleted_at: '2026-09-16' }], 'Trash'],
    [[{ id: quoteId, version: 1, deleted_at: null }, { id: 'another', version: 1, deleted_at: null }], 'duplicate'],
    [[{ id: quoteId, version: 1, deleted_at: null }, { id: 'another', version: 2, deleted_at: '2026-09-16' }], 'Trash'],
  ])('blocks archived or ambiguous Jobber imports before writing', async (rows, expected) => {
    const { rpc, from } = persistenceFixture()
    rpc.mockResolvedValueOnce({ data: rows, error: null })
    expect(await createQuote({ ...quoteInput, jobberSnapshot: previousJobberSnapshot })).toMatchObject({ ok: false, error: expect.stringContaining(expected) })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(from).not.toHaveBeenCalled()
  })

  it('fails closed when identity lookup fails', async () => {
    const { rpc } = persistenceFixture()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'lookup failed' } })
    expect((await createQuote({ ...quoteInput, jobberQuoteId: 'linked' })).ok).toBe(false)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('records a price revision when main totals change', async () => {
    const { rpc } = persistenceFixture()
    expect((await updateQuote({ ...quoteInput, id: quoteId, expectedVersion: 1, workingDays: 2 })).ok).toBe(true)
    expect(rpcPayload(rpc)).toMatchObject({ expected_version: 1, price_revision: {
      revision_number: 2, event_type: 'updated', previous_final_total: '561.00', new_final_total: '1111.00',
      previous_options_subtotal: null, new_options_subtotal: null, changed_by: 'user-1',
    } })
  })

  it('records option totals in the same atomic save', async () => {
    const { rpc } = persistenceFixture({ ...quoteRow, quote_options: [{ subtotal: '300.00', final_total: '330.00' }] })
    expect((await updateQuote({ ...quoteInput, id: quoteId, expectedVersion: 1, options: [{
      title: 'Option 1', selectedMin: 1, selectedMax: 1,
      items: [{ ...quoteInput.items[0], marketPriceSnapshot: 100, actualPriceSnapshot: 100, workingDays: 1, labourPerDay: 1 }],
    }] })).ok).toBe(true)
    expect(rpcPayload(rpc)).toMatchObject({ price_revision: {
      previous_options_subtotal: '300.00', new_options_subtotal: '600.00', previous_options_final_total: '330.00', new_options_final_total: '660.00',
    } })
  })

  it('saves unchanged pricing without adding a price revision', async () => {
    const { rpc, from, quote } = persistenceFixture()
    expect((await updateQuote({ ...quoteInput, id: quoteId, expectedVersion: 1, customerName: 'Same Price Customer' })).ok).toBe(true)
    expect(rpcPayload(rpc)).toMatchObject({ price_revision: null, quote: { customer_name: 'Same Price Customer' } })
    expect(from).not.toHaveBeenCalledWith('quote_price_revisions')
    expect(quote.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it.each(['create', 'update'])('does not perform compensating deletes when the %s transaction fails', async (operation) => {
    const { rpc, from } = persistenceFixture()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'memo insert failed' } })
    const result = operation === 'create' ? await createQuote(quoteInput) : await updateQuote({ ...quoteInput, id: quoteId, expectedVersion: 1 })
    expect(result.ok).toBe(false)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(from.mock.calls.every(([table]) => table === 'quotes')).toBe(true)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('requires an administrator before saving or reading quotes', async () => {
    mocks.requireAllowedUser.mockResolvedValue({ ok: false, error: 'Admin access required' })
    expect((await createQuote(quoteInput)).ok).toBe(false)
    expect((await updateQuote({ ...quoteInput, id: quoteId, expectedVersion: 1 })).ok).toBe(false)
    expect((await searchQuotes()).ok).toBe(false)
    expect((await getQuote(quoteId)).ok).toBe(false)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('treats product-linked main and option items as non-custom and pins trusted actual prices on create', async () => {
    const productId = '00000000-0000-4000-8000-000000000902'
    const productQuery = createThenableBuilder({
      data: [{
        id: productId,
        name: 'Catalog paint name',
        market_price: '150.00',
        actual_price: '80.00',
        price: '80.00',
        rrp_price: '150.00',
      }],
      error: null,
    })
    const from = vi.fn((table: string) => {
      if (table === 'products') return productQuery
      throw new Error(`unexpected table ${table}`)
    })
    const rpc = vi.fn(async () => ({ data: quoteId, error: null }))
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from, rpc })

    const result = await createQuote({
      ...quoteInput,
      items: [{
        productId,
        productNameSnapshot: 'Quote-local paint label',
        marketPriceSnapshot: 125,
        actualPriceSnapshot: 999,
        quantity: 1,
        isCustom: true,
        position: 0,
      }],
      options: [{
        title: 'Option 1',
        selectedMin: 1,
        selectedMax: 1,
        position: 0,
        items: [{
          productId,
          productNameSnapshot: 'Quote-local option paint',
          marketPriceSnapshot: 75,
          actualPriceSnapshot: 777,
          quantity: 1,
          isCustom: true,
          position: 0,
        }],
      }],
    })

    expect(result).toEqual({ ok: true, data: { id: quoteId } })
    expect(rpc).toHaveBeenCalledWith('create_quote_with_jobber_sync', {
      payload: expect.objectContaining({
        items: [expect.objectContaining({
          product_id: productId,
          product_name_snapshot: 'Quote-local paint label',
          market_price_snapshot: '125.00',
          actual_price_snapshot: '150.00',
          is_custom: false,
        })],
        options: [expect.objectContaining({
          items: [expect.objectContaining({
            product_id: productId,
            product_name_snapshot: 'Quote-local option paint',
            market_price_snapshot: '75.00',
            actual_price_snapshot: '150.00',
            is_custom: false,
          })],
        })],
      }),
    })
  })

  it('persists edited name, RRP, and memo for an existing catalog item while retaining its saved actual price', async () => {
    const sourceItemId = '00000000-0000-4000-8000-000000000201'
    const productId = '00000000-0000-4000-8000-000000000901'
    const existingQuote = createSelectSingleBuilder({
      data: {
        pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS,
        subtotal: '600.00',
        final_total: '660.00',
      },
      error: null,
    })
    const existingSnapshots = createSelectSingleBuilder({
      data: {
        quote_items: [{
          id: sourceItemId,
          product_id: productId,
          product_name_snapshot: 'Saved paint',
          market_price_snapshot: '100.00',
          actual_price_snapshot: '80.00',
          position: 0,
        }],
        quote_options: [],
      },
      error: null,
    })
    const productQuery = createThenableBuilder({
      data: [{
        id: productId,
        name: 'Current catalog paint',
        market_price: '150.00',
        actual_price: '80.00',
        price: null,
        rrp_price: '150.00',
      }],
      error: null,
    })
    const latestRevision = createThenableBuilder({ data: [], error: null })
    const builders: Record<string, unknown[]> = {
      quotes: [existingQuote, existingSnapshots],
      products: [productQuery],
      quote_price_revisions: [latestRevision],
    }
    const from = vi.fn((table: string) => {
      const builder = builders[table]?.shift()
      if (!builder) throw new Error(`unexpected table ${table}`)
      return builder
    })
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from, rpc })

    const result = await updateQuote({
      id: quoteId,
      ...quoteInput,
      materialMarket: 125,
      materialActual: 80,
      items: [{
        sourceItemId,
        productId,
        productNameSnapshot: 'Edited quote-local paint',
        marketPriceSnapshot: 125,
        actualPriceSnapshot: 999,
        quantity: 1,
        workingDays: 1,
        labourPerDay: 1,
        areaScopeSnapshot: 'interior',
        isCustom: false,
        memo: 'Protect the timber trim.',
        position: 0,
      }],
    })

    expect(result).toEqual({ ok: true, data: { id: quoteId } })
    expect(rpc).toHaveBeenCalledWith('update_quote_with_jobber_sync', {
      payload: expect.objectContaining({
        quote: expect.objectContaining({
          formula1_total: '625.00',
          subtotal: '625.00',
        }),
        items: [
          expect.objectContaining({
            product_name_snapshot: 'Edited quote-local paint',
            market_price_snapshot: '125.00',
            actual_price_snapshot: '80.00',
            memo: 'Protect the timber trim.',
          }),
        ],
      }),
    })
  })

  it('keeps an existing Main snapshot while pinning its fresh copied Option row to the current product price', async () => {
    const sourceItemId = '00000000-0000-4000-8000-000000000201'
    const freshOptionItemId = '00000000-0000-4000-8000-000000000202'
    const productId = '00000000-0000-4000-8000-000000000901'
    const existingQuote = createSelectSingleBuilder({
      data: {
        pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS,
        subtotal: '600.00',
        final_total: '660.00',
        quote_options: [],
      },
      error: null,
    })
    const existingSnapshots = createSelectSingleBuilder({
      data: {
        quote_items: [{
          id: sourceItemId,
          product_id: productId,
          actual_price_snapshot: '80.00',
        }],
        quote_options: [],
      },
      error: null,
    })
    const productQuery = createThenableBuilder({
      data: [{
        id: productId,
        name: 'Current catalog paint',
        market_price: '150.00',
        actual_price: '80.00',
        price: null,
        rrp_price: '150.00',
      }],
      error: null,
    })
    const latestRevision = createThenableBuilder({ data: [], error: null })
    const builders: Record<string, unknown[]> = {
      quotes: [existingQuote, existingSnapshots],
      products: [productQuery],
      quote_price_revisions: [latestRevision],
    }
    const from = vi.fn((table: string) => {
      const builder = builders[table]?.shift()
      if (!builder) throw new Error(`unexpected table ${table}`)
      return builder
    })
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from, rpc })

    const result = await updateQuote({
      id: quoteId,
      ...quoteInput,
      items: [{
        sourceItemId,
        productId,
        productNameSnapshot: 'Saved Main paint',
        marketPriceSnapshot: 125,
        actualPriceSnapshot: 999,
        quantity: 1,
        isCustom: false,
        position: 0,
      }],
      options: [{
        title: 'Option 1',
        selectedMin: 3,
        selectedMax: 3,
        position: 0,
        items: [{
          sourceItemId: freshOptionItemId,
          productId,
          productNameSnapshot: 'Copied Option paint',
          marketPriceSnapshot: 125,
          actualPriceSnapshot: 999,
          quantity: 1,
          isCustom: false,
          position: 0,
        }],
      }],
    })

    expect(result).toEqual({ ok: true, data: { id: quoteId } })
    expect(rpc).toHaveBeenCalledWith('update_quote_with_jobber_sync', {
      payload: expect.objectContaining({
        items: [expect.objectContaining({
          product_id: productId,
          actual_price_snapshot: '80.00',
        })],
        options: [expect.objectContaining({
          items: [expect.objectContaining({
            product_id: productId,
            actual_price_snapshot: '150.00',
          })],
        })],
      }),
    })
  })

  it('retains a main item actual snapshot by sourceItemId after an earlier row is deleted and positions are reindexed', async () => {
    const removedItemId = '00000000-0000-4000-8000-000000000211'
    const retainedItemId = '00000000-0000-4000-8000-000000000212'
    const removedProductId = '00000000-0000-4000-8000-000000000911'
    const retainedProductId = '00000000-0000-4000-8000-000000000912'
    const existingQuote = createSelectSingleBuilder({
      data: {
        pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS,
        subtotal: '510.00',
        final_total: '561.00',
        quote_options: [],
      },
      error: null,
    })
    const existingSnapshots = createSelectSingleBuilder({
      data: {
        quote_items: [
          {
            id: removedItemId,
            product_id: removedProductId,
            product_name_snapshot: 'Removed paint',
            market_price_snapshot: '40.00',
            actual_price_snapshot: '11.00',
            position: 0,
          },
          {
            id: retainedItemId,
            product_id: retainedProductId,
            product_name_snapshot: 'Retained paint',
            market_price_snapshot: '50.00',
            actual_price_snapshot: '22.00',
            position: 1,
          },
        ],
        quote_options: [],
      },
      error: null,
    })
    const productQuery = createThenableBuilder({
      data: [{
        id: retainedProductId,
        name: 'Current retained paint',
        market_price: '900.00',
        actual_price: '700.00',
        price: '700.00',
        rrp_price: '900.00',
      }],
      error: null,
    })
    const latestRevision = createThenableBuilder({ data: [], error: null })
    const builders: Record<string, unknown[]> = {
      quotes: [existingQuote, existingSnapshots],
      products: [productQuery],
      quote_price_revisions: [latestRevision],
    }
    const from = vi.fn((table: string) => {
      const builder = builders[table]?.shift()
      if (!builder) throw new Error(`unexpected table ${table}`)
      return builder
    })
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from, rpc })

    const result = await updateQuote({
      id: quoteId,
      ...quoteInput,
      items: [{
        sourceItemId: retainedItemId,
        productId: retainedProductId,
        productNameSnapshot: 'Edited retained paint',
        marketPriceSnapshot: 55,
        actualPriceSnapshot: 999,
        quantity: 1,
        isCustom: false,
        position: 0,
      }],
    })

    expect(result).toEqual({ ok: true, data: { id: quoteId } })
    expect(rpc).toHaveBeenCalledWith('update_quote_with_jobber_sync', {
      payload: expect.objectContaining({
        items: [expect.objectContaining({
          product_id: retainedProductId,
          actual_price_snapshot: '22.00',
          position: 0,
        })],
      }),
    })
  })

  it('retains each duplicate-product main snapshot by sourceItemId when rows are reordered', async () => {
    const firstItemId = '00000000-0000-4000-8000-000000000221'
    const secondItemId = '00000000-0000-4000-8000-000000000222'
    const productId = '00000000-0000-4000-8000-000000000921'
    const existingQuote = createSelectSingleBuilder({
      data: {
        pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS,
        subtotal: '510.00',
        final_total: '561.00',
        quote_options: [],
      },
      error: null,
    })
    const existingSnapshots = createSelectSingleBuilder({
      data: {
        quote_items: [
          {
            id: firstItemId,
            product_id: productId,
            product_name_snapshot: 'First coat',
            market_price_snapshot: '40.00',
            actual_price_snapshot: '11.00',
            position: 0,
          },
          {
            id: secondItemId,
            product_id: productId,
            product_name_snapshot: 'Second coat',
            market_price_snapshot: '50.00',
            actual_price_snapshot: '22.00',
            position: 1,
          },
        ],
        quote_options: [],
      },
      error: null,
    })
    const productQuery = createThenableBuilder({
      data: [{
        id: productId,
        name: 'Current catalog paint',
        market_price: '300.00',
        actual_price: '200.00',
        price: '200.00',
        rrp_price: '300.00',
      }],
      error: null,
    })
    const latestRevision = createThenableBuilder({ data: [], error: null })
    const builders: Record<string, unknown[]> = {
      quotes: [existingQuote, existingSnapshots],
      products: [productQuery],
      quote_price_revisions: [latestRevision],
    }
    const from = vi.fn((table: string) => {
      const builder = builders[table]?.shift()
      if (!builder) throw new Error(`unexpected table ${table}`)
      return builder
    })
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from, rpc })

    const result = await updateQuote({
      id: quoteId,
      ...quoteInput,
      items: [
        {
          sourceItemId: secondItemId,
          productId,
          productNameSnapshot: 'Second coat moved first',
          marketPriceSnapshot: 55,
          actualPriceSnapshot: 999,
          quantity: 1,
          isCustom: false,
          position: 0,
        },
        {
          sourceItemId: firstItemId,
          productId,
          productNameSnapshot: 'First coat moved second',
          marketPriceSnapshot: 45,
          actualPriceSnapshot: 888,
          quantity: 1,
          isCustom: false,
          position: 1,
        },
      ],
    })

    expect(result).toEqual({ ok: true, data: { id: quoteId } })
    expect(rpc).toHaveBeenCalledWith('update_quote_with_jobber_sync', {
      payload: expect.objectContaining({
        items: [
          expect.objectContaining({ actual_price_snapshot: '22.00', position: 0 }),
          expect.objectContaining({ actual_price_snapshot: '11.00', position: 1 }),
        ],
      }),
    })
  })

  it('rejects duplicate reuse of one owned sourceItemId across linked rows', async () => {
    const sourceItemId = '00000000-0000-4000-8000-000000000223'
    const productId = '00000000-0000-4000-8000-000000000922'
    const existingQuote = createSelectSingleBuilder({
      data: {
        pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS,
        subtotal: '510.00',
        final_total: '561.00',
        quote_options: [],
      },
      error: null,
    })
    const existingSnapshots = createSelectSingleBuilder({
      data: {
        quote_items: [{
          id: sourceItemId,
          product_id: productId,
          actual_price_snapshot: '22.00',
        }],
        quote_options: [],
      },
      error: null,
    })
    const productQuery = createThenableBuilder({
      data: [{
        id: productId,
        name: 'Current catalog paint',
        market_price: '300.00',
        actual_price: '200.00',
        price: '200.00',
        rrp_price: '300.00',
      }],
      error: null,
    })
    const latestRevision = createThenableBuilder({ data: [], error: null })
    const builders: Record<string, unknown[]> = {
      quotes: [existingQuote, existingSnapshots],
      products: [productQuery],
      quote_price_revisions: [latestRevision],
    }
    const from = vi.fn((table: string) => {
      const builder = builders[table]?.shift()
      if (!builder) throw new Error(`unexpected table ${table}`)
      return builder
    })
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from, rpc })

    const result = await updateQuote({
      id: quoteId,
      ...quoteInput,
      items: [
        {
          sourceItemId,
          productId,
          productNameSnapshot: 'First row',
          marketPriceSnapshot: 55,
          actualPriceSnapshot: 999,
          quantity: 1,
          isCustom: false,
          position: 0,
        },
        {
          sourceItemId,
          productId,
          productNameSnapshot: 'Duplicated identity',
          marketPriceSnapshot: 65,
          actualPriceSnapshot: 888,
          quantity: 1,
          isCustom: false,
          position: 1,
        },
      ],
    })

    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['main', 'option'] as const)(
    'rejects removing productId from an owned linked %s source item',
    async (kind) => {
      const sourceItemId = kind === 'main'
        ? '00000000-0000-4000-8000-000000000224'
        : '00000000-0000-4000-8000-000000000234'
      const productId = kind === 'main'
        ? '00000000-0000-4000-8000-000000000923'
        : '00000000-0000-4000-8000-000000000933'
      const existingQuote = createSelectSingleBuilder({
        data: {
          pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS,
          subtotal: '510.00',
          final_total: '561.00',
          quote_options: kind === 'option' ? [{ subtotal: '300.00', final_total: '330.00' }] : [],
        },
        error: null,
      })
      const linkedSnapshot = {
        id: sourceItemId,
        product_id: productId,
        actual_price_snapshot: '22.00',
      }
      const existingSnapshots = createSelectSingleBuilder({
        data: {
          quote_items: kind === 'main' ? [linkedSnapshot] : [],
          quote_options: kind === 'option'
            ? [{ quote_option_items: [linkedSnapshot] }]
            : [],
        },
        error: null,
      })
      const latestRevision = createThenableBuilder({ data: [], error: null })
      const builders: Record<string, unknown[]> = {
        quotes: [existingQuote, existingSnapshots],
        quote_price_revisions: [latestRevision],
      }
      const from = vi.fn((table: string) => {
        const builder = builders[table]?.shift()
        if (!builder) throw new Error(`unexpected table ${table}`)
        return builder
      })
      const rpc = vi.fn(async () => ({ data: null, error: null }))
      mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from, rpc })
      const tamperedItem = {
        sourceItemId,
        productNameSnapshot: 'Tampered custom row',
        marketPriceSnapshot: 999,
        actualPriceSnapshot: 888,
        quantity: 1,
        isCustom: true,
        position: 0,
      }

      const result = await updateQuote({
        id: quoteId,
        ...quoteInput,
        items: kind === 'main' ? [tamperedItem] : [],
        options: kind === 'option'
          ? [{
              title: 'Option 1',
              selectedMin: 1,
              selectedMax: 1,
              position: 0,
              items: [tamperedItem],
            }]
          : [],
      })

      expect(result.ok).toBe(false)
      expect(rpc).not.toHaveBeenCalled()
    }
  )

  it('retains each option item actual snapshot by sourceItemId when duplicate-product rows are reordered', async () => {
    const optionId = '00000000-0000-4000-8000-000000000431'
    const firstItemId = '00000000-0000-4000-8000-000000000231'
    const secondItemId = '00000000-0000-4000-8000-000000000232'
    const productId = '00000000-0000-4000-8000-000000000931'
    const existingQuote = createSelectSingleBuilder({
      data: {
        pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS,
        subtotal: '510.00',
        final_total: '561.00',
        quote_options: [{ subtotal: '300.00', final_total: '330.00' }],
      },
      error: null,
    })
    const existingSnapshots = createSelectSingleBuilder({
      data: {
        quote_items: [],
        quote_options: [{
          id: optionId,
          position: 0,
          quote_option_items: [
            {
              id: firstItemId,
              product_id: productId,
              product_name_snapshot: 'Option first coat',
              market_price_snapshot: '60.00',
              actual_price_snapshot: '33.00',
              position: 0,
            },
            {
              id: secondItemId,
              product_id: productId,
              product_name_snapshot: 'Option second coat',
              market_price_snapshot: '70.00',
              actual_price_snapshot: '44.00',
              position: 1,
            },
          ],
        }],
      },
      error: null,
    })
    const productQuery = createThenableBuilder({
      data: [{
        id: productId,
        name: 'Current option paint',
        market_price: '300.00',
        actual_price: '200.00',
        price: '200.00',
        rrp_price: '300.00',
      }],
      error: null,
    })
    const latestRevision = createThenableBuilder({ data: [], error: null })
    const builders: Record<string, unknown[]> = {
      quotes: [existingQuote, existingSnapshots],
      products: [productQuery],
      quote_price_revisions: [latestRevision],
    }
    const from = vi.fn((table: string) => {
      const builder = builders[table]?.shift()
      if (!builder) throw new Error(`unexpected table ${table}`)
      return builder
    })
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from, rpc })

    const result = await updateQuote({
      id: quoteId,
      ...quoteInput,
      items: [],
      options: [{
        title: 'Option 1',
        selectedMin: 1,
        selectedMax: 1,
        position: 0,
        items: [
          {
            sourceItemId: secondItemId,
            productId,
            productNameSnapshot: 'Option second coat moved first',
            marketPriceSnapshot: 75,
            actualPriceSnapshot: 999,
            quantity: 1,
            isCustom: false,
            position: 0,
          },
          {
            sourceItemId: firstItemId,
            productId,
            productNameSnapshot: 'Option first coat moved second',
            marketPriceSnapshot: 65,
            actualPriceSnapshot: 888,
            quantity: 1,
            isCustom: false,
            position: 1,
          },
        ],
      }],
    })

    expect(result).toEqual({ ok: true, data: { id: quoteId } })
    expect(rpc).toHaveBeenCalledWith('update_quote_with_jobber_sync', {
      payload: expect.objectContaining({
        options: [expect.objectContaining({
          items: [
            expect.objectContaining({ actual_price_snapshot: '44.00', position: 0 }),
            expect.objectContaining({ actual_price_snapshot: '33.00', position: 1 }),
          ],
        })],
      }),
    })
  })

  it('rejects an unresolved linked product when sourceItemId is not owned by the quote', async () => {
    const productId = '00000000-0000-4000-8000-000000000941'
    const unownedItemId = '00000000-0000-4000-8000-000000000241'
    const existingQuote = createSelectSingleBuilder({
      data: {
        pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS,
        subtotal: '510.00',
        final_total: '561.00',
        quote_options: [],
      },
      error: null,
    })
    const existingSnapshots = createSelectSingleBuilder({
      data: { quote_items: [], quote_options: [] },
      error: null,
    })
    const productQuery = createThenableBuilder({ data: [], error: null })
    const latestRevision = createThenableBuilder({ data: [], error: null })
    const builders: Record<string, unknown[]> = {
      quotes: [existingQuote, existingSnapshots],
      products: [productQuery],
      quote_price_revisions: [latestRevision],
    }
    const from = vi.fn((table: string) => {
      const builder = builders[table]?.shift()
      if (!builder) throw new Error(`unexpected table ${table}`)
      return builder
    })
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from, rpc })

    const result = await updateQuote({
      id: quoteId,
      ...quoteInput,
      items: [{
        sourceItemId: unownedItemId,
        productId,
        productNameSnapshot: 'Tampered missing paint',
        marketPriceSnapshot: 999,
        actualPriceSnapshot: 888,
        quantity: 1,
        isCustom: false,
        position: 0,
      }],
    })

    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns a conflict error when the update RPC detects a stale quote version', async () => {
    const existingQuote = createSelectSingleBuilder({
      data: {
        pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS,
        subtotal: '510.00',
        final_total: '561.00',
      },
      error: null,
    })
    const from = vi.fn((table: string) => {
      if (table === 'quotes') return existingQuote
      throw new Error(`unexpected table ${table}`)
    })
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'QUOTE_VERSION_CONFLICT' },
    }))
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from, rpc })

    const result = await updateQuote({
      id: quoteId,
      ...quoteInput,
    })

    expect(result).toEqual({
      ok: false,
      error: 'Quote was changed by someone else. Refresh and try again.',
    })
    expect(rpc).toHaveBeenCalledWith('update_quote_with_jobber_sync', expect.objectContaining({
      payload: expect.objectContaining({
        id: quoteId,
        expected_version: 1,
      }),
    }))
    expect(mocks.syncJobberQuoteLineItems).not.toHaveBeenCalled()
  })


  it('replaces ordered public lines and memos in the save payload without direct child writes', async () => {
    const { rpc, from } = persistenceFixture()
    expect((await updateQuote({ ...quoteInputWithJobberLines, id: quoteId, expectedVersion: 1, memos: [{ body: 'Keep this memo' }] })).ok).toBe(true)
    expect(rpcPayload(rpc)).toMatchObject({ jobber_lines: [{ position: 0 }, { position: 1 }], memos: [{ body: 'Keep this memo' }] })
    expect(from.mock.calls.every(([table]) => table === 'quotes')).toBe(true)
  })

  it('saves linked Jobber changes locally unless synchronization is requested', async () => {
    const { rpc } = persistenceFixture()
    expect((await updateQuote({ ...quoteInputWithJobberLines, id: quoteId, expectedVersion: 1, jobberQuoteId: 'jobber-quote-id' })).ok).toBe(true)
    expect(rpcPayload(rpc)).toMatchObject({ quote: { jobber_quote_id: 'jobber-quote-id' } })
    expect(mocks.syncJobberQuoteLineItems).not.toHaveBeenCalled()
  })

  it('keeps ordinary create and update saves working in Vercel Preview', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { rpc } = persistenceFixture()

    try {
      await expect(createQuote(quoteInput)).resolves.toEqual({ ok: true, data: { id: quoteId } })
      await expect(updateQuote({ ...quoteInput, id: quoteId, expectedVersion: 1 }))
        .resolves.toEqual({ ok: true, data: { id: quoteId } })
    } finally {
      vi.unstubAllEnvs()
    }

    expect(rpc).toHaveBeenCalledWith('create_quote_with_jobber_sync', expect.objectContaining({
      payload: expect.objectContaining({ sync_requested: false }),
    }))
    expect(rpc).toHaveBeenCalledWith('update_quote_with_jobber_sync', expect.objectContaining({
      payload: expect.objectContaining({ sync_requested: false }),
    }))
  })

  it('rejects Save & Sync in Vercel Preview before any quote database access', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')

    try {
      await expect(createQuote({ ...quoteInput, syncJobber: true })).resolves.toEqual({
        ok: false,
        error: 'Jobber is disabled in this preview environment.',
      })
      await expect(updateQuote({ ...quoteInput, id: quoteId, expectedVersion: 1, syncJobber: true }))
        .resolves.toEqual({
          ok: false,
          error: 'Jobber is disabled in this preview environment.',
        })
    } finally {
      vi.unstubAllEnvs()
    }

    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.getPricingSettings).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it('persists edit-form snapshot refresh metadata with the quote', async () => {
    const { rpc } = persistenceFixture()
    expect((await updateQuote({ ...quoteInput, id: quoteId, expectedVersion: 1, jobberSnapshot: changedJobberSnapshot,
      jobberSnapshotRefreshedAt: '2026-05-19T01:00:00.000Z', jobberSnapshotChangeStatus: 'changed', jobberSnapshotChangeSummary: [],
    })).ok).toBe(true)
    expect(rpcPayload(rpc)).toMatchObject({ quote: { jobber_snapshot: changedJobberSnapshot, jobber_snapshot_refreshed_at: '2026-05-19T01:00:00.000Z', jobber_snapshot_change_status: 'changed' } })
  })

  it('commits Save & Sync intent transactionally before scheduling an operation-only worker', async () => {
    const operationId = '00000000-0000-4000-8000-000000000701'
    const { rpc } = persistenceFixture()

    expect((await updateQuote({
      ...quoteInputWithJobberLines,
      id: quoteId,
      expectedVersion: 6,
      jobberQuoteId: 'jobber-quote-id',
      deletedJobberLineItemIds: ['deleted-before-save'],
      syncJobber: true,
    })).ok).toBe(true)

    expect(rpc).toHaveBeenCalledWith('update_quote_with_jobber_sync', expect.objectContaining({
      payload: expect.objectContaining({
        sync_requested: true,
        deleted_jobber_line_item_ids: ['deleted-before-save'],
      }),
    }))
    expect(mocks.getJobberSyncOperationForQuote).toHaveBeenCalledWith(expect.any(Object), quoteId)
    expect(mocks.after).toHaveBeenCalledTimes(1)
    expect(mocks.runJobberSyncOperation).not.toHaveBeenCalled()
    expect(mocks.syncJobberQuoteLineItems).not.toHaveBeenCalled()

    const scheduled = mocks.after.mock.calls[0]?.[0] as (() => Promise<void>) | undefined
    expect(scheduled).toBeTypeOf('function')
    await scheduled?.()
    expect(mocks.runJobberSyncOperation).toHaveBeenCalledWith(operationId, expect.any(Object))
    expect(mocks.runJobberSyncOperation).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      deletedJobberLineItemIds: expect.anything(),
    }))
  })

  it('keeps durable intent queued when the best-effort scheduler callback never runs', async () => {
    const { rpc } = persistenceFixture()

    expect((await createQuote({
      ...quoteInputWithJobberLines,
      jobberQuoteId: 'jobber-quote-id',
      syncJobber: true,
    })).ok).toBe(true)

    expect(rpc).toHaveBeenCalledWith('create_quote_with_jobber_sync', expect.objectContaining({
      payload: expect.objectContaining({ sync_requested: true }),
    }))
    expect(mocks.after).toHaveBeenCalledTimes(1)
    expect(mocks.runJobberSyncOperation).not.toHaveBeenCalled()
    expect(mocks.syncJobberQuoteLineItems).not.toHaveBeenCalled()
  })

  it('does not run a duplicate retry request whose immutable operation already succeeded', async () => {
    persistenceFixture({ ...quoteRow, jobber_quote_id: 'jobber-quote-id' })
    mocks.requestJobberSyncOperation.mockResolvedValueOnce({
      ...await mocks.getJobberSyncOperationForQuote(),
      status: 'succeeded',
      result: { syncedLineItems: [], expectedLineItems: [], deletedLineItemIds: [] },
    })

    expect(await retryJobberQuoteSync(quoteId)).toEqual({ ok: true, data: { id: quoteId } })
    expect(mocks.runJobberSyncOperation).not.toHaveBeenCalled()
    expect(mocks.syncJobberQuoteLineItems).not.toHaveBeenCalled()
  })

  it('rejects Retry and snapshot refresh in Vercel Preview before reading a quote', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')

    try {
      await expect(retryJobberQuoteSync(quoteId)).resolves.toEqual({
        ok: false,
        error: 'Jobber is disabled in this preview environment.',
      })
      await expect(refreshJobberQuoteSnapshot(quoteId)).resolves.toEqual({
        ok: false,
        error: 'Jobber is disabled in this preview environment.',
      })
    } finally {
      vi.unstubAllEnvs()
    }

    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.requestJobberSyncOperation).not.toHaveBeenCalled()
    expect(mocks.fetchJobberQuote).not.toHaveBeenCalled()
  })

  it('blocks a legacy failed quote without a journal instead of blindly resending it', async () => {
    persistenceFixture({ ...quoteRow, jobber_quote_id: 'jobber-quote-id', jobber_sync_status: 'failed' })
    mocks.requestJobberSyncOperation.mockResolvedValueOnce({
      ...await mocks.getJobberSyncOperationForQuote(),
      status: 'reconciliation_required',
      failure_code: 'legacy_unjournaled',
      result: null,
    })

    expect(await retryJobberQuoteSync(quoteId)).toEqual({
      ok: false,
      error: expect.stringContaining('Check Jobber'),
    })
    expect(mocks.runJobberSyncOperation).not.toHaveBeenCalled()
    expect(mocks.syncJobberQuoteLineItems).not.toHaveBeenCalled()
  })

  it('returns the safe priced/text mismatch explanation after a zero-write preflight', async () => {
    persistenceFixture({ ...quoteRow, jobber_quote_id: 'jobber-quote-id' })
    const operation = await mocks.getJobberSyncOperationForQuote()
    mocks.requestJobberSyncOperation.mockResolvedValueOnce(operation)
    mocks.runJobberSyncOperation.mockResolvedValueOnce({
      status: 'retryable',
      reason: 'line_kind_mismatch',
      operation: { ...operation, status: 'retryable', failure_code: 'line_kind_mismatch' },
    })

    const result = await retryJobberQuoteSync(quoteId)
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('Nothing was sent to Jobber'),
    })
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('priced/text types'),
    })
  })

  it('duplicates a Supabase quote with refreshed product RRP and no copied Jobber identifiers', async () => {
    const duplicateProductId = '00000000-0000-4000-8000-000000000901'
    const duplicateQuoteId = '00000000-0000-4000-8000-000000000902'
    const sourceQuoteSelect = createSelectSingleBuilder({
      data: {
        ...quoteRow,
        jobber_quote_id: 'jobber-quote-id',
        jobber_snapshot: { jobberQuoteId: 'jobber-quote-id' },
        jobber_sync_status: 'failed',
        jobber_sync_error: 'old failure',
        work_type: 'Roof',
        selected_min: 4,
        selected_max: 1,
        roof_selected_min: 2,
        roof_selected_max: 5,
        quote_items: [
          {
            ...quoteRow.quote_items[0],
            product_id: duplicateProductId,
            product_name_snapshot: 'Old product name',
            market_price_snapshot: '50.00',
            actual_price_snapshot: '50.00',
            quantity: '2.00',
            working_days: '2.00',
            labour_per_day: '1.00',
            area_name_snapshot: 'Roof',
            area_scope_snapshot: 'roof',
          },
        ],
        jobber_quote_lines: [
          {
            ...quoteRow.jobber_quote_lines[0],
            jobber_line_item_id: 'old-jobber-line-id',
            linked_product_or_service_id: 'jobber-product-1',
          },
          {
            ...quoteRow.jobber_quote_lines[0],
            id: '00000000-0000-4000-8000-000000000303',
            name: 'Hidden old line',
            client_visible: false,
            jobber_line_item_id: 'old-hidden-line-id',
            position: 1,
          },
        ],
        quote_options: [],
        quote_memos: [],
      },
      error: null,
    })
    const productQuery = createThenableBuilder({
      data: [{
        id: duplicateProductId,
        name: 'Current RRP paint',
        market_price: '150.00',
        actual_price: '120.00',
        price: null,
        rrp_price: '150.00',
      }],
      error: null,
    })
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => { void name; void args; return { data: duplicateQuoteId, error: null } })
    const duplicateActionFrom = vi.fn((table: string) => {
      if (table === 'products') return productQuery
      throw new Error(`unexpected duplicate action table ${table}`)
    })
    const getQuoteFrom = vi.fn((table: string) => {
      if (table === 'quotes') return sourceQuoteSelect
      throw new Error(`unexpected get quote table ${table}`)
    })
    const createQuoteFrom = vi.fn((table: string) => {
      if (table === 'products') return productQuery
      throw new Error(`unexpected create quote table ${table}`)
    })
    mocks.createClient
      .mockResolvedValueOnce({ auth: createAuthUser(), from: duplicateActionFrom })
      .mockResolvedValueOnce({ from: getQuoteFrom })
      .mockResolvedValueOnce({ auth: createAuthUser(), from: createQuoteFrom, rpc })

    const result = await duplicateQuote(quoteId)

    expect(result).toEqual({ ok: true, data: { id: duplicateQuoteId } })
    expect(productQuery.select).toHaveBeenCalledWith('id, name, market_price, actual_price, price, rrp_price')
    expect(productQuery.in).toHaveBeenCalledWith('id', [duplicateProductId])
    const payload = rpcPayload(rpc, 'create_quote_with_jobber_sync')
    expect(payload.quote).toEqual(expect.objectContaining({
      customer_name: 'Supabase Customer',
      jobber_quote_id: null,
      jobber_snapshot: null,
      jobber_sync_status: 'not_synced',
      roof_selected_min: 2,
      roof_selected_max: 5,
    }))
    expect(payload.items).toEqual([
      expect.objectContaining({
        product_id: duplicateProductId,
        product_name_snapshot: 'Current RRP paint',
        market_price_snapshot: '150.00',
        actual_price_snapshot: '150.00',
        quantity: '2.00',
        area_name_snapshot: 'Roof',
        area_scope_snapshot: 'roof',
      }),
    ])
    expect(payload.jobber_lines).toEqual([
      expect.objectContaining({
        name: 'Public painting service',
        jobber_line_item_id: null,
        linked_product_or_service_id: 'jobber-product-1',
      }),
    ])
    expect(payload.jobber_lines).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Hidden old line' }),
    ]))
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/quotes')
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/quotes/${quoteId}`)
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/quotes/${duplicateQuoteId}`)
  })

  it('returns product lookup errors when duplicating a Supabase quote', async () => {
    const duplicateProductId = '00000000-0000-4000-8000-000000000901'
    const sourceQuoteSelect = createSelectSingleBuilder({
      data: {
        ...quoteRow,
        quote_items: [{ ...quoteRow.quote_items[0], product_id: duplicateProductId }],
      },
      error: null,
    })
    const productQuery = createThenableBuilder({ data: null, error: new Error('product lookup failed') })
    mocks.createClient
      .mockResolvedValueOnce({
        auth: createAuthUser(),
        from: vi.fn((table: string) => {
          if (table === 'products') return productQuery
          throw new Error(`unexpected duplicate action table ${table}`)
        }),
      })
      .mockResolvedValueOnce({
        from: vi.fn((table: string) => {
          if (table === 'quotes') return sourceQuoteSelect
          throw new Error(`unexpected get quote table ${table}`)
        }),
      })

    const result = await duplicateQuote(quoteId)

    expect(result).toEqual({ ok: false, error: 'product lookup failed' })
  })

  it('returns createQuote errors when duplicating a Supabase quote fails at insert', async () => {
    const duplicateProductId = '00000000-0000-4000-8000-000000000901'
    const sourceQuoteSelect = createSelectSingleBuilder({
      data: {
        ...quoteRow,
        quote_items: [{ ...quoteRow.quote_items[0], product_id: duplicateProductId }],
      },
      error: null,
    })
    const productQuery = createThenableBuilder({
      data: [{
        id: duplicateProductId,
        name: 'Current catalog paint',
        market_price: '150.00',
        actual_price: '80.00',
        price: '80.00',
        rrp_price: '150.00',
      }],
      error: null,
    })
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'duplicate insert failed' } })
    mocks.createClient
      .mockResolvedValueOnce({
        auth: createAuthUser(),
        from: vi.fn((table: string) => {
          if (table === 'products') return productQuery
          throw new Error(`unexpected duplicate action table ${table}`)
        }),
      })
      .mockResolvedValueOnce({
        from: vi.fn((table: string) => {
          if (table === 'quotes') return sourceQuoteSelect
          throw new Error(`unexpected get quote table ${table}`)
        }),
      })
      .mockResolvedValueOnce({
        auth: createAuthUser(), rpc,
        from: vi.fn((table: string) => {
          if (table === 'products') return productQuery
          throw new Error(`unexpected create quote table ${table}`)
        }),
      })

    const result = await duplicateQuote(quoteId)

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Unable') })
  })

  it('rejects quote updates without an id before touching Supabase', async () => {
    const result = await updateQuote(quoteInput)

    expect(result).toEqual({ ok: false, error: 'Quote id is required' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('requires an observed version before updating in every environment', async () => {
    const { from, rpc } = persistenceFixture()
    expect(await updateQuote({ ...quoteInput, id: quoteId, expectedVersion: undefined }))
      .toEqual({ ok: false, error: 'Quote version is required. Refresh and try again.' })
    expect(from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects Jobber snapshot refresh without an id before touching Supabase', async () => {
    const result = await refreshJobberQuoteSnapshot(' ')

    expect(result).toEqual({ ok: false, error: 'Quote id is required' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })


  it('rejects snapshot refresh for missing and unlinked quotes', async () => {
    persistenceFixture(null)
    expect((await refreshJobberQuoteSnapshot(quoteId)).ok).toBe(false)
    persistenceFixture()
    expect((await refreshJobberQuoteSnapshot(quoteId)).ok).toBe(false)
    expect(mocks.fetchJobberQuote).not.toHaveBeenCalled()
  })

  it.each([['changed', changedJobberSnapshot], ['unchanged', previousJobberSnapshot]] as const)('stores %s snapshot metadata using the versioned result RPC', async (status, fresh) => {
    const { rpc, quote } = persistenceFixture({ ...quoteRow, jobber_quote_id: 'jobber-quote-id', jobber_snapshot: previousJobberSnapshot })
    mocks.mapJobberQuoteToDraft.mockReturnValueOnce(fresh)
    expect(await refreshJobberQuoteSnapshot(quoteId)).toEqual({ ok: true, data: { id: quoteId, status } })
    expect(rpc).toHaveBeenCalledWith('apply_quote_jobber_result', expect.objectContaining({ target_quote_id: quoteId, expected_version: 1,
      changes: expect.objectContaining({ jobber_snapshot: fresh, jobber_snapshot_change_status: status }),
    }))
    expect(quote.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('refreshes snapshots against the shared token owner', async () => {
    persistenceFixture({ ...quoteRow, jobber_quote_id: 'jobber-quote-id' })
    mocks.fetchJobberQuote.mockRejectedValueOnce(new mocks.JobberApiError('expired', 401))
    expect((await refreshJobberQuoteSnapshot(quoteId)).ok).toBe(true)
    expect(mocks.refreshSharedJobberConnectionToken).toHaveBeenCalledWith('refresh-token', expect.any(Object), 'user-1')
  })

  it('fails clearly when the shared token owner cannot be resolved', async () => {
    persistenceFixture({ ...quoteRow, jobber_quote_id: 'jobber-quote-id' })
    mocks.getUsableSharedJobberConnectionToken.mockResolvedValueOnce({ accessToken: 'token', refreshToken: 'refresh' })
    mocks.fetchJobberQuote.mockRejectedValueOnce(new mocks.JobberApiError('expired', 401))
    expect(await refreshJobberQuoteSnapshot(quoteId)).toMatchObject({ ok: false, error: expect.stringContaining('owner') })
  })

  it('stores refresh errors with the original version and rejects late success results', async () => {
    const { rpc } = persistenceFixture({ ...quoteRow, jobber_quote_id: 'jobber-quote-id' })
    mocks.fetchJobberQuote.mockRejectedValueOnce(new Error('Jobber timeout'))
    expect(await refreshJobberQuoteSnapshot(quoteId)).toEqual({ ok: false, error: 'Jobber timeout' })
    expect(rpc).toHaveBeenCalledWith('apply_quote_jobber_result', { target_quote_id: quoteId, expected_version: 1, changes: { jobber_snapshot_refresh_error: 'Jobber timeout' } })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'QUOTE_DELETED' } })
    expect(await refreshJobberQuoteSnapshot(quoteId)).toMatchObject({ ok: false, error: expect.stringContaining('Trash') })
  })

  it('keeps the legacy delete action safe and requires a version', async () => {
    const { rpc, from } = persistenceFixture()
    expect((await deleteQuote(quoteId)).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(await deleteQuote(quoteId, 1)).toEqual({ ok: true, data: { id: quoteId } })
    expect(rpc).toHaveBeenCalledWith('soft_delete_quote', { target_quote_id: quoteId, expected_version: 1 })
    expect(from).not.toHaveBeenCalled()
    mocks.requireAllowedUser.mockResolvedValueOnce({ ok: false, error: 'Admin access required' })
    expect((await deleteQuote(quoteId, 1)).ok).toBe(false)
  })

  it('searches the lightweight overview by human-readable Jobber quote number', async () => {
    const searchBuilder = createThenableBuilder({ data: [quoteRow], error: null })
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => searchBuilder),
    })

    const result = await searchQuotes('# 3535')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data[0].items).toEqual([])
      expect(result.data[0].options).toEqual([])
      expect(result.data[0].priceRevisions).toEqual([])
      expect(result.data[0].jobberSaveMode).toBe('priced_line_items')
      expect(result.data[0].createdByName).toBeNull()
      expect(result.data[0].createdByEmail).toBeNull()
    }
    expect(searchBuilder.or).toHaveBeenCalledWith(
      'customer_name.ilike."%3535%",customer_address.ilike."%3535%",jobber_quote_id.ilike."%3535%",jobber_snapshot->>quoteNumber.ilike."%3535%"'
    )
    expect(searchBuilder.ilike).not.toHaveBeenCalled()
    expect(searchBuilder.limit).toHaveBeenCalledWith(100)
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it('preserves punctuation when building the overview search filter', async () => {
    const searchBuilder = createThenableBuilder({ data: [quoteRow], error: null })
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => searchBuilder),
    })

    await searchQuotes('Unit #5, 12.5 Main St')

    expect(searchBuilder.or).toHaveBeenCalledWith(
      'customer_name.ilike."%Unit #5, 12.5 Main St%",customer_address.ilike."%Unit #5, 12.5 Main St%",jobber_quote_id.ilike."%Unit #5, 12.5 Main St%",jobber_snapshot->>quoteNumber.ilike."%Unit #5, 12.5 Main St%"'
    )
  })

  it('treats Postgres ILIKE metacharacters as literal search text', async () => {
    const cases = [
      { query: '100% Painting', escaped: '100\\\\% Painting' },
      { query: 'A_B', escaped: 'A\\\\_B' },
      { query: 'A\\B', escaped: 'A\\\\\\\\B' },
    ]

    for (const testCase of cases) {
      const searchBuilder = createThenableBuilder({ data: [quoteRow], error: null })
      mocks.createClient.mockResolvedValueOnce({
        from: vi.fn(() => searchBuilder),
      })

      await searchQuotes(testCase.query)

      expect(searchBuilder.or).toHaveBeenCalledWith(
        expect.stringContaining(`customer_name.ilike."%${testCase.escaped}%"`)
      )
    }
  })

  it('treats the PostgREST asterisk wildcard alias as literal search text', async () => {
    const searchBuilder = createThenableBuilder({ data: [quoteRow], error: null })
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => searchBuilder),
    })

    await searchQuotes('A*B')

    expect(searchBuilder.or).toHaveBeenCalledWith(
      'customer_name.imatch.".*A\\\\*B.*",customer_address.imatch.".*A\\\\*B.*",jobber_quote_id.imatch.".*A\\\\*B.*",jobber_snapshot->>quoteNumber.imatch.".*A\\\\*B.*"'
    )
  })

  it('returns Supabase errors when quote search fails', async () => {
    const searchBuilder = createThenableBuilder({ data: null, error: new Error('quote search failed') })
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => searchBuilder),
    })

    const result = await searchQuotes()

    expect(result).toEqual({ ok: false, error: 'quote search failed' })
    expect(searchBuilder.or).not.toHaveBeenCalled()
  })

  it('falls back to the list query shape when quote options are not migrated yet', async () => {
    const detailBuilder = createSelectSingleBuilder({
      data: null,
      error: { message: "Could not find a relationship between 'quotes' and 'quote_options'" },
    })
    const fallbackBuilder = createSelectSingleBuilder({ data: quoteRow, error: null })
    const from = vi.fn(() => from.mock.calls.length === 1 ? detailBuilder : fallbackBuilder)
    mocks.createClient.mockResolvedValueOnce({ from })

    const result = await getQuote(quoteId)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data?.id).toBe(quoteId)
      expect(result.data?.items).toHaveLength(1)
      expect(result.data?.jobberQuoteLines[0].name).toBe('Public painting service')
      expect(result.data?.createdByName).toBe('Mia Kang')
      expect(result.data?.priceRevisions?.[0]).toEqual(expect.objectContaining({
        revisionNumber: 1,
        eventType: 'created',
        previousFinalTotal: null,
        newFinalTotal: '561.00',
        changedByName: 'Mia Kang',
        changedByEmail: 'owner@example.com',
      }))
    }
  })

  it('requests every field needed to map quote detail without wildcard selects', async () => {
    const detailBuilder = createSelectSingleBuilder({ data: quoteRow, error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => detailBuilder) })

    await getQuote(quoteId)

    expect(detailBuilder.select).toHaveBeenCalledWith([
      'id',
      'version',
      'customer_name',
      'customer_address',
      'jobber_quote_id',
      'jobber_snapshot',
      'jobber_save_mode',
      'jobber_sync_status',
      'jobber_last_synced_at',
      'jobber_sync_error',
      'jobber_snapshot_refreshed_at',
      'jobber_snapshot_change_status',
      'jobber_snapshot_change_summary',
      'jobber_snapshot_refresh_error',
      'area_sqft',
      'work_type',
      'working_days',
      'labour_per_day',
      'formula1_total',
      'formula2_total',
      'formula3_total',
      'formula4_total',
      'formula5_total',
      'selected_min',
      'selected_max',
      'interior_selected_min',
      'interior_selected_max',
      'exterior_selected_min',
      'exterior_selected_max',
      'roof_selected_min',
      'roof_selected_max',
      'subtotal',
      'final_total',
      'pricing_settings_snapshot',
      'created_by',
      'created_at',
      'quote_items(id, quote_id, product_id, product_name_snapshot, memo, market_price_snapshot, actual_price_snapshot, quantity, working_days, labour_per_day, area_id, area_name_snapshot, area_scope_snapshot, is_custom, position)',
      'quote_options(id, quote_id, title, working_days, labour_per_day, material_market, material_actual, formula1_total, formula2_total, formula3_total, formula4_total, formula5_total, selected_min, selected_max, subtotal, final_total, position, quote_option_items(id, option_id, product_id, product_name_snapshot, memo, market_price_snapshot, actual_price_snapshot, quantity, working_days, labour_per_day, area_id, area_name_snapshot, area_scope_snapshot, is_custom, position))',
      'jobber_quote_lines(id, quote_id, kind, name, description, quantity, unit_price, total_price, taxable, client_visible, jobber_line_item_id, linked_product_or_service_id, position, created_at, updated_at)',
      'quote_memos(id, quote_id, body, position, created_by, created_at, updated_at)',
      'quote_price_revisions(id, quote_id, revision_number, event_type, previous_subtotal, previous_final_total, new_subtotal, new_final_total, previous_jobber_lines_total, new_jobber_lines_total, previous_options_subtotal, new_options_subtotal, previous_options_final_total, new_options_final_total, changed_by, changed_at)',
    ].join(', '))
  })

  it('reuses the allowed user profile for current-user quote details without an Auth Admin lookup', async () => {
    mocks.requireAllowedUser.mockResolvedValueOnce({
      ok: true,
      user: {
        id: 'user-1',
        email: 'owner@example.com',
        userMetadata: { full_name: 'Mia Direct' },
        appMetadata: {},
      },
    })
    const detailBuilder = createSelectSingleBuilder({ data: quoteRow, error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => detailBuilder) })

    const result = await getQuote(quoteId)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data?.createdByName).toBe('Mia Direct')
      expect(result.data?.priceRevisions[0]?.changedByName).toBe('Mia Direct')
    }
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it('loads non-current quote detail users in one authenticated app-profile query', async () => {
    mocks.requireAllowedUser.mockResolvedValueOnce({
      ok: true,
      user: {
        id: 'user-1',
        email: 'owner@example.com',
        userMetadata: { full_name: 'Mia Direct' },
        appMetadata: {},
      },
    })
    const detailBuilder = createSelectSingleBuilder({
      data: {
        ...quoteRow,
        quote_price_revisions: [
          ...quoteRow.quote_price_revisions,
          {
            ...quoteRow.quote_price_revisions[0],
            id: '00000000-0000-4000-8000-000000000602',
            revision_number: 2,
            event_type: 'updated',
            changed_by: 'user-2',
          },
          {
            ...quoteRow.quote_price_revisions[0],
            id: '00000000-0000-4000-8000-000000000603',
            revision_number: 3,
            event_type: 'updated',
            changed_by: 'user-3',
          },
        ],
      },
      error: null,
    })
    const profileQuery = createThenableBuilder({
      data: [
        { id: 'user-2', email: 'two@example.com', display_name: 'User Two', role: 'admin' },
        { id: 'user-3', email: 'three@example.com', display_name: 'User Three', role: 'supervisor' },
      ],
      error: null,
    })
    mocks.createClient
      .mockResolvedValueOnce({ from: vi.fn(() => detailBuilder) })
      .mockResolvedValueOnce({ from: vi.fn(() => profileQuery) })

    const result = await getQuote(quoteId)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data?.priceRevisions[1]?.changedByName).toBe('User Two')
      expect(result.data?.priceRevisions[2]?.changedByName).toBe('User Three')
    }
    expect(profileQuery.in).toHaveBeenCalledWith('id', ['user-2', 'user-3'])
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it('uses Auth Admin only for quote detail users absent from active app profiles', async () => {
    mocks.requireAllowedUser.mockResolvedValueOnce({
      ok: true,
      user: {
        id: 'user-1',
        email: 'owner@example.com',
        userMetadata: { full_name: 'Mia Direct' },
        appMetadata: {},
      },
    })
    const getUserById = vi.fn(async (userId: string) => ({
      data: {
        user: {
          id: userId,
          email: 'legacy@example.com',
          user_metadata: { full_name: 'Legacy Estimator' },
          app_metadata: {},
        },
      },
      error: null,
    }))
    mocks.createServiceClient.mockResolvedValueOnce({ auth: { admin: { getUserById } } })
    const detailBuilder = createSelectSingleBuilder({
      data: {
        ...quoteRow,
        quote_price_revisions: [
          ...quoteRow.quote_price_revisions,
          {
            ...quoteRow.quote_price_revisions[0],
            id: '00000000-0000-4000-8000-000000000602',
            revision_number: 2,
            event_type: 'updated',
            changed_by: 'user-2',
          },
          {
            ...quoteRow.quote_price_revisions[0],
            id: '00000000-0000-4000-8000-000000000603',
            revision_number: 3,
            event_type: 'updated',
            changed_by: 'user-3',
          },
        ],
      },
      error: null,
    })
    const profileQuery = createThenableBuilder({
      data: [
        { id: 'user-2', email: 'two@example.com', display_name: 'User Two', role: 'admin' },
      ],
      error: null,
    })
    mocks.createClient
      .mockResolvedValueOnce({ from: vi.fn(() => detailBuilder) })
      .mockResolvedValueOnce({ from: vi.fn(() => profileQuery) })

    const result = await getQuote(quoteId)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data?.createdByName).toBe('Mia Direct')
      expect(result.data?.priceRevisions[1]?.changedByName).toBe('User Two')
      expect(result.data?.priceRevisions[2]?.changedByName).toBe('Legacy Estimator')
    }
    expect(profileQuery.in).toHaveBeenCalledWith('id', ['user-2', 'user-3'])
    expect(getUserById).toHaveBeenCalledTimes(1)
    expect(getUserById).toHaveBeenCalledWith('user-3')
  })

  it('normalizes numeric Supabase decimal values before sending quote data to the edit form', async () => {
    const detailBuilder = createSelectSingleBuilder({
      data: {
        ...quoteRow,
        working_days: 3,
        labour_per_day: 3,
        formula1_total: 1599,
        subtotal: 1599,
        final_total: 1758.9,
        quote_items: [
          {
            ...quoteRow.quote_items[0],
            market_price_snapshot: 99,
            actual_price_snapshot: 99,
            quantity: 1,
            working_days: 3,
            labour_per_day: 3,
          },
        ],
        jobber_quote_lines: [
          {
            ...quoteRow.jobber_quote_lines[0],
            quantity: 1,
            unit_price: 1281.88,
            total_price: 1281.88,
          },
        ],
        quote_options: [
          {
            id: '00000000-0000-4000-8000-000000000401',
            quote_id: quoteId,
            title: 'Option 1',
            working_days: 1,
            labour_per_day: 2,
            material_market: 50,
            material_actual: 45,
            formula1_total: 500,
            formula2_total: 510,
            formula3_total: 520,
            formula4_total: 530,
            formula5_total: 540,
            selected_min: 1,
            selected_max: 1,
            subtotal: 500,
            final_total: 550,
            position: 0,
            quote_option_items: [
              {
                ...quoteRow.quote_items[0],
                option_id: '00000000-0000-4000-8000-000000000401',
                market_price_snapshot: 50,
                actual_price_snapshot: 45,
                quantity: 1,
                working_days: 1,
                labour_per_day: 2,
              },
            ],
          },
        ],
      },
      error: null,
    })

    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => detailBuilder) })

    const result = await getQuote(quoteId)

    expect(result.ok).toBe(true)
    if (result.ok && result.data) {
      expect(result.data.workingDays).toBe('3.00')
      expect(result.data.labourPerDay).toBe('9.00')
      expect(result.data.items[0].marketPriceSnapshot).toBe('99.00')
      expect(result.data.items[0].quantity).toBe('1.00')
      expect(result.data.items[0].workingDays).toBe('3.00')
      expect(result.data.jobberQuoteLines[0].unitPrice).toBe('1281.88')
      expect(result.data.options[0].items[0].marketPriceSnapshot).toBe('50.00')
      expect(result.data.options[0].items[0].labourPerDay).toBe('2.00')
    }
  })

  it('loads main and option material memos from saved quote item snapshots', async () => {
    const optionId = '00000000-0000-4000-8000-000000000401'
    const detailBuilder = createSelectSingleBuilder({
      data: {
        ...quoteRow,
        quote_items: [{
          ...quoteRow.quote_items[0],
          memo: 'Main material memo',
        }],
        quote_options: [{
          id: optionId,
          quote_id: quoteId,
          title: 'Option 1',
          working_days: '1.00',
          labour_per_day: '1.00',
          material_market: '50.00',
          material_actual: '45.00',
          formula1_total: '550.00',
          formula2_total: '650.00',
          formula3_total: '700.00',
          formula4_total: '500.00',
          formula5_total: '525.00',
          selected_min: 1,
          selected_max: 1,
          subtotal: '550.00',
          final_total: '605.00',
          position: 0,
          quote_option_items: [{
            ...quoteRow.quote_items[0],
            option_id: optionId,
            memo: 'Option material memo',
          }],
        }],
      },
      error: null,
    })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => detailBuilder) })

    const result = await getQuote(quoteId)

    expect(result.ok).toBe(true)
    if (result.ok && result.data) {
      expect(result.data.items[0].memo).toBe('Main material memo')
      expect(result.data.options[0].items[0].memo).toBe('Option material memo')
    }
  })

  it('fills missing pricing snapshot fields for legacy quotes', async () => {
    const legacyPricingSettingsSnapshot = {
      f1LabourRate: 500,
      f2LabourRate: 460,
      f3LabourRate: 460,
      f4LabourRate: 380,
      f5LabourRate: 380,
      f2Margin: 0.3,
      f3Margin: 0.3,
      f4Margin: 0.25,
      f5Margin: 0.25,
    }
    const detailBuilder = createSelectSingleBuilder({
      data: {
        ...quoteRow,
        pricing_settings_snapshot: legacyPricingSettingsSnapshot,
      },
      error: null,
    })

    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => detailBuilder) })

    const result = await getQuote(quoteId)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data?.pricingSettingsSnapshot).toEqual({
        ...legacyPricingSettingsSnapshot,
        roofLabourRate: 700,
      })
    }
  })

  it('falls back without memos while preserving detail child relations when quote memos are not migrated yet', async () => {
    const detailBuilder = createSelectSingleBuilder({
      data: null,
      error: { message: "Could not find a relationship between 'quotes' and 'quote_memos'" },
    })
    const fallbackBuilder = createSelectSingleBuilder({
      data: { ...quoteRow, quote_memos: undefined },
      error: null,
    })
    const from = vi.fn(() => from.mock.calls.length === 1 ? detailBuilder : fallbackBuilder)
    mocks.createClient.mockResolvedValueOnce({ from })

    const result = await getQuote(quoteId)

    expect(result.ok).toBe(true)
    const fallbackSelect = fallbackBuilder.select.mock.calls[0]?.[0]
    expect(fallbackSelect).not.toContain('*')
    expect(fallbackSelect).not.toContain('quote_memos(')
    expect(fallbackSelect).toContain('quote_items(id, quote_id')
    expect(fallbackSelect).toContain('quote_price_revisions(id, quote_id')
    if (result.ok) {
      expect(result.data?.jobberQuoteLines[0].name).toBe('Public painting service')
      expect(result.data?.memos).toEqual([])
    }
  })

  it('derives displayed labour totals from saved material rows when loading older quotes', async () => {
    const olderQuoteRow = {
      ...quoteRow,
      working_days: '999.00',
      labour_per_day: '999.00',
      quote_items: [
        {
          ...quoteRow.quote_items[0],
          working_days: '0.50',
          labour_per_day: '1.00',
          position: 0,
        },
        {
          ...quoteRow.quote_items[0],
          id: '00000000-0000-4000-8000-000000000202',
          product_name_snapshot: 'Second saved row',
          working_days: '0.50',
          labour_per_day: '1.00',
          position: 1,
        },
      ],
    }
    const detailBuilder = createSelectSingleBuilder({ data: olderQuoteRow, error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => detailBuilder) })

    const result = await getQuote(quoteId)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data?.workingDays).toBe('1.00')
      expect(result.data?.labourPerDay).toBe('1.00')
    }
  })

  it('returns non-migration Supabase errors when quote detail loading fails', async () => {
    const detailBuilder = createSelectSingleBuilder({
      data: null,
      error: { message: 'quote detail failed' },
    })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => detailBuilder) })

    const result = await getQuote(quoteId)

    expect(result).toEqual({ ok: false, error: 'quote detail failed' })
  })

  it('returns null data when quote detail lookup finds no rows', async () => {
    const detailBuilder = createSelectSingleBuilder({
      data: null,
      error: {
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
      },
    })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => detailBuilder) })

    const result = await getQuote(quoteId)

    expect(result).toEqual({ ok: true, data: null })
  })
})
