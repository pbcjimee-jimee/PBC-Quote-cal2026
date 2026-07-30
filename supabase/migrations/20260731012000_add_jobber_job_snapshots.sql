create table public.jobber_job_snapshots (
  jobber_job_id text primary key,
  payload jsonb not null,
  refreshed_at timestamptz not null default now(),
  refreshed_by uuid not null references auth.users(id)
);

alter table public.jobber_job_snapshots enable row level security;

revoke all on table public.jobber_job_snapshots from anon, authenticated;
grant all on table public.jobber_job_snapshots to service_role;
