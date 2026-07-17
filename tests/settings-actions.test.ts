import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import { resetDevData } from '@/lib/dev-data'
import { getPricingSettings, updatePricingSettings } from '@/lib/actions/settings'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

describe('settings actions', () => {
  beforeEach(() => {
    resetDevData()
    vi.mocked(revalidatePath).mockClear()
  })

  it('makes updated formula labels available to the new quote page', async () => {
    const result = await updatePricingSettings({
      ...DEFAULT_PRICING_SETTINGS,
      f4LabourRate: 410,
      f4Margin: 0.28,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)

    const settings = await getPricingSettings()
    expect(settings.ok).toBe(true)
    if (settings.ok) {
      expect(settings.data.f4LabourRate).toBe(410)
      expect(settings.data.f4Margin).toBe(0.28)
    }

    expect(revalidatePath).toHaveBeenCalledWith('/settings')
    expect(revalidatePath).toHaveBeenCalledWith('/quotes/new')
  })

  it('rejects margins at or above 100% before saving settings', async () => {
    const result = await updatePricingSettings({
      ...DEFAULT_PRICING_SETTINGS,
      f2Margin: 1,
      f3Margin: 1.25,
      f4Margin: 0.25,
      f5Margin: 0.30,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Margins must be less than 100%')
    }

    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns a clear validation message for negative margins', async () => {
    const result = await updatePricingSettings({
      ...DEFAULT_PRICING_SETTINGS,
      f2Margin: -0.01,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Margins must be 0% or higher')
    }

    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
