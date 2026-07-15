BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(21);

CREATE FUNCTION pg_temp.capture_sqlstate(command TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE command;
    RAISE EXCEPTION '__PGTAP_ROLLBACK_SUCCESS__' USING ERRCODE = 'P0001';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = '__PGTAP_ROLLBACK_SUCCESS__' THEN
        RETURN 'NO_ERROR';
      END IF;
      RETURN SQLSTATE;
    WHEN OTHERS THEN
      RETURN SQLSTATE;
  END;
END;
$$;

CREATE FUNCTION pg_temp.insert_claim_revision(
  revision_id UUID,
  owning_claim_id UUID,
  revision_no INT,
  revision_state TEXT,
  registered_template_id UUID,
  registered_template_version INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  payload JSONB;
BEGIN
  payload := jsonb_build_object(
    'id', revision_id,
    'claim_id', owning_claim_id,
    'revision_number', revision_no,
    'state', revision_state,
    'input_mode', 'cumulative_percentage',
    'authoritative_cumulative_percentage', 50,
    'issue_date', '2026-07-15',
    'due_date', '2026-07-29',
    'description', 'Core schema test claim',
    'notes', '',
    'reference', 'CORE-TEST',
    'supplier_profile_version', 1,
    'supplier_legal_name', 'Paint Buddy & Co Pty Ltd',
    'supplier_trading_name', 'Paint Buddy & Co',
    'supplier_abn', '12345678901',
    'supplier_contractor_licence', 'TEST-LICENCE',
    'supplier_address', '1 Test Street, Sydney NSW',
    'supplier_phone', '0400000000',
    'supplier_email', 'accounts@example.test',
    'supplier_bank_name', 'Test Bank',
    'supplier_bsb', '000-000',
    'supplier_bank_account_name', 'Paint Buddy & Co',
    'supplier_bank_account_number', '00000000',
    'supplier_gst_rate', 0.1,
    'supplier_timezone', 'Australia/Sydney',
    'supplier_default_payment_term_days', 14
  ) || jsonb_build_object(
    'recipient_name', 'Builder Test',
    'recipient_address', '2 Test Street, Sydney NSW',
    'site_name', 'Core Schema Site',
    'site_address', '3 Test Street, Sydney NSW',
    'jobber_account_id', 'jobber-account-test',
    'jobber_invoice_id', 'jobber-invoice-test',
    'original_jobber_invoice_number', 'INV-CORE',
    'observed_jobber_invoice_number', 'INV-CORE',
    'accepted_numbering_base', 'INV-CORE',
    'adjusted_contract_ex_gst', 1000,
    'adjusted_contract_gst', 100,
    'adjusted_contract_inc_gst', 1100,
    'approved_variations_ex_gst', 0,
    'approved_credits_ex_gst', 0,
    'previous_claims_ex_gst', 0,
    'previous_claims_gst', 0,
    'previous_claims_inc_gst', 0,
    'cumulative_target_ex_gst', 500,
    'cumulative_target_gst', 50,
    'cumulative_target_inc_gst', 550,
    'current_claim_ex_gst', 500,
    'current_claim_gst', 50,
    'current_claim_inc_gst', 550,
    'cumulative_percentage', 50,
    'remaining_ex_gst', 500,
    'remaining_gst', 50,
    'remaining_inc_gst', 550,
    'calculation_policy_version', 'v1',
    'template_id', registered_template_id,
    'template_version', registered_template_version,
    'edit_classification', 'clerical',
    'financial_snapshot_hash', repeat('a', 64),
    'tax_review_state', 'not_required',
    'adjustment_snapshot', '[]'::JSONB,
    'created_by', '00000000-0000-0000-0000-000000000001',
    'created_at', '2026-07-15T00:00:00Z'
  );

  INSERT INTO public.progress_claim_revisions
  SELECT (jsonb_populate_record(NULL::public.progress_claim_revisions, payload)).*;
END;
$$;

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'progress-core@example.test',
  now(),
  now()
);

INSERT INTO public.quotes (
  id,
  customer_name,
  working_days,
  formula1_total,
  formula2_total,
  formula3_total,
  formula4_total,
  formula5_total,
  selected_min,
  selected_max,
  interior_selected_min,
  interior_selected_max,
  exterior_selected_min,
  exterior_selected_max,
  roof_selected_min,
  roof_selected_max,
  subtotal,
  final_total,
  pricing_settings_snapshot,
  created_by
) VALUES (
  '00000000-0000-0000-0000-000000000010',
  'Progress Core Quote',
  1,
  1000,
  1000,
  1000,
  1000,
  1000,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1000,
  1100,
  '{}'::JSONB,
  '00000000-0000-0000-0000-000000000001'
);

INSERT INTO public.progress_invoice_templates (
  id,
  version,
  status,
  source_evidence_path,
  source_byte_length,
  source_sha256,
  normalized_master_path,
  normalized_sha256,
  logo_sha256,
  manifest_version,
  cell_map_version,
  page_layout_version,
  font_version,
  font_regular_sha256,
  font_bold_sha256,
  manifest,
  registered_by,
  activated_at
) VALUES (
  '00000000-0000-0000-0000-000000000020',
  1,
  'active',
  'template/source.xlsx',
  1024,
  repeat('1', 64),
  'template/master.xlsx',
  repeat('2', 64),
  repeat('3', 64),
  'v1',
  'v1',
  'v1',
  'v1',
  repeat('4', 64),
  repeat('5', 64),
  '{}'::JSONB,
  '00000000-0000-0000-0000-000000000001',
  '2026-07-01T00:00:00Z'
);

INSERT INTO public.progress_invoice_series (
  id,
  quote_id,
  source_type,
  base_contract_ex_gst,
  recipient_name,
  recipient_address,
  site_name,
  site_address,
  default_description,
  created_by,
  updated_by
) VALUES
  (
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000010',
    'pbc_quote',
    1000,
    'Builder A',
    '1 Builder Street',
    'Site A',
    '1 Site Street',
    'Progress works',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '00000000-0000-0000-0000-000000000101',
    NULL,
    'jobber_job',
    1000,
    'Builder B',
    '2 Builder Street',
    'Site B',
    '2 Site Street',
    'Progress works',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.progress_claims (
  id,
  series_id,
  sequence,
  kind,
  suffix,
  tax_invoice_number,
  created_by,
  updated_by
) VALUES
  (
    '00000000-0000-0000-0000-000000000200',
    '00000000-0000-0000-0000-000000000100',
    1,
    'progress',
    'P01',
    'INV-CORE-P01',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000100',
    2,
    'progress',
    'P02',
    'INV-CORE-P02',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001'
  );

SELECT pg_temp.insert_claim_revision(
  '00000000-0000-0000-0000-000000000300',
  '00000000-0000-0000-0000-000000000200',
  1,
  'draft',
  NULL,
  NULL
);

SELECT pg_temp.insert_claim_revision(
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000200',
  2,
  'issued',
  '00000000-0000-0000-0000-000000000020',
  1
);

SELECT pg_temp.insert_claim_revision(
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000201',
  2,
  'draft',
  NULL,
  NULL
);

UPDATE public.progress_claims
SET current_revision_id = '00000000-0000-0000-0000-000000000300'
WHERE id = '00000000-0000-0000-0000-000000000200';

INSERT INTO public.progress_invoice_revision_sets (
  id,
  series_id,
  set_number,
  predecessor_set_id,
  revision_manifest,
  aggregate_financial_manifest_hash,
  created_by
) VALUES
  (
    '00000000-0000-0000-0000-000000000400',
    '00000000-0000-0000-0000-000000000100',
    1,
    NULL,
    '[]'::JSONB,
    repeat('6', 64),
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000100',
    2,
    NULL,
    '[]'::JSONB,
    repeat('7', 64),
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000100',
    3,
    '00000000-0000-0000-0000-000000000401',
    '[]'::JSONB,
    repeat('8', 64),
    '00000000-0000-0000-0000-000000000001'
  );

UPDATE public.progress_invoice_series
SET current_revision_set_id = '00000000-0000-0000-0000-000000000400'
WHERE id = '00000000-0000-0000-0000-000000000100';

INSERT INTO public.progress_payments (
  id,
  series_id,
  source,
  jobber_payment_id,
  matched_manual_payment_id,
  created_by,
  updated_by
) VALUES
  (
    '00000000-0000-0000-0000-000000000500',
    '00000000-0000-0000-0000-000000000100',
    'manual',
    NULL,
    NULL,
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000100',
    'jobber',
    'jobber-payment-core',
    '00000000-0000-0000-0000-000000000500',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.progress_payment_revisions (
  id,
  payment_id,
  revision_number,
  received_date,
  observed_amount,
  effective_receipt_amount,
  sync_state,
  created_by
) VALUES (
  '00000000-0000-0000-0000-000000000600',
  '00000000-0000-0000-0000-000000000500',
  1,
  '2026-07-15',
  100,
  100,
  'manual',
  '00000000-0000-0000-0000-000000000001'
);

UPDATE public.progress_payments
SET current_revision_id = '00000000-0000-0000-0000-000000000600'
WHERE id = '00000000-0000-0000-0000-000000000500';

SELECT lives_ok(
  $$DELETE FROM public.quotes WHERE id = '00000000-0000-0000-0000-000000000010'$$,
  'deleting a linked Quote preserves the Progress Invoice series'
);

SELECT is(
  (SELECT source_type FROM public.progress_invoice_series WHERE id = '00000000-0000-0000-0000-000000000100'),
  'pbc_quote',
  'Quote deletion retains the historical PBC Quote source type'
);

SELECT is(
  (SELECT quote_id FROM public.progress_invoice_series WHERE id = '00000000-0000-0000-0000-000000000100'),
  NULL::UUID,
  'Quote deletion nulls the optional Quote link'
);

SELECT is(
  pg_temp.capture_sqlstate(
    $$UPDATE public.progress_invoice_templates
      SET status = 'superseded', activated_at = '2026-07-02T00:00:00Z'
      WHERE id = '00000000-0000-0000-0000-000000000020'$$
  ),
  '55000',
  'Active-to-Superseded cannot rewrite the original activation timestamp'
);

SELECT lives_ok(
  $$UPDATE public.progress_invoice_templates
    SET status = 'superseded'
    WHERE id = '00000000-0000-0000-0000-000000000020'$$,
  'Active-to-Superseded succeeds when every evidence field is unchanged'
);

SELECT is(
  (
    SELECT activated_at
    FROM public.progress_invoice_templates
    WHERE id = '00000000-0000-0000-0000-000000000020'
  ),
  '2026-07-01T00:00:00Z'::TIMESTAMPTZ,
  'Superseded template retains its original activation timestamp'
);

SELECT is(
  pg_temp.capture_sqlstate(
    $$UPDATE public.progress_claim_revisions
      SET description = 'Forbidden issued edit'
      WHERE id = '00000000-0000-0000-0000-000000000301'$$
  ),
  '55000',
  'Issued Claim Revision content is immutable'
);

SELECT is(
  pg_temp.capture_sqlstate(
    $$DELETE FROM public.progress_claim_revisions
      WHERE id = '00000000-0000-0000-0000-000000000301'$$
  ),
  '55000',
  'Issued Claim Revision cannot be deleted'
);

SELECT lives_ok(
  $$UPDATE public.progress_claim_revisions
    SET state = 'superseded'
    WHERE id = '00000000-0000-0000-0000-000000000301'$$,
  'Issued Claim Revision permits an exact state-only transition to Superseded'
);

SELECT is(
  pg_temp.capture_sqlstate(
    $$UPDATE public.progress_claim_revisions
      SET description = 'Forbidden superseded edit'
      WHERE id = '00000000-0000-0000-0000-000000000301'$$
  ),
  '55000',
  'Superseded Claim Revision content remains immutable'
);

SELECT is(
  pg_temp.capture_sqlstate(
    $$UPDATE public.progress_claim_revisions
      SET state = 'issued'
      WHERE id = '00000000-0000-0000-0000-000000000301'$$
  ),
  '55000',
  'Superseded Claim Revision cannot reverse state'
);

SELECT is(
  pg_temp.capture_sqlstate(
    $$UPDATE public.progress_claim_revisions
      SET claim_id = '00000000-0000-0000-0000-000000000201'
      WHERE id = '00000000-0000-0000-0000-000000000300'$$
  ),
  '55000',
  'a current Draft Claim Revision cannot be reparented from the referenced side'
);

SELECT is(
  pg_temp.capture_sqlstate(
    $$UPDATE public.progress_invoice_revision_sets
      SET series_id = '00000000-0000-0000-0000-000000000101'
      WHERE id = '00000000-0000-0000-0000-000000000400'$$
  ),
  '55000',
  'a current Revision Set cannot be reparented from the referenced side'
);

SELECT is(
  pg_temp.capture_sqlstate(
    $$UPDATE public.progress_invoice_revision_sets
      SET series_id = '00000000-0000-0000-0000-000000000101'
      WHERE id = '00000000-0000-0000-0000-000000000401'$$
  ),
  '55000',
  'a predecessor Revision Set cannot be reparented from the referenced side'
);

SELECT is(
  pg_temp.capture_sqlstate(
    $$UPDATE public.progress_payments
      SET series_id = '00000000-0000-0000-0000-000000000101'
      WHERE id = '00000000-0000-0000-0000-000000000500'$$
  ),
  '55000',
  'a matched Manual payment cannot be reparented from the referenced side'
);

SELECT is(
  pg_temp.capture_sqlstate(
    $$UPDATE public.progress_payments
      SET source = 'manual', jobber_payment_id = NULL, matched_manual_payment_id = NULL
      WHERE id = '00000000-0000-0000-0000-000000000501'$$
  ),
  '55000',
  'stable Jobber payment source and external identity cannot be rewritten'
);

SELECT is(
  pg_temp.capture_sqlstate(
    $$UPDATE public.progress_payment_revisions
      SET payment_id = '00000000-0000-0000-0000-000000000501'
      WHERE id = '00000000-0000-0000-0000-000000000600'$$
  ),
  '55000',
  'immutable Payment Revision ownership cannot be rewritten'
);

SELECT is(
  pg_temp.capture_sqlstate(
    $$SELECT pg_temp.insert_claim_revision(
      '00000000-0000-0000-0000-000000000310',
      '00000000-0000-0000-0000-000000000201',
      10,
      'issued',
      '00000000-0000-0000-0000-000000000020',
      999
    )$$
  ),
  '23503',
  'Claim Revision rejects a mismatched template ID/version pair'
);

SELECT isnt(
  pg_temp.capture_sqlstate(
    $$SELECT pg_temp.insert_claim_revision(
      '00000000-0000-0000-0000-000000000311',
      '00000000-0000-0000-0000-000000000201',
      11,
      'issued',
      '00000000-0000-0000-0000-000000000020',
      NULL
    )$$
  ),
  'NO_ERROR',
  'Claim Revision rejects a half-null template evidence pair'
);

SELECT is(
  pg_temp.capture_sqlstate(
    $$SELECT pg_temp.insert_claim_revision(
      '00000000-0000-0000-0000-000000000312',
      '00000000-0000-0000-0000-000000000201',
      12,
      'issued',
      NULL,
      NULL
    )$$
  ),
  '23514',
  'Issued Claim Revision requires a complete template evidence pair'
);

SELECT lives_ok(
  $$SELECT pg_temp.insert_claim_revision(
    '00000000-0000-0000-0000-000000000313',
    '00000000-0000-0000-0000-000000000201',
    13,
    'draft',
    NULL,
    NULL
  )$$,
  'Draft Claim Revision may remain unbound before document generation'
);

SELECT * FROM finish();

ROLLBACK;
