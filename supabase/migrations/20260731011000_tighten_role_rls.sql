DROP POLICY IF EXISTS "authenticated_all" ON public.products;
DROP POLICY IF EXISTS "authenticated_all" ON public.pricing_settings;
DROP POLICY IF EXISTS "authenticated_all" ON public.quotes;
DROP POLICY IF EXISTS "authenticated_all" ON public.quote_items;
DROP POLICY IF EXISTS "authenticated_all" ON public.quote_areas;
DROP POLICY IF EXISTS "authenticated_all" ON public.quote_options;
DROP POLICY IF EXISTS "authenticated_all" ON public.quote_option_items;
DROP POLICY IF EXISTS "authenticated_all" ON public.jobber_quote_lines;
DROP POLICY IF EXISTS "authenticated_all" ON public.product_services;
DROP POLICY IF EXISTS "authenticated_all" ON public.quote_line_templates;
DROP POLICY IF EXISTS "authenticated_all" ON public.quote_line_template_items;
DROP POLICY IF EXISTS "authenticated_all" ON public.quote_memos;
DROP POLICY IF EXISTS "authenticated_all" ON public.quote_price_revisions;

CREATE POLICY "products_admin" ON public.products
  FOR ALL TO authenticated
  USING (app_auth.current_role() = 'admin')
  WITH CHECK (app_auth.current_role() = 'admin');
CREATE POLICY "pricing_settings_admin" ON public.pricing_settings
  FOR ALL TO authenticated
  USING (app_auth.current_role() = 'admin')
  WITH CHECK (app_auth.current_role() = 'admin');
CREATE POLICY "quotes_admin" ON public.quotes
  FOR ALL TO authenticated
  USING (app_auth.current_role() = 'admin')
  WITH CHECK (app_auth.current_role() = 'admin');
CREATE POLICY "quote_items_admin" ON public.quote_items
  FOR ALL TO authenticated
  USING (app_auth.current_role() = 'admin')
  WITH CHECK (app_auth.current_role() = 'admin');
CREATE POLICY "quote_areas_admin" ON public.quote_areas
  FOR ALL TO authenticated
  USING (app_auth.current_role() = 'admin')
  WITH CHECK (app_auth.current_role() = 'admin');
CREATE POLICY "quote_options_admin" ON public.quote_options
  FOR ALL TO authenticated
  USING (app_auth.current_role() = 'admin')
  WITH CHECK (app_auth.current_role() = 'admin');
CREATE POLICY "quote_option_items_admin" ON public.quote_option_items
  FOR ALL TO authenticated
  USING (app_auth.current_role() = 'admin')
  WITH CHECK (app_auth.current_role() = 'admin');
CREATE POLICY "jobber_quote_lines_admin" ON public.jobber_quote_lines
  FOR ALL TO authenticated
  USING (app_auth.current_role() = 'admin')
  WITH CHECK (app_auth.current_role() = 'admin');
CREATE POLICY "product_services_admin" ON public.product_services
  FOR ALL TO authenticated
  USING (app_auth.current_role() = 'admin')
  WITH CHECK (app_auth.current_role() = 'admin');
CREATE POLICY "quote_line_templates_admin" ON public.quote_line_templates
  FOR ALL TO authenticated
  USING (app_auth.current_role() = 'admin')
  WITH CHECK (app_auth.current_role() = 'admin');
CREATE POLICY "quote_line_template_items_admin" ON public.quote_line_template_items
  FOR ALL TO authenticated
  USING (app_auth.current_role() = 'admin')
  WITH CHECK (app_auth.current_role() = 'admin');
CREATE POLICY "quote_memos_admin" ON public.quote_memos
  FOR ALL TO authenticated
  USING (app_auth.current_role() = 'admin')
  WITH CHECK (app_auth.current_role() = 'admin');
CREATE POLICY "quote_price_revisions_admin" ON public.quote_price_revisions
  FOR ALL TO authenticated
  USING (app_auth.current_role() = 'admin')
  WITH CHECK (app_auth.current_role() = 'admin');

