'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'
import { pricingSettingsSchema, type PricingSettingsInput } from '@/lib/validators'
import type { PricingSettings } from '@/lib/calculator'
import type { ActionResult } from './types'
import { isDevNoAuthMode } from './types'

function rowToSettings(row: {
  f1_labour_rate: string
  f2_labour_rate: string
  f3_labour_rate: string
  f4_labour_rate: string
  f5_labour_rate: string
  roof_labour_rate: string
  f2_margin: string
  f3_margin: string
  f4_margin: string
  f5_margin: string
}): PricingSettings {
  return {
    f1LabourRate: Number(row.f1_labour_rate),
    f2LabourRate: Number(row.f2_labour_rate),
    f3LabourRate: Number(row.f3_labour_rate),
    f4LabourRate: Number(row.f4_labour_rate),
    f5LabourRate: Number(row.f5_labour_rate),
    roofLabourRate: Number(row.roof_labour_rate),
    f2Margin: Number(row.f2_margin),
    f3Margin: Number(row.f3_margin),
    f4Margin: Number(row.f4_margin),
    f5Margin: Number(row.f5_margin),
  }
}

function settingsToRow(settings: PricingSettingsInput) {
  return {
    f1_labour_rate: settings.f1LabourRate.toFixed(2),
    f2_labour_rate: settings.f2LabourRate.toFixed(2),
    f3_labour_rate: settings.f3LabourRate.toFixed(2),
    f4_labour_rate: settings.f4LabourRate.toFixed(2),
    f5_labour_rate: settings.f5LabourRate.toFixed(2),
    roof_labour_rate: settings.roofLabourRate.toFixed(2),
    f2_margin: settings.f2Margin.toFixed(3),
    f3_margin: settings.f3Margin.toFixed(3),
    f4_margin: settings.f4Margin.toFixed(3),
    f5_margin: settings.f5Margin.toFixed(3),
    updated_at: new Date().toISOString(),
  }
}

function revalidateSettingsConsumers(): void {
  revalidatePath('/settings')
  revalidatePath('/quotes/new')
}

export async function getPricingSettings(): Promise<ActionResult<PricingSettings>> {
  if (isDevNoAuthMode()) {
    const { getDevPricingSettings } = await import('@/lib/dev-data')
    return { ok: true, data: getDevPricingSettings() }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pricing_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: rowToSettings(data) }
}

export async function updatePricingSettings(input: unknown): Promise<ActionResult<PricingSettings>> {
  const parsed = pricingSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  if (isDevNoAuthMode()) {
    const { updateDevPricingSettings } = await import('@/lib/dev-data')
    const settings = updateDevPricingSettings(parsed.data)
    revalidateSettingsConsumers()
    return { ok: true, data: settings }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pricing_settings')
    .update({ ...settingsToRow(parsed.data), updated_by: allowedUser.user.id })
    .eq('id', 1)
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  revalidateSettingsConsumers()
  return { ok: true, data: rowToSettings(data) }
}
