import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const config = {
  url: process.env.SUPABASE_RLS_TEST_URL,
  anonKey: process.env.SUPABASE_RLS_TEST_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_RLS_TEST_SERVICE_ROLE_KEY,
  email: process.env.SUPABASE_RLS_TEST_EMAIL,
  password: process.env.SUPABASE_RLS_TEST_PASSWORD,
}

const hasLocalRlsConfig = Object.values(config).every(Boolean)
const describeLocal = hasLocalRlsConfig ? describe : describe.skip
const supervisorEmail = process.env.SUPABASE_RLS_TEST_SUPERVISOR_EMAIL
  ?? 'supervisor.rls@example.test'
const supervisorPassword = process.env.SUPABASE_RLS_TEST_SUPERVISOR_PASSWORD
  ?? 'local-supervisor-password'

interface LocalRlsConfig {
  url: string
  anonKey: string
  serviceRoleKey: string
  email: string
  password: string
}

function requireConfig(): LocalRlsConfig {
  if (!hasLocalRlsConfig) {
    throw new Error('Supabase local RLS integration config is missing')
  }

  const local = config as LocalRlsConfig
  const hostname = new URL(local.url).hostname
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('Supabase local RLS integration tests must only run against a local Supabase URL')
  }

  return local
}

function expectNoError<T extends { error: unknown }>(result: T): T {
  expect(result.error).toBeNull()
  return result
}

function expectData<T>(data: T | null): T {
  expect(data).not.toBeNull()
  if (data === null) throw new Error('Expected Supabase result data')
  return data
}