DROP POLICY IF EXISTS "authenticated_all" ON public.warehouse_inventory;

CREATE POLICY "warehouse_inventory_app_select" ON public.warehouse_inventory
  FOR SELECT TO authenticated
  USING (app_auth.current_role() IN ('admin', 'supervisor'));
CREATE POLICY "warehouse_inventory_app_update" ON public.warehouse_inventory
  FOR UPDATE TO authenticated
  USING (app_auth.current_role() IN ('admin', 'supervisor'))
  WITH CHECK (app_auth.current_role() IN ('admin', 'supervisor'));
CREATE POLICY "warehouse_inventory_admin_insert" ON public.warehouse_inventory
  FOR INSERT TO authenticated
  WITH CHECK (app_auth.current_role() = 'admin');
CREATE POLICY "warehouse_inventory_admin_delete" ON public.warehouse_inventory
  FOR DELETE TO authenticated
  USING (app_auth.current_role() = 'admin');

CREATE FUNCTION app_auth.protect_inventory_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF app_auth.current_role() = 'supervisor'
    AND (
      OLD.id IS DISTINCT FROM NEW.id
      OR OLD.name IS DISTINCT FROM NEW.name
      OR OLD.category IS DISTINCT FROM NEW.category
      OR OLD.brand IS DISTINCT FROM NEW.brand
      OR OLD.model_specification IS DISTINCT FROM NEW.model_specification
      OR OLD.colour IS DISTINCT FROM NEW.colour
      OR OLD.size_or_serial IS DISTINCT FROM NEW.size_or_serial
      OR OLD.purchase_date IS DISTINCT FROM NEW.purchase_date
      OR OLD.notes IS DISTINCT FROM NEW.notes
      OR OLD.active IS DISTINCT FROM NEW.active
      OR OLD.source_year IS DISTINCT FROM NEW.source_year
      OR OLD.created_at IS DISTINCT FROM NEW.created_at
    ) THEN
    RAISE EXCEPTION 'INVENTORY_ADMIN_FIELDS_REQUIRED' USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_warehouse_inventory_protect_admin_fields
BEFORE UPDATE ON public.warehouse_inventory
FOR EACH ROW EXECUTE FUNCTION app_auth.protect_inventory_admin_fields();

REVOKE ALL ON FUNCTION app_auth.protect_inventory_admin_fields() FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS "business_invoice_profiles_authenticated_select" ON public.business_invoice_profiles;
DROP POLICY IF EXISTS "progress_invoice_templates_authenticated_select" ON public.progress_invoice_templates;
DROP POLICY IF EXISTS "progress_invoice_series_authenticated_select" ON public.progress_invoice_series;
DROP POLICY IF EXISTS "progress_jobber_invoice_snapshots_authenticated_select" ON public.progress_jobber_invoice_snapshots;
DROP POLICY IF EXISTS "progress_adjustments_authenticated_select" ON public.progress_adjustments;
DROP POLICY IF EXISTS "progress_claims_authenticated_select" ON public.progress_claims;
DROP POLICY IF EXISTS "progress_claim_revisions_authenticated_select" ON public.progress_claim_revisions;
DROP POLICY IF EXISTS "progress_invoice_revision_sets_authenticated_select" ON public.progress_invoice_revision_sets;
DROP POLICY IF EXISTS "progress_payments_authenticated_select" ON public.progress_payments;
DROP POLICY IF EXISTS "progress_payment_revisions_authenticated_select" ON public.progress_payment_revisions;
DROP POLICY IF EXISTS "progress_documents_authenticated_select" ON public.progress_documents;
DROP POLICY IF EXISTS "progress_invoice_events_authenticated_select" ON public.progress_invoice_events;

