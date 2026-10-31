BEGIN;

CREATE FUNCTION public.quote_has_pending_ai_review(p_quote_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_auth.current_role() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.ai_quote_runs
    WHERE quote_id = p_quote_id
      AND kind = 'quote_draft'
      AND status = 'succeeded'
      AND review_confirmed_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.quote_has_pending_ai_review(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.quote_has_pending_ai_review(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
