create table public.jobber_job_snapshots (
  jobber_job_id text primary key,
  payload jsonb not null,
  refreshed_at timestamptz not null default now(),
  refreshed_by uuid not null references auth.users(id)
);

alter table public.jobber_job_snapshots enable row level security;

revoke all on table public.jobber_job_snapshots from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.jobber_job_snapshots to service_role;

create function public.synchronize_jobber_job_snapshot_scope(
  p_jobber_user_id text,
  p_assigned_job_ids text[]
)
returns table (
  payload jsonb,
  refreshed_at timestamptz,
  refreshed_by uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if nullif(btrim(p_jobber_user_id), '') is null then
    raise exception 'JOBBER_USER_ID_REQUIRED' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('jobber_snapshot_scope:' || p_jobber_user_id, 0));

  update public.jobber_job_snapshots as snapshot
  set payload = jsonb_set(
    snapshot.payload,
    '{scopeJobberUserIds}',
    (
      select coalesce(jsonb_agg(scoped.scope_id order by scoped.scope_id), '[]'::jsonb)
      from (
        select existing_scope.scope_id
        from jsonb_array_elements_text(
          coalesce(snapshot.payload -> 'scopeJobberUserIds', '[]'::jsonb)
        ) as existing_scope(scope_id)
        where existing_scope.scope_id <> p_jobber_user_id
        union
        select p_jobber_user_id
        where snapshot.jobber_job_id = any(coalesce(p_assigned_job_ids, array[]::text[]))
      ) as scoped
    ),
    true
  )
  where snapshot.jobber_job_id is not null;

  return query
  select snapshot.payload, snapshot.refreshed_at, snapshot.refreshed_by
  from public.jobber_job_snapshots as snapshot
  where snapshot.jobber_job_id = any(coalesce(p_assigned_job_ids, array[]::text[]));
end;
$$;

revoke all on function public.synchronize_jobber_job_snapshot_scope(text, text[])
  from public, anon, authenticated, service_role;
grant execute on function public.synchronize_jobber_job_snapshot_scope(text, text[])
  to service_role;
