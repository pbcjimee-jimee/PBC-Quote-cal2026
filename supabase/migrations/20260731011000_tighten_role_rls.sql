DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'products', 'pricing_settings', 'quotes', 'quote_items', 'quote_areas',
    'quote_options', 'quote_option_items', 'jobber_quote_lines',
    'product_services', 'quote_line_templates', 'quote_line_template_items',
    'quote_memos', 'quote_price_revisions', 'warehouse_inventory'
  ]
  LOOP
    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      table_name
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role',
      table_name
    );
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE public.jobber_tokens FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.jobber_tokens TO service_role;

CREATE FUNCTION app_auth.protect_last_active_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.role = 'admin'
    AND OLD.is_active
    AND (
      TG_OP = 'DELETE'
      OR NEW.role <> 'admin'
      OR NOT NEW.is_active
    ) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('app_auth.active_admin', 0));

    IF NOT EXISTS (
      SELECT 1
      FROM public.user_profiles AS profile
      WHERE profile.id <> OLD.id
        AND profile.role = 'admin'
        AND profile.is_active
    ) THEN
      RAISE EXCEPTION 'LAST_ACTIVE_ADMIN_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_profiles_protect_last_active_admin
BEFORE UPDATE OR DELETE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION app_auth.protect_last_active_admin();

REVOKE ALL ON FUNCTION app_auth.protect_last_active_admin() FROM PUBLIC, anon, authenticated, service_role;

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

NOTIFY pgrst, 'reload schema';
