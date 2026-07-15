CREATE TABLE public.business_invoice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  trading_name TEXT NOT NULL,
  abn TEXT NOT NULL CHECK (abn ~ '^[0-9]{11}$'),
  contractor_licence TEXT NOT NULL,
  business_address TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  bsb TEXT NOT NULL,
  bank_account_name TEXT NOT NULL,
  bank_account_number TEXT NOT NULL,
  gst_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1000 CHECK (gst_rate = 0.1000),
  business_timezone TEXT NOT NULL DEFAULT 'Australia/Sydney'
    CHECK (business_timezone = 'Australia/Sydney'),
  default_payment_term_days INT NOT NULL DEFAULT 14
    CHECK (default_payment_term_days BETWEEN 0 AND 365),
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_business_invoice_profiles_singleton
  ON public.business_invoice_profiles ((true));

CREATE TABLE public.progress_invoice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL UNIQUE CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'failed', 'superseded')),
  source_evidence_path TEXT NOT NULL,
  source_byte_length INT NOT NULL CHECK (source_byte_length > 0),
  source_sha256 CHAR(64) NOT NULL CHECK (source_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  normalized_master_path TEXT NOT NULL,
  normalized_sha256 CHAR(64) NOT NULL CHECK (normalized_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  logo_sha256 CHAR(64) NOT NULL CHECK (logo_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  manifest_version TEXT NOT NULL,
  cell_map_version TEXT NOT NULL,
  page_layout_version TEXT NOT NULL,
  font_version TEXT NOT NULL,
  font_regular_sha256 CHAR(64) NOT NULL CHECK (font_regular_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  font_bold_sha256 CHAR(64) NOT NULL CHECK (font_bold_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  manifest JSONB NOT NULL
    CHECK (jsonb_typeof(manifest) = 'object' AND pg_column_size(manifest) <= 131072),
  registered_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  activated_at TIMESTAMPTZ,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (status = 'pending' AND activated_at IS NULL AND failure_code IS NULL)
    OR (status = 'active' AND activated_at IS NOT NULL AND failure_code IS NULL)
    OR (status = 'failed' AND activated_at IS NULL AND length(btrim(failure_code)) > 0)
    OR (status = 'superseded' AND activated_at IS NOT NULL AND failure_code IS NULL)
  ),
  UNIQUE (id, version)
);

CREATE UNIQUE INDEX uq_progress_invoice_templates_active
  ON public.progress_invoice_templates (status)
  WHERE status = 'active';

CREATE TABLE public.progress_invoice_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('pbc_quote', 'jobber_job', 'jobber_invoice')),
  jobber_account_id TEXT,
  jobber_invoice_id TEXT,
  selected_jobber_job_id TEXT,
  jobber_client_id TEXT,
  selected_jobber_property_id TEXT,
  original_jobber_invoice_number TEXT,
  accepted_numbering_base TEXT,
  jobber_link_locked_at TIMESTAMPTZ,
  current_jobber_snapshot_id UUID,
  current_revision_set_id UUID,
  base_contract_ex_gst NUMERIC(14,2) NOT NULL CHECK (base_contract_ex_gst > 0),
  gst_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1000 CHECK (gst_rate = 0.1000),
  recipient_name TEXT NOT NULL,
  recipient_company TEXT,
  recipient_address TEXT NOT NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  recipient_abn TEXT CHECK (recipient_abn IS NULL OR recipient_abn ~ '^[0-9]{11}$'),
  site_name TEXT NOT NULL,
  site_address TEXT NOT NULL,
  default_description TEXT NOT NULL,
  reference TEXT,
  last_jobber_sync_attempt_at TIMESTAMPTZ,
  last_successful_jobber_sync_at TIMESTAMPTZ,
  last_jobber_sync_error_code TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'completed', 'reconciliation_required', 'void')),
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  current_adjusted_contract_ex_gst NUMERIC(14,2) NOT NULL DEFAULT 0
    CHECK (current_adjusted_contract_ex_gst >= 0),
  current_adjusted_contract_gst NUMERIC(14,2) NOT NULL DEFAULT 0
    CHECK (current_adjusted_contract_gst >= 0),
  current_adjusted_contract_inc_gst NUMERIC(14,2) NOT NULL DEFAULT 0
    CHECK (current_adjusted_contract_inc_gst >= 0),
  current_claimed_ex_gst NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (current_claimed_ex_gst >= 0),
  current_claimed_gst NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (current_claimed_gst >= 0),
  current_claimed_inc_gst NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (current_claimed_inc_gst >= 0),
  current_actual_receipts NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_outstanding_receivable NUMERIC(14,2) NOT NULL DEFAULT 0
    CHECK (current_outstanding_receivable >= 0),
  current_credit_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (current_credit_balance >= 0),
  current_unclaimed_ex_gst NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (current_unclaimed_ex_gst >= 0),
  current_unclaimed_gst NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (current_unclaimed_gst >= 0),
  current_unclaimed_inc_gst NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (current_unclaimed_inc_gst >= 0),
  current_cumulative_percentage NUMERIC(9,6) NOT NULL DEFAULT 0
    CHECK (current_cumulative_percentage BETWEEN 0 AND 100),
  current_payment_state TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (current_payment_state IN ('unpaid', 'part_paid', 'paid', 'overdue', 'credit_balance')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (jobber_account_id IS NULL AND jobber_invoice_id IS NULL)
    OR (jobber_account_id IS NOT NULL AND jobber_invoice_id IS NOT NULL)
  ),
  CHECK (accepted_numbering_base IS NULL OR jobber_invoice_id IS NOT NULL)
);

CREATE UNIQUE INDEX uq_progress_invoice_series_jobber_identity
  ON public.progress_invoice_series (jobber_account_id, jobber_invoice_id)
  WHERE jobber_account_id IS NOT NULL
    AND jobber_invoice_id IS NOT NULL
    AND status <> 'void';

