CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(1);

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000008101',
  'progress-upgrade@example.test',
  now(),
  now()
);

INSERT INTO public.progress_invoice_series (
  id, source_type, accepted_numbering_base, base_contract_ex_gst,
  recipient_name, recipient_address, site_name, site_address, default_description,
  status, created_by, updated_by, created_at, updated_at
) VALUES
  (
    '88000000-0000-4000-8000-000000000001', 'manual', ' Upgrade-Active ', 1000,
    'Upgrade Active', 'Upgrade Billing', 'Upgrade Site', 'Upgrade Site address',
    'Upgrade active works', 'active',
    '00000000-0000-0000-0000-000000008101', '00000000-0000-0000-0000-000000008101',
    '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'
  ),
  (
    '88000000-0000-4000-8000-000000000010', 'manual', 'Upgrade-Permanent', 2000,
    'Upgrade Permanent', 'Upgrade Billing', 'Upgrade Site', 'Upgrade Site address',
    'Upgrade permanent works', 'void',
    '00000000-0000-0000-0000-000000008101', '00000000-0000-0000-0000-000000008101',
    '2026-01-03T00:00:00Z', '2026-01-06T00:00:00Z'
  ),
  (
    '88000000-0000-4000-8000-000000000020', 'manual', 'Upgrade-Released', 3000,
    'Upgrade Released', 'Upgrade Billing', 'Upgrade Site', 'Upgrade Site address',
    'Upgrade released works', 'void',
    '00000000-0000-0000-0000-000000008101', '00000000-0000-0000-0000-000000008101',
    '2026-01-07T00:00:00Z', '2026-01-08T00:00:00Z'
  );

INSERT INTO public.progress_claims (
  id, series_id, sequence, kind, suffix, tax_invoice_number, status,
  created_by, updated_by, created_at, updated_at
) VALUES
  (
    '88000000-0000-4000-8000-000000000011', '88000000-0000-4000-8000-000000000010',
    1, 'progress', 'P01', 'UPGRADE-PERMANENT-P01', 'void',
    '00000000-0000-0000-0000-000000008101', '00000000-0000-0000-0000-000000008101',
    '2026-01-05T00:00:00Z', '2026-01-05T00:00:00Z'
  ),
  (
    '88000000-0000-4000-8000-000000000012', '88000000-0000-4000-8000-000000000010',
    2, 'progress', 'P02', 'UPGRADE-PERMANENT-P02', 'void',
    '00000000-0000-0000-0000-000000008101', '00000000-0000-0000-0000-000000008101',
    '2026-01-04T00:00:00Z', '2026-01-04T00:00:00Z'
  );

SELECT pass('seeded pre-lifecycle-migration Series and Claim history');

SELECT * FROM finish();
