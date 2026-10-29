BEGIN;

CREATE TABLE public.ai_quote_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('knowledge_build', 'quote_draft', 'eval_memo', 'eval_draft')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed', 'refused')),
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  knowledge_id UUID,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  jobber_quote_id TEXT,
  memo TEXT CHECK (char_length(memo) <= 8000),
  output JSONB,
  error_code TEXT,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cache_read_tokens INT NOT NULL DEFAULT 0,
  cache_write_tokens INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  review_confirmed_at TIMESTAMPTZ,
  review_confirmed_by UUID REFERENCES auth.users(id),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.ai_quote_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  style_guide TEXT NOT NULL CHECK (char_length(style_guide) <= 40000),
  pricing_guide TEXT NOT NULL CHECK (char_length(pricing_guide) <= 40000),
  stats JSONB NOT NULL,
  source_counts JSONB NOT NULL,
  run_id UUID NOT NULL REFERENCES public.ai_quote_runs(id),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_quote_runs
  ADD CONSTRAINT ai_quote_runs_knowledge_id_fkey FOREIGN KEY (knowledge_id) REFERENCES public.ai_quote_knowledge(id);

CREATE TABLE public.ai_quote_eval_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_label TEXT NOT NULL,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  memo TEXT NOT NULL CHECK (char_length(memo) <= 8000),
  memo_run_id UUID NOT NULL REFERENCES public.ai_quote_runs(id),
  last_draft_run_id UUID REFERENCES public.ai_quote_runs(id),
  last_metrics JSONB,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (set_label, quote_id)
);

CREATE UNIQUE INDEX ai_quote_knowledge_one_active ON public.ai_quote_knowledge ((true)) WHERE status = 'active';
CREATE INDEX ai_quote_runs_created_by_kind_created_at ON public.ai_quote_runs (created_by, kind, created_at DESC);
CREATE INDEX ai_quote_runs_quote_id ON public.ai_quote_runs (quote_id) WHERE quote_id IS NOT NULL;

REVOKE ALL ON TABLE public.ai_quote_runs, public.ai_quote_knowledge, public.ai_quote_eval_cases
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_quote_runs, public.ai_quote_knowledge, public.ai_quote_eval_cases TO authenticated;
GRANT DELETE ON TABLE public.ai_quote_eval_cases TO authenticated;

ALTER TABLE public.ai_quote_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_quote_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_quote_eval_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_quote_runs_admin_select ON public.ai_quote_runs
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY ai_quote_runs_admin_insert ON public.ai_quote_runs
  FOR INSERT TO authenticated WITH CHECK (app_auth.current_role() = 'admin' AND created_by = auth.uid());
CREATE POLICY ai_quote_runs_admin_update ON public.ai_quote_runs
  FOR UPDATE TO authenticated USING (app_auth.current_role() = 'admin') WITH CHECK (app_auth.current_role() = 'admin');

CREATE POLICY ai_quote_knowledge_admin_select ON public.ai_quote_knowledge
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY ai_quote_knowledge_admin_insert ON public.ai_quote_knowledge
  FOR INSERT TO authenticated WITH CHECK (app_auth.current_role() = 'admin' AND created_by = auth.uid());
CREATE POLICY ai_quote_knowledge_admin_update ON public.ai_quote_knowledge
  FOR UPDATE TO authenticated USING (app_auth.current_role() = 'admin') WITH CHECK (app_auth.current_role() = 'admin');

CREATE POLICY ai_quote_eval_cases_admin_select ON public.ai_quote_eval_cases
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY ai_quote_eval_cases_admin_insert ON public.ai_quote_eval_cases
  FOR INSERT TO authenticated WITH CHECK (app_auth.current_role() = 'admin' AND created_by = auth.uid());
CREATE POLICY ai_quote_eval_cases_admin_update ON public.ai_quote_eval_cases
  FOR UPDATE TO authenticated USING (app_auth.current_role() = 'admin') WITH CHECK (app_auth.current_role() = 'admin');
CREATE POLICY ai_quote_eval_cases_admin_delete ON public.ai_quote_eval_cases
  FOR DELETE TO authenticated USING (app_auth.current_role() = 'admin');

CREATE FUNCTION app_auth.preserve_ai_quote_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;

CREATE TRIGGER preserve_ai_quote_creator BEFORE UPDATE ON public.ai_quote_runs
  FOR EACH ROW EXECUTE FUNCTION app_auth.preserve_ai_quote_creator();
CREATE TRIGGER preserve_ai_quote_creator BEFORE UPDATE ON public.ai_quote_knowledge
  FOR EACH ROW EXECUTE FUNCTION app_auth.preserve_ai_quote_creator();
CREATE TRIGGER preserve_ai_quote_creator BEFORE UPDATE ON public.ai_quote_eval_cases
  FOR EACH ROW EXECUTE FUNCTION app_auth.preserve_ai_quote_creator();
REVOKE ALL ON FUNCTION app_auth.preserve_ai_quote_creator() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.activate_ai_quote_knowledge(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF app_auth.current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Serialize approvals even when there is no active version to lock yet.
  PERFORM pg_advisory_xact_lock(hashtextextended('public.ai_quote_knowledge.activation', 0));

  UPDATE public.ai_quote_knowledge SET status = 'archived', updated_at = now() WHERE status = 'active';
  UPDATE public.ai_quote_knowledge
    SET status = 'active', approved_by = auth.uid(), approved_at = now(), updated_at = now()
    WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_QUOTE_KNOWLEDGE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_ai_quote_knowledge(UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_ai_quote_knowledge(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
