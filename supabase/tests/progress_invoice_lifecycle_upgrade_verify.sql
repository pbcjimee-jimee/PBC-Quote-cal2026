CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(7);

SELECT has_table(
  'public',
  'progress_invoice_numbering_base_reservations',
  'the lifecycle migration creates the reservation table during upgrade'
);

SELECT is(
  (SELECT count(*)::INT FROM public.progress_invoice_numbering_base_reservations),
  3,
  'the upgrade backfills every pre-existing accepted numbering base'
);

SELECT is(
  (SELECT state FROM public.progress_invoice_numbering_base_reservations
   WHERE series_id = '88000000-0000-4000-8000-000000000001'),
  'active',
  'a non-Void claim-free Series backfills an active reservation'
);

SELECT is(
  (SELECT state FROM public.progress_invoice_numbering_base_reservations
   WHERE series_id = '88000000-0000-4000-8000-000000000010'),
  'permanent',
  'any historical Claim makes a Void Series reservation permanent'
);

SELECT is(
  (SELECT first_claim_id FROM public.progress_invoice_numbering_base_reservations
   WHERE series_id = '88000000-0000-4000-8000-000000000010'),
  '88000000-0000-4000-8000-000000000012'::UUID,
  'the earliest historical Claim is preserved as the permanent reservation origin'
);

SELECT is(
  (SELECT state FROM public.progress_invoice_numbering_base_reservations
   WHERE series_id = '88000000-0000-4000-8000-000000000020'),
  'released',
  'a claim-free Void Series backfills a released reservation'
);

SELECT is(
  (SELECT normalized_base FROM public.progress_invoice_numbering_base_reservations
   WHERE series_id = '88000000-0000-4000-8000-000000000001'),
  'upgrade-active',
  'backfill normalizes accepted numbering bases'
);

SELECT * FROM finish();
