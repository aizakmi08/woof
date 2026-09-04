-- Special food forms are formula-defining variants. A dry row should not be
-- considered a duplicate of a freeze-dried, dehydrated, air-dried, fresh, or
-- raw row just because both identities also contain "dry".

CREATE OR REPLACE FUNCTION public.catalog_acquisition_food_form_terms_match(
  p_query_identity TEXT,
  p_candidate_identity TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
WITH normalized AS (
  SELECT
    regexp_replace(lower(COALESCE(p_query_identity, '')), '[^a-z0-9]+', ' ', 'g') AS q_norm,
    regexp_replace(lower(COALESCE(p_candidate_identity, '')), '[^a-z0-9]+', ' ', 'g') AS c_norm
),
flags AS (
  SELECT
    q_norm ~ '(^| )(dry|kibble|crunchy|clusters)( |$)' AS q_dry,
    c_norm ~ '(^| )(dry|kibble|crunchy|clusters)( |$)' AS c_dry,
    q_norm ~ '(^| )(wet|liquid|can|cans|canned|pouch|pouches|tray|trays|tub|cups|cup|pate|pat|gravy|sauce|stew|morsels|chunks|shreds|filets|loaf|minced|flaked|entree|entr e|broth)( |$)' AS q_wet,
    c_norm ~ '(^| )(wet|liquid|can|cans|canned|pouch|pouches|tray|trays|tub|cups|cup|pate|pat|gravy|sauce|stew|morsels|chunks|shreds|filets|loaf|minced|flaked|entree|entr e|broth)( |$)' AS c_wet,
    q_norm ~ '(^| )(fresh food|fresh dog food|fresh cat food|fresh frozen|fresh refrigerated|frozen|refrigerated)( |$)' AS q_fresh,
    c_norm ~ '(^| )(fresh food|fresh dog food|fresh cat food|fresh frozen|fresh refrigerated|frozen|refrigerated)( |$)' AS c_fresh,
    q_norm ~ '(^| )(freeze dried|freezedried|freeze dry)( |$)' AS q_freeze_dried,
    c_norm ~ '(^| )(freeze dried|freezedried|freeze dry)( |$)' AS c_freeze_dried,
    q_norm ~ '(^| )(dehydrated)( |$)' AS q_dehydrated,
    c_norm ~ '(^| )(dehydrated)( |$)' AS c_dehydrated,
    q_norm ~ '(^| )(air dried|airdried)( |$)' AS q_air_dried,
    c_norm ~ '(^| )(air dried|airdried)( |$)' AS c_air_dried,
    q_norm ~ '(^| )(raw food|raw frozen|frozen raw)( |$)' AS q_raw,
    c_norm ~ '(^| )(raw food|raw frozen|frozen raw)( |$)' AS c_raw
  FROM normalized
),
form_sets AS (
  SELECT
    ARRAY_REMOVE(ARRAY[
      CASE WHEN q_dry THEN 'dry' END,
      CASE WHEN q_wet THEN 'wet' END
    ], NULL) AS q_base_forms,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN c_dry THEN 'dry' END,
      CASE WHEN c_wet THEN 'wet' END
    ], NULL) AS c_base_forms,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN q_fresh THEN 'fresh' END,
      CASE WHEN q_freeze_dried THEN 'freeze_dried' END,
      CASE WHEN q_dehydrated THEN 'dehydrated' END,
      CASE WHEN q_air_dried THEN 'air_dried' END,
      CASE WHEN q_raw THEN 'raw' END
    ], NULL) AS q_special_forms,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN c_fresh THEN 'fresh' END,
      CASE WHEN c_freeze_dried THEN 'freeze_dried' END,
      CASE WHEN c_dehydrated THEN 'dehydrated' END,
      CASE WHEN c_air_dried THEN 'air_dried' END,
      CASE WHEN c_raw THEN 'raw' END
    ], NULL) AS c_special_forms
  FROM flags
)
SELECT CASE
  WHEN cardinality(q_base_forms) = 0 AND cardinality(q_special_forms) = 0 THEN TRUE
  WHEN cardinality(c_base_forms) = 0 AND cardinality(c_special_forms) = 0 THEN TRUE
  WHEN cardinality(q_special_forms) > 0 OR cardinality(c_special_forms) > 0 THEN
    EXISTS (
      SELECT 1
      FROM unnest(q_special_forms) AS q_special(form_name)
      JOIN unnest(c_special_forms) AS c_special(form_name)
        USING (form_name)
    )
    AND (
      cardinality(q_base_forms) = 0
      OR cardinality(c_base_forms) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(q_base_forms) AS q_base(form_name)
        JOIN unnest(c_base_forms) AS c_base(form_name)
          USING (form_name)
      )
    )
  WHEN cardinality(q_base_forms) = 0 OR cardinality(c_base_forms) = 0 THEN TRUE
  ELSE EXISTS (
    SELECT 1
    FROM unnest(q_base_forms) AS q_base(form_name)
    JOIN unnest(c_base_forms) AS c_base(form_name)
      USING (form_name)
  )
