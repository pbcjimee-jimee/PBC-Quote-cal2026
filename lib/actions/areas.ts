'use server'

import { revalidatePath } from 'next/cache'
import { areaDeleteSchema, areaSchema, areaUpdateSchema } from '@/lib/validators'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import type { AreaRecord } from '@/lib/areas/types'
import type { ActionResult } from './types'
import { isDevNoAuthMode } from './types'

type AreaRow = Database['public']['Tables']['quote_areas']['Row']

function rowToArea(row: AreaRow): AreaRecord {
  return {
    id: row.id,
    scope: row.scope,
    name: row.name,
    active: row.active,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function revalidateAreaConsumers(): void {
  revalidatePath('/settings')
  revalidatePath('/quotes/new')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

export async function listAreas(): Promise<ActionResult<AreaRecord[]>> {
  if (isDevNoAuthMode()) {
    const { listDevAreas } = await import('@/lib/dev-data')
    return { ok: true, data: listDevAreas() }
  }

  try {
    const allowedUser = await requireAllowedUser()
    if (!allowedUser.ok) return allowedUser

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('quote_areas')
      .select('*')
      .eq('active', true)
      .order('scope', { ascending: true })
      .order('position', { ascending: true })
      .order('name', { ascending: true })

    if (error) return { ok: false, error: error.message }
    return { ok: true, data: data.map(rowToArea) }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

export async function createArea(input: unknown): Promise<ActionResult<AreaRecord>> {
  const parsed = areaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  if (isDevNoAuthMode()) {
    const { createDevArea } = await import('@/lib/dev-data')
    const area = createDevArea(parsed.data)
    revalidateAreaConsumers()
    return { ok: true, data: area }
  }

  try {
    const allowedUser = await requireAllowedUser()
    if (!allowedUser.ok) return allowedUser

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('quote_areas')
      .insert({
        scope: parsed.data.scope,
        name: parsed.data.name,
        active: true,
        position: 0,
      })
      .select('*')
      .single()

    if (error) return { ok: false, error: error.message }
    revalidateAreaConsumers()
    return { ok: true, data: rowToArea(data) }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

export async function updateArea(input: unknown): Promise<ActionResult<AreaRecord>> {
  const parsed = areaUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  if (isDevNoAuthMode()) {
    const { updateDevArea } = await import('@/lib/dev-data')
    const area = updateDevArea(parsed.data)
    if (!area) return { ok: false, error: 'Area not found' }
    revalidateAreaConsumers()
    return { ok: true, data: area }
  }

  try {
    const allowedUser = await requireAllowedUser()
    if (!allowedUser.ok) return allowedUser

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('quote_areas')
      .update({
        scope: parsed.data.scope,
        name: parsed.data.name,
        active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.id)
      .select('*')
      .single()

    if (error) return { ok: false, error: error.message }
    revalidateAreaConsumers()
    return { ok: true, data: rowToArea(data) }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

export async function deleteArea(input: unknown): Promise<ActionResult<AreaRecord>> {
  const parsed = areaDeleteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  if (isDevNoAuthMode()) {
    const { deleteDevArea } = await import('@/lib/dev-data')
    const area = deleteDevArea(parsed.data.id)
    if (!area) return { ok: false, error: 'Area not found' }
    revalidateAreaConsumers()
    return { ok: true, data: area }
  }

  try {
    const allowedUser = await requireAllowedUser()
    if (!allowedUser.ok) return allowedUser

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('quote_areas')
      .update({
        active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.id)
      .select('*')
      .single()

    if (error) return { ok: false, error: error.message }
    revalidateAreaConsumers()
    return { ok: true, data: rowToArea(data) }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}
