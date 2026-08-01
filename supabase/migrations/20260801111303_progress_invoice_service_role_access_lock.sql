BEGIN;

REVOKE ALL PRIVILEGES ON TABLE public.business_invoice_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.business_invoice_profiles FROM service_role;
GRANT SELECT ON TABLE public.business_invoice_profiles TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.progress_invoice_templates FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.progress_invoice_templates FROM service_role;
GRANT SELECT ON TABLE public.progress_invoice_templates TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.progress_invoice_series FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.progress_invoice_series FROM service_role;
GRANT SELECT ON TABLE public.progress_invoice_series TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.progress_jobber_invoice_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.progress_jobber_invoice_snapshots FROM service_role;
GRANT SELECT ON TABLE public.progress_jobber_invoice_snapshots TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.progress_adjustments FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.progress_adjustments FROM service_role;
GRANT SELECT ON TABLE public.progress_adjustments TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.progress_claims FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.progress_claims FROM service_role;
GRANT SELECT ON TABLE public.progress_claims TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.progress_claim_revisions FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.progress_claim_revisions FROM service_role;
GRANT SELECT ON TABLE public.progress_claim_revisions TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.progress_invoice_revision_sets FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.progress_invoice_revision_sets FROM service_role;
GRANT SELECT ON TABLE public.progress_invoice_revision_sets TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.progress_payments FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.progress_payments FROM service_role;
GRANT SELECT ON TABLE public.progress_payments TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.progress_payment_revisions FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.progress_payment_revisions FROM service_role;
GRANT SELECT ON TABLE public.progress_payment_revisions TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.progress_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.progress_documents FROM service_role;
GRANT SELECT ON TABLE public.progress_documents TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.progress_invoice_events FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.progress_invoice_events FROM service_role;
GRANT SELECT ON TABLE public.progress_invoice_events TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.progress_invoice_numbering_base_reservations FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.progress_invoice_numbering_base_reservations FROM service_role;
GRANT SELECT ON TABLE public.progress_invoice_numbering_base_reservations TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.progress_claim_command_results FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.progress_claim_command_results FROM service_role;
GRANT SELECT ON TABLE public.progress_claim_command_results TO service_role;

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
DROP POLICY IF EXISTS "progress_numbering_base_reservations_authenticated_select" ON public.progress_invoice_numbering_base_reservations;

REVOKE EXECUTE ON FUNCTION public.accept_progress_jobber_invoice_number(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_progress_jobber_invoice_number(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.approve_progress_adjustment(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_progress_adjustment(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.create_manual_progress_invoice_series(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_manual_progress_invoice_series(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.create_manual_progress_payment(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_manual_progress_payment(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.create_progress_adjustment(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_progress_adjustment(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.create_progress_claim_draft(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_progress_claim_draft(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.get_progress_claim_defaults(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_progress_claim_defaults(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.get_progress_claim_editor(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_progress_claim_editor(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.get_progress_invoice_jobber_context(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_progress_invoice_jobber_context(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.get_progress_invoice_series(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_progress_invoice_series(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.get_progress_invoice_workspace(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_progress_invoice_workspace(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.list_progress_invoice_history(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_progress_invoice_history(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.list_progress_invoice_series(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_progress_invoice_series(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.reconcile_progress_payment(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_progress_payment(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.reject_progress_adjustment(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_progress_adjustment(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.replace_manual_progress_payment(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.replace_manual_progress_payment(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.save_business_invoice_profile(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_business_invoice_profile(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.save_progress_claim_draft(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_progress_claim_draft(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.supersede_progress_adjustment(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.supersede_progress_adjustment(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.undo_progress_payment_reconciliation(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.undo_progress_payment_reconciliation(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.update_progress_adjustment_draft(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_progress_adjustment_draft(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.update_progress_invoice_series(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_progress_invoice_series(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.void_manual_progress_payment(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.void_manual_progress_payment(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.void_progress_claim_draft(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.void_progress_claim_draft(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.void_progress_invoice_series(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.void_progress_invoice_series(jsonb) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.apply_progress_invoice_jobber_refresh(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_progress_invoice_jobber_refresh(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.apply_progress_invoice_jobber_refresh(jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_progress_invoice_series_from_jobber(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_progress_invoice_series_from_jobber(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.create_progress_invoice_series_from_jobber(jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.link_progress_jobber_invoice(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_progress_jobber_invoice(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.link_progress_jobber_invoice(jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_progress_jobber_refresh_failure(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_progress_jobber_refresh_failure(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.record_progress_jobber_refresh_failure(jsonb) TO service_role;

COMMIT;