CREATE POLICY "business_invoice_profiles_admin" ON public.business_invoice_profiles
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY "progress_invoice_templates_admin" ON public.progress_invoice_templates
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY "progress_invoice_series_admin" ON public.progress_invoice_series
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY "progress_jobber_invoice_snapshots_admin" ON public.progress_jobber_invoice_snapshots
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY "progress_adjustments_admin" ON public.progress_adjustments
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY "progress_claims_admin" ON public.progress_claims
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY "progress_claim_revisions_admin" ON public.progress_claim_revisions
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY "progress_invoice_revision_sets_admin" ON public.progress_invoice_revision_sets
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY "progress_payments_admin" ON public.progress_payments
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY "progress_payment_revisions_admin" ON public.progress_payment_revisions
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY "progress_documents_admin" ON public.progress_documents
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY "progress_invoice_events_admin" ON public.progress_invoice_events
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');

CREATE FUNCTION app_auth.require_admin()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'PROGRESS_AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF app_auth.current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'APP_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app_auth.require_admin() FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.save_business_invoice_profile(JSONB) RENAME TO save_business_invoice_profile_admin_impl;
ALTER FUNCTION public.list_progress_invoice_series(JSONB) RENAME TO list_progress_invoice_series_admin_impl;
ALTER FUNCTION public.get_progress_invoice_series(JSONB) RENAME TO get_progress_invoice_series_admin_impl;
ALTER FUNCTION public.get_progress_invoice_quote_prefill(JSONB) RENAME TO get_progress_invoice_quote_prefill_admin_impl;
ALTER FUNCTION public.create_progress_invoice_series(JSONB) RENAME TO create_progress_invoice_series_admin_impl;
ALTER FUNCTION public.update_progress_invoice_series(JSONB) RENAME TO update_progress_invoice_series_admin_impl;
ALTER FUNCTION public.create_progress_adjustment(JSONB) RENAME TO create_progress_adjustment_admin_impl;
ALTER FUNCTION public.update_progress_adjustment_draft(JSONB) RENAME TO update_progress_adjustment_draft_admin_impl;
ALTER FUNCTION public.approve_progress_adjustment(JSONB) RENAME TO approve_progress_adjustment_admin_impl;
ALTER FUNCTION public.supersede_progress_adjustment(JSONB) RENAME TO supersede_progress_adjustment_admin_impl;
ALTER FUNCTION public.get_progress_invoice_jobber_context(JSONB) RENAME TO get_progress_invoice_jobber_context_admin_impl;
ALTER FUNCTION public.accept_progress_jobber_invoice_number(JSONB) RENAME TO accept_progress_jobber_invoice_number_admin_impl;