END
FROM form_sets;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) TO service_role;

WITH closed_duplicate_rows AS (
  SELECT
    q.id,
    q.cache_key AS legacy_cache_key,
    q.brand,
    q.product_name AS legacy_product_name,
    q.sample_metadata->>'duplicate_closed_by' AS duplicate_closed_by,
    q.sample_metadata->>'matched_cache_key' AS matched_cache_key,
    q.sample_metadata->>'matched_product_name' AS recorded_matched_product_name,
    q.sample_metadata->>'matched_source_url' AS recorded_matched_source_url,
    matched.product_name AS matched_product_name,
    matched.source_url AS matched_source_url,
    public.catalog_acquisition_food_form_terms_match(
      q.product_name,
      concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS food_form_ok
  FROM public.catalog_acquisition_queue q
  LEFT JOIN public.product_data matched
    ON matched.cache_key = q.sample_metadata->>'matched_cache_key'
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'duplicate_closed_by' = 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand'
),
closures_to_reopen AS (
  SELECT *
  FROM closed_duplicate_rows
  WHERE food_form_ok IS NOT TRUE
),
reopened_products AS (
  UPDATE public.product_data pd
  SET
    catalog_exclusion_reason = NULL,
    updated_at = now()
  FROM closures_to_reopen bad
  WHERE pd.cache_key = bad.legacy_cache_key
    AND pd.catalog_exclusion_reason = 'duplicate_verified_official_catalog_row'
  RETURNING pd.cache_key
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
      - 'matched_source_quality'
      - 'matched_source_url'
      - 'matched_rank'
      - 'direct_identity_score'
      - 'duplicate_closed_at'
      - 'duplicate_closed_by'
      || jsonb_build_object(
        'last_reconcile_checked_at', now(),
        'last_reconcile_checked_by', 'special_food_form_duplicate_guard',
        'last_reconcile_checked_result', 'reopened_special_food_form_mismatch',
        'previous_duplicate_closed_by', bad.duplicate_closed_by,
        'previous_matched_cache_key', bad.matched_cache_key,
        'previous_matched_product_name', COALESCE(bad.matched_product_name, bad.recorded_matched_product_name),
        'previous_matched_source_url', COALESCE(bad.matched_source_url, bad.recorded_matched_source_url),
        'previous_food_form_ok', bad.food_form_ok,
        'reopened_at', now(),
        'reopened_by', '269_require_special_food_form_duplicate_match',
        'reopen_reason', 'Direct duplicate closure failed protected special food-form guard.'
      )
  FROM closures_to_reopen bad
  WHERE q.id = bad.id
  RETURNING q.id
)
SELECT
  (SELECT count(*) FROM reopened_products) AS reopened_product_rows,
  (SELECT count(*) FROM reopened_queue) AS reopened_queue_rows;

DO $$
DECLARE
  remaining_bad_rows INTEGER;
BEGIN
  IF public.catalog_acquisition_food_form_terms_match(
    'Nature''s Recipe Freeze Dried Blend Chicken, Barley & Brown Rice Dry Dog Food',
    'Nature''s Recipe Chicken, Barley & Brown Rice Dry Dog Food dry https://www.naturesrecipe.com/product/natures-recipe-chicken-barley-brown-rice-recipe-dry-dog-food/'
  ) THEN
    RAISE EXCEPTION 'food-form guard must reject freeze-dried blend matched to normal dry food';
  END IF;

  IF public.catalog_acquisition_food_form_terms_match(
    'Nature''s Recipe Chicken, Barley & Brown Rice Dry Dog Food',
    'Nature''s Recipe Freeze Dried Blend Dry Dog Food dry https://www.naturesrecipe.com/product/natures-recipe-freeze-dried-blend-chicken-barley-brown-rice-recipe-dry-dog-food/'
  ) THEN
    RAISE EXCEPTION 'food-form guard must reject normal dry food matched to freeze-dried blend';
  END IF;

  IF NOT public.catalog_acquisition_food_form_terms_match(
    'Nature''s Recipe Freeze Dried Blend Chicken, Barley & Brown Rice Dry Dog Food',
    'Nature''s Recipe Freeze Dried Blend Dry Dog Food dry https://www.naturesrecipe.com/product/natures-recipe-freeze-dried-blend-chicken-barley-brown-rice-recipe-dry-dog-food/'
  ) THEN
    RAISE EXCEPTION 'food-form guard should allow matching freeze-dried blend formulas';
  END IF;

  SELECT count(*)::INTEGER
  INTO remaining_bad_rows
  FROM public.catalog_acquisition_queue q
  LEFT JOIN public.product_data matched
    ON matched.cache_key = q.sample_metadata->>'matched_cache_key'
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'duplicate_closed_by' = 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand'
    AND NOT public.catalog_acquisition_food_form_terms_match(
      q.product_name,
      concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    );

  IF remaining_bad_rows <> 0 THEN
    RAISE EXCEPTION 'direct duplicate special food-form guard failures remain: %', remaining_bad_rows;
  END IF;
END $$;