CREATE INDEX idx_progress_invoice_series_quote
  ON public.progress_invoice_series (quote_id)
  WHERE quote_id IS NOT NULL;

CREATE INDEX idx_progress_invoice_series_status
  ON public.progress_invoice_series (status, updated_at DESC);

CREATE TABLE public.progress_jobber_invoice_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.progress_invoice_series(id) ON DELETE RESTRICT,
  schema_version INT NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  jobber_account_id TEXT NOT NULL,
  jobber_invoice_id TEXT NOT NULL,
  selected_jobber_job_id TEXT,
  jobber_client_id TEXT NOT NULL,
  selected_jobber_property_id TEXT,
  original_invoice_number TEXT NOT NULL,
  observed_invoice_number TEXT NOT NULL,
  raw_status TEXT NOT NULL,
  normalized_status TEXT NOT NULL
    CHECK (normalized_status IN ('draft', 'awaiting_payment', 'part_paid', 'paid', 'past_due', 'unknown')),
  jobber_web_uri TEXT NOT NULL,
  invoice_subtotal NUMERIC(14,2),
  invoice_tax NUMERIC(14,2),
  invoice_total NUMERIC(14,2),
  invoice_balance NUMERIC(14,2),
  issued_date DATE,
  due_date DATE,
  received_date DATE,
  external_updated_at TIMESTAMPTZ,
  client_name TEXT NOT NULL,
  client_company_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  billing_address TEXT,
  property_address TEXT,
  jobber_job_ids JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(jobber_job_ids) = 'array' AND pg_column_size(jobber_job_ids) <= 16384),
  jobber_property_ids JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(jobber_property_ids) = 'array' AND pg_column_size(jobber_property_ids) <= 16384),
  site_candidates JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(site_candidates) = 'array' AND pg_column_size(site_candidates) <= 32768),
  effective_graphql_version TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  response_fingerprint CHAR(64) NOT NULL CHECK (response_fingerprint ~ '^[0-9A-Fa-f]{64}$'),
  normalization_warnings JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(normalization_warnings) = 'array' AND pg_column_size(normalization_warnings) <= 16384),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (invoice_subtotal IS NULL OR invoice_subtotal >= 0),
  CHECK (invoice_tax IS NULL OR invoice_tax >= 0),
  CHECK (invoice_total IS NULL OR invoice_total >= 0),
  UNIQUE (id, series_id)
);

CREATE INDEX idx_progress_jobber_snapshots_series
  ON public.progress_jobber_invoice_snapshots (series_id, fetched_at DESC);

CREATE TABLE public.progress_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.progress_invoice_series(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('variation', 'credit')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'rejected', 'superseded', 'void')),
  effective_date DATE NOT NULL,
  display_order INT NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  description TEXT NOT NULL,
  amount_ex_gst NUMERIC(14,2) NOT NULL CHECK (amount_ex_gst > 0),
  gst_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1000 CHECK (gst_rate = 0.1000),
  superseded_adjustment_id UUID REFERENCES public.progress_adjustments(id) ON DELETE RESTRICT,
  reason TEXT,
  quote_item_id UUID REFERENCES public.quote_items(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (superseded_adjustment_id IS NULL OR superseded_adjustment_id <> id),
  CHECK (superseded_adjustment_id IS NULL OR length(btrim(reason)) > 0),
  CHECK (status <> 'superseded' OR length(btrim(reason)) > 0)
);

CREATE INDEX idx_progress_adjustments_series
  ON public.progress_adjustments (series_id, effective_date, display_order);

CREATE TABLE public.progress_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.progress_invoice_series(id) ON DELETE RESTRICT,
  sequence INT NOT NULL CHECK (sequence > 0),
  kind TEXT NOT NULL CHECK (kind IN ('progress', 'final')),
  suffix TEXT NOT NULL,
  tax_invoice_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'void')),
  current_revision_id UUID,
  original_issued_at TIMESTAMPTZ,
  latest_revised_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (series_id, sequence),
  UNIQUE (series_id, suffix),
  CHECK (
    (kind = 'progress' AND suffix ~ '^P[0-9]{2,}$')
    OR (kind = 'final' AND suffix = 'FINAL')
  ),
  CHECK (status <> 'issued' OR original_issued_at IS NOT NULL)
);

CREATE UNIQUE INDEX uq_progress_claims_non_void_final
  ON public.progress_claims (series_id)
  WHERE kind = 'final' AND status <> 'void';

CREATE INDEX idx_progress_claims_series
  ON public.progress_claims (series_id, sequence);

