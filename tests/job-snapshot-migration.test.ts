import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260731012000_add_jobber_job_snapshots.sql',
  'utf8',
)

describe('Jobber job snapshot migration', () => {
  it('creates a service-role-only cache with RLS and no client policy', () => {
    expect(migration).toContain('create table public.jobber_job_snapshots')
    expect(migration).toContain('jobber_job_id text primary key')
    expect(migration).toContain('payload jsonb not null')
    expect(migration).toContain('refreshed_by uuid not null references auth.users(id)')
    expect(migration).toContain('enable row level security')
    expect(migration).toContain(
      'revoke all on table public.jobber_job_snapshots from public, anon, authenticated, service_role'
    )
    expect(migration).toContain(
      'grant select, insert, update, delete on table public.jobber_job_snapshots to service_role'
    )
    expect(migration).not.toMatch(/create\s+policy/i)
  })

  it('atomically replaces one supervisor scope without granting client execution', () => {
    expect(migration).toMatch(/create function public\.synchronize_jobber_job_snapshot_scope/i)
    expect(migration).toMatch(/p_assigned_job_ids text\[\]/i)
    expect(migration).toMatch(/jsonb_array_elements_text/i)
    expect(migration).toMatch(/revoke all on function public\.synchronize_jobber_job_snapshot_scope/i)
    expect(migration).toMatch(/grant execute on function public\.synchronize_jobber_job_snapshot_scope[\s\S]*to service_role/i)
  })
})
