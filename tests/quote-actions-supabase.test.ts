import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  getPricingSettings: vi.fn(),
  isDevNoAuthMode: vi.fn(),
  revalidatePath: vi.fn(),
  getJobberConfig: vi.fn(),
  getMissingGraphqlConfigKeys: vi.fn(),
  getUsableJobberToken: vi.fn(),
  refreshStoredJobberToken: vi.fn(),
  fetchJobberQuote: vi.fn(),
  syncJobberQuoteLineItems: vi.fn(),
  mapJobberQuoteToDraft: vi.fn(),
}))

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

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/jobber/config', () => ({
  getJobberConfig: mocks.getJobberConfig,
  getMissingGraphqlConfigKeys: mocks.getMissingGraphqlConfigKeys,
}))

vi.mock('@/lib/jobber/tokens', () => ({
  getUsableJobberToken: mocks.getUsableJobberToken,
  refreshStoredJobberToken: mocks.refreshStoredJobberToken,
}))

vi.mock('@/lib/jobber/client', () => ({
  fetchJobberQuote: mocks.fetchJobberQuote,
  syncJobberQuoteLineItems: mocks.syncJobberQuoteLineItems,
  JobberApiError: class JobberApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message)
    }
  },
}))

vi.mock('@/lib/jobber/mapper', () => ({
  mapJobberQuoteToDraft: mocks.mapJobberQuoteToDraft,
}))

import { createQuote, deleteQuote, getQuote, searchQuotes, updateQuote } from '@/lib/actions/quotes'

const quoteId = '00000000-0000-4000-8000-000000000101'

const quoteRow = {
  id: quoteId,
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
}

const quoteInput = {
  customerName: 'Supabase Customer',
  customerAddress: '1 Paint St',
  workingDays: 1,
  labourPerDay: 1,
  materialMarket: 10,
  materialActual: 10,
  selectedMin: 1,
  selectedMax: 1,
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

function createInsertSingleBuilder(response: unknown) {
  const builder = {
    insert: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(async () => response),
  }
  return builder
}

function createInsertOnlyBuilder(response: unknown) {
  return {
    insert: vi.fn(async (rows: unknown) => {
      void rows
      return response
    }),
  }
}

function createInsertSelectBuilder(response: unknown) {
  const builder = {
    insert: vi.fn(() => builder),
    select: vi.fn(async () => response),
  }
  return builder
}

function createSelectSingleBuilder(response: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => response),
  }
  return builder
}

function createThenableBuilder(response: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) => resolve(response),
  }
  return builder
}

