CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(4);

SELECT is(
  to_regclass('public.progress_invoice_numbering_base_reservations'),
  NULL,
  'a duplicate preflight failure rolls back reservation table creation'
);

SELECT isnt(
  to_regclass('public.uq_progress_invoice_series_numbering_base'),
  NULL,
  'a duplicate preflight failure preserves the previous unique index'
);

SELECT is(
  (SELECT count(*)::INT FROM public.progress_invoice_series
   WHERE id IN (
     '88000000-0000-4000-8000-000000000101',
     '88000000-0000-4000-8000-000000000102'
   )),
  2,
  'a failed migration preserves both pre-upgrade Series rows'
);

SELECT is(
  (SELECT count(*)::INT FROM public.progress_claims
   WHERE id = '88000000-0000-4000-8000-000000000103'),
  1,
  'a failed migration preserves pre-upgrade Claim history'
);

SELECT * FROM finish();
