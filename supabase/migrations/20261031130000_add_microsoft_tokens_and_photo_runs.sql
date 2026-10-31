BEGIN;

CREATE TABLE public.microsoft_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  scope TEXT,
  expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.microsoft_tokens FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.microsoft_tokens TO authenticated;

ALTER TABLE public.microsoft_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY microsoft_tokens_owner_select ON public.microsoft_tokens
  FOR SELECT TO authenticated USING (app_auth.is_ai_quote_user() AND user_id = auth.uid());
CREATE POLICY microsoft_tokens_owner_insert ON public.microsoft_tokens
  FOR INSERT TO authenticated WITH CHECK (app_auth.is_ai_quote_user() AND user_id = auth.uid());
CREATE POLICY microsoft_tokens_owner_update ON public.microsoft_tokens
  FOR UPDATE TO authenticated
  USING (app_auth.is_ai_quote_user() AND user_id = auth.uid())
  WITH CHECK (app_auth.is_ai_quote_user() AND user_id = auth.uid());
CREATE POLICY microsoft_tokens_owner_delete ON public.microsoft_tokens
  FOR DELETE TO authenticated USING (app_auth.is_ai_quote_user() AND user_id = auth.uid());

ALTER TABLE public.ai_quote_runs DROP CONSTRAINT ai_quote_runs_kind_check;
ALTER TABLE public.ai_quote_runs ADD CONSTRAINT ai_quote_runs_kind_check
  CHECK (kind IN ('knowledge_build', 'quote_draft', 'eval_memo', 'eval_draft', 'photo_analysis'));

NOTIFY pgrst, 'reload schema';
COMMIT;
