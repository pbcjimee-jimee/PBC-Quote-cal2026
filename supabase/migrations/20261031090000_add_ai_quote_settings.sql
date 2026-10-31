BEGIN;

CREATE TABLE public.ai_quote_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  monthly_budget_usd NUMERIC(8,2) NOT NULL DEFAULT 30 CHECK (monthly_budget_usd > 0 AND monthly_budget_usd <= 1000),
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ai_quote_settings (id) VALUES (true);

REVOKE ALL ON TABLE public.ai_quote_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE ON TABLE public.ai_quote_settings TO authenticated;

ALTER TABLE public.ai_quote_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_quote_settings_admin_select ON public.ai_quote_settings
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY ai_quote_settings_admin_update ON public.ai_quote_settings
  FOR UPDATE TO authenticated USING (app_auth.current_role() = 'admin') WITH CHECK (app_auth.current_role() = 'admin');

CREATE FUNCTION app_auth.guard_ai_quote_settings_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_auth.guard_ai_quote_settings_update() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_ai_quote_settings_update BEFORE UPDATE ON public.ai_quote_settings
  FOR EACH ROW EXECUTE FUNCTION app_auth.guard_ai_quote_settings_update();

NOTIFY pgrst, 'reload schema';
COMMIT;