describeLocal('Supabase local RLS CRUD integration', () => {
  let admin: SupabaseClient
  let anon: SupabaseClient
  let authed: SupabaseClient
  let supervisor: SupabaseClient
  let userId: string
  let supervisorUserId: string
  let inventoryItemId: string | null = null
  let originalPricingSettings: { f1LabourRate: string; updatedBy: string | null } | null = null

  beforeAll(async () => {
    const local = requireConfig()
    admin = createClient(local.url, local.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
    anon = createClient(local.url, local.anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
    authed = createClient(local.url, local.anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
    supervisor = createClient(local.url, local.anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })

    const created = await admin.auth.admin.createUser({
      email: local.email,
      password: local.password,
      email_confirm: true,
    })
    if (created.error && !created.error.message.toLowerCase().includes('already')) {
      throw created.error
    }

    const signedIn = await authed.auth.signInWithPassword({
      email: local.email,
      password: local.password,
    })
    if (signedIn.error) throw signedIn.error
    if (!signedIn.data.user) throw new Error('Supabase test user sign-in did not return a user')
    userId = signedIn.data.user.id

    const createdSupervisor = await admin.auth.admin.createUser({
      email: supervisorEmail,
      password: supervisorPassword,
      email_confirm: true,
    })
    if (createdSupervisor.error && !createdSupervisor.error.message.toLowerCase().includes('already')) {
      throw createdSupervisor.error
    }
    const supervisorSignedIn = await supervisor.auth.signInWithPassword({
      email: supervisorEmail,
      password: supervisorPassword,
    })
    if (supervisorSignedIn.error) throw supervisorSignedIn.error
    if (!supervisorSignedIn.data.user) {
      throw new Error('Supabase supervisor test sign-in did not return a user')
    }
    supervisorUserId = supervisorSignedIn.data.user.id

    expectNoError(
      await admin.from('user_profiles').upsert([
        {
          id: userId,
          email: local.email.toLowerCase(),
          display_name: 'RLS Admin',
          role: 'admin',
          is_active: true,
        },
        {
          id: supervisorUserId,
          email: supervisorEmail,
          display_name: 'RLS Supervisor',
          role: 'supervisor',
          is_active: true,
        },
      ])
    )
  })

  afterAll(async () => {
    if (inventoryItemId) {
      const removedInventory = await admin
        .from('warehouse_inventory')
        .delete()
        .eq('id', inventoryItemId)
      if (removedInventory.error) throw removedInventory.error
    }

    if (originalPricingSettings !== null) {
      const restored = await admin
        .from('pricing_settings')
        .update({
          f1_labour_rate: originalPricingSettings.f1LabourRate,
          updated_by: originalPricingSettings.updatedBy,
        })
        .eq('id', 1)
      if (restored.error) throw restored.error
    }

    if (supervisorUserId) {
      const deleted = await admin.auth.admin.deleteUser(supervisorUserId)
      if (deleted.error) throw deleted.error
    }
  })

  it('denies anonymous Data API access through table privileges', async () => {
    const selected = await anon.from('products').select('id').limit(1)
    expect(selected.error?.code).toBe('42501')
    expect(selected.error?.message).toMatch(/permission denied for table products/i)

    const inserted = await anon.from('products').insert({
      name: 'anon-rls-denied',
      unit: 'gallon',
      market_price: '1.00',
      actual_price: '1.00',
    })
    expect(inserted.error?.code).toBe('42501')
    expect(inserted.error?.message).toMatch(/permission denied for table products/i)
  })

  it('keeps Jobber tokens behind table privileges and RLS', async () => {
    const anonSelected = await anon.from('jobber_tokens').select('user_id').limit(1)
    expect(anonSelected.error?.code).toBe('42501')
    expect(anonSelected.error?.message).toMatch(/permission denied for table jobber_tokens/i)

    const authedSelected = await authed.from('jobber_tokens').select('user_id').limit(1)
    expect(authedSelected.error?.code).toBe('42501')
    expect(authedSelected.error?.message).toMatch(/permission denied for table jobber_tokens/i)

    expectNoError(
      await admin.from('jobber_tokens').upsert({
        user_id: userId,
        access_token: 'local-test-access-token',
        refresh_token: 'local-test-refresh-token',
        token_type: 'Bearer',
      })
    )
    expectNoError(
      await admin.from('jobber_tokens').select('user_id').eq('user_id', userId).single()
    )
    expectNoError(await admin.from('jobber_tokens').delete().eq('user_id', userId))
  })

  it('keeps Jobber job snapshots service-role only', async () => {
    for (const client of [anon, authed, supervisor]) {
      const selected = await client.from('jobber_job_snapshots').select('jobber_job_id').limit(1)
      expect(selected.error?.code).toBe('42501')
      expect(selected.error?.message).toMatch(/permission denied for table jobber_job_snapshots/i)
    }

    expectNoError(await admin.from('jobber_job_snapshots').upsert([
      {
        jobber_job_id: 'local-rls-job',
        payload: { scopeJobberUserIds: ['local-jobber-user'] },
        refreshed_by: userId,
      },
      {
        jobber_job_id: 'local-rls-revoked-job',
        payload: { scopeJobberUserIds: ['local-jobber-user'] },
        refreshed_by: userId,
      },
    ]))
    const synchronized = expectNoError(await admin.rpc('synchronize_jobber_job_snapshot_scope', {
      p_jobber_user_id: 'local-jobber-user',
      p_assigned_job_ids: ['local-rls-job'],
    }))
    expect(synchronized.data).toHaveLength(1)
    expectNoError(
      await admin.from('jobber_job_snapshots').select('jobber_job_id').eq('jobber_job_id', 'local-rls-job').single()
    )
    const scopedRows = expectNoError(
      await admin
        .from('jobber_job_snapshots')
        .select('jobber_job_id, payload')
        .in('jobber_job_id', ['local-rls-job', 'local-rls-revoked-job'])
        .order('jobber_job_id')
    )
    expect(scopedRows.data).toEqual([
      {
        jobber_job_id: 'local-rls-job',
        payload: { scopeJobberUserIds: ['local-jobber-user'] },
      },
      {
        jobber_job_id: 'local-rls-revoked-job',
        payload: { scopeJobberUserIds: [] },
      },
    ])
    expectNoError(
      await admin
        .from('jobber_job_snapshots')
        .delete()
        .in('jobber_job_id', ['local-rls-job', 'local-rls-revoked-job'])
    )
  })

  it('exposes only the current profile to supervisors and all profiles to admins', async () => {
    const supervisorProfiles = expectNoError(
      await supervisor.from('user_profiles').select('id, role')
    )
    expect(supervisorProfiles.data).toEqual([
      { id: supervisorUserId, role: 'supervisor' },
    ])

    const adminProfiles = expectNoError(
      await authed.from('user_profiles').select('id, role').order('role')
    )
    expect(adminProfiles.data).toEqual(expect.arrayContaining([
      { id: userId, role: 'admin' },
      { id: supervisorUserId, role: 'supervisor' },
    ]))
  })

  it('preserves one active admin while allowing changes when another active admin exists', async () => {
    const lastAdminDemotion = await admin
      .from('user_profiles')
      .update({ role: 'supervisor' })
      .eq('id', userId)
    if (!lastAdminDemotion.error) {
      expectNoError(
        await admin.from('user_profiles').update({ role: 'admin' }).eq('id', userId)
      )
    }

    const lastAdminDeactivation = await admin
      .from('user_profiles')
      .update({ is_active: false })
      .eq('id', userId)
    if (!lastAdminDeactivation.error) {
      expectNoError(
        await admin.from('user_profiles').update({ is_active: true }).eq('id', userId)
      )
    }

    expectNoError(
      await admin
        .from('user_profiles')
        .update({ role: 'admin' })
        .eq('id', supervisorUserId)
    )
    expectNoError(
      await admin
        .from('user_profiles')
        .update({ role: 'supervisor' })
        .eq('id', userId)
    )
    expectNoError(
      await admin
        .from('user_profiles')
        .update({ role: 'admin', is_active: true })
        .eq('id', userId)
    )
    expectNoError(
      await admin
        .from('user_profiles')
        .update({ role: 'supervisor' })
        .eq('id', supervisorUserId)
    )

    expect(lastAdminDemotion.error?.message).toContain('LAST_ACTIVE_ADMIN_REQUIRED')
    expect(lastAdminDeactivation.error?.message).toContain('LAST_ACTIVE_ADMIN_REQUIRED')
  })

  it('denies supervisors admin tables', async () => {
    const products = expectNoError(await supervisor.from('products').select('id').limit(1))
    expect(products.data).toEqual([])

    const productInsert = await supervisor.from('products').insert({
      name: 'supervisor-must-not-create',
      unit: 'gallon',
      market_price: '1.00',
      actual_price: '1.00',
    })
    expect(productInsert.error?.code).toBe('42501')
  })

  it('allows supervisor inventory movement but rejects identity edits', async () => {
    const inserted = expectNoError(
      await admin
        .from('warehouse_inventory')
        .insert({
          name: 'RLS movement fixture',
          category: 'Tools',
          quantity: '2.00',
          status: 'in_stock',
          active: true,
        })
        .select('id')
        .single()
    )
    inventoryItemId = expectData(inserted.data).id

    const moved = expectNoError(
      await supervisor
        .from('warehouse_inventory')
        .update({
          quantity: '1.00',
          status: 'out',
          used_date: '2026-07-31',
          used_location_text: 'Local RLS test',
        })
        .eq('id', inventoryItemId)
        .select('quantity, status, used_location_text')
        .single()
    )
    expect(moved.data).toEqual({
      quantity: 1,
      status: 'out',
      used_location_text: 'Local RLS test',
    })

    const renamed = await supervisor
      .from('warehouse_inventory')
      .update({ name: 'Supervisor identity edit denied' })
      .eq('id', inventoryItemId)
    expect(renamed.error?.code).toBe('42501')
    expect(renamed.error?.message).toContain('INVENTORY_ADMIN_FIELDS_REQUIRED')
  })

  it('allows service-role cleanup on non-secret application tables', async () => {
    const product = expectNoError(
      await authed
        .from('products')
        .insert({
          name: `service-cleanup-${Date.now()}`,
          unit: 'gallon',
          market_price: '1.00',
          actual_price: '1.00',
        })
        .select('id')
        .single()
    )
    const productData = expectData(product.data)

    expectNoError(await admin.from('products').delete().eq('id', productData.id))

    const selected = expectNoError(
      await authed.from('products').select('id').eq('id', productData.id)
    )
    expect(selected.data).toEqual([])
  })

  it('allows authenticated CRUD on RLS-protected app tables', async () => {
    const marker = `rls-${Date.now()}`

    const settings = expectNoError(
      await authed
        .from('pricing_settings')
        .select('f1_labour_rate, updated_by')
        .eq('id', 1)
        .single()
    )
    const settingsData = expectData(settings.data)
    originalPricingSettings = {
      f1LabourRate: settingsData.f1_labour_rate,
      updatedBy: settingsData.updated_by,
    }

    expectNoError(
      await authed
        .from('pricing_settings')
        .update({ f1_labour_rate: '501.00', updated_by: userId })
        .eq('id', 1)
    )

    const product = expectNoError(
      await authed
        .from('products')
        .insert({
          name: `${marker} product`,
          unit: 'gallon',
          market_price: '11.00',
          actual_price: '7.00',
        })
        .select('id')
        .single()
    )
    const productData = expectData(product.data)

    const area = expectNoError(
      await authed
        .from('quote_areas')
        .insert({
          scope: 'exterior',
          name: `${marker} area`,
          position: 999,
        })
        .select('id')
        .single()
    )
    const areaData = expectData(area.data)

    const quote = expectNoError(
      await authed
        .from('quotes')
        .insert({
          customer_name: `${marker} customer`,
          working_days: '1.00',
          labour_per_day: '1.00',
          formula1_total: '10.00',
          formula2_total: '11.00',
          formula3_total: '12.00',
          formula4_total: '13.00',
          formula5_total: '14.00',
          selected_min: 1,
          selected_max: 5,
          interior_selected_min: 1,
          interior_selected_max: 5,
          exterior_selected_min: 1,
          exterior_selected_max: 5,
          roof_selected_min: 1,
          roof_selected_max: 5,
          subtotal: '12.00',
          final_total: '13.20',
          pricing_settings_snapshot: {},
          created_by: userId,
          updated_by: userId,
        })
        .select('id')
        .single()
    )
    const quoteData = expectData(quote.data)

    const item = expectNoError(
      await authed
        .from('quote_items')
        .insert({
          quote_id: quoteData.id,
          product_id: productData.id,
          product_name_snapshot: `${marker} product`,
          market_price_snapshot: '11.00',
          actual_price_snapshot: '7.00',
          quantity: '2.00',
          working_days: '1.00',
          labour_per_day: '1.00',
          area_id: areaData.id,
          area_name_snapshot: `${marker} area`,
          area_scope_snapshot: 'exterior',
          position: 0,
        })
        .select('id')
        .single()
    )
    const itemData = expectData(item.data)

    expectNoError(
      await authed
        .from('quote_items')
        .update({ quantity: '3.00' })
        .eq('id', itemData.id)
    )
    expectNoError(
      await authed
        .from('quotes')
        .update({ customer_name: `${marker} updated`, updated_by: userId })
        .eq('id', quoteData.id)
    )
    expectNoError(
      await authed
        .from('quote_areas')
        .update({ active: false })
        .eq('id', areaData.id)
    )
    expectNoError(
      await authed
        .from('products')
        .update({ active: false })
        .eq('id', productData.id)
    )

    expectNoError(await authed.from('quote_items').delete().eq('id', itemData.id))
    expectNoError(await authed.from('quotes').delete().eq('id', quoteData.id))
    expectNoError(await authed.from('quote_areas').delete().eq('id', areaData.id))
    expectNoError(await authed.from('products').delete().eq('id', productData.id))
  })
})