describe('quote actions against Supabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDevNoAuthMode.mockReturnValue(false)
    mocks.getPricingSettings.mockResolvedValue({ ok: true, data: DEFAULT_PRICING_SETTINGS })
    mocks.getJobberConfig.mockReturnValue({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'http://localhost:3000/api/jobber/callback',
      graphqlVersion: '2025-04-16',
      accessToken: '',
    })
    mocks.getMissingGraphqlConfigKeys.mockReturnValue([])
    mocks.getUsableJobberToken.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: null,
      ownerUserId: 'user-1',
    })
    mocks.refreshStoredJobberToken.mockResolvedValue({
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

  it('creates a quote and item rows through Supabase', async () => {
    const quoteInsert = createInsertSingleBuilder({ data: { id: quoteId }, error: null })
    const itemInsert = createInsertOnlyBuilder({ error: null })
    const from = vi.fn((table: string) => {
      if (table === 'quotes') return quoteInsert
      if (table === 'quote_items') return itemInsert
      throw new Error(`unexpected table ${table}`)
    })
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from })

    const result = await createQuote(quoteInput)

    expect(result).toEqual({ ok: true, data: { id: quoteId } })
    expect(quoteInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      customer_name: 'Supabase Customer',
      created_by: 'user-1',
      final_total: '561.00',
    }))
    expect(itemInsert.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        quote_id: quoteId,
        product_name_snapshot: 'Brush',
      }),
    ])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/quotes')
  })

  it('creates public Jobber rows separately from internal material rows through Supabase', async () => {
    const quoteInsert = createInsertSingleBuilder({ data: { id: quoteId }, error: null })
    const itemInsert = createInsertOnlyBuilder({ error: null })
    const jobberLineInsert = createInsertOnlyBuilder({ error: null })
    const from = vi.fn((table: string) => {
      if (table === 'quotes') return quoteInsert
      if (table === 'quote_items') return itemInsert
      if (table === 'jobber_quote_lines') return jobberLineInsert
      throw new Error(`unexpected table ${table}`)
    })
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from })

    const result = await createQuote(quoteInputWithJobberLines)

    expect(result).toEqual({ ok: true, data: { id: quoteId } })
    expect(quoteInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      jobber_save_mode: 'priced_line_items',
      jobber_sync_status: 'not_synced',
    }))
    expect(itemInsert.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        quote_id: quoteId,
        product_name_snapshot: 'Brush',
      }),
    ])
    expect(jobberLineInsert.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        quote_id: quoteId,
        kind: 'line_item',
        name: 'Public painting service',
        unit_price: '1250.00',
        total_price: '2500.00',
      }),
      expect.objectContaining({
        quote_id: quoteId,
        kind: 'text',
        name: 'Scope notes',
        unit_price: null,
        total_price: null,
      }),
    ])
    const insertedJobberRows = jobberLineInsert.insert.mock.calls[0]?.[0] as Array<Record<string, unknown>> | undefined
    expect(insertedJobberRows?.[0]).not.toHaveProperty('actual_price_snapshot')
  })

  it('creates app-only memo rows through Supabase without adding Jobber lines', async () => {
    const quoteInsert = createInsertSingleBuilder({ data: { id: quoteId }, error: null })
    const itemInsert = createInsertOnlyBuilder({ error: null })
    const memoInsert = createInsertSelectBuilder({
      data: [
        { id: '00000000-0000-4000-8000-000000000501' },
        { id: '00000000-0000-4000-8000-000000000502' },
      ],
      error: null,
    })
    const from = vi.fn((table: string) => {
      if (table === 'quotes') return quoteInsert
      if (table === 'quote_items') return itemInsert
      if (table === 'quote_memos') return memoInsert
      throw new Error(`unexpected table ${table}`)
    })
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from })

    const result = await createQuote({
      ...quoteInput,
      memos: [
        { body: 'Call before arriving.', position: 0 },
        { body: 'Use side gate access.', position: 1 },
      ],
    })

    expect(result).toEqual({ ok: true, data: { id: quoteId } })
    expect(memoInsert.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        quote_id: quoteId,
        body: 'Call before arriving.',
        created_by: 'user-1',
        position: 0,
      }),
      expect.objectContaining({
        quote_id: quoteId,
        body: 'Use side gate access.',
        created_by: 'user-1',
        position: 1,
      }),
    ])
    expect(memoInsert.select).toHaveBeenCalledWith('id')
    expect(from).not.toHaveBeenCalledWith('jobber_quote_lines')
  })

  it('cleans up a created quote when memo rows fail to insert', async () => {
    const quoteInsert = createInsertSingleBuilder({ data: { id: quoteId }, error: null })
    const quoteDelete = createThenableBuilder({ error: null })
    const itemInsert = createInsertOnlyBuilder({ error: null })
    const memoInsert = createInsertSelectBuilder({ data: null, error: new Error('memo insert failed') })
    const builders: Record<string, unknown[]> = {
      quotes: [quoteInsert, quoteDelete],
      quote_items: [itemInsert],
      quote_memos: [memoInsert],
    }
    const from = vi.fn((table: string) => {
      const builder = builders[table]?.shift()
      if (!builder) throw new Error(`unexpected table ${table}`)
      return builder
    })
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from })

    const result = await createQuote({
      ...quoteInput,
      memos: [{ body: 'Call first.', position: 0 }],
    })

    expect(result).toEqual({ ok: false, error: 'memo insert failed' })
    expect(quoteDelete.delete).toHaveBeenCalled()
    expect(quoteDelete.eq).toHaveBeenCalledWith('id', quoteId)
  })

  it('requires authentication before creating a quote', async () => {
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(null) })

    const result = await createQuote(quoteInput)

    expect(result).toEqual({ ok: false, error: 'Authentication required' })
  })

  it('updates a quote through Supabase and replaces child rows', async () => {
    const existingQuote = createSelectSingleBuilder({
      data: { pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS },
      error: null,
    })
    const quoteUpdate = createThenableBuilder({ error: null })
    const itemDelete = createThenableBuilder({ error: null })
    const optionDelete = createThenableBuilder({ error: null })
    const jobberLineDelete = createThenableBuilder({ error: null })
    const memoDelete = createThenableBuilder({ error: null })
    const itemInsert = createInsertOnlyBuilder({ error: null })
    const from = vi.fn((table: string) => {
      if (table === 'quotes') return from.mock.calls.filter(([name]) => name === 'quotes').length === 1 ? existingQuote : quoteUpdate
      if (table === 'quote_items') return from.mock.calls.filter(([name]) => name === 'quote_items').length === 1 ? itemDelete : itemInsert
      if (table === 'quote_options') return optionDelete
      if (table === 'jobber_quote_lines') return jobberLineDelete
      if (table === 'quote_memos') return memoDelete
      throw new Error(`unexpected table ${table}`)
    })
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from })

    const result = await updateQuote({ id: quoteId, ...quoteInput, customerName: 'Updated Customer' })

    expect(result).toEqual({ ok: true, data: { id: quoteId } })
    expect(quoteUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      customer_name: 'Updated Customer',
      updated_by: 'user-1',
    }))
    expect(itemDelete.delete).toHaveBeenCalled()
    expect(optionDelete.delete).toHaveBeenCalled()
    expect(jobberLineDelete.delete).toHaveBeenCalled()
    expect(memoDelete.delete).toHaveBeenCalled()
    expect(itemInsert.insert).toHaveBeenCalledWith([expect.objectContaining({ quote_id: quoteId })])
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/quotes/${quoteId}`)
  })

  it('does not delete existing memos before replacement memo rows insert successfully', async () => {
    const existingQuote = createSelectSingleBuilder({
      data: { pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS },
      error: null,
    })
    const quoteUpdate = createThenableBuilder({ error: null })
    const itemDelete = createThenableBuilder({ error: null })
    const optionDelete = createThenableBuilder({ error: null })
    const jobberLineDelete = createThenableBuilder({ error: null })
    const itemInsert = createInsertOnlyBuilder({ error: null })
    const memoReplace = {
      delete: vi.fn(() => memoReplace),
      insert: vi.fn(() => memoReplace),
      select: vi.fn(async () => ({ data: null, error: new Error('memo insert failed') })),
      eq: vi.fn(async () => ({ error: null })),
    }
    const from = vi.fn((table: string) => {
      if (table === 'quotes') return from.mock.calls.filter(([name]) => name === 'quotes').length === 1 ? existingQuote : quoteUpdate
      if (table === 'quote_items') return from.mock.calls.filter(([name]) => name === 'quote_items').length === 1 ? itemDelete : itemInsert
      if (table === 'quote_options') return optionDelete
      if (table === 'jobber_quote_lines') return jobberLineDelete
      if (table === 'quote_memos') return memoReplace
      throw new Error(`unexpected table ${table}`)
    })
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from })

    const result = await updateQuote({
      id: quoteId,
      ...quoteInput,
      memos: [{ body: 'Replacement memo', position: 0 }],
    })

    expect(result).toEqual({ ok: false, error: 'memo insert failed' })
    expect(memoReplace.insert).toHaveBeenCalled()
    expect(memoReplace.select).toHaveBeenCalledWith('id')
    expect(memoReplace.delete).not.toHaveBeenCalled()
  })

  it('updates public Jobber rows by replacing the saved ordered set', async () => {
    const existingQuote = createSelectSingleBuilder({
      data: { pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS },
      error: null,
    })
    const quoteUpdate = createThenableBuilder({ error: null })
    const itemDelete = createThenableBuilder({ error: null })
    const optionDelete = createThenableBuilder({ error: null })
    const jobberLineDelete = createThenableBuilder({ error: null })
    const itemInsert = createInsertOnlyBuilder({ error: null })
    const jobberLineInsert = createInsertOnlyBuilder({ error: null })
    const builders: Record<string, unknown[]> = {
      quotes: [existingQuote, quoteUpdate],
      quote_items: [itemDelete, itemInsert],
      quote_options: [optionDelete],
      jobber_quote_lines: [jobberLineDelete, jobberLineInsert],
      quote_memos: [createThenableBuilder({ error: null })],
    }
    const from = vi.fn((table: string) => {
      const builder = builders[table]?.shift()
      if (!builder) throw new Error(`unexpected table ${table}`)
      return builder
    })
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from })

    const result = await updateQuote({
      id: quoteId,
      ...quoteInputWithJobberLines,
      jobberSaveMode: 'description_total',
      jobberQuoteLines: [
        {
          kind: 'line_item',
          name: 'Updated public total',
          quantity: 1,
          unitPrice: 2750,
          position: 0,
        },
      ],
    })

    expect(result).toEqual({ ok: true, data: { id: quoteId } })
    expect(quoteUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      jobber_save_mode: 'description_total',
      jobber_sync_status: 'not_synced',
    }))
    expect(jobberLineDelete.delete).toHaveBeenCalled()
    expect(jobberLineDelete.eq).toHaveBeenCalledWith('quote_id', quoteId)
    expect(jobberLineInsert.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        quote_id: quoteId,
        name: 'Updated public total',
        total_price: '2750.00',
      }),
    ])
  })

  it('syncs saved public quote lines to the matching Jobber quote and marks the quote synced', async () => {
    const existingQuote = createSelectSingleBuilder({
      data: { pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS },
      error: null,
    })
    const quoteUpdate = createThenableBuilder({ error: null })
    const syncStatusUpdate = createThenableBuilder({ error: null })
    const itemDelete = createThenableBuilder({ error: null })
    const optionDelete = createThenableBuilder({ error: null })
    const jobberLineDelete = createThenableBuilder({ error: null })
    const itemInsert = createInsertOnlyBuilder({ error: null })
    const jobberLineInsert = createInsertOnlyBuilder({ error: null })
    const builders: Record<string, unknown[]> = {
      quotes: [existingQuote, quoteUpdate, syncStatusUpdate],
      quote_items: [itemDelete, itemInsert],
      quote_options: [optionDelete],
      jobber_quote_lines: [jobberLineDelete, jobberLineInsert],
      quote_memos: [createThenableBuilder({ error: null })],
    }
    const from = vi.fn((table: string) => {
      const builder = builders[table]?.shift()
      if (!builder) throw new Error(`unexpected table ${table}`)
      return builder
    })
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from })

    const result = await updateQuote({
      id: quoteId,
      ...quoteInputWithJobberLines,
      jobberQuoteId: 'jobber-quote-id',
      jobberSaveMode: 'description_total',
    })

    expect(result).toEqual({ ok: true, data: { id: quoteId } })
    expect(mocks.syncJobberQuoteLineItems).toHaveBeenCalledWith('jobber-quote-id', expect.objectContaining({
      saveMode: 'description_total',
      lines: expect.any(Array),
      finalTotalIncludesGst: true,
    }), expect.objectContaining({
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
    }))
    expect(mocks.fetchJobberQuote).toHaveBeenCalledWith('jobber-quote-id', expect.objectContaining({
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
    }))
    expect(syncStatusUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      jobber_sync_status: 'synced',
      jobber_sync_error: null,
      jobber_last_synced_at: expect.any(String),
      jobber_snapshot: expect.objectContaining({
        productsAndServices: [
          expect.objectContaining({
            name: 'Synced product',
          }),
        ],
      }),
    }))
    expect(syncStatusUpdate.eq).toHaveBeenCalledWith('id', quoteId)
  })

  it('keeps successful Jobber line sync when only the post-write snapshot refresh is throttled', async () => {
    const existingQuote = createSelectSingleBuilder({
      data: { pricing_settings_snapshot: DEFAULT_PRICING_SETTINGS },
      error: null,
    })
    const quoteUpdate = createThenableBuilder({ error: null })
    const syncStatusUpdate = createThenableBuilder({ error: null })
    const itemDelete = createThenableBuilder({ error: null })
    const optionDelete = createThenableBuilder({ error: null })
    const jobberLineDelete = createThenableBuilder({ error: null })
    const itemInsert = createInsertOnlyBuilder({ error: null })
    const jobberLineInsert = createInsertOnlyBuilder({ error: null })
    const jobberLineIdUpdate = createThenableBuilder({ error: null })
    const builders: Record<string, unknown[]> = {
      quotes: [existingQuote, quoteUpdate, syncStatusUpdate],
      quote_items: [itemDelete, itemInsert],
      quote_options: [optionDelete],
      jobber_quote_lines: [jobberLineDelete, jobberLineInsert, jobberLineIdUpdate],
      quote_memos: [createThenableBuilder({ error: null })],
    }
    const from = vi.fn((table: string) => {
      const builder = builders[table]?.shift()
      if (!builder) throw new Error(`unexpected table ${table}`)
      return builder
    })
    mocks.syncJobberQuoteLineItems.mockResolvedValueOnce({
      deletedLineItemIds: [],
      createdLineItemIds: ['created-line-id'],
      editedLineItemIds: [],
      syncedLineItems: [{ sourcePosition: 0, jobberLineItemId: 'created-line-id' }],
    })
    mocks.fetchJobberQuote.mockRejectedValueOnce(new Error('Jobber returned a GraphQL error: Throttled'))
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(), from })

    const result = await updateQuote({
      id: quoteId,
      ...quoteInputWithJobberLines,
      jobberQuoteId: 'jobber-quote-id',
      jobberSaveMode: 'priced_line_items',
    })

    expect(result).toEqual({ ok: true, data: { id: quoteId } })
    expect(jobberLineIdUpdate.update).toHaveBeenCalledWith({ jobber_line_item_id: 'created-line-id' })
    expect(jobberLineIdUpdate.eq).toHaveBeenCalledWith('quote_id', quoteId)
    expect(jobberLineIdUpdate.eq).toHaveBeenCalledWith('position', 0)
    expect(syncStatusUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      jobber_sync_status: 'synced',
      jobber_sync_error: null,
      jobber_last_synced_at: expect.any(String),
    }))
    expect(syncStatusUpdate.update).not.toHaveBeenCalledWith(expect.objectContaining({
      jobber_sync_status: 'failed',
    }))
    expect(syncStatusUpdate.update).toHaveBeenCalledWith(expect.not.objectContaining({
      jobber_snapshot: expect.anything(),
    }))
  })

  it('rejects quote updates without an id before touching Supabase', async () => {
    const result = await updateQuote(quoteInput)

    expect(result).toEqual({ ok: false, error: 'Quote id is required' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('deletes a quote through Supabase after authentication', async () => {
    const deleteBuilder = createThenableBuilder({ error: null })
    mocks.createClient.mockResolvedValueOnce({
      auth: createAuthUser(),
      from: vi.fn(() => deleteBuilder),
    })

    const result = await deleteQuote(quoteId)

    expect(result).toEqual({ ok: true, data: { id: quoteId } })
    expect(deleteBuilder.delete).toHaveBeenCalled()
    expect(deleteBuilder.eq).toHaveBeenCalledWith('id', quoteId)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/quotes')
  })

  it('requires authentication before deleting a quote', async () => {
    mocks.createClient.mockResolvedValueOnce({ auth: createAuthUser(null) })

    const result = await deleteQuote(quoteId)

    expect(result).toEqual({ ok: false, error: 'Authentication required' })
  })

  it('searches quotes and maps joined item rows', async () => {
    const searchBuilder = createThenableBuilder({ data: [quoteRow], error: null })
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => searchBuilder),
    })

    const result = await searchQuotes('Supabase')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data[0].items[0].productNameSnapshot).toBe('Brush')
      expect(result.data[0].jobberSaveMode).toBe('priced_line_items')
      expect(result.data[0].createdByName).toBe('Mia Kang')
      expect(result.data[0].createdByEmail).toBe('owner@example.com')
    }
    expect(searchBuilder.ilike).toHaveBeenCalledWith('customer_name', '%Supabase%')
  })

  it('returns Supabase errors when quote search fails', async () => {
    const searchBuilder = createThenableBuilder({ data: null, error: new Error('quote search failed') })
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => searchBuilder),
    })

    const result = await searchQuotes()

    expect(result).toEqual({ ok: false, error: 'quote search failed' })
    expect(searchBuilder.ilike).not.toHaveBeenCalled()
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
    }
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
    expect(fallbackBuilder.select).toHaveBeenCalledWith('*, quote_items(*), quote_options(*, quote_option_items(*)), jobber_quote_lines(*)')
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
})
