CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(1);

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000008102',
  'progress-upgrade-duplicate@example.test',
  now(),
  now()
);

INSERT INTO public.progress_invoice_series (
  id, source_type, accepted_numbering_base, base_contract_ex_gst,
  recipient_name, recipient_address, site_name, site_address, default_description,
  status, created_by, updated_by
) VALUES
  (
    '88000000-0000-4000-8000-000000000101', 'manual', 'Duplicate-Upgrade-Base', 1000,
    'Duplicate Active', 'Duplicate Billing', 'Duplicate Site', 'Duplicate Site address',
    'Duplicate active works', 'active',
    '00000000-0000-0000-0000-000000008102', '00000000-0000-0000-0000-000000008102'
  ),
  (
    '88000000-0000-4000-8000-000000000102', 'manual', ' duplicate-upgrade-base ', 1000,
    'Duplicate Void', 'Duplicate Billing', 'Duplicate Site', 'Duplicate Site address',
    'Duplicate Void works', 'void',
    '00000000-0000-0000-0000-000000008102', '00000000-0000-0000-0000-000000008102'
  );

INSERT INTO public.progress_claims (
  id, series_id, sequence, kind, suffix, tax_invoice_number, status,
  created_by, updated_by
) VALUES (
  '88000000-0000-4000-8000-000000000103', '88000000-0000-4000-8000-000000000102',
  1, 'progress', 'P01', 'DUPLICATE-UPGRADE-P01', 'void',
  '00000000-0000-0000-0000-000000008102', '00000000-0000-0000-0000-000000008102'
);

SELECT pass('seeded a duplicate lifetime reservation that the old partial index permits');

SELECT * FROM finish();
