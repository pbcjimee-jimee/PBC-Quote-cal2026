ALTER FUNCTION public.get_progress_invoice_workspace(JSONB)
  RENAME TO progress_get_invoice_workspace_v1;

REVOKE ALL ON FUNCTION public.progress_get_invoice_workspace_v1(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_progress_invoice_workspace(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result JSONB;
  requested_series_id UUID;
  base_contract_editable BOOLEAN;
BEGIN
  result := public.progress_get_invoice_workspace_v1(payload);

  IF result -> 'series' IS NULL OR jsonb_typeof(result -> 'series') = 'null' THEN
    RETURN result;
  END IF;

  requested_series_id := (result #>> '{series,id}')::UUID;
  base_contract_editable := (result #>> '{series,status}') <> 'void'
    AND NOT EXISTS (
      SELECT 1
      FROM public.progress_claims AS claim
      WHERE claim.series_id = requested_series_id
    );

  RETURN jsonb_set(
    result,
    ARRAY['capabilities', 'can_edit_base_contract'],
    pg_catalog.to_jsonb(base_contract_editable),
    false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_progress_invoice_workspace(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_progress_invoice_workspace(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
