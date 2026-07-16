-- Prefer direct identity matches over broad strict-search matches in the
-- duplicate legacy row closer. This lets verified official rows close stale
-- no-source duplicates when the exact formula title matches, while keeping
-- nearby same-brand variants inside the existing ambiguity guard.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand not found';
  END IF;

  IF function_sql NOT LIKE '%direct duplicate exact identity priority%' THEN
    function_sql := replace(
      function_sql,
      $$        + LEAST(COALESCE(bc.matched_ingredient_count, 0), 40) * 0.1
        + bc.prefilter_score$$,
      $$        + LEAST(COALESCE(bc.matched_ingredient_count, 0), 40) * 0.1
        + CASE
          WHEN public.catalog_acquisition_identity_match(
            concat_ws(' ', bc.legacy_brand, bc.legacy_product_name),
            bc.legacy_pet_type,
            bc.matched_identity,
            bc.matched_pet_type
          ) THEN 10.0
          ELSE 0.0
        END
        + CASE
          WHEN public.catalog_acquisition_strict_search_high_confidence(
            bc.legacy_brand,
            bc.legacy_product_name,
            bc.legacy_pet_type,
            bc.matched_brand,
            bc.matched_identity,
            bc.matched_pet_type,
            8.0
          ) THEN 1.0
          ELSE 0.0
        END
        -- direct duplicate exact identity priority
        + bc.prefilter_score$$
    );
  END IF;

  IF function_sql NOT LIKE '%direct duplicate exact identity priority%' THEN
    RAISE EXCEPTION 'direct duplicate exact identity priority patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role;

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%direct duplicate exact identity priority%' THEN
    RAISE EXCEPTION 'direct duplicate exact identity priority marker missing after patch';
  END IF;

  IF function_sql NOT LIKE '%THEN 10.0%' THEN
    RAISE EXCEPTION 'direct identity match score bonus missing after patch';
  END IF;
END $$;
