BEGIN;

REVOKE UPDATE, DELETE ON TABLE public.quote_price_revisions FROM authenticated;

DROP POLICY "quote_price_revisions_admin" ON public.quote_price_revisions;
CREATE POLICY quote_price_revisions_admin_select ON public.quote_price_revisions
  FOR SELECT TO authenticated
  USING (app_auth.current_role() = 'admin');
CREATE POLICY quote_price_revisions_admin_insert ON public.quote_price_revisions
  FOR INSERT TO authenticated
  WITH CHECK (app_auth.current_role() = 'admin');

CREATE FUNCTION app_auth.enforce_audit_actor_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  actor UUID := auth.uid();
BEGIN
  -- Maintenance without a user JWT must retain its supplied attribution.
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN ('quotes', 'quote_memos') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := actor;
    ELSE
      NEW.created_by := OLD.created_by;
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('quotes', 'pricing_settings') THEN
    NEW.updated_by := actor;
  END IF;

  IF TG_TABLE_NAME = 'quote_price_revisions' AND TG_OP = 'INSERT' THEN
    NEW.changed_by := actor;
  END IF;

  RETURN NEW;
END;
$$;

-- Run after the existing lifecycle/parent guards so their rejection rules remain intact.
CREATE TRIGGER zz_enforce_audit_actor_integrity
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION app_auth.enforce_audit_actor_integrity();
CREATE TRIGGER zz_enforce_audit_actor_integrity
  BEFORE INSERT OR UPDATE ON public.quote_memos
  FOR EACH ROW EXECUTE FUNCTION app_auth.enforce_audit_actor_integrity();
CREATE TRIGGER zz_enforce_audit_actor_integrity
  BEFORE INSERT OR UPDATE ON public.quote_price_revisions
  FOR EACH ROW EXECUTE FUNCTION app_auth.enforce_audit_actor_integrity();
CREATE TRIGGER zz_enforce_audit_actor_integrity
  BEFORE INSERT OR UPDATE ON public.pricing_settings
  FOR EACH ROW EXECUTE FUNCTION app_auth.enforce_audit_actor_integrity();

REVOKE ALL ON FUNCTION app_auth.enforce_audit_actor_integrity()
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
