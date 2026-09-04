-- Emergency coordinated rollback for the 2026-09-03 catalog quota boundary,
-- RevenueCat deletion tombstones, and normalized-GTIN indexes.
--
-- WARNING: run this only after rolling the client and RevenueCat webhook back.
-- It temporarily restores the old authenticated full-catalog surface and
-- removes durable deletion protection, so it is not a normal recovery path.

BEGIN;

DROP VIEW IF EXISTS public.kpi_release_monitoring_daily;

DROP TRIGGER IF EXISTS reject_deleted_revenuecat_event ON public.revenuecat_events;
DROP FUNCTION IF EXISTS public.reject_deleted_revenuecat_event();
DROP FUNCTION IF EXISTS public.is_deleted_revenuecat_identity(TEXT[]);
DROP TABLE IF EXISTS public.deleted_revenuecat_identities;

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_own_account requires an authenticated user';
  END IF;

  DELETE FROM public.analytics_events WHERE user_id = v_user_id;
  DELETE FROM public.product_events WHERE user_id = v_user_id;
  DELETE FROM public.revenuecat_events
  WHERE app_user_id = v_user_id::TEXT
    OR original_app_user_id = v_user_id::TEXT
    OR subscriber_app_user_id = v_user_id::TEXT
    OR v_user_id = ANY(processed_user_ids)
    OR v_user_id::TEXT = ANY(aliases)
    OR payload::TEXT LIKE ('%' || v_user_id::TEXT || '%');
  DELETE FROM public.scan_usage_events WHERE user_id = v_user_id;
  DELETE FROM public.rate_limits WHERE user_id = v_user_id;
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

DROP FUNCTION IF EXISTS public.consume_verified_catalog_product(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_verified_product_teaser_by_gtin(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.search_verified_product_teasers(TEXT, INTEGER);

DROP INDEX IF EXISTS public.idx_catalog_skus_normalized_gtin;
DROP INDEX IF EXISTS public.idx_product_data_normalized_gtin;

-- Restore the legacy client contract only for a coordinated old-client
-- rollback. This reopens the quota-bypass risk fixed by the release.
GRANT SELECT ON TABLE public.product_data TO authenticated;

DO $rollback$
DECLARE
  v_signature REGPROCEDURE;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    to_regprocedure('public.resolve_verified_product_by_gtin(text,integer)'),
    to_regprocedure('public.search_products(text,integer)'),
    to_regprocedure('public.search_verified_products(text,integer)'),
    to_regprocedure('public.search_verified_products_for_label_fast(text[],integer)'),
    to_regprocedure('public.search_verified_products_for_label_ocr(text[],integer)'),
    to_regprocedure('public.search_verified_products_for_label_ocr_text(text,integer)'),
    to_regprocedure('public.search_verified_products_ranked_v1(text,integer)')
  ]
  LOOP
    IF v_signature IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_signature);
    END IF;
  END LOOP;
END
$rollback$;

COMMIT;
