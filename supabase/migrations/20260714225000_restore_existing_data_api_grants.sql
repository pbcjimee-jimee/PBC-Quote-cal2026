REVOKE ALL ON TABLE public.products FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.pricing_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pricing_settings TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.quotes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quotes TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.quote_items FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quote_items TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.quote_areas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quote_areas TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.jobber_tokens FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.jobber_tokens TO service_role;

REVOKE ALL ON TABLE public.quote_options FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quote_options TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.quote_option_items FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quote_option_items TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.jobber_quote_lines FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.jobber_quote_lines TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.product_services FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_services TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.quote_line_templates FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quote_line_templates TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.quote_line_template_items FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quote_line_template_items TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.quote_memos FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quote_memos TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.quote_price_revisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quote_price_revisions TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.warehouse_inventory FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warehouse_inventory TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
