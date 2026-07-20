ALTER TABLE public.progress_claim_revisions
  ADD COLUMN previous_claim_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(previous_claim_snapshot) = 'array' AND pg_column_size(previous_claim_snapshot) <= 131072),
  ADD COLUMN jobber_observation_snapshot JSONB
    CHECK (jobber_observation_snapshot IS NULL OR (jsonb_typeof(jobber_observation_snapshot) = 'object' AND pg_column_size(jobber_observation_snapshot) <= 131072)),
  ADD COLUMN calculation_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(calculation_snapshot) = 'object' AND pg_column_size(calculation_snapshot) <= 131072);

CREATE TABLE public.progress_claim_command_results (
  series_id UUID NOT NULL REFERENCES public.progress_invoice_series(id) ON DELETE RESTRICT,
  command_name TEXT NOT NULL CHECK (command_name IN ('create_progress_claim_draft','save_progress_claim_draft')),
  correlation_key UUID NOT NULL,
  response_snapshot JSONB NOT NULL CHECK (jsonb_typeof(response_snapshot) = 'object' AND pg_column_size(response_snapshot) <= 524288),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(series_id,command_name,correlation_key)
);
ALTER TABLE public.progress_claim_command_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.progress_claim_command_results FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.progress_claim_money(value NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.to_char(value, 'FM999999999999990.00');
$$;

CREATE FUNCTION public.progress_claim_percentage(value NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.to_char(value, 'FM999999990.000000');
$$;

CREATE FUNCTION public.progress_claim_assert_text(value TEXT, maximum_length INT, required BOOLEAN DEFAULT true)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE normalized TEXT := btrim(COALESCE(value, ''));
BEGIN
  IF length(normalized) > maximum_length OR (required AND normalized = '') THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  RETURN normalized;
END;
$$;

CREATE FUNCTION public.progress_claim_profile_ready(profile public.business_invoice_profiles)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT profile.id IS NOT NULL
    AND NULLIF(btrim(profile.legal_name),'') IS NOT NULL AND length(btrim(profile.legal_name))<=160
    AND length(btrim(profile.trading_name))<=160
    AND public.progress_canonicalize_supplier_abn(profile.abn) IS NOT NULL
    AND length(btrim(profile.abn))<=14
    AND length(btrim(profile.contractor_licence))<=64
    AND NULLIF(btrim(profile.business_address),'') IS NOT NULL AND length(btrim(profile.business_address))<=300
    AND NULLIF(btrim(profile.phone),'') IS NOT NULL AND length(btrim(profile.phone))<=40
    AND NULLIF(btrim(profile.email),'') IS NOT NULL AND length(btrim(profile.email))<=254
    AND btrim(profile.email) ~ $zod_email$^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}\Z$zod_email$
    AND NULLIF(btrim(profile.bank_name),'') IS NOT NULL AND length(btrim(profile.bank_name))<=120
    AND NULLIF(btrim(profile.bsb),'') IS NOT NULL AND length(btrim(profile.bsb))<=16
    AND NULLIF(btrim(profile.bank_account_name),'') IS NOT NULL AND length(btrim(profile.bank_account_name))<=120
    AND NULLIF(btrim(profile.bank_account_number),'') IS NOT NULL AND length(btrim(profile.bank_account_number))<=32
    AND profile.gst_rate=0.10 AND profile.business_timezone='Australia/Sydney'
    AND profile.default_payment_term_days BETWEEN 0 AND 365;
$$;

CREATE FUNCTION public.progress_claim_assert_current_set(
  series_row public.progress_invoice_series,
  expected_set_id UUID,
  expected_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE actual_hash TEXT;
BEGIN
  IF (expected_set_id IS NULL) IS DISTINCT FROM (expected_hash IS NULL)
    OR (expected_hash IS NOT NULL AND expected_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  IF series_row.current_revision_set_id IS NOT NULL THEN
    SELECT lower(set_row.aggregate_financial_manifest_hash)
    INTO actual_hash
    FROM public.progress_invoice_revision_sets AS set_row
    WHERE set_row.id = series_row.current_revision_set_id
      AND set_row.series_id = series_row.id
      AND set_row.state = 'current';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN expected_set_id IS NOT DISTINCT FROM series_row.current_revision_set_id
    AND expected_hash IS NOT DISTINCT FROM actual_hash;
END;
$$;

CREATE FUNCTION public.progress_claim_source_observation(series_row public.progress_invoice_series)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE snapshot public.progress_jobber_invoice_snapshots%ROWTYPE;
BEGIN
  IF series_row.source_type = 'manual' THEN
    IF series_row.jobber_account_id IS NOT NULL OR series_row.jobber_invoice_id IS NOT NULL
      OR series_row.current_jobber_snapshot_id IS NOT NULL THEN
      RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    RETURN NULL;
  END IF;
  SELECT row_value.* INTO snapshot
  FROM public.progress_jobber_invoice_snapshots AS row_value
  WHERE row_value.id = series_row.current_jobber_snapshot_id
    AND row_value.series_id = series_row.id;
  IF NOT FOUND OR snapshot.jobber_account_id IS DISTINCT FROM series_row.jobber_account_id
    OR snapshot.jobber_invoice_id IS DISTINCT FROM series_row.jobber_invoice_id THEN
    RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object(
    'snapshot_id', snapshot.id, 'schema_version', snapshot.schema_version,
    'jobber_account_id', snapshot.jobber_account_id, 'jobber_invoice_id', snapshot.jobber_invoice_id,
    'selected_jobber_job_id', snapshot.selected_jobber_job_id,
    'jobber_client_id', snapshot.jobber_client_id,
    'selected_jobber_property_id', snapshot.selected_jobber_property_id,
    'original_invoice_number', snapshot.original_invoice_number,
    'observed_invoice_number', snapshot.observed_invoice_number,
    'raw_status', snapshot.raw_status, 'normalized_status', snapshot.normalized_status,
    'jobber_web_uri', snapshot.jobber_web_uri,
    'invoice_subtotal', CASE WHEN snapshot.invoice_subtotal IS NULL THEN NULL ELSE public.progress_claim_money(snapshot.invoice_subtotal) END,
    'invoice_tax', CASE WHEN snapshot.invoice_tax IS NULL THEN NULL ELSE public.progress_claim_money(snapshot.invoice_tax) END,
    'invoice_total', CASE WHEN snapshot.invoice_total IS NULL THEN NULL ELSE public.progress_claim_money(snapshot.invoice_total) END,
    'invoice_balance', CASE WHEN snapshot.invoice_balance IS NULL THEN NULL ELSE public.progress_claim_money(snapshot.invoice_balance) END,
    'issued_date', snapshot.issued_date, 'due_date', snapshot.due_date,
    'received_date', snapshot.received_date, 'external_updated_at', snapshot.external_updated_at,
    'client_name', snapshot.client_name, 'client_company_name', snapshot.client_company_name,
    'client_email', snapshot.client_email, 'client_phone', snapshot.client_phone,
    'billing_address', snapshot.billing_address, 'property_address', snapshot.property_address,
    'fetched_at', snapshot.fetched_at
  );
END;
$$;

CREATE FUNCTION public.progress_claim_financial_snapshot(
  series_row public.progress_invoice_series,
  kind_value TEXT,
  input_mode_value TEXT,
  authoritative_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  approved_adjustments JSONB;
  previous_claims JSONB;
  variations NUMERIC := 0; credits NUMERIC := 0;
  previous_ex NUMERIC := 0; previous_gst NUMERIC := 0; previous_inc NUMERIC := 0;
  adjusted_ex NUMERIC; adjusted_gst NUMERIC; adjusted_inc NUMERIC;
  target_ex NUMERIC; target_gst NUMERIC; target_inc NUMERIC;
  current_ex NUMERIC; current_gst NUMERIC; current_inc NUMERIC;
  cumulative NUMERIC; remaining_ex NUMERIC; remaining_gst NUMERIC; remaining_inc NUMERIC;
  parsed NUMERIC;
BEGIN
  IF kind_value NOT IN ('progress', 'final') OR input_mode_value NOT IN ('cumulative_percentage', 'current_claim_amount') THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  IF authoritative_value !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  parsed := authoritative_value::NUMERIC;
  IF parsed < 0 OR parsed > 999999999999.99
    OR (input_mode_value = 'current_claim_amount' AND scale(parsed) > 2)
    OR (input_mode_value = 'cumulative_percentage' AND (parsed > 100 OR scale(parsed) > 6)) THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(sum(CASE WHEN adjustment.type = 'variation' THEN adjustment.amount_ex_gst ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN adjustment.type = 'credit' THEN adjustment.amount_ex_gst ELSE 0 END), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', adjustment.id, 'type', adjustment.type,
      'effective_date', adjustment.effective_date,
      'description', adjustment.description,
      'amount_ex_gst', public.progress_claim_money(adjustment.amount_ex_gst),
      'gst_rate', '0.10', 'version', adjustment.version
    ) ORDER BY adjustment.effective_date, adjustment.display_order, adjustment.id), '[]'::JSONB)
  INTO variations, credits, approved_adjustments
  FROM public.progress_adjustments AS adjustment
  WHERE adjustment.series_id = series_row.id AND adjustment.status = 'approved';

  SELECT COALESCE(sum(manifest.current_claim_ex_gst), 0),
    COALESCE(sum(manifest.current_claim_gst), 0),
    COALESCE(sum(manifest.current_claim_inc_gst), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'claim_id', manifest.claim_id, 'revision_id', manifest.revision_id,
      'sequence', manifest.claim_sequence, 'tax_invoice_number', manifest.tax_invoice_number,
      'ex_gst', public.progress_claim_money(manifest.current_claim_ex_gst),
      'gst', public.progress_claim_money(manifest.current_claim_gst),
      'inc_gst', public.progress_claim_money(manifest.current_claim_inc_gst)
    ) ORDER BY manifest.manifest_ordinal), '[]'::JSONB)
  INTO previous_ex, previous_gst, previous_inc, previous_claims
  FROM public.progress_resolve_current_manifest(series_row.id) AS manifest;

  adjusted_ex := series_row.base_contract_ex_gst + variations - credits;
  IF adjusted_ex <= 0 THEN
    RAISE EXCEPTION 'PROGRESS_RECONCILIATION_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  adjusted_gst := round(adjusted_ex * 0.10, 2);
  adjusted_inc := adjusted_ex + adjusted_gst;
  IF previous_ex > adjusted_ex OR previous_gst > adjusted_gst OR previous_inc > adjusted_inc THEN
    RAISE EXCEPTION 'PROGRESS_RECONCILIATION_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF kind_value = 'final' THEN
    current_ex := adjusted_ex - previous_ex;
    current_gst := adjusted_gst - previous_gst;
    current_inc := current_ex + current_gst;
    IF current_inc <= 0 OR (input_mode_value = 'cumulative_percentage' AND parsed <> 100)
      OR (input_mode_value = 'current_claim_amount' AND parsed <> current_inc) THEN
      RAISE EXCEPTION 'PROGRESS_FINAL_RESIDUAL_REQUIRED' USING ERRCODE = '23514';
    END IF;
    target_ex := adjusted_ex; target_gst := adjusted_gst; target_inc := adjusted_inc; cumulative := 100;
  ELSE
    IF input_mode_value = 'cumulative_percentage' THEN
      cumulative := parsed;
      target_inc := round(adjusted_inc * cumulative / 100, 2);
      current_inc := target_inc - previous_inc;
    ELSE
      current_inc := parsed;
      target_inc := previous_inc + current_inc;
      cumulative := round(target_inc / adjusted_inc * 100, 6);
    END IF;
    IF current_inc <= 0 THEN
      RAISE EXCEPTION 'PROGRESS_CLAIM_AMOUNT_NOT_POSITIVE' USING ERRCODE = '23514';
    END IF;
    IF target_inc > adjusted_inc THEN
      RAISE EXCEPTION 'PROGRESS_CLAIM_OVER_CONTRACT' USING ERRCODE = '23514';
    END IF;
    current_ex := round(current_inc / 1.10, 2);
    current_gst := current_inc - current_ex;
    target_ex := previous_ex + current_ex;
    target_gst := previous_gst + current_gst;
    IF target_ex > adjusted_ex OR target_gst > adjusted_gst THEN
      RAISE EXCEPTION 'PROGRESS_CLAIM_OVER_CONTRACT' USING ERRCODE = '23514';
    END IF;
  END IF;
  remaining_ex := adjusted_ex - target_ex;
  remaining_gst := adjusted_gst - target_gst;
  remaining_inc := adjusted_inc - target_inc;

  RETURN jsonb_build_object(
    'base_contract_ex_gst', public.progress_claim_money(series_row.base_contract_ex_gst),
    'approved_variations_ex_gst', public.progress_claim_money(variations),
    'approved_credits_ex_gst', public.progress_claim_money(credits),
    'approved_adjustments', approved_adjustments, 'previous_claims', previous_claims,
    'adjusted_contract_ex_gst', public.progress_claim_money(adjusted_ex),
    'adjusted_contract_gst', public.progress_claim_money(adjusted_gst),
    'adjusted_contract_inc_gst', public.progress_claim_money(adjusted_inc),
    'previous_claims_ex_gst', public.progress_claim_money(previous_ex),
    'previous_claims_gst', public.progress_claim_money(previous_gst),
    'previous_claims_inc_gst', public.progress_claim_money(previous_inc),
    'cumulative_target_ex_gst', public.progress_claim_money(target_ex),
    'cumulative_target_gst', public.progress_claim_money(target_gst),
    'cumulative_target_inc_gst', public.progress_claim_money(target_inc),
    'current_claim_ex_gst', public.progress_claim_money(current_ex),
    'current_claim_gst', public.progress_claim_money(current_gst),
    'current_claim_inc_gst', public.progress_claim_money(current_inc),
    'cumulative_percentage', public.progress_claim_percentage(cumulative),
    'remaining_ex_gst', public.progress_claim_money(remaining_ex),
    'remaining_gst', public.progress_claim_money(remaining_gst),
    'remaining_inc_gst', public.progress_claim_money(remaining_inc)
  );