CREATE TABLE public.progress_claim_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.progress_claims(id) ON DELETE RESTRICT,
  revision_number INT NOT NULL CHECK (revision_number > 0),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'issued', 'superseded')),
  input_mode TEXT NOT NULL CHECK (input_mode IN ('cumulative_percentage', 'current_claim_amount')),
  authoritative_cumulative_percentage NUMERIC(9,6),
  authoritative_current_claim_inc_gst NUMERIC(14,2),
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  description TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  reference TEXT,
  supplier_profile_version INT NOT NULL CHECK (supplier_profile_version > 0),
  supplier_legal_name TEXT NOT NULL,
  supplier_trading_name TEXT NOT NULL,
  supplier_abn TEXT NOT NULL CHECK (supplier_abn ~ '^[0-9]{11}$'),
  supplier_contractor_licence TEXT NOT NULL,
  supplier_address TEXT NOT NULL,
  supplier_phone TEXT NOT NULL,
  supplier_email TEXT NOT NULL,
  supplier_bank_name TEXT NOT NULL,
  supplier_bsb TEXT NOT NULL,
  supplier_bank_account_name TEXT NOT NULL,
  supplier_bank_account_number TEXT NOT NULL,
  supplier_gst_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1000 CHECK (supplier_gst_rate = 0.1000),
  supplier_timezone TEXT NOT NULL DEFAULT 'Australia/Sydney'
    CHECK (supplier_timezone = 'Australia/Sydney'),
  supplier_default_payment_term_days INT NOT NULL
    CHECK (supplier_default_payment_term_days BETWEEN 0 AND 365),
  recipient_name TEXT NOT NULL,
  recipient_company TEXT,
  recipient_address TEXT NOT NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  recipient_abn TEXT CHECK (recipient_abn IS NULL OR recipient_abn ~ '^[0-9]{11}$'),
  site_name TEXT NOT NULL,
  site_address TEXT NOT NULL,
  jobber_account_id TEXT NOT NULL,
  jobber_invoice_id TEXT NOT NULL,
  original_jobber_invoice_number TEXT NOT NULL,
  observed_jobber_invoice_number TEXT NOT NULL,
  accepted_numbering_base TEXT NOT NULL,
  adjusted_contract_ex_gst NUMERIC(14,2) NOT NULL,
  adjusted_contract_gst NUMERIC(14,2) NOT NULL,
  adjusted_contract_inc_gst NUMERIC(14,2) NOT NULL,
  approved_variations_ex_gst NUMERIC(14,2) NOT NULL DEFAULT 0,
  approved_credits_ex_gst NUMERIC(14,2) NOT NULL DEFAULT 0,
  previous_claims_ex_gst NUMERIC(14,2) NOT NULL DEFAULT 0,
  previous_claims_gst NUMERIC(14,2) NOT NULL DEFAULT 0,
  previous_claims_inc_gst NUMERIC(14,2) NOT NULL DEFAULT 0,
  cumulative_target_ex_gst NUMERIC(14,2) NOT NULL,
  cumulative_target_gst NUMERIC(14,2) NOT NULL,
  cumulative_target_inc_gst NUMERIC(14,2) NOT NULL,
  current_claim_ex_gst NUMERIC(14,2) NOT NULL,
  current_claim_gst NUMERIC(14,2) NOT NULL,
  current_claim_inc_gst NUMERIC(14,2) NOT NULL,
  cumulative_percentage NUMERIC(9,6) NOT NULL CHECK (cumulative_percentage > 0 AND cumulative_percentage <= 100),
  remaining_ex_gst NUMERIC(14,2) NOT NULL,
  remaining_gst NUMERIC(14,2) NOT NULL,
  remaining_inc_gst NUMERIC(14,2) NOT NULL,
  calculation_policy_version TEXT NOT NULL,
  template_id UUID,
  template_version INT CHECK (template_version IS NULL OR template_version > 0),
  edit_classification TEXT NOT NULL
    CHECK (edit_classification IN ('clerical', 'financial_tax_affecting')),
  financial_snapshot_hash CHAR(64) NOT NULL CHECK (financial_snapshot_hash ~ '^[0-9A-Fa-f]{64}$'),
  predecessor_financial_manifest_hash CHAR(64)
    CHECK (
      predecessor_financial_manifest_hash IS NULL
      OR predecessor_financial_manifest_hash ~ '^[0-9A-Fa-f]{64}$'
    ),
  tax_review_state TEXT NOT NULL DEFAULT 'not_required'
    CHECK (
      tax_review_state IN (
        'not_required',
        'pending',
        'approved',
        'external_reference_required',
        'external_reference_recorded'
      )
    ),
  tax_review_external_reference TEXT,
  adjustment_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(adjustment_snapshot) = 'array' AND pg_column_size(adjustment_snapshot) <= 131072),
  revision_reason TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (claim_id, revision_number),
  UNIQUE (id, claim_id),
  CONSTRAINT fk_progress_claim_revisions_template
    FOREIGN KEY (template_id, template_version)
    REFERENCES public.progress_invoice_templates(id, version)
    MATCH FULL
    ON DELETE RESTRICT,
  CHECK (due_date >= issue_date),
  CHECK (
    state = 'draft'
    OR (template_id IS NOT NULL AND template_version IS NOT NULL)
  ),
  CHECK (
    (
      input_mode = 'cumulative_percentage'
      AND authoritative_cumulative_percentage IS NOT NULL
      AND authoritative_current_claim_inc_gst IS NULL
      AND authoritative_cumulative_percentage > 0
      AND authoritative_cumulative_percentage <= 100
    )
    OR (
      input_mode = 'current_claim_amount'
      AND authoritative_cumulative_percentage IS NULL
      AND authoritative_current_claim_inc_gst IS NOT NULL
      AND authoritative_current_claim_inc_gst > 0
    )
  ),
  CHECK (adjusted_contract_ex_gst >= 0 AND adjusted_contract_gst >= 0 AND adjusted_contract_inc_gst >= 0),
  CHECK (approved_variations_ex_gst >= 0 AND approved_credits_ex_gst >= 0),
  CHECK (previous_claims_ex_gst >= 0 AND previous_claims_gst >= 0 AND previous_claims_inc_gst >= 0),
  CHECK (cumulative_target_ex_gst >= 0 AND cumulative_target_gst >= 0 AND cumulative_target_inc_gst >= 0),
  CHECK (current_claim_ex_gst >= 0 AND current_claim_gst >= 0 AND current_claim_inc_gst >= 0),
  CHECK (remaining_ex_gst >= 0 AND remaining_gst >= 0 AND remaining_inc_gst >= 0),
  CHECK (adjusted_contract_ex_gst + adjusted_contract_gst = adjusted_contract_inc_gst),
  CHECK (previous_claims_ex_gst + previous_claims_gst = previous_claims_inc_gst),
  CHECK (cumulative_target_ex_gst + cumulative_target_gst = cumulative_target_inc_gst),
  CHECK (current_claim_ex_gst + current_claim_gst = current_claim_inc_gst),
  CHECK (remaining_ex_gst + remaining_gst = remaining_inc_gst),
  CHECK (
    (tax_review_state NOT IN ('external_reference_required', 'external_reference_recorded'))
    OR length(btrim(tax_review_external_reference)) > 0
  )
);

CREATE INDEX idx_progress_claim_revisions_claim
  ON public.progress_claim_revisions (claim_id, revision_number DESC);