REVOKE ALL ON FUNCTION public.save_business_invoice_profile_admin_impl(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_progress_invoice_series_admin_impl(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_progress_invoice_series_admin_impl(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_progress_invoice_quote_prefill_admin_impl(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_progress_invoice_series_admin_impl(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_progress_invoice_series_admin_impl(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_progress_adjustment_admin_impl(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_progress_adjustment_draft_admin_impl(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_progress_adjustment_admin_impl(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.supersede_progress_adjustment_admin_impl(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_progress_invoice_jobber_context_admin_impl(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_progress_jobber_invoice_number_admin_impl(JSONB) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.save_business_invoice_profile(payload JSONB)
RETURNS TABLE (
  id UUID, legal_name TEXT, trading_name TEXT, abn TEXT, contractor_licence TEXT,
  business_address TEXT, phone TEXT, email TEXT, bank_name TEXT, bsb TEXT,
  bank_account_name TEXT, bank_account_number TEXT, gst_rate TEXT,
  business_timezone TEXT, default_payment_term_days INT, version INT,
  created_by UUID, updated_by UUID, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM app_auth.require_admin();
  RETURN QUERY SELECT * FROM public.save_business_invoice_profile_admin_impl(payload);
END;
$$;

CREATE FUNCTION public.list_progress_invoice_series(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN PERFORM app_auth.require_admin(); RETURN public.list_progress_invoice_series_admin_impl(payload); END; $$;
CREATE FUNCTION public.get_progress_invoice_series(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN PERFORM app_auth.require_admin(); RETURN public.get_progress_invoice_series_admin_impl(payload); END; $$;
CREATE FUNCTION public.get_progress_invoice_quote_prefill(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN PERFORM app_auth.require_admin(); RETURN public.get_progress_invoice_quote_prefill_admin_impl(payload); END; $$;

CREATE FUNCTION public.create_progress_invoice_series(payload JSONB)
RETURNS TABLE (id UUID, version INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN PERFORM app_auth.require_admin(); RETURN QUERY SELECT * FROM public.create_progress_invoice_series_admin_impl(payload); END; $$;
CREATE FUNCTION public.update_progress_invoice_series(payload JSONB)
RETURNS TABLE (id UUID, version INT, quote_id UUID, conflict BOOLEAN, current JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN PERFORM app_auth.require_admin(); RETURN QUERY SELECT * FROM public.update_progress_invoice_series_admin_impl(payload); END; $$;
CREATE FUNCTION public.create_progress_adjustment(payload JSONB)
RETURNS TABLE (id UUID, series_id UUID, quote_id UUID, version INT, replacement_id UUID, conflict BOOLEAN, current JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN PERFORM app_auth.require_admin(); RETURN QUERY SELECT * FROM public.create_progress_adjustment_admin_impl(payload); END; $$;
CREATE FUNCTION public.update_progress_adjustment_draft(payload JSONB)
RETURNS TABLE (id UUID, series_id UUID, quote_id UUID, version INT, replacement_id UUID, conflict BOOLEAN, current JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN PERFORM app_auth.require_admin(); RETURN QUERY SELECT * FROM public.update_progress_adjustment_draft_admin_impl(payload); END; $$;
CREATE FUNCTION public.approve_progress_adjustment(payload JSONB)
RETURNS TABLE (id UUID, series_id UUID, quote_id UUID, version INT, replacement_id UUID, conflict BOOLEAN, current JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN PERFORM app_auth.require_admin(); RETURN QUERY SELECT * FROM public.approve_progress_adjustment_admin_impl(payload); END; $$;
CREATE FUNCTION public.supersede_progress_adjustment(payload JSONB)
RETURNS TABLE (id UUID, series_id UUID, quote_id UUID, version INT, replacement_id UUID, conflict BOOLEAN, current JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN PERFORM app_auth.require_admin(); RETURN QUERY SELECT * FROM public.supersede_progress_adjustment_admin_impl(payload); END; $$;

CREATE FUNCTION public.get_progress_invoice_jobber_context(payload JSONB)
RETURNS TABLE (
  series_id UUID, series_version INT, jobber_account_id TEXT, jobber_invoice_id TEXT,
  selected_jobber_job_id TEXT, selected_jobber_property_id TEXT, current_snapshot_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN PERFORM app_auth.require_admin(); RETURN QUERY SELECT * FROM public.get_progress_invoice_jobber_context_admin_impl(payload); END; $$;
CREATE FUNCTION public.accept_progress_jobber_invoice_number(payload JSONB)
RETURNS TABLE (id UUID, version INT, conflict BOOLEAN, current JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN PERFORM app_auth.require_admin(); RETURN QUERY SELECT * FROM public.accept_progress_jobber_invoice_number_admin_impl(payload); END; $$;

REVOKE ALL ON FUNCTION public.save_business_invoice_profile(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_progress_invoice_series(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_progress_invoice_series(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_progress_invoice_quote_prefill(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_progress_invoice_series(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_progress_invoice_series(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_progress_adjustment(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_progress_adjustment_draft(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_progress_adjustment(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.supersede_progress_adjustment(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_progress_invoice_jobber_context(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_progress_jobber_invoice_number(JSONB) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.save_business_invoice_profile(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_progress_invoice_series(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_progress_invoice_series(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_progress_invoice_quote_prefill(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_progress_invoice_series(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_progress_invoice_series(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_progress_adjustment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_progress_adjustment_draft(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_progress_adjustment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supersede_progress_adjustment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_progress_invoice_jobber_context(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_progress_jobber_invoice_number(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
