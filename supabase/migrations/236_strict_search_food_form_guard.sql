-- Brand-scoped strict-search reconciliation must not close dry/wet/fresh/raw
-- form variants against each other. The high-confidence helper is intentionally
-- broad for search ranking; the queue reconciler needs this explicit final gate
-- before marking an acquisition gap resolved.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match(hc.product_name, hc.matched_identity)%' THEN
    IF function_sql LIKE '%WHERE public.catalog_acquisition_package_count_match(hc.product_name, hc.matched_identity)%' THEN
      function_sql := replace(
        function_sql,
        $$    FROM high_confidence_candidates hc
    WHERE public.catalog_acquisition_package_count_match(hc.product_name, hc.matched_identity)
      AND NOT EXISTS ($$,
        $$    FROM high_confidence_candidates hc
    WHERE public.catalog_acquisition_food_form_terms_match(hc.product_name, hc.matched_identity)
      AND public.catalog_acquisition_package_count_match(hc.product_name, hc.matched_identity)
      AND NOT EXISTS ($$
      );
    ELSE
      function_sql := replace(
        function_sql,
        $$    FROM high_confidence_candidates hc
    WHERE NOT EXISTS ($$,
        $$    FROM high_confidence_candidates hc
    WHERE public.catalog_acquisition_food_form_terms_match(hc.product_name, hc.matched_identity)
      AND NOT EXISTS ($$
      );
    END IF;
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match(hc.product_name, hc.matched_identity)%' THEN
    RAISE EXCEPTION 'brand-scoped strict-search reconciler food-form guard patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) TO service_role;

WITH bad_form_reconciliations AS (
  SELECT
    q.id,
    concat_ws(' ', q.sample_metadata->>'matched_product_name', q.sample_metadata->>'matched_source_url') AS matched_identity
  FROM public.catalog_acquisition_queue q
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'reconciled_by' = 'reconcile_catalog_acquisition_queue_strict_search_for_brand'
    AND NOT public.catalog_acquisition_food_form_terms_match(
      q.product_name,
      concat_ws(' ', q.sample_metadata->>'matched_product_name', q.sample_metadata->>'matched_source_url')
    )
),
reopened_queue AS (
  UPDATE public.catalog_acquisition_queue q
  SET
    status = 'open',
    resolved_at = NULL,
    resolution_reason = NULL,
    updated_at = now(),
    sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb)
      - 'matched_cache_key'
      - 'matched_product_name'
      - 'matched_brand'
      - 'matched_pet_type'
      - 'matched_source'
      - 'matched_source_url'
      - 'matched_rank'
      - 'match_strategy'
      - 'reconciled_at'
      - 'reconciled_by'
      || jsonb_build_object(
        'last_reconcile_checked_at', now(),
        'last_reconcile_checked_by', 'strict_search_food_form_guard',
        'last_reconcile_checked_result', 'reopened_food_form_variant_mismatch',
        'reopened_at', now(),
        'reopened_by', '236_strict_search_food_form_guard',
        'reopen_reason', 'Queued title has explicit food-form evidence that does not match the verified catalog identity.'
      )
  FROM bad_form_reconciliations bad
  WHERE q.id = bad.id
  RETURNING q.id
)
SELECT count(*) AS reopened_queue_rows
FROM reopened_queue;

DO $$
DECLARE
  bad_rows INTEGER;
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match(hc.product_name, hc.matched_identity)%' THEN
    RAISE EXCEPTION 'brand-scoped strict-search reconciler must require food-form compatibility';
  END IF;

  IF public.catalog_acquisition_food_form_terms_match(
    'Blue Buffalo True Solutions Mobility Care Natural Dry Dog Food for Adult Dogs, Chicken, 24-lb. Bag',
    'BLUE True Solutions Mobility Care Chicken Recipe for Adult Dogs https://www.bluebuffalo.com/wet-dog-food/true-solutions/mobility-support/'
  ) THEN
    RAISE EXCEPTION 'strict-search food-form guard must reject explicit dry title matched to wet verified source URL';
  END IF;

  IF public.catalog_acquisition_food_form_terms_match(
    'Fancy Feast Gravy Lovers Chicken Feast in Grilled Chicken Flavor Gravy Wet Cat Food',
    'Fancy Feast Gourmet Naturals Dry Cat Food With White Meat Chicken https://www.purina.com/cats/shop/fancy-feast-gourmet-naturals-chicken-dry-cat-food'
  ) THEN
    RAISE EXCEPTION 'strict-search food-form guard must reject explicit wet title matched to dry verified source URL';
  END IF;

  IF NOT public.catalog_acquisition_food_form_terms_match(
    'Stella & Chewy''s Wild Red Raw Coated Kibble Dry Dog Food Wholesome Grains Red Meat Recipe',
    'Wild Red Raw Coated Kibble Wholesome Grains Red Meat Recipe dry'
  ) THEN
    RAISE EXCEPTION 'strict-search food-form guard should allow raw coated kibble dry identities';
  END IF;

  SELECT count(*)::INTEGER
  INTO bad_rows
  FROM public.catalog_acquisition_queue
  WHERE status = 'resolved'
    AND sample_metadata->>'reconciled_by' = 'reconcile_catalog_acquisition_queue_strict_search_for_brand'
    AND NOT public.catalog_acquisition_food_form_terms_match(
      product_name,
      concat_ws(' ', sample_metadata->>'matched_product_name', sample_metadata->>'matched_source_url')
    );

  IF bad_rows <> 0 THEN
    RAISE EXCEPTION 'strict-search food-form mismatches remain: %', bad_rows;
  END IF;
END $$;
