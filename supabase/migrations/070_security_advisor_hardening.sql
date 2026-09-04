-- Reduce Supabase advisor noise without breaking authenticated app RPCs.
-- Production already has historical catalog/search/product-event functions
-- from migrations 007-057; this migration only hardens them when present.

DO $$
BEGIN
  IF to_regprocedure('public.is_likely_non_product_catalog_row(text,text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.is_likely_non_product_catalog_row(text,text) SET search_path = public';
  END IF;

  IF to_regprocedure('public.increment_cache_hit(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.increment_cache_hit(TEXT) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.increment_cache_hit(TEXT) FROM anon;
    GRANT EXECUTE ON FUNCTION public.increment_cache_hit(TEXT) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.increment_cache_hit(TEXT) TO service_role;
  END IF;

  IF to_regprocedure('public.log_product_event(text,text,jsonb)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.log_product_event(TEXT, TEXT, JSONB) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.log_product_event(TEXT, TEXT, JSONB) FROM anon;
    GRANT EXECUTE ON FUNCTION public.log_product_event(TEXT, TEXT, JSONB) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.log_product_event(TEXT, TEXT, JSONB) TO service_role;
  END IF;

  IF to_regprocedure('public.search_products(text,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.search_products(TEXT, INTEGER) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.search_products(TEXT, INTEGER) FROM anon;
    GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INTEGER) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INTEGER) TO service_role;
  END IF;

  IF to_regprocedure('public.delete_own_account()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon;
    GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
  END IF;

  IF to_regprocedure('public.get_human_food_count_today(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_human_food_count_today(UUID) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.get_human_food_count_today(UUID) FROM anon;
    GRANT EXECUTE ON FUNCTION public.get_human_food_count_today(UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.get_human_food_count_today(UUID) TO service_role;
  END IF;

  IF to_regprocedure('public.increment_human_food_count(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.increment_human_food_count(UUID) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.increment_human_food_count(UUID) FROM anon;
    GRANT EXECUTE ON FUNCTION public.increment_human_food_count(UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.increment_human_food_count(UUID) TO service_role;
  END IF;

  IF to_regprocedure('public.increment_scan_count(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.increment_scan_count(UUID) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.increment_scan_count(UUID) FROM anon;
    GRANT EXECUTE ON FUNCTION public.increment_scan_count(UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.increment_scan_count(UUID) TO service_role;
  END IF;
END;
$$;