END;
$$;

CREATE FUNCTION public.progress_claim_defaults_snapshot(series_row public.progress_invoice_series)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE approved_adjustments JSONB; previous_claims JSONB;
  variations NUMERIC:=0; credits NUMERIC:=0; previous_ex NUMERIC:=0; previous_gst NUMERIC:=0; previous_inc NUMERIC:=0;
  adjusted_ex NUMERIC; adjusted_gst NUMERIC; adjusted_inc NUMERIC; cumulative NUMERIC;
BEGIN
  SELECT COALESCE(sum(CASE WHEN adjustment.type='variation' THEN adjustment.amount_ex_gst ELSE 0 END),0),
    COALESCE(sum(CASE WHEN adjustment.type='credit' THEN adjustment.amount_ex_gst ELSE 0 END),0),
    COALESCE(jsonb_agg(jsonb_build_object('id',adjustment.id,'type',adjustment.type,'effective_date',adjustment.effective_date,
      'description',adjustment.description,'amount_ex_gst',public.progress_claim_money(adjustment.amount_ex_gst),'gst_rate','0.10','version',adjustment.version)
      ORDER BY adjustment.effective_date,adjustment.display_order,adjustment.id),'[]'::JSONB)
  INTO variations,credits,approved_adjustments
  FROM public.progress_adjustments AS adjustment WHERE adjustment.series_id=series_row.id AND adjustment.status='approved';
  SELECT COALESCE(sum(manifest.current_claim_ex_gst),0),COALESCE(sum(manifest.current_claim_gst),0),COALESCE(sum(manifest.current_claim_inc_gst),0),
    COALESCE(jsonb_agg(jsonb_build_object('claim_id',manifest.claim_id,'revision_id',manifest.revision_id,'sequence',manifest.claim_sequence,
      'tax_invoice_number',manifest.tax_invoice_number,'ex_gst',public.progress_claim_money(manifest.current_claim_ex_gst),
      'gst',public.progress_claim_money(manifest.current_claim_gst),'inc_gst',public.progress_claim_money(manifest.current_claim_inc_gst))
      ORDER BY manifest.manifest_ordinal),'[]'::JSONB)
  INTO previous_ex,previous_gst,previous_inc,previous_claims
  FROM public.progress_resolve_current_manifest(series_row.id) AS manifest;
  adjusted_ex:=series_row.base_contract_ex_gst+variations-credits; adjusted_gst:=round(adjusted_ex*0.10,2); adjusted_inc:=adjusted_ex+adjusted_gst;
  IF adjusted_ex<=0 OR previous_ex>adjusted_ex OR previous_gst>adjusted_gst OR previous_inc>adjusted_inc THEN
    RAISE EXCEPTION 'PROGRESS_RECONCILIATION_REQUIRED' USING ERRCODE='P0001';
  END IF;
  cumulative:=round(previous_inc/adjusted_inc*100,6);
  RETURN jsonb_build_object(
    'base_contract_ex_gst',public.progress_claim_money(series_row.base_contract_ex_gst),
    'approved_variations_ex_gst',public.progress_claim_money(variations),'approved_credits_ex_gst',public.progress_claim_money(credits),
    'approved_adjustments',approved_adjustments,'previous_claims',previous_claims,
    'adjusted_contract_ex_gst',public.progress_claim_money(adjusted_ex),'adjusted_contract_gst',public.progress_claim_money(adjusted_gst),
    'adjusted_contract_inc_gst',public.progress_claim_money(adjusted_inc),
    'previous_claims_ex_gst',public.progress_claim_money(previous_ex),'previous_claims_gst',public.progress_claim_money(previous_gst),
    'previous_claims_inc_gst',public.progress_claim_money(previous_inc),
    'cumulative_target_ex_gst',public.progress_claim_money(previous_ex),'cumulative_target_gst',public.progress_claim_money(previous_gst),
    'cumulative_target_inc_gst',public.progress_claim_money(previous_inc),
    'current_claim_ex_gst','0.00','current_claim_gst','0.00','current_claim_inc_gst','0.00',
    'cumulative_percentage',public.progress_claim_percentage(cumulative),
    'remaining_ex_gst',public.progress_claim_money(adjusted_ex-previous_ex),'remaining_gst',public.progress_claim_money(adjusted_gst-previous_gst),
    'remaining_inc_gst',public.progress_claim_money(adjusted_inc-previous_inc));
