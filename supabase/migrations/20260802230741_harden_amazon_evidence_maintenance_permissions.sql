-- Amazon evidence maintenance mutates private ingestion state and serving
-- aliases. PostgreSQL grants function execution to PUBLIC by default, so
-- revoke both PUBLIC and Supabase client roles explicitly.

REVOKE ALL ON FUNCTION public.refresh_catalog_amazon_evidence_queue()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_catalog_amazon_evidence_queue()
  TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_catalog_amazon_exact_existing_evidence()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_amazon_exact_existing_evidence()
  TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_catalog_amazon_strict_existing_evidence()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_amazon_strict_existing_evidence()
  TO service_role;
