BEGIN;

CREATE FUNCTION app_auth.is_ai_quote_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles AS profile
    JOIN auth.users AS account ON account.id = profile.id
    WHERE profile.id = auth.uid()
      AND profile.is_active
      AND profile.role = 'admin'
      AND lower(account.email) = 'jimee@paintbuddyco.com.au'
  );
$$;

REVOKE ALL ON FUNCTION app_auth.is_ai_quote_user() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_auth.is_ai_quote_user() TO authenticated;

DROP POLICY ai_quote_runs_admin_select ON public.ai_quote_runs;
DROP POLICY ai_quote_runs_admin_insert ON public.ai_quote_runs;
DROP POLICY ai_quote_runs_admin_update ON public.ai_quote_runs;
DROP POLICY ai_quote_knowledge_admin_select ON public.ai_quote_knowledge;
DROP POLICY ai_quote_knowledge_admin_insert ON public.ai_quote_knowledge;
DROP POLICY ai_quote_knowledge_admin_update ON public.ai_quote_knowledge;
DROP POLICY ai_quote_eval_cases_admin_select ON public.ai_quote_eval_cases;
DROP POLICY ai_quote_eval_cases_admin_insert ON public.ai_quote_eval_cases;
DROP POLICY ai_quote_eval_cases_admin_update ON public.ai_quote_eval_cases;
DROP POLICY ai_quote_eval_cases_admin_delete ON public.ai_quote_eval_cases;
DROP POLICY ai_quote_settings_admin_select ON public.ai_quote_settings;
DROP POLICY ai_quote_settings_admin_update ON public.ai_quote_settings;

CREATE POLICY ai_quote_runs_admin_select ON public.ai_quote_runs
  FOR SELECT TO authenticated USING (app_auth.is_ai_quote_user());
CREATE POLICY ai_quote_runs_admin_insert ON public.ai_quote_runs
  FOR INSERT TO authenticated WITH CHECK (app_auth.is_ai_quote_user() AND created_by = auth.uid());
CREATE POLICY ai_quote_runs_admin_update ON public.ai_quote_runs
  FOR UPDATE TO authenticated USING (app_auth.is_ai_quote_user()) WITH CHECK (app_auth.is_ai_quote_user());

CREATE POLICY ai_quote_knowledge_admin_select ON public.ai_quote_knowledge
  FOR SELECT TO authenticated USING (app_auth.is_ai_quote_user());
CREATE POLICY ai_quote_knowledge_admin_insert ON public.ai_quote_knowledge
  FOR INSERT TO authenticated WITH CHECK (app_auth.is_ai_quote_user() AND created_by = auth.uid());
CREATE POLICY ai_quote_knowledge_admin_update ON public.ai_quote_knowledge
  FOR UPDATE TO authenticated USING (app_auth.is_ai_quote_user()) WITH CHECK (app_auth.is_ai_quote_user());

CREATE POLICY ai_quote_eval_cases_admin_select ON public.ai_quote_eval_cases
  FOR SELECT TO authenticated USING (app_auth.is_ai_quote_user());
CREATE POLICY ai_quote_eval_cases_admin_insert ON public.ai_quote_eval_cases
  FOR INSERT TO authenticated WITH CHECK (app_auth.is_ai_quote_user() AND created_by = auth.uid());
CREATE POLICY ai_quote_eval_cases_admin_update ON public.ai_quote_eval_cases
  FOR UPDATE TO authenticated USING (app_auth.is_ai_quote_user()) WITH CHECK (app_auth.is_ai_quote_user());
CREATE POLICY ai_quote_eval_cases_admin_delete ON public.ai_quote_eval_cases
  FOR DELETE TO authenticated USING (app_auth.is_ai_quote_user());

CREATE POLICY ai_quote_settings_admin_select ON public.ai_quote_settings
  FOR SELECT TO authenticated USING (app_auth.is_ai_quote_user());
CREATE POLICY ai_quote_settings_admin_update ON public.ai_quote_settings
  FOR UPDATE TO authenticated USING (app_auth.is_ai_quote_user()) WITH CHECK (app_auth.is_ai_quote_user());

CREATE OR REPLACE FUNCTION public.activate_ai_quote_knowledge(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  previous_activation TEXT;
BEGIN
  IF NOT app_auth.is_ai_quote_user() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Serialize approvals even when there is no active version to lock yet.
  PERFORM pg_advisory_xact_lock(hashtextextended('public.ai_quote_knowledge.activation', 0));

  previous_activation := current_setting('app.ai_knowledge_activation', true);
  PERFORM set_config('app.ai_knowledge_activation', 'on', true);
  UPDATE public.ai_quote_knowledge SET status = 'archived', updated_at = now() WHERE status = 'active';
  UPDATE public.ai_quote_knowledge
    SET status = 'active', approved_by = auth.uid(), approved_at = now(), updated_at = now()
    WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_QUOTE_KNOWLEDGE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM set_config('app.ai_knowledge_activation', coalesce(previous_activation, ''), true);
  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_ai_quote_knowledge(UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_ai_quote_knowledge(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
