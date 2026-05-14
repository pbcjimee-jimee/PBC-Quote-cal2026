import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import { resetDevData } from '@/lib/dev-data'
import { getPricingSettings, updatePricingSettings } from '@/lib/actions/settings'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
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
})
