CREATE OR REPLACE FUNCTION public.get_progress_claim_defaults(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_series_id UUID;
  result JSONB;
BEGIN
  PERFORM public.progress_require_actor();
  PERFORM public.progress_assert_jsonb_keys(payload, ARRAY['series_id']::TEXT[]);
  IF (SELECT count(*) FROM jsonb_object_keys(payload)) <> 1
    OR jsonb_typeof(payload->'series_id') IS DISTINCT FROM 'string'
    OR payload->>'series_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE='23514';
  END IF;

  requested_series_id := (payload->>'series_id')::UUID;
  result := public.progress_claim_editor_dto(requested_series_id, NULL);
  IF result IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.progress_claims AS claim
    WHERE claim.series_id = requested_series_id
      AND claim.kind = 'final'
  ) THEN
    result := jsonb_set(result, '{can_save}', 'false'::JSONB, false);
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_progress_invoice_workspace(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  base JSONB;
  patched_claims JSONB;
  requested_series_id UUID;
BEGIN
  PERFORM public.progress_require_actor();
  base:=public.progress_get_invoice_workspace_before_claim_drafts(payload);
  IF base->'series'='null'::JSONB THEN RETURN base; END IF;
  requested_series_id := (base #>> '{series,id}')::UUID;

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

  base := jsonb_set(base,'{claims}',patched_claims);
  IF EXISTS (
    SELECT 1
    FROM public.progress_claims AS claim
    WHERE claim.series_id = requested_series_id
      AND claim.kind = 'final'
  ) THEN
    base := jsonb_set(base, '{capabilities,can_create_claim}', 'false'::JSONB, false);
  END IF;
  RETURN base;
END;
$$;

ALTER FUNCTION public.get_progress_claim_defaults(JSONB) OWNER TO postgres;
ALTER FUNCTION public.get_progress_invoice_workspace(JSONB) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_progress_claim_defaults(JSONB) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_progress_invoice_workspace(JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_progress_claim_defaults(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_progress_invoice_workspace(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
