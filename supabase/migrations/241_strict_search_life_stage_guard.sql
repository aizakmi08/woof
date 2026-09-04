-- Brand-scoped strict-search reconciliation must not close senior/adult 7+,
-- puppy, kitten, or all-life-stage variants against different life-stage rows.
-- The strict-search helper can rank close titles, but queue resolution needs
-- the same explicit final life-stage gate used by duplicate cleanup.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_life_stage_terms_match(hc.product_name, hc.matched_identity)%' THEN
    function_sql := replace(
      function_sql,
      $$    FROM high_confidence_candidates hc
    WHERE public.catalog_acquisition_food_form_terms_match(hc.product_name, hc.matched_identity)
      AND public.catalog_acquisition_package_count_match(hc.product_name, hc.matched_identity)$$,
      $$    FROM high_confidence_candidates hc
    WHERE public.catalog_acquisition_life_stage_terms_match(hc.product_name, hc.matched_identity)
      AND public.catalog_acquisition_food_form_terms_match(hc.product_name, hc.matched_identity)
      AND public.catalog_acquisition_package_count_match(hc.product_name, hc.matched_identity)$$
    );
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_life_stage_terms_match(hc.product_name, hc.matched_identity)%' THEN
    RAISE EXCEPTION 'brand-scoped strict-search reconciler life-stage guard patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) TO service_role;

WITH bad_life_stage_reconciliations AS (
  SELECT
    q.id,
    concat_ws(' ', q.sample_metadata->>'matched_product_name', q.sample_metadata->>'matched_source_url') AS matched_identity
  FROM public.catalog_acquisition_queue q
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'reconciled_by' = 'reconcile_catalog_acquisition_queue_strict_search_for_brand'
    AND NOT public.catalog_acquisition_life_stage_terms_match(
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
        'last_reconcile_checked_by', 'strict_search_life_stage_guard',
        'last_reconcile_checked_result', 'reopened_life_stage_variant_mismatch',
        'reopened_at', now(),
        'reopened_by', '241_strict_search_life_stage_guard',
        'reopen_reason', 'Queued title has explicit life-stage evidence that does not match the verified catalog identity.'
      )
  FROM bad_life_stage_reconciliations bad
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

  IF function_sql NOT LIKE '%catalog_acquisition_life_stage_terms_match(hc.product_name, hc.matched_identity)%' THEN
    RAISE EXCEPTION 'brand-scoped strict-search reconciler must require life-stage compatibility';
  END IF;

  IF public.catalog_acquisition_life_stage_terms_match(
    'Blue Buffalo Tastefuls Natural Dry Food for Adult Cats 7+, Chicken & Brown Rice Recipe',
    'BLUE Tastefuls Adult Active Cat Chicken & Brown Rice Recipe https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-chicken-brown-rice/'
  ) THEN
    RAISE EXCEPTION 'strict-search life-stage guard must reject adult 7+ title matched to non-senior adult row';
  END IF;

  IF NOT public.catalog_acquisition_life_stage_terms_match(
    'Blue Buffalo Wilderness High-Protein Natural Dry Food for Senior Dogs, Salmon Recipe',
    'BLUE Wilderness Salmon Senior Dog Food https://www.bluebuffalo.com/dry-dog-food/wilderness/senior-salmon-wholesome-grain-recipe/'
  ) THEN
    RAISE EXCEPTION 'strict-search life-stage guard should allow matching senior titles';
  END IF;

  IF NOT public.catalog_acquisition_life_stage_terms_match(
    'Blue Buffalo Freedom Grain Free Natural Puppy Wet Dog Food, Chicken',
    'BLUE Freedom Wet Puppy Food Grain-Free - Chicken https://www.bluebuffalo.com/wet-dog-food/freedom/puppy-grain-free-chicken-recipe/'
  ) THEN
    RAISE EXCEPTION 'strict-search life-stage guard should allow matching puppy titles';
  END IF;

  SELECT count(*)::INTEGER
  INTO bad_rows
  FROM public.catalog_acquisition_queue
  WHERE status = 'resolved'
    AND sample_metadata->>'reconciled_by' = 'reconcile_catalog_acquisition_queue_strict_search_for_brand'
    AND NOT public.catalog_acquisition_life_stage_terms_match(
      product_name,
      concat_ws(' ', sample_metadata->>'matched_product_name', sample_metadata->>'matched_source_url')
    );

  IF bad_rows <> 0 THEN
    RAISE EXCEPTION 'strict-search life-stage mismatches remain: %', bad_rows;
  END IF;
END $$;
