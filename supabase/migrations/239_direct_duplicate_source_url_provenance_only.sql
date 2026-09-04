-- Direct duplicate reconciliation should treat source URLs as provenance, not
-- formula identity. Official product URL slugs can contain broad words such as
-- "fish" that are not part of the front-label formula and can block exact
-- source-backed duplicate closure.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand not found';
  END IF;

  IF function_sql NOT LIKE '%source URL omitted from normalized catalog duplicate identity%' THEN
    function_sql := replace(
      function_sql,
      $$        pd.package_size,
        pd.gtin,
        pd.source_url
      )) AS catalog_identity_norm,$$,
      $$        pd.package_size,
        pd.gtin
        -- source URL omitted from normalized catalog duplicate identity
      )) AS catalog_identity_norm,$$
    );
  END IF;

  IF function_sql NOT LIKE '%source URL omitted from raw catalog duplicate identity%' THEN
    function_sql := replace(
      function_sql,
      $$        pd.package_size,
        pd.gtin,
        pd.source_url
      ) AS catalog_identity$$,
      $$        pd.package_size,
        pd.gtin
        -- source URL omitted from raw catalog duplicate identity
      ) AS catalog_identity$$
    );
  END IF;

  IF function_sql NOT LIKE '%source URL omitted from normalized catalog duplicate identity%' THEN
    RAISE EXCEPTION 'normalized duplicate identity still includes source_url evidence';
  END IF;

  IF function_sql NOT LIKE '%source URL omitted from raw catalog duplicate identity%' THEN
    RAISE EXCEPTION 'raw duplicate identity still includes source_url evidence';
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

  IF function_sql NOT LIKE '%source URL omitted from normalized catalog duplicate identity%' THEN
    RAISE EXCEPTION 'normalized duplicate identity source-url provenance marker missing';
  END IF;

  IF function_sql NOT LIKE '%source URL omitted from raw catalog duplicate identity%' THEN
    RAISE EXCEPTION 'raw duplicate identity source-url provenance marker missing';
  END IF;

  IF NOT public.catalog_acquisition_identity_match(
    'Open Farm Open Farm Chicken & Salmon Freeze-Dried Raw Morsels Cat Food',
    'cat',
    'Open Farm Chicken & Salmon Freeze Dried Raw Morsels for Cats Chicken & Salmon Freeze Dried Raw Morsel freeze-dried 683547129511',
    'cat'
  ) THEN
    RAISE EXCEPTION 'Open Farm source-backed morsels duplicate identity should match without URL slug terms';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Open Farm',
    'Open Farm Chicken & Salmon Freeze-Dried Raw Morsels Cat Food',
    'cat',
    'Open Farm',
    'Open Farm Chicken & Salmon Freeze Dried Raw Morsels for Cats Chicken & Salmon Freeze Dried Raw Morsel freeze-dried 683547129511',
    'cat',
    8.0
  ) THEN
    RAISE EXCEPTION 'Open Farm source-backed morsels strict search should match without URL slug terms';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Open Farm',
    'Open Farm Chicken & Salmon Freeze-Dried Raw Morsels Cat Food',
    'cat',
    'Open Farm',
    'Open Farm Chicken & Salmon Freeze Dried Raw Patties for Cats Chicken & Salmon Freeze Dried Raw Patties freeze-dried 683547129511',
    'cat',
    8.0
  ) THEN
    RAISE EXCEPTION 'Open Farm morsels duplicate identity must not reconcile to patties';
  END IF;
END $$;