CREATE TABLE public.progress_invoice_revision_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.progress_invoice_series(id) ON DELETE RESTRICT,
  set_number INT NOT NULL CHECK (set_number > 0),
  predecessor_set_id UUID,
  revision_manifest JSONB NOT NULL
    CHECK (jsonb_typeof(revision_manifest) = 'array' AND pg_column_size(revision_manifest) <= 262144),
  state TEXT NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft', 'generating', 'ready', 'current', 'superseded', 'failed')),
  aggregate_financial_manifest_hash CHAR(64) NOT NULL
    CHECK (aggregate_financial_manifest_hash ~ '^[0-9A-Fa-f]{64}$'),
  requires_financial_cascade BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason TEXT,
  publication_correlation_key UUID,
  generation_started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (series_id, set_number),
  UNIQUE (id, series_id),
  CONSTRAINT fk_progress_revision_sets_predecessor_parent
    FOREIGN KEY (predecessor_set_id, series_id)
    REFERENCES public.progress_invoice_revision_sets(id, series_id)
    ON DELETE RESTRICT,
  CHECK (predecessor_set_id IS NULL OR predecessor_set_id <> id),
  CHECK (state <> 'current' OR published_at IS NOT NULL),
  CHECK (state <> 'failed' OR (failed_at IS NOT NULL AND length(btrim(failure_code)) > 0))
);

CREATE UNIQUE INDEX uq_progress_revision_sets_current
  ON public.progress_invoice_revision_sets (series_id)
  WHERE state = 'current';

CREATE INDEX idx_progress_revision_sets_series
  ON public.progress_invoice_revision_sets (series_id, set_number DESC);

CREATE TABLE public.progress_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.progress_invoice_series(id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK (source IN ('jobber', 'manual')),
  jobber_payment_id TEXT,
  current_revision_id UUID,
  matched_manual_payment_id UUID,
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, series_id),
  CONSTRAINT fk_progress_payments_matched_manual_parent
    FOREIGN KEY (matched_manual_payment_id, series_id)
    REFERENCES public.progress_payments(id, series_id)
    ON DELETE RESTRICT,
  CHECK (
    (source = 'jobber' AND jobber_payment_id IS NOT NULL)
    OR (source = 'manual' AND jobber_payment_id IS NULL)
  ),
  CHECK (matched_manual_payment_id IS NULL OR source = 'jobber'),
  CHECK (matched_manual_payment_id IS NULL OR matched_manual_payment_id <> id)
);

CREATE UNIQUE INDEX uq_progress_payments_jobber_identity
  ON public.progress_payments (series_id, jobber_payment_id)
  WHERE source = 'jobber' AND jobber_payment_id IS NOT NULL;

CREATE UNIQUE INDEX uq_progress_payments_matched_manual
  ON public.progress_payments (matched_manual_payment_id)
  WHERE matched_manual_payment_id IS NOT NULL;

CREATE INDEX idx_progress_payments_series
  ON public.progress_payments (series_id, created_at);

CREATE TABLE public.progress_payment_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.progress_payments(id) ON DELETE RESTRICT,
  revision_number INT NOT NULL CHECK (revision_number > 0),
  received_date DATE NOT NULL,
  observed_amount NUMERIC(14,2) NOT NULL CHECK (observed_amount >= 0),
  effective_receipt_amount NUMERIC(14,2) NOT NULL,
  payment_method TEXT,
  reference TEXT,
  external_status TEXT,
  external_updated_at TIMESTAMPTZ,
  sync_state TEXT
    CHECK (
      sync_state IS NULL
      OR sync_state IN ('manual', 'observed', 'changed', 'disappeared', 'refunded', 'reversed', 'ambiguous')
    ),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'unconfirmed', 'void')),
  predecessor_revision_id UUID,
  source_observed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_id, revision_number),
  UNIQUE (id, payment_id),
  CONSTRAINT fk_progress_payment_revisions_predecessor_parent
    FOREIGN KEY (predecessor_revision_id, payment_id)
    REFERENCES public.progress_payment_revisions(id, payment_id)
    ON DELETE RESTRICT,
  CHECK (predecessor_revision_id IS NULL OR predecessor_revision_id <> id),
  CHECK (status NOT IN ('superseded', 'void') OR length(btrim(reason)) > 0)
);

CREATE INDEX idx_progress_payment_revisions_payment
  ON public.progress_payment_revisions (payment_id, revision_number DESC);

CREATE TABLE public.progress_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.progress_invoice_series(id) ON DELETE RESTRICT,
  claim_revision_id UUID REFERENCES public.progress_claim_revisions(id) ON DELETE RESTRICT,
  revision_set_id UUID REFERENCES public.progress_invoice_revision_sets(id) ON DELETE RESTRICT,
  scope TEXT NOT NULL CHECK (scope IN ('current_claim', 'series_bundle')),
  format TEXT NOT NULL CHECK (format IN ('xlsx', 'pdf')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'generating', 'ready', 'failed')),
  template_id UUID NOT NULL REFERENCES public.progress_invoice_templates(id) ON DELETE RESTRICT,
  template_version INT NOT NULL CHECK (template_version > 0),
  renderer_version TEXT NOT NULL,
  storage_path TEXT,
  sha256 CHAR(64) CHECK (sha256 IS NULL OR sha256 ~ '^[0-9A-Fa-f]{64}$'),
  page_or_worksheet_count INT CHECK (page_or_worksheet_count IS NULL OR page_or_worksheet_count > 0),
  revision_manifest_hash CHAR(64)
    CHECK (revision_manifest_hash IS NULL OR revision_manifest_hash ~ '^[0-9A-Fa-f]{64}$'),
  snapshot_hash CHAR(64) NOT NULL CHECK (snapshot_hash ~ '^[0-9A-Fa-f]{64}$'),
  generation_correlation_key UUID NOT NULL,
  failure_code TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'current_claim' AND claim_revision_id IS NOT NULL)
    OR (scope = 'series_bundle' AND claim_revision_id IS NULL AND revision_set_id IS NOT NULL)
  ),
  CHECK (
    state <> 'ready'
    OR (
      storage_path IS NOT NULL
      AND sha256 IS NOT NULL
      AND page_or_worksheet_count IS NOT NULL
      AND generated_at IS NOT NULL
    )
  ),
  CHECK (state <> 'failed' OR length(btrim(failure_code)) > 0)
);

