import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isDevNoAuthMode: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
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

import { getPricingSettings, updatePricingSettings } from '@/lib/actions/settings'

const settingsRow = {
  f1_labour_rate: '500.00',
  f2_labour_rate: '460.00',
  f3_labour_rate: '460.00',
  f4_labour_rate: '380.00',
  f5_labour_rate: '380.00',
  roof_labour_rate: '700.00',
  f2_margin: '0.300',
  f3_margin: '0.300',
  f4_margin: '0.250',
  f5_margin: '0.300',
}

function createSettingsSelectBuilder(response: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => response),
  }
  return builder
}

function createSettingsUpdateBuilder(response: unknown) {
  const builder = {
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(async () => response),
  }
  return builder
}

describe('settings actions against Supabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDevNoAuthMode.mockReturnValue(false)
  })

  it('reads pricing settings from Supabase', async () => {
    const builder = createSettingsSelectBuilder({ data: settingsRow, error: null })
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => builder),
    })

    const result = await getPricingSettings()

    expect(result).toEqual({ ok: true, data: DEFAULT_PRICING_SETTINGS })
    expect(builder.eq).toHaveBeenCalledWith('id', 1)
  })

  it('returns Supabase read errors when pricing settings cannot be loaded', async () => {
    const builder = createSettingsSelectBuilder({ data: null, error: new Error('settings missing') })
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => builder),
    })

    const result = await getPricingSettings()

    expect(result).toEqual({ ok: false, error: 'settings missing' })
  })

  it('requires authentication before updating pricing settings', async () => {
    mocks.createClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    })

    const result = await updatePricingSettings(DEFAULT_PRICING_SETTINGS)

    expect(result).toEqual({ ok: false, error: 'Authentication required' })
  })

  it('updates pricing settings and revalidates settings consumers', async () => {
    const builder = createSettingsUpdateBuilder({ data: settingsRow, error: null })
    mocks.createClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
      from: vi.fn(() => builder),
    })

    const result = await updatePricingSettings(DEFAULT_PRICING_SETTINGS)

    expect(result.ok).toBe(true)
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ updated_by: 'user-1' }))
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/quotes/new')
  })
})