END;
$$;

CREATE FUNCTION public.progress_claim_editor_dto(requested_series_id UUID, requested_claim_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE series_row public.progress_invoice_series%ROWTYPE;
  claim_row public.progress_claims%ROWTYPE; revision_row public.progress_claim_revisions%ROWTYPE;
  profile public.business_invoice_profiles%ROWTYPE; set_hash TEXT; financial JSONB;
  today_sydney DATE; observation JSONB;
BEGIN
  SELECT row_value.* INTO series_row FROM public.progress_invoice_series AS row_value WHERE row_value.id = requested_series_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF requested_claim_id IS NULL THEN
    SELECT row_value.* INTO profile FROM public.business_invoice_profiles AS row_value ORDER BY row_value.created_at LIMIT 1;
    IF NOT FOUND OR NOT public.progress_claim_profile_ready(profile) THEN
      RAISE EXCEPTION 'PROGRESS_INVOICE_PROFILE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF series_row.current_revision_set_id IS NOT NULL THEN
    SELECT lower(row_value.aggregate_financial_manifest_hash) INTO set_hash
    FROM public.progress_invoice_revision_sets AS row_value
    WHERE row_value.id = series_row.current_revision_set_id AND row_value.series_id = series_row.id AND row_value.state = 'current';
    IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF requested_claim_id IS NOT NULL THEN
    SELECT row_value.* INTO claim_row FROM public.progress_claims AS row_value
    WHERE row_value.id = requested_claim_id AND row_value.series_id = series_row.id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT row_value.* INTO revision_row FROM public.progress_claim_revisions AS row_value
    WHERE row_value.id = claim_row.current_revision_id AND row_value.claim_id = claim_row.id
      AND row_value.revision_number = 1 AND row_value.state = 'draft';
    IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_CLAIM_NOT_DRAFT' USING ERRCODE = 'P0001'; END IF;
    financial := revision_row.calculation_snapshot;
  ELSE
    today_sydney := (pg_catalog.now() AT TIME ZONE 'Australia/Sydney')::DATE;
    financial := public.progress_claim_defaults_snapshot(series_row);
  END IF;
  observation := CASE WHEN requested_claim_id IS NULL THEN public.progress_claim_source_observation(series_row) ELSE revision_row.jobber_observation_snapshot END;
  RETURN jsonb_build_object(
    'series_id', series_row.id, 'series_version', series_row.version, 'series_status', series_row.status,
    'source_type', series_row.source_type, 'accepted_numbering_base', series_row.accepted_numbering_base,
    'expected_current_revision_set_id', series_row.current_revision_set_id, 'expected_current_manifest_hash', set_hash,
    'claim_id', CASE WHEN requested_claim_id IS NULL THEN NULL ELSE claim_row.id END,
    'claim_version', CASE WHEN requested_claim_id IS NULL THEN NULL ELSE claim_row.version END,
    'claim_status', CASE WHEN requested_claim_id IS NULL THEN NULL ELSE claim_row.status END,
    'claim_kind', CASE WHEN requested_claim_id IS NULL THEN NULL ELSE claim_row.kind END,
    'sequence', CASE WHEN requested_claim_id IS NULL THEN NULL ELSE claim_row.sequence END,
    'suffix', CASE WHEN requested_claim_id IS NULL THEN NULL ELSE claim_row.suffix END,
    'tax_invoice_number', CASE WHEN requested_claim_id IS NULL THEN NULL ELSE claim_row.tax_invoice_number END,
    'revision_id', CASE WHEN requested_claim_id IS NULL THEN NULL ELSE revision_row.id END,
    'revision_number', CASE WHEN requested_claim_id IS NULL THEN NULL ELSE revision_row.revision_number END,
    'input_mode', CASE WHEN requested_claim_id IS NULL THEN 'cumulative_percentage' ELSE revision_row.input_mode END,
    'authoritative_value', CASE WHEN requested_claim_id IS NULL THEN public.progress_claim_percentage(series_row.current_cumulative_percentage)
      WHEN revision_row.input_mode = 'cumulative_percentage' THEN public.progress_claim_percentage(revision_row.authoritative_cumulative_percentage)
      ELSE public.progress_claim_money(revision_row.authoritative_current_claim_inc_gst) END,
    'issue_date', CASE WHEN requested_claim_id IS NULL THEN today_sydney ELSE revision_row.issue_date END,
    'due_date', CASE WHEN requested_claim_id IS NULL THEN today_sydney + profile.default_payment_term_days ELSE revision_row.due_date END,
    'description', CASE WHEN requested_claim_id IS NULL THEN series_row.default_description ELSE revision_row.description END,
    'notes', CASE WHEN requested_claim_id IS NULL THEN '' ELSE revision_row.notes END,
    'reference', CASE WHEN requested_claim_id IS NULL THEN series_row.reference ELSE revision_row.reference END
  ) || jsonb_build_object(
    'supplier_profile_version', CASE WHEN requested_claim_id IS NULL THEN profile.version ELSE revision_row.supplier_profile_version END,
    'supplier_legal_name', CASE WHEN requested_claim_id IS NULL THEN profile.legal_name ELSE revision_row.supplier_legal_name END,
    'supplier_trading_name', CASE WHEN requested_claim_id IS NULL THEN profile.trading_name ELSE revision_row.supplier_trading_name END,
    'supplier_abn', CASE WHEN requested_claim_id IS NULL THEN profile.abn ELSE revision_row.supplier_abn END,
    'supplier_contractor_licence', CASE WHEN requested_claim_id IS NULL THEN profile.contractor_licence ELSE revision_row.supplier_contractor_licence END,
    'supplier_address', CASE WHEN requested_claim_id IS NULL THEN profile.business_address ELSE revision_row.supplier_address END,
    'supplier_phone', CASE WHEN requested_claim_id IS NULL THEN profile.phone ELSE revision_row.supplier_phone END,
    'supplier_email', CASE WHEN requested_claim_id IS NULL THEN profile.email ELSE revision_row.supplier_email END,
    'supplier_bank_name', CASE WHEN requested_claim_id IS NULL THEN profile.bank_name ELSE revision_row.supplier_bank_name END,
    'supplier_bsb', CASE WHEN requested_claim_id IS NULL THEN profile.bsb ELSE revision_row.supplier_bsb END,
    'supplier_bank_account_name', CASE WHEN requested_claim_id IS NULL THEN profile.bank_account_name ELSE revision_row.supplier_bank_account_name END,
    'supplier_bank_account_number', CASE WHEN requested_claim_id IS NULL THEN profile.bank_account_number ELSE revision_row.supplier_bank_account_number END,
    'supplier_gst_rate', '0.10', 'supplier_timezone', 'Australia/Sydney',
    'supplier_default_payment_term_days', CASE WHEN requested_claim_id IS NULL THEN profile.default_payment_term_days ELSE revision_row.supplier_default_payment_term_days END,
    'recipient_name', CASE WHEN requested_claim_id IS NULL THEN series_row.recipient_name ELSE revision_row.recipient_name END,
    'recipient_company', CASE WHEN requested_claim_id IS NULL THEN series_row.recipient_company ELSE revision_row.recipient_company END,
    'recipient_address', CASE WHEN requested_claim_id IS NULL THEN series_row.recipient_address ELSE revision_row.recipient_address END,
    'recipient_email', CASE WHEN requested_claim_id IS NULL THEN series_row.recipient_email ELSE revision_row.recipient_email END,
    'recipient_phone', CASE WHEN requested_claim_id IS NULL THEN series_row.recipient_phone ELSE revision_row.recipient_phone END,
    'recipient_abn', CASE WHEN requested_claim_id IS NULL THEN series_row.recipient_abn ELSE revision_row.recipient_abn END,
    'site_name', CASE WHEN requested_claim_id IS NULL THEN series_row.site_name ELSE revision_row.site_name END,
    'site_address', CASE WHEN requested_claim_id IS NULL THEN series_row.site_address ELSE revision_row.site_address END
  ) || jsonb_build_object(
    'jobber_account_id', observation ->> 'jobber_account_id', 'jobber_invoice_id', observation ->> 'jobber_invoice_id',
    'original_jobber_invoice_number', observation ->> 'original_invoice_number',
    'observed_jobber_invoice_number', observation ->> 'observed_invoice_number',
    'base_contract_ex_gst', financial ->> 'base_contract_ex_gst',
    'approved_variations_ex_gst', financial ->> 'approved_variations_ex_gst',
    'approved_credits_ex_gst', financial ->> 'approved_credits_ex_gst',
    'approved_adjustments', financial -> 'approved_adjustments', 'previous_claims', financial -> 'previous_claims',
    'adjusted_contract_ex_gst', financial ->> 'adjusted_contract_ex_gst',
    'adjusted_contract_gst', financial ->> 'adjusted_contract_gst', 'adjusted_contract_inc_gst', financial ->> 'adjusted_contract_inc_gst',
    'previous_claims_ex_gst', financial ->> 'previous_claims_ex_gst', 'previous_claims_gst', financial ->> 'previous_claims_gst',
    'previous_claims_inc_gst', financial ->> 'previous_claims_inc_gst',
    'cumulative_target_ex_gst', financial ->> 'cumulative_target_ex_gst', 'cumulative_target_gst', financial ->> 'cumulative_target_gst',
    'cumulative_target_inc_gst', financial ->> 'cumulative_target_inc_gst',
    'current_claim_ex_gst', financial ->> 'current_claim_ex_gst', 'current_claim_gst', financial ->> 'current_claim_gst',
    'current_claim_inc_gst', financial ->> 'current_claim_inc_gst', 'cumulative_percentage', financial ->> 'cumulative_percentage',
    'remaining_ex_gst', financial ->> 'remaining_ex_gst', 'remaining_gst', financial ->> 'remaining_gst',
    'remaining_inc_gst', financial ->> 'remaining_inc_gst',
    'calculation_policy_version', 'progress-claim-v1',
    'financial_snapshot_hash', CASE WHEN requested_claim_id IS NULL THEN encode(extensions.digest(financial::TEXT, 'sha256'), 'hex') ELSE lower(revision_row.financial_snapshot_hash) END,
    'can_save', series_row.status IN ('draft', 'active') AND (requested_claim_id IS NULL OR claim_row.status = 'draft'),
    'can_issue', false
  );
END;
$$;

CREATE FUNCTION public.get_progress_claim_defaults(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor UUID := public.progress_require_actor(); series_id UUID;
BEGIN
  PERFORM public.progress_assert_jsonb_keys(payload, ARRAY['series_id']::TEXT[]);
  IF (SELECT count(*) FROM jsonb_object_keys(payload)) <> 1 OR jsonb_typeof(payload->'series_id') IS DISTINCT FROM 'string'
    OR payload->>'series_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE='23514'; END IF;
  series_id := (payload->>'series_id')::UUID;
  RETURN public.progress_claim_editor_dto(series_id, NULL);
END; $$;

CREATE FUNCTION public.get_progress_claim_editor(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor UUID := public.progress_require_actor(); claim_id UUID; series_id UUID;
BEGIN
  PERFORM public.progress_assert_jsonb_keys(payload, ARRAY['claim_id']::TEXT[]);
  IF (SELECT count(*) FROM jsonb_object_keys(payload)) <> 1 OR jsonb_typeof(payload->'claim_id') IS DISTINCT FROM 'string'
    OR payload->>'claim_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE='23514'; END IF;
  claim_id := (payload->>'claim_id')::UUID;
  SELECT row_value.series_id INTO series_id FROM public.progress_claims AS row_value WHERE row_value.id=claim_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN public.progress_claim_editor_dto(series_id, claim_id);
END; $$;

CREATE FUNCTION public.create_progress_claim_draft(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID := public.progress_require_actor(); series_row public.progress_invoice_series%ROWTYPE;
  profile public.business_invoice_profiles%ROWTYPE; claim_row public.progress_claims%ROWTYPE;
  revision_id UUID; series_id UUID; key UUID; expected_set UUID; expected_hash TEXT;
  expected_version INT; issue_date DATE; due_date DATE; kind_value TEXT; input_mode_value TEXT;
  authoritative_value TEXT; description_value TEXT; notes_value TEXT; financial JSONB; observation JSONB;
  fingerprint TEXT; replay JSONB; sequence_value INT; suffix_value TEXT; invoice_number TEXT; financial_hash TEXT; result_json JSONB;
BEGIN
  PERFORM public.progress_ledger_assert_payload(payload,
    ARRAY['series_id','kind','input_mode','authoritative_value','issue_date','due_date','description','notes','expected_series_version','expected_current_revision_set_id','expected_current_manifest_hash','correlation_key'],
    ARRAY['series_id','kind','input_mode','authoritative_value','issue_date','due_date','description','correlation_key'],
    ARRAY['expected_series_version'], ARRAY['notes','expected_current_revision_set_id','expected_current_manifest_hash']);
  IF (SELECT count(*) FROM jsonb_object_keys(payload)) <> 12
    OR payload->>'series_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    OR payload->>'correlation_key' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    OR (payload->>'expected_current_revision_set_id' IS NOT NULL AND payload->>'expected_current_revision_set_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')
    OR (payload->>'expected_current_manifest_hash' IS NOT NULL AND lower(payload->>'expected_current_manifest_hash') !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE='23514';
  END IF;
  series_id := (payload->>'series_id')::UUID; key := (payload->>'correlation_key')::UUID;
  expected_version := (payload->>'expected_series_version')::INT;
  expected_set := (payload->>'expected_current_revision_set_id')::UUID;
  expected_hash := lower(payload->>'expected_current_manifest_hash');
  kind_value := payload->>'kind'; input_mode_value := payload->>'input_mode'; authoritative_value := payload->>'authoritative_value';
  issue_date := public.progress_require_iso_date(payload->'issue_date'); due_date := public.progress_require_iso_date(payload->'due_date');
  IF due_date < issue_date THEN RAISE EXCEPTION 'PROGRESS_DUE_DATE_INVALID' USING ERRCODE='23514'; END IF;
  description_value := public.progress_claim_assert_text(payload->>'description', 1200, true);
  notes_value := public.progress_claim_assert_text(payload->>'notes', 2000, false);
  SELECT row_value.* INTO series_row FROM public.progress_invoice_series AS row_value WHERE row_value.id=series_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  fingerprint := public.progress_request_fingerprint(payload);
  replay := public.progress_lock_idempotency(series_row.id, 'create_progress_claim_draft', key, fingerprint);
  IF replay IS NOT NULL THEN
    SELECT result.response_snapshot INTO result_json FROM public.progress_claim_command_results AS result
    WHERE result.series_id=series_row.id AND result.command_name='create_progress_claim_draft' AND result.correlation_key=key;
    IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE='P0001'; END IF;
    RETURN result_json;
  END IF;
  IF expected_version <> series_row.version OR NOT public.progress_claim_assert_current_set(series_row, expected_set, expected_hash) THEN
    RETURN jsonb_build_object('conflict', true, 'current', public.progress_claim_editor_dto(series_row.id, NULL));
  END IF;
  IF series_row.status NOT IN ('draft','active') THEN RAISE EXCEPTION 'PROGRESS_SERIES_STATE_INVALID' USING ERRCODE='P0001'; END IF;
  IF NULLIF(btrim(series_row.accepted_numbering_base),'') IS NULL THEN RAISE EXCEPTION 'PROGRESS_NUMBERING_BASE_REQUIRED' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM public.progress_claims AS existing WHERE existing.series_id=series_row.id AND existing.kind='final') THEN
    RAISE EXCEPTION 'PROGRESS_FINAL_ALREADY_EXISTS' USING ERRCODE='23514';
  END IF;
  SELECT row_value.* INTO profile FROM public.business_invoice_profiles AS row_value ORDER BY row_value.created_at LIMIT 1 FOR SHARE;
  IF NOT FOUND OR NOT public.progress_claim_profile_ready(profile) THEN
    RAISE EXCEPTION 'PROGRESS_INVOICE_PROFILE_INVALID' USING ERRCODE='P0001';
  END IF;
  observation := public.progress_claim_source_observation(series_row);
  financial := public.progress_claim_financial_snapshot(series_row, kind_value, input_mode_value, authoritative_value);
  SELECT COALESCE(max(existing.sequence),0)+1 INTO sequence_value FROM public.progress_claims AS existing WHERE existing.series_id=series_row.id;
  suffix_value := CASE WHEN kind_value='final' THEN 'FINAL'
    WHEN sequence_value < 100 THEN 'P'||lpad(sequence_value::TEXT,2,'0')
    ELSE 'P'||sequence_value::TEXT END;
  invoice_number := btrim(series_row.accepted_numbering_base)||'-'||suffix_value;
  INSERT INTO public.progress_claims(series_id,sequence,kind,suffix,tax_invoice_number,status,created_by,updated_by)
  VALUES(series_row.id,sequence_value,kind_value,suffix_value,invoice_number,'draft',actor,actor) RETURNING * INTO claim_row;
  financial_hash := encode(extensions.digest(jsonb_build_object(
    'policy','progress-claim-v1','series_id',series_row.id,'claim_id',claim_row.id,'kind',kind_value,
    'input_mode',input_mode_value,'authoritative_value',authoritative_value,'financial',financial,
    'jobber_observation',observation
  )::TEXT,'sha256'),'hex');
  INSERT INTO public.progress_claim_revisions(
    claim_id,revision_number,state,input_mode,authoritative_cumulative_percentage,authoritative_current_claim_inc_gst,
    issue_date,due_date,description,notes,reference,
    supplier_profile_version,supplier_legal_name,supplier_trading_name,supplier_abn,supplier_contractor_licence,
    supplier_address,supplier_phone,supplier_email,supplier_bank_name,supplier_bsb,supplier_bank_account_name,supplier_bank_account_number,
    supplier_gst_rate,supplier_timezone,supplier_default_payment_term_days,
    recipient_name,recipient_company,recipient_address,recipient_email,recipient_phone,recipient_abn,site_name,site_address,
    jobber_account_id,jobber_invoice_id,original_jobber_invoice_number,observed_jobber_invoice_number,accepted_numbering_base,
    adjusted_contract_ex_gst,adjusted_contract_gst,adjusted_contract_inc_gst,approved_variations_ex_gst,approved_credits_ex_gst,
    previous_claims_ex_gst,previous_claims_gst,previous_claims_inc_gst,cumulative_target_ex_gst,cumulative_target_gst,cumulative_target_inc_gst,
    current_claim_ex_gst,current_claim_gst,current_claim_inc_gst,cumulative_percentage,remaining_ex_gst,remaining_gst,remaining_inc_gst,
    calculation_policy_version,edit_classification,financial_snapshot_hash,adjustment_snapshot,previous_claim_snapshot,
    jobber_observation_snapshot,calculation_snapshot,created_by
  ) VALUES(
    claim_row.id,1,'draft',input_mode_value,
    CASE WHEN input_mode_value='cumulative_percentage' THEN authoritative_value::NUMERIC ELSE NULL END,
    CASE WHEN input_mode_value='current_claim_amount' THEN authoritative_value::NUMERIC ELSE NULL END,
    issue_date,due_date,description_value,notes_value,series_row.reference,
    profile.version,profile.legal_name,profile.trading_name,profile.abn,profile.contractor_licence,
    profile.business_address,profile.phone,profile.email,profile.bank_name,profile.bsb,profile.bank_account_name,profile.bank_account_number,
    0.10,'Australia/Sydney',profile.default_payment_term_days,
    series_row.recipient_name,series_row.recipient_company,series_row.recipient_address,series_row.recipient_email,series_row.recipient_phone,series_row.recipient_abn,
    series_row.site_name,series_row.site_address,
    observation->>'jobber_account_id',observation->>'jobber_invoice_id',observation->>'original_invoice_number',observation->>'observed_invoice_number',series_row.accepted_numbering_base,
    (financial->>'adjusted_contract_ex_gst')::NUMERIC,(financial->>'adjusted_contract_gst')::NUMERIC,(financial->>'adjusted_contract_inc_gst')::NUMERIC,
    (financial->>'approved_variations_ex_gst')::NUMERIC,(financial->>'approved_credits_ex_gst')::NUMERIC,
    (financial->>'previous_claims_ex_gst')::NUMERIC,(financial->>'previous_claims_gst')::NUMERIC,(financial->>'previous_claims_inc_gst')::NUMERIC,
    (financial->>'cumulative_target_ex_gst')::NUMERIC,(financial->>'cumulative_target_gst')::NUMERIC,(financial->>'cumulative_target_inc_gst')::NUMERIC,
    (financial->>'current_claim_ex_gst')::NUMERIC,(financial->>'current_claim_gst')::NUMERIC,(financial->>'current_claim_inc_gst')::NUMERIC,
    (financial->>'cumulative_percentage')::NUMERIC,(financial->>'remaining_ex_gst')::NUMERIC,(financial->>'remaining_gst')::NUMERIC,(financial->>'remaining_inc_gst')::NUMERIC,
    'progress-claim-v1','financial_tax_affecting',financial_hash,financial->'approved_adjustments',financial->'previous_claims',observation,financial,actor
  ) RETURNING id INTO revision_id;
  UPDATE public.progress_claims SET current_revision_id=revision_id WHERE id=claim_row.id;
  UPDATE public.progress_invoice_series SET version=version+1,updated_by=actor,updated_at=now(),
    jobber_link_locked_at=CASE WHEN source_type='manual' THEN jobber_link_locked_at ELSE COALESCE(jobber_link_locked_at,now()) END
  WHERE id=series_row.id RETURNING * INTO series_row;
  PERFORM public.progress_append_event(series_row.id,claim_row.id,'progress_claim_draft_created','user',NULL,revision_id,
    jsonb_build_object('suffix',suffix_value,'kind',kind_value,'input_mode',input_mode_value,'issue_date',issue_date,'due_date',due_date),
    'create_progress_claim_draft',key,fingerprint,jsonb_build_object('claim_id',claim_row.id,'revision_id',revision_id));
  result_json:=public.progress_claim_editor_dto(series_row.id,claim_row.id);
  INSERT INTO public.progress_claim_command_results(series_id,command_name,correlation_key,response_snapshot)
  VALUES(series_row.id,'create_progress_claim_draft',key,result_json);
  RETURN result_json;
END;
$$;

CREATE FUNCTION public.save_progress_claim_draft(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID := public.progress_require_actor(); series_row public.progress_invoice_series%ROWTYPE;
  claim_row public.progress_claims%ROWTYPE; revision_row public.progress_claim_revisions%ROWTYPE;
  claim_id UUID; owning_series_id UUID; key UUID; expected_set UUID; expected_hash TEXT;
  expected_claim_version INT; expected_series_version INT; issue_date_value DATE; due_date_value DATE;
  input_mode_value TEXT; authoritative_value TEXT; description_value TEXT; notes_value TEXT;
  financial JSONB; fingerprint TEXT; replay JSONB; financial_hash TEXT; result_json JSONB;
BEGIN
  PERFORM public.progress_ledger_assert_payload(payload,
    ARRAY['claim_id','expected_claim_version','expected_series_version','expected_current_revision_set_id','expected_current_manifest_hash','input_mode','authoritative_value','issue_date','due_date','description','notes','correlation_key'],
    ARRAY['claim_id','input_mode','authoritative_value','issue_date','due_date','description','correlation_key'],
    ARRAY['expected_claim_version','expected_series_version'],ARRAY['expected_current_revision_set_id','expected_current_manifest_hash','notes']);
  IF (SELECT count(*) FROM jsonb_object_keys(payload)) <> 12
    OR payload->>'claim_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    OR payload->>'correlation_key' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    OR (payload->>'expected_current_revision_set_id' IS NOT NULL AND payload->>'expected_current_revision_set_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')
    OR (payload->>'expected_current_manifest_hash' IS NOT NULL AND lower(payload->>'expected_current_manifest_hash') !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE='23514';
  END IF;
  claim_id := (payload->>'claim_id')::UUID; key := (payload->>'correlation_key')::UUID;
  SELECT row_value.series_id INTO owning_series_id FROM public.progress_claims AS row_value WHERE row_value.id=claim_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  SELECT row_value.* INTO series_row FROM public.progress_invoice_series AS row_value WHERE row_value.id=owning_series_id FOR UPDATE;
  SELECT row_value.* INTO claim_row FROM public.progress_claims AS row_value WHERE row_value.id=claim_id AND row_value.series_id=owning_series_id FOR UPDATE;
  fingerprint := public.progress_request_fingerprint(payload);
  replay := public.progress_lock_idempotency(series_row.id,'save_progress_claim_draft',key,fingerprint);
  IF replay IS NOT NULL THEN
    SELECT result.response_snapshot INTO result_json FROM public.progress_claim_command_results AS result
    WHERE result.series_id=series_row.id AND result.command_name='save_progress_claim_draft' AND result.correlation_key=key;
    IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE='P0001'; END IF;
    RETURN result_json;
  END IF;
  expected_claim_version := (payload->>'expected_claim_version')::INT; expected_series_version := (payload->>'expected_series_version')::INT;
  expected_set := (payload->>'expected_current_revision_set_id')::UUID; expected_hash := lower(payload->>'expected_current_manifest_hash');
  IF expected_claim_version <> claim_row.version OR expected_series_version <> series_row.version
    OR NOT public.progress_claim_assert_current_set(series_row,expected_set,expected_hash) THEN
    RETURN jsonb_build_object('conflict',true,'current',public.progress_claim_editor_dto(series_row.id,claim_row.id));
  END IF;
  IF series_row.status NOT IN ('draft','active') OR claim_row.status <> 'draft' THEN
    RAISE EXCEPTION 'PROGRESS_CLAIM_NOT_DRAFT' USING ERRCODE='P0001';
  END IF;
  SELECT row_value.* INTO revision_row FROM public.progress_claim_revisions AS row_value
  WHERE row_value.id=claim_row.current_revision_id AND row_value.claim_id=claim_row.id
    AND row_value.revision_number=1 AND row_value.state='draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_CLAIM_NOT_DRAFT' USING ERRCODE='P0001'; END IF;
  input_mode_value:=payload->>'input_mode'; authoritative_value:=payload->>'authoritative_value';
  issue_date_value:=public.progress_require_iso_date(payload->'issue_date'); due_date_value:=public.progress_require_iso_date(payload->'due_date');
  IF due_date_value<issue_date_value THEN RAISE EXCEPTION 'PROGRESS_DUE_DATE_INVALID' USING ERRCODE='23514'; END IF;
  description_value:=public.progress_claim_assert_text(payload->>'description',1200,true);
  notes_value:=public.progress_claim_assert_text(payload->>'notes',2000,false);
  financial:=public.progress_claim_financial_snapshot(series_row,claim_row.kind,input_mode_value,authoritative_value);
  financial_hash:=encode(extensions.digest(jsonb_build_object(
    'policy','progress-claim-v1','series_id',series_row.id,'claim_id',claim_row.id,'kind',claim_row.kind,
    'input_mode',input_mode_value,'authoritative_value',authoritative_value,'financial',financial,
    'jobber_observation',revision_row.jobber_observation_snapshot
  )::TEXT,'sha256'),'hex');
  UPDATE public.progress_claim_revisions SET
    input_mode=input_mode_value,
    authoritative_cumulative_percentage=CASE WHEN input_mode_value='cumulative_percentage' THEN authoritative_value::NUMERIC ELSE NULL END,
    authoritative_current_claim_inc_gst=CASE WHEN input_mode_value='current_claim_amount' THEN authoritative_value::NUMERIC ELSE NULL END,
    issue_date=issue_date_value,due_date=due_date_value,
    description=description_value,notes=notes_value,
    adjusted_contract_ex_gst=(financial->>'adjusted_contract_ex_gst')::NUMERIC,
    adjusted_contract_gst=(financial->>'adjusted_contract_gst')::NUMERIC,adjusted_contract_inc_gst=(financial->>'adjusted_contract_inc_gst')::NUMERIC,
    approved_variations_ex_gst=(financial->>'approved_variations_ex_gst')::NUMERIC,approved_credits_ex_gst=(financial->>'approved_credits_ex_gst')::NUMERIC,
    previous_claims_ex_gst=(financial->>'previous_claims_ex_gst')::NUMERIC,previous_claims_gst=(financial->>'previous_claims_gst')::NUMERIC,previous_claims_inc_gst=(financial->>'previous_claims_inc_gst')::NUMERIC,
    cumulative_target_ex_gst=(financial->>'cumulative_target_ex_gst')::NUMERIC,cumulative_target_gst=(financial->>'cumulative_target_gst')::NUMERIC,cumulative_target_inc_gst=(financial->>'cumulative_target_inc_gst')::NUMERIC,
    current_claim_ex_gst=(financial->>'current_claim_ex_gst')::NUMERIC,current_claim_gst=(financial->>'current_claim_gst')::NUMERIC,current_claim_inc_gst=(financial->>'current_claim_inc_gst')::NUMERIC,
    cumulative_percentage=(financial->>'cumulative_percentage')::NUMERIC,
    remaining_ex_gst=(financial->>'remaining_ex_gst')::NUMERIC,remaining_gst=(financial->>'remaining_gst')::NUMERIC,remaining_inc_gst=(financial->>'remaining_inc_gst')::NUMERIC,
    financial_snapshot_hash=financial_hash,adjustment_snapshot=financial->'approved_adjustments',previous_claim_snapshot=financial->'previous_claims',calculation_snapshot=financial
  WHERE id=revision_row.id;
  UPDATE public.progress_claims SET version=version+1,updated_by=actor,updated_at=now() WHERE id=claim_row.id RETURNING * INTO claim_row;
  UPDATE public.progress_invoice_series SET version=version+1,updated_by=actor,updated_at=now() WHERE id=series_row.id RETURNING * INTO series_row;
  PERFORM public.progress_append_event(series_row.id,claim_row.id,'progress_claim_draft_saved','user',revision_row.id,revision_row.id,
    jsonb_build_object('input_mode',input_mode_value,'issue_date',issue_date_value,'due_date',due_date_value),
    'save_progress_claim_draft',key,fingerprint,jsonb_build_object('claim_id',claim_row.id,'revision_id',revision_row.id));
  result_json:=public.progress_claim_editor_dto(series_row.id,claim_row.id);
  INSERT INTO public.progress_claim_command_results(series_id,command_name,correlation_key,response_snapshot)
  VALUES(series_row.id,'save_progress_claim_draft',key,result_json);
  RETURN result_json;
END;
$$;

ALTER FUNCTION public.get_progress_invoice_workspace(JSONB) RENAME TO progress_get_invoice_workspace_before_claim_drafts;
REVOKE ALL ON FUNCTION public.progress_get_invoice_workspace_before_claim_drafts(JSONB) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_progress_invoice_workspace(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE base JSONB; patched_claims JSONB;
BEGIN
  PERFORM public.progress_require_actor();
  base:=public.progress_get_invoice_workspace_before_claim_drafts(payload);
  IF base->'series'='null'::JSONB THEN RETURN base; END IF;
  SELECT COALESCE(jsonb_agg(CASE WHEN item.value->>'status'='draft' THEN
    jsonb_set(item.value,'{current_revision}',jsonb_build_object(
      'id',revision.id,'revision_number',revision.revision_number,'state',revision.state,
      'issue_date',revision.issue_date,'due_date',revision.due_date,'description',revision.description,'reference',revision.reference,
      'current_claim_ex_gst',public.progress_claim_money(revision.current_claim_ex_gst),
      'current_claim_gst',public.progress_claim_money(revision.current_claim_gst),
      'current_claim_inc_gst',public.progress_claim_money(revision.current_claim_inc_gst),
      'cumulative_percentage',public.progress_claim_percentage(revision.cumulative_percentage),
      'remaining_ex_gst',public.progress_claim_money(revision.remaining_ex_gst),
      'remaining_gst',public.progress_claim_money(revision.remaining_gst),
      'remaining_inc_gst',public.progress_claim_money(revision.remaining_inc_gst),
      'edit_classification',revision.edit_classification,'tax_review_state',revision.tax_review_state,'created_at',revision.created_at
    )) ELSE item.value END ORDER BY item.ordinal),'[]'::JSONB)
  INTO patched_claims
  FROM jsonb_array_elements(base->'claims') WITH ORDINALITY AS item(value,ordinal)
  LEFT JOIN public.progress_claims AS claim ON claim.id=(item.value->>'id')::UUID AND claim.status='draft'
  LEFT JOIN public.progress_claim_revisions AS revision ON revision.id=claim.current_revision_id AND revision.claim_id=claim.id AND revision.state='draft';
  RETURN jsonb_set(base,'{claims}',patched_claims);
END;
$$;

ALTER FUNCTION public.progress_claim_money(NUMERIC) OWNER TO postgres;
ALTER FUNCTION public.progress_claim_percentage(NUMERIC) OWNER TO postgres;
ALTER FUNCTION public.progress_claim_assert_text(TEXT,INT,BOOLEAN) OWNER TO postgres;
ALTER FUNCTION public.progress_claim_profile_ready(public.business_invoice_profiles) OWNER TO postgres;
ALTER FUNCTION public.progress_claim_assert_current_set(public.progress_invoice_series,UUID,TEXT) OWNER TO postgres;
ALTER FUNCTION public.progress_claim_source_observation(public.progress_invoice_series) OWNER TO postgres;
ALTER FUNCTION public.progress_claim_financial_snapshot(public.progress_invoice_series,TEXT,TEXT,TEXT) OWNER TO postgres;
ALTER FUNCTION public.progress_claim_defaults_snapshot(public.progress_invoice_series) OWNER TO postgres;
ALTER FUNCTION public.progress_claim_editor_dto(UUID,UUID) OWNER TO postgres;
ALTER FUNCTION public.get_progress_claim_defaults(JSONB) OWNER TO postgres;
ALTER FUNCTION public.get_progress_claim_editor(JSONB) OWNER TO postgres;
ALTER FUNCTION public.create_progress_claim_draft(JSONB) OWNER TO postgres;
ALTER FUNCTION public.save_progress_claim_draft(JSONB) OWNER TO postgres;
ALTER FUNCTION public.get_progress_invoice_workspace(JSONB) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.progress_claim_money(NUMERIC) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.progress_claim_percentage(NUMERIC) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.progress_claim_assert_text(TEXT,INT,BOOLEAN) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.progress_claim_profile_ready(public.business_invoice_profiles) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.progress_claim_assert_current_set(public.progress_invoice_series,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.progress_claim_source_observation(public.progress_invoice_series) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.progress_claim_financial_snapshot(public.progress_invoice_series,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.progress_claim_defaults_snapshot(public.progress_invoice_series) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.progress_claim_editor_dto(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_progress_claim_defaults(JSONB) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.get_progress_claim_editor(JSONB) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.create_progress_claim_draft(JSONB) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.save_progress_claim_draft(JSONB) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.get_progress_invoice_workspace(JSONB) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_progress_claim_defaults(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_progress_claim_editor(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_progress_claim_draft(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_progress_claim_draft(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_progress_invoice_workspace(JSONB) TO authenticated;