CREATE INDEX idx_progress_documents_series
  ON public.progress_documents (series_id, created_at DESC);

CREATE INDEX idx_progress_documents_claim_revision
  ON public.progress_documents (claim_revision_id, format)
  WHERE claim_revision_id IS NOT NULL;

CREATE INDEX idx_progress_documents_revision_set
  ON public.progress_documents (revision_set_id, format)
  WHERE revision_set_id IS NOT NULL;

CREATE TABLE public.progress_invoice_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.progress_invoice_series(id) ON DELETE RESTRICT,
  claim_id UUID REFERENCES public.progress_claims(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('user', 'jobber_sync', 'system')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prior_revision_id UUID REFERENCES public.progress_claim_revisions(id) ON DELETE RESTRICT,
  next_revision_id UUID REFERENCES public.progress_claim_revisions(id) ON DELETE RESTRICT,
  safe_field_changes JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(safe_field_changes) = 'object' AND pg_column_size(safe_field_changes) <= 16384),
  command_name TEXT,
  correlation_key UUID,
  request_fingerprint CHAR(64)
    CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[0-9A-Fa-f]{64}$'),
  result_refs JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(result_refs) = 'object' AND pg_column_size(result_refs) <= 8192),
  CHECK (
    (
      command_name IS NULL
      AND correlation_key IS NULL
      AND request_fingerprint IS NULL
    )
    OR (
      command_name IS NOT NULL
      AND correlation_key IS NOT NULL
      AND request_fingerprint IS NOT NULL
    )
  ),
  CHECK (
    (prior_revision_id IS NULL AND next_revision_id IS NULL)
    OR claim_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX uq_progress_invoice_events_idempotency
  ON public.progress_invoice_events (series_id, command_name, correlation_key)
  WHERE command_name IS NOT NULL AND correlation_key IS NOT NULL;

CREATE INDEX idx_progress_invoice_events_series
  ON public.progress_invoice_events (series_id, occurred_at DESC);

ALTER TABLE public.progress_invoice_series
  ADD CONSTRAINT fk_progress_series_current_jobber_snapshot
  FOREIGN KEY (current_jobber_snapshot_id, id)
  REFERENCES public.progress_jobber_invoice_snapshots(id, series_id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT fk_progress_series_current_revision_set
  FOREIGN KEY (current_revision_set_id, id)
  REFERENCES public.progress_invoice_revision_sets(id, series_id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.progress_claims
  ADD CONSTRAINT fk_progress_claims_current_revision
  FOREIGN KEY (current_revision_id, id)
  REFERENCES public.progress_claim_revisions(id, claim_id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.progress_payments
  ADD CONSTRAINT fk_progress_payments_current_revision
  FOREIGN KEY (current_revision_id, id)
  REFERENCES public.progress_payment_revisions(id, payment_id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION public.set_progress_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.protect_progress_template_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PROGRESS_TEMPLATE_EVIDENCE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF ROW(
    NEW.id,
    NEW.version,
    NEW.source_evidence_path,
    NEW.source_byte_length,
    NEW.source_sha256,
    NEW.normalized_master_path,
    NEW.normalized_sha256,
    NEW.logo_sha256,
    NEW.manifest_version,
    NEW.cell_map_version,
    NEW.page_layout_version,
    NEW.font_version,
    NEW.font_regular_sha256,
    NEW.font_bold_sha256,
    NEW.manifest,
    NEW.registered_by,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.version,
    OLD.source_evidence_path,
    OLD.source_byte_length,
    OLD.source_sha256,
    OLD.normalized_master_path,
    OLD.normalized_sha256,
    OLD.logo_sha256,
    OLD.manifest_version,
    OLD.cell_map_version,
    OLD.page_layout_version,
    OLD.font_version,
    OLD.font_regular_sha256,
    OLD.font_bold_sha256,
    OLD.manifest,
    OLD.registered_by,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'PROGRESS_TEMPLATE_EVIDENCE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF OLD.status IN ('failed', 'superseded') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'PROGRESS_TEMPLATE_STATUS_TERMINAL' USING ERRCODE = '55000';
  END IF;

  IF NEW.status <> OLD.status
    AND NOT (
      (OLD.status = 'pending' AND NEW.status IN ('active', 'failed'))
      OR (OLD.status = 'active' AND NEW.status = 'superseded')
    ) THEN
    RAISE EXCEPTION 'PROGRESS_TEMPLATE_STATUS_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'active'
    AND NEW.status = 'superseded'
    AND NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
    RAISE EXCEPTION 'PROGRESS_TEMPLATE_ACTIVATION_EVIDENCE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF NEW.status = OLD.status
    AND ROW(NEW.activated_at, NEW.failure_code)
      IS DISTINCT FROM ROW(OLD.activated_at, OLD.failure_code) THEN
    RAISE EXCEPTION 'PROGRESS_TEMPLATE_STATUS_EVIDENCE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.reject_progress_row_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'PROGRESS_ROW_IMMUTABLE:%', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION public.protect_progress_adjustment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('approved', 'superseded') THEN
      RAISE EXCEPTION 'PROGRESS_ADJUSTMENT_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'superseded' THEN
    RAISE EXCEPTION 'PROGRESS_ADJUSTMENT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'approved' THEN
    IF NEW.status NOT IN ('approved', 'superseded') THEN
      RAISE EXCEPTION 'PROGRESS_ADJUSTMENT_STATUS_TRANSITION_INVALID' USING ERRCODE = '23514';
    END IF;

    IF ROW(
      NEW.id,
      NEW.series_id,
      NEW.type,
      NEW.effective_date,
      NEW.display_order,
      NEW.description,
      NEW.amount_ex_gst,
      NEW.gst_rate,
      NEW.quote_item_id,
      NEW.created_by,
      NEW.created_at
    ) IS DISTINCT FROM ROW(
      OLD.id,
      OLD.series_id,
      OLD.type,
      OLD.effective_date,
      OLD.display_order,
      OLD.description,
      OLD.amount_ex_gst,
      OLD.gst_rate,
      OLD.quote_item_id,
      OLD.created_by,
      OLD.created_at
    ) THEN
      RAISE EXCEPTION 'PROGRESS_ADJUSTMENT_IMMUTABLE' USING ERRCODE = '55000';
    END IF;

    IF NEW.status = 'approved'
      AND ROW(NEW.superseded_adjustment_id, NEW.reason)
        IS DISTINCT FROM ROW(OLD.superseded_adjustment_id, OLD.reason) THEN
      RAISE EXCEPTION 'PROGRESS_ADJUSTMENT_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.protect_progress_claim_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.state IN ('issued', 'superseded') THEN
      RAISE EXCEPTION 'PROGRESS_CLAIM_REVISION_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF ROW(
    NEW.id,
    NEW.claim_id,
    NEW.revision_number,
    NEW.created_by,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.claim_id,
    OLD.revision_number,
    OLD.created_by,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'PROGRESS_CLAIM_REVISION_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF OLD.state = 'superseded' THEN
    RAISE EXCEPTION 'PROGRESS_CLAIM_REVISION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF OLD.state = 'issued' THEN
    IF NEW.state <> 'superseded'
      OR (to_jsonb(NEW) - 'state') IS DISTINCT FROM (to_jsonb(OLD) - 'state') THEN
      RAISE EXCEPTION 'PROGRESS_CLAIM_REVISION_IMMUTABLE' USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.state = 'draft' AND NEW.state = 'superseded' THEN
    RAISE EXCEPTION 'PROGRESS_CLAIM_REVISION_STATE_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.protect_progress_revision_set_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF ROW(
    NEW.id,
    NEW.series_id,
    NEW.set_number,
    NEW.predecessor_set_id,
    NEW.created_by,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.series_id,
    OLD.set_number,
    OLD.predecessor_set_id,
    OLD.created_by,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'PROGRESS_REVISION_SET_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.protect_progress_payment_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF ROW(
    NEW.id,
    NEW.series_id,
    NEW.source,
    NEW.jobber_payment_id,
    NEW.created_by,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.series_id,
    OLD.source,
    OLD.jobber_payment_id,
    OLD.created_by,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'PROGRESS_PAYMENT_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.protect_progress_claim_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PROGRESS_CLAIM_IDENTITY_PERMANENT' USING ERRCODE = '55000';
  END IF;

  IF ROW(
    NEW.id,
    NEW.series_id,
    NEW.sequence,
    NEW.kind,
    NEW.suffix,
    NEW.tax_invoice_number,
    NEW.created_by,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.series_id,
    OLD.sequence,
    OLD.kind,
    OLD.suffix,
    OLD.tax_invoice_number,
    OLD.created_by,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'PROGRESS_CLAIM_IDENTITY_PERMANENT' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.protect_progress_series_locked_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.jobber_link_locked_at IS NOT NULL
    AND ROW(
      NEW.jobber_account_id,
      NEW.jobber_invoice_id,
      NEW.accepted_numbering_base,
      NEW.jobber_link_locked_at
    ) IS DISTINCT FROM ROW(
      OLD.jobber_account_id,
      OLD.jobber_invoice_id,
      OLD.accepted_numbering_base,
      OLD.jobber_link_locked_at
    ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_LINK_LOCKED' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.protect_progress_document()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.state = 'ready' THEN
    RAISE EXCEPTION 'PROGRESS_DOCUMENT_READY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_progress_series_current_pointers()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.current_jobber_snapshot_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.progress_jobber_invoice_snapshots AS snapshot
      WHERE snapshot.id = NEW.current_jobber_snapshot_id
        AND snapshot.series_id = NEW.id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_CURRENT_JOBBER_SNAPSHOT_PARENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF NEW.current_revision_set_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.progress_invoice_revision_sets AS revision_set
      WHERE revision_set.id = NEW.current_revision_set_id
        AND revision_set.series_id = NEW.id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_CURRENT_REVISION_SET_PARENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_progress_claim_current_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.current_revision_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.progress_claim_revisions AS revision
      WHERE revision.id = NEW.current_revision_id
        AND revision.claim_id = NEW.id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_CLAIM_CURRENT_REVISION_PARENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_progress_revision_set_predecessor()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.predecessor_set_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.progress_invoice_revision_sets AS predecessor
      WHERE predecessor.id = NEW.predecessor_set_id
        AND predecessor.series_id = NEW.series_id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_REVISION_SET_PREDECESSOR_PARENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_progress_adjustment_supersession()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.superseded_adjustment_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.progress_adjustments AS prior_adjustment
      WHERE prior_adjustment.id = NEW.superseded_adjustment_id
        AND prior_adjustment.series_id = NEW.series_id
        AND prior_adjustment.status IN ('approved', 'superseded')
    ) THEN
    RAISE EXCEPTION 'PROGRESS_ADJUSTMENT_SUPERSESSION_PARENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_progress_payment_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.matched_manual_payment_id IS NOT NULL THEN
    IF NEW.source <> 'jobber' THEN
      RAISE EXCEPTION 'PROGRESS_PAYMENT_MATCH_DIRECTION_INVALID' USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.progress_payments AS manual_payment
      WHERE manual_payment.id = NEW.matched_manual_payment_id
        AND manual_payment.series_id = NEW.series_id
        AND manual_payment.source = 'manual'
    ) THEN
      RAISE EXCEPTION 'PROGRESS_PAYMENT_MATCH_PARENT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_progress_payment_current_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.current_revision_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.progress_payment_revisions AS revision
      WHERE revision.id = NEW.current_revision_id
        AND revision.payment_id = NEW.id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_PAYMENT_CURRENT_REVISION_PARENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_progress_payment_revision_predecessor()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.predecessor_revision_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.progress_payment_revisions AS predecessor
      WHERE predecessor.id = NEW.predecessor_revision_id
        AND predecessor.payment_id = NEW.payment_id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_PAYMENT_REVISION_PREDECESSOR_PARENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_progress_document_parentage()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  registered_template_version INT;
BEGIN
  IF NEW.claim_revision_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.progress_claim_revisions AS revision
      JOIN public.progress_claims AS claim ON claim.id = revision.claim_id
      WHERE revision.id = NEW.claim_revision_id
        AND claim.series_id = NEW.series_id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_DOCUMENT_CLAIM_PARENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF NEW.revision_set_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.progress_invoice_revision_sets AS revision_set
      WHERE revision_set.id = NEW.revision_set_id
        AND revision_set.series_id = NEW.series_id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_DOCUMENT_SET_PARENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT template.version
  INTO registered_template_version
  FROM public.progress_invoice_templates AS template
  WHERE template.id = NEW.template_id;

  IF registered_template_version IS NULL
    OR registered_template_version <> NEW.template_version THEN
    RAISE EXCEPTION 'PROGRESS_DOCUMENT_TEMPLATE_VERSION_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_progress_event_parentage()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.claim_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.progress_claims AS claim
      WHERE claim.id = NEW.claim_id
        AND claim.series_id = NEW.series_id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_EVENT_CLAIM_PARENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF NEW.prior_revision_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.progress_claim_revisions AS revision
      WHERE revision.id = NEW.prior_revision_id
        AND revision.claim_id = NEW.claim_id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_EVENT_PRIOR_REVISION_PARENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF NEW.next_revision_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.progress_claim_revisions AS revision
      WHERE revision.id = NEW.next_revision_id
        AND revision.claim_id = NEW.claim_id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_EVENT_NEXT_REVISION_PARENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_business_invoice_profiles_updated_at
BEFORE UPDATE ON public.business_invoice_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_progress_updated_at();

CREATE TRIGGER trg_progress_invoice_templates_protect_evidence
BEFORE UPDATE OR DELETE ON public.progress_invoice_templates
FOR EACH ROW EXECUTE FUNCTION public.protect_progress_template_evidence();

CREATE TRIGGER trg_progress_invoice_templates_updated_at
BEFORE UPDATE ON public.progress_invoice_templates
FOR EACH ROW EXECUTE FUNCTION public.set_progress_updated_at();

CREATE TRIGGER trg_progress_series_locked_link
BEFORE UPDATE ON public.progress_invoice_series
FOR EACH ROW EXECUTE FUNCTION public.protect_progress_series_locked_link();

CREATE TRIGGER trg_progress_series_validate_current_pointers
BEFORE INSERT OR UPDATE ON public.progress_invoice_series
FOR EACH ROW EXECUTE FUNCTION public.validate_progress_series_current_pointers();

CREATE TRIGGER trg_progress_series_updated_at
BEFORE UPDATE ON public.progress_invoice_series
FOR EACH ROW EXECUTE FUNCTION public.set_progress_updated_at();

CREATE TRIGGER trg_progress_jobber_snapshots_immutable
BEFORE UPDATE OR DELETE ON public.progress_jobber_invoice_snapshots
FOR EACH ROW EXECUTE FUNCTION public.reject_progress_row_mutation();

CREATE TRIGGER trg_progress_adjustments_validate_supersession
BEFORE INSERT OR UPDATE ON public.progress_adjustments
FOR EACH ROW EXECUTE FUNCTION public.validate_progress_adjustment_supersession();

CREATE TRIGGER trg_progress_adjustments_protect_approved
BEFORE UPDATE OR DELETE ON public.progress_adjustments
FOR EACH ROW EXECUTE FUNCTION public.protect_progress_adjustment();

CREATE TRIGGER trg_progress_adjustments_updated_at
BEFORE UPDATE ON public.progress_adjustments
FOR EACH ROW EXECUTE FUNCTION public.set_progress_updated_at();

CREATE TRIGGER trg_progress_claims_protect_identity
BEFORE UPDATE OR DELETE ON public.progress_claims
FOR EACH ROW EXECUTE FUNCTION public.protect_progress_claim_identity();

CREATE TRIGGER trg_progress_claims_validate_current_revision
BEFORE INSERT OR UPDATE ON public.progress_claims
FOR EACH ROW EXECUTE FUNCTION public.validate_progress_claim_current_revision();

CREATE TRIGGER trg_progress_claims_updated_at
BEFORE UPDATE ON public.progress_claims
FOR EACH ROW EXECUTE FUNCTION public.set_progress_updated_at();

CREATE TRIGGER trg_progress_claim_revisions_immutable
BEFORE UPDATE OR DELETE ON public.progress_claim_revisions
FOR EACH ROW EXECUTE FUNCTION public.protect_progress_claim_revision();

CREATE TRIGGER trg_progress_revision_sets_protect_identity
BEFORE UPDATE ON public.progress_invoice_revision_sets
FOR EACH ROW EXECUTE FUNCTION public.protect_progress_revision_set_identity();

CREATE TRIGGER trg_progress_revision_sets_validate_predecessor
BEFORE INSERT OR UPDATE ON public.progress_invoice_revision_sets
FOR EACH ROW EXECUTE FUNCTION public.validate_progress_revision_set_predecessor();

CREATE TRIGGER trg_progress_revision_sets_updated_at
BEFORE UPDATE ON public.progress_invoice_revision_sets
FOR EACH ROW EXECUTE FUNCTION public.set_progress_updated_at();

CREATE TRIGGER trg_progress_payments_protect_identity
BEFORE UPDATE ON public.progress_payments
FOR EACH ROW EXECUTE FUNCTION public.protect_progress_payment_identity();

CREATE TRIGGER trg_progress_payments_validate_match
BEFORE INSERT OR UPDATE ON public.progress_payments
FOR EACH ROW EXECUTE FUNCTION public.validate_progress_payment_match();

CREATE TRIGGER trg_progress_payments_validate_current_revision
BEFORE INSERT OR UPDATE ON public.progress_payments
FOR EACH ROW EXECUTE FUNCTION public.validate_progress_payment_current_revision();

CREATE TRIGGER trg_progress_payments_updated_at
BEFORE UPDATE ON public.progress_payments
FOR EACH ROW EXECUTE FUNCTION public.set_progress_updated_at();

CREATE TRIGGER trg_progress_payment_revisions_validate_predecessor
BEFORE INSERT OR UPDATE ON public.progress_payment_revisions
FOR EACH ROW EXECUTE FUNCTION public.validate_progress_payment_revision_predecessor();

CREATE TRIGGER trg_progress_payment_revisions_immutable
BEFORE UPDATE OR DELETE ON public.progress_payment_revisions
FOR EACH ROW EXECUTE FUNCTION public.reject_progress_row_mutation();

CREATE TRIGGER trg_progress_documents_validate_parentage
BEFORE INSERT OR UPDATE ON public.progress_documents
FOR EACH ROW EXECUTE FUNCTION public.validate_progress_document_parentage();

CREATE TRIGGER trg_progress_documents_protect_ready
BEFORE UPDATE OR DELETE ON public.progress_documents
FOR EACH ROW EXECUTE FUNCTION public.protect_progress_document();

CREATE TRIGGER trg_progress_documents_updated_at
BEFORE UPDATE ON public.progress_documents
FOR EACH ROW EXECUTE FUNCTION public.set_progress_updated_at();

CREATE TRIGGER trg_progress_invoice_events_validate_parentage
BEFORE INSERT ON public.progress_invoice_events
FOR EACH ROW EXECUTE FUNCTION public.validate_progress_event_parentage();

CREATE TRIGGER trg_progress_invoice_events_append_only
BEFORE UPDATE OR DELETE ON public.progress_invoice_events
FOR EACH ROW EXECUTE FUNCTION public.reject_progress_row_mutation();

REVOKE ALL ON FUNCTION public.set_progress_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_progress_template_evidence() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_progress_row_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_progress_adjustment() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_progress_claim_revision() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_progress_revision_set_identity() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_progress_payment_identity() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_progress_claim_identity() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_progress_series_locked_link() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_progress_document() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_progress_series_current_pointers() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_progress_claim_current_revision() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_progress_revision_set_predecessor() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_progress_adjustment_supersession() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_progress_payment_match() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_progress_payment_current_revision() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_progress_payment_revision_predecessor() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_progress_document_parentage() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_progress_event_parentage() FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.business_invoice_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_invoice_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.business_invoice_profiles TO authenticated;
CREATE POLICY "business_invoice_profiles_authenticated_select"
  ON public.business_invoice_profiles FOR SELECT TO authenticated USING (true);

ALTER TABLE public.progress_invoice_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.progress_invoice_templates FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.progress_invoice_templates TO authenticated;
CREATE POLICY "progress_invoice_templates_authenticated_select"
  ON public.progress_invoice_templates FOR SELECT TO authenticated USING (true);

ALTER TABLE public.progress_invoice_series ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.progress_invoice_series FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.progress_invoice_series TO authenticated;
CREATE POLICY "progress_invoice_series_authenticated_select"
  ON public.progress_invoice_series FOR SELECT TO authenticated USING (true);

ALTER TABLE public.progress_jobber_invoice_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.progress_jobber_invoice_snapshots FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.progress_jobber_invoice_snapshots TO authenticated;
CREATE POLICY "progress_jobber_invoice_snapshots_authenticated_select"
  ON public.progress_jobber_invoice_snapshots FOR SELECT TO authenticated USING (true);

ALTER TABLE public.progress_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.progress_adjustments FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.progress_adjustments TO authenticated;
CREATE POLICY "progress_adjustments_authenticated_select"
  ON public.progress_adjustments FOR SELECT TO authenticated USING (true);

ALTER TABLE public.progress_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.progress_claims FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.progress_claims TO authenticated;
CREATE POLICY "progress_claims_authenticated_select"
  ON public.progress_claims FOR SELECT TO authenticated USING (true);

ALTER TABLE public.progress_claim_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.progress_claim_revisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.progress_claim_revisions TO authenticated;
CREATE POLICY "progress_claim_revisions_authenticated_select"
  ON public.progress_claim_revisions FOR SELECT TO authenticated USING (true);

ALTER TABLE public.progress_invoice_revision_sets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.progress_invoice_revision_sets FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.progress_invoice_revision_sets TO authenticated;
CREATE POLICY "progress_invoice_revision_sets_authenticated_select"
  ON public.progress_invoice_revision_sets FOR SELECT TO authenticated USING (true);

ALTER TABLE public.progress_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.progress_payments FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.progress_payments TO authenticated;
CREATE POLICY "progress_payments_authenticated_select"
  ON public.progress_payments FOR SELECT TO authenticated USING (true);

ALTER TABLE public.progress_payment_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.progress_payment_revisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.progress_payment_revisions TO authenticated;
CREATE POLICY "progress_payment_revisions_authenticated_select"
  ON public.progress_payment_revisions FOR SELECT TO authenticated USING (true);

ALTER TABLE public.progress_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.progress_documents FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.progress_documents TO authenticated;
CREATE POLICY "progress_documents_authenticated_select"
  ON public.progress_documents FOR SELECT TO authenticated USING (true);

ALTER TABLE public.progress_invoice_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.progress_invoice_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.progress_invoice_events TO authenticated;
CREATE POLICY "progress_invoice_events_authenticated_select"
  ON public.progress_invoice_events FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
