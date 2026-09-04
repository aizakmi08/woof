-- Brand-scoped strict reconciliation must not close package-count variants
-- against a verified row for a different count. Ingredients may be the same
-- formula, but the catalog still needs exact package/image evidence.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_package_count_terms(
  p_text TEXT
)
RETURNS INTEGER[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT regexp_replace(
      extensions.unaccent(lower(COALESCE(p_text, ''))),
      '[^a-z0-9]+',
      ' ',
      'g'
    ) AS identity_text
  ),
  raw_matches AS (
    SELECT captures[1]::INTEGER AS package_count
    FROM normalized n
    CROSS JOIN LATERAL regexp_matches(
      n.identity_text,
      '(?:pack of|case of|count of|box of) ([0-9]{1,3})(?: |$)',
      'g'
    ) AS package_matches(captures)
    WHERE captures[1] IS NOT NULL
    UNION ALL
    SELECT captures[1]::INTEGER AS package_count
    FROM normalized n
    CROSS JOIN LATERAL regexp_matches(
      n.identity_text,
      '(?:^| )([0-9]{1,3}) *(?:pack|packs|pk|ct|count|counts|can|cans|pouch|pouches|cup|cups|tray|trays|carton|cartons|case|cases)(?: |$)',
      'g'
    ) AS package_matches(captures)
    WHERE captures[1] IS NOT NULL
  )
  SELECT COALESCE(array_agg(DISTINCT package_count ORDER BY package_count), ARRAY[]::INTEGER[])
  FROM raw_matches
  WHERE package_count BETWEEN 2 AND 99;
$$;

CREATE OR REPLACE FUNCTION public.catalog_acquisition_package_count_match(
  p_queued_identity TEXT,
  p_matched_identity TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH queued AS (
    SELECT public.catalog_acquisition_package_count_terms(p_queued_identity) AS package_counts
  ),
  matched AS (
    SELECT public.catalog_acquisition_package_count_terms(p_matched_identity) AS package_counts
  )
  SELECT CASE
    WHEN cardinality(queued.package_counts) = 0 THEN TRUE
    WHEN cardinality(matched.package_counts) = 0 THEN FALSE
    ELSE EXISTS (
      SELECT 1
      FROM unnest(queued.package_counts) AS queued_count(package_count)
      JOIN unnest(matched.package_counts) AS matched_count(package_count)
        USING (package_count)
    )
  END
  FROM queued, matched;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_package_count_terms(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_package_count_terms(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_package_count_terms(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_package_count_terms(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.catalog_acquisition_package_count_match(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_package_count_match(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_package_count_match(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_package_count_match(TEXT, TEXT) TO service_role;

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_package_count_match(hc.product_name, hc.matched_identity)%' THEN
    function_sql := replace(
      function_sql,
      $$    FROM high_confidence_candidates hc
    WHERE NOT EXISTS ($$,
      $$    FROM high_confidence_candidates hc
    WHERE public.catalog_acquisition_package_count_match(hc.product_name, hc.matched_identity)
      AND NOT EXISTS ($$
    );
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_package_count_match(hc.product_name, hc.matched_identity)%' THEN
    RAISE EXCEPTION 'brand-scoped reconciler package-count guard patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) TO service_role;

UPDATE public.catalog_acquisition_queue
SET
  status = 'open',
  resolved_at = NULL,
  resolution_reason = NULL,
  updated_at = now(),
  sample_metadata = COALESCE(sample_metadata, '{}'::jsonb)
    - 'matched_cache_key'
    - 'matched_product_name'
    - 'matched_brand'
    - 'matched_pet_type'
    - 'matched_source'
    - 'matched_source_url'
    - 'matched_rank'
    - 'match_strategy'
    || jsonb_build_object(
      'last_reconcile_checked_at', now(),
      'last_reconcile_checked_by', 'brand_reconcile_package_count_guard',
      'last_reconcile_checked_result', 'reopened_package_count_mismatch',
      'reopened_at', now(),
      'reopened_by', '216_brand_reconcile_package_count_guard',
      'reopen_reason', 'Queued title has explicit package count that does not match the verified catalog package/source identity.'
    )
WHERE status = 'resolved'
  AND sample_metadata->>'reconciled_by' = 'reconcile_catalog_acquisition_queue_strict_search_for_brand'
  AND NOT public.catalog_acquisition_package_count_match(
    product_name,
    concat_ws(' ', sample_metadata->>'matched_product_name', sample_metadata->>'matched_source_url')
  );

DO $$
DECLARE
  bad_rows INTEGER;
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%catalog_acquisition_package_count_match(hc.product_name, hc.matched_identity)%' THEN
    RAISE EXCEPTION 'brand-scoped reconciler must require package-count compatibility';
  END IF;

  IF public.catalog_acquisition_package_count_match(
    'Purina Fancy Feast Grilled Wet Cat Food Chicken Feast in Wet Cat Food Gravy - (Pack of 24)',
    'Fancy Feast Grilled Chicken Feast in Gravy Gourmet Cat Food 12 ct Pack https://www.purina.com/cats/shop/fancy-feast-timeless-favorites-grilled-chicken-gravy-12-cans-wet-cat-food'
  ) THEN
    RAISE EXCEPTION '24-pack title must not reconcile to 12-count verified package identity';
  END IF;

  IF NOT public.catalog_acquisition_package_count_match(
    'Purina Fancy Feast Grilled Wet Cat Food Chicken Feast in Wet Cat Food Gravy - (Pack of 24)',
    'Fancy Feast Grilled Chicken Feast in Gravy Gourmet Cat Food 24 ct Pack https://www.purina.com/cats/shop/fancy-feast-grilled-chicken-gravy-24-cans-wet-cat-food'
  ) THEN
    RAISE EXCEPTION '24-pack title should reconcile to matching 24-count package identity';
  END IF;

  IF public.catalog_acquisition_package_count_match(
    'Blue Buffalo Wilderness High Protein, Natural Kitten Dry Cat Food, Chicken 2-lb (Pack of 2)',
    'BLUE Wilderness Nature''s Evolutionary Diet with Chicken for Kittens Dry Food https://www.bluebuffalo.com/dry-cat-food/wilderness/kitten-chicken/'
  ) THEN
    RAISE EXCEPTION 'multi-pack title must not reconcile to single-package verified identity without count evidence';
  END IF;

  SELECT count(*)::INTEGER
  INTO bad_rows
  FROM public.catalog_acquisition_queue
  WHERE status = 'resolved'
    AND sample_metadata->>'reconciled_by' = 'reconcile_catalog_acquisition_queue_strict_search_for_brand'
    AND NOT public.catalog_acquisition_package_count_match(
      product_name,
      concat_ws(' ', sample_metadata->>'matched_product_name', sample_metadata->>'matched_source_url')
    );

  IF bad_rows <> 0 THEN
    RAISE EXCEPTION 'resolved package-count mismatches remain: %', bad_rows;
  END IF;
END $$;
