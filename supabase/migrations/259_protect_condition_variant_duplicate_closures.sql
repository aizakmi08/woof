-- Direct duplicate reconciliation must not close underspecified legacy titles
-- onto condition-specific formulas such as Weight Management, Urinary, or
-- Hairball. The verified row can be source-backed and still be the wrong
-- variant if the legacy identity omits those protected terms.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_protected_line_terms_match(
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
    q_norm ~ '(^| )high protein( |$)' AS q_high_protein,
    c_norm ~ '(^| )high protein( |$)' AS c_high_protein,
    q_norm ~ '(^| )blue( |$)' AND q_norm ~ '(^| )wilderness( |$)' AS q_blue_wilderness,
    c_norm ~ '(^| )blue( |$)' AND c_norm ~ '(^| )wilderness( |$)' AS c_blue_wilderness,
    q_norm ~ '(^| )challenger( |$)' AS q_nulo_challenger,
    c_norm ~ '(^| )challenger( |$)' AS c_nulo_challenger,
    (
      q_norm ~ '(^| )sport( |$)'
      AND q_norm ~ '(^| )performance( |$)'
    ) OR q_norm ~ '(^| )30 20( |$)' AS q_pro_plan_sport,
    (
      c_norm ~ '(^| )sport( |$)'
      AND c_norm ~ '(^| )performance( |$)'
    ) OR c_norm ~ '(^| )30 20( |$)' AS c_pro_plan_sport,
    q_norm ~ '(^| )(healthy weight|weight management|weight control|weight care|weight loss|reduced calorie)( |$)' AS q_weight_condition,
    c_norm ~ '(^| )(healthy weight|weight management|weight control|weight care|weight loss|reduced calorie)( |$)' AS c_weight_condition,
    q_norm ~ '(^| )(sensitive|skin stomach|skin and stomach)( |$)' AS q_sensitive_condition,
    c_norm ~ '(^| )(sensitive|skin stomach|skin and stomach)( |$)' AS c_sensitive_condition,
    q_norm ~ '(^| )urinary( |$)' AS q_urinary_condition,
    c_norm ~ '(^| )urinary( |$)' AS c_urinary_condition,
    q_norm ~ '(^| )hairball( |$)' AS q_hairball_condition,
    c_norm ~ '(^| )hairball( |$)' AS c_hairball_condition,
    q_norm ~ '(^| )indoor( |$)' AS q_indoor_condition,
    c_norm ~ '(^| )indoor( |$)' AS c_indoor_condition,
    q_norm ~ '(^| )(digestive|gastrointestinal)( |$)' AS q_digestive_condition,
    c_norm ~ '(^| )(digestive|gastrointestinal)( |$)' AS c_digestive_condition,
    q_norm ~ '(^| )(mobility|joint)( |$)' AS q_mobility_condition,
    c_norm ~ '(^| )(mobility|joint)( |$)' AS c_mobility_condition,
    q_norm ~ '(^| )(dental|oral care)( |$)' AS q_dental_condition,
    c_norm ~ '(^| )(dental|oral care)( |$)' AS c_dental_condition,
    q_norm ~ '(^| )(renal|kidney)( |$)' AS q_renal_condition,
    c_norm ~ '(^| )(renal|kidney)( |$)' AS c_renal_condition,
    q_norm ~ '(^| )(hydrolyzed|hydrolysed)( |$)' AS q_hydrolyzed_condition,
    c_norm ~ '(^| )(hydrolyzed|hydrolysed)( |$)' AS c_hydrolyzed_condition
  FROM normalized
)
SELECT
  (
    q_high_protein = c_high_protein
    OR (
      -- Blue Wilderness high-protein line equivalence.
      q_high_protein
      AND NOT c_high_protein
      AND q_blue_wilderness
      AND c_blue_wilderness
    )
    OR (
      -- Nulo Challenger products use "High-Protein Kibble" in official titles.
      c_high_protein
      AND NOT q_high_protein
      AND q_nulo_challenger
      AND c_nulo_challenger
    )
    OR (
      -- Pro Plan Sport 30/20 titles are the high-protein Sport line.
      c_high_protein
      AND NOT q_high_protein
      AND q_pro_plan_sport
      AND c_pro_plan_sport
    )
  )
  AND q_weight_condition = c_weight_condition
  AND q_sensitive_condition = c_sensitive_condition
  AND q_urinary_condition = c_urinary_condition
  AND q_hairball_condition = c_hairball_condition
  AND q_indoor_condition = c_indoor_condition
  AND q_digestive_condition = c_digestive_condition
  AND q_mobility_condition = c_mobility_condition
  AND q_dental_condition = c_dental_condition
  AND q_renal_condition = c_renal_condition
  AND q_hydrolyzed_condition = c_hydrolyzed_condition
FROM flags;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) TO service_role;

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
    public.catalog_quality_state(
      matched.pet_type,
      matched.is_complete_food,
      matched.catalog_exclusion_reason,
      matched.ingredient_text,
      matched.ingredient_count,
      matched.ingredient_verification_status,
      matched.image_url,
      matched.image_verification_status,
      matched.source_url,
      matched.expires_at
    ) AS matched_quality_state,
    public.catalog_acquisition_life_stage_terms_match(
      q.product_name,
      concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS life_stage_ok,
    public.catalog_acquisition_protected_line_terms_match(
      q.product_name,
      concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS line_ok,
    public.catalog_acquisition_food_form_terms_match(
      q.product_name,
      concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS food_form_ok,
    public.catalog_acquisition_size_terms_match(
      q.product_name,
      concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS size_ok,
    public.catalog_acquisition_package_count_match(
      q.product_name,
      concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS package_count_ok
  FROM public.catalog_acquisition_queue q
  LEFT JOIN public.product_data matched
    ON matched.cache_key = q.sample_metadata->>'matched_cache_key'
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'duplicate_closed_by' = 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand'
),
closures_to_reopen AS (
  SELECT *
  FROM closed_duplicate_rows
  WHERE matched_quality_state IS DISTINCT FROM 'verified_ready'
    OR life_stage_ok IS NOT TRUE
    OR line_ok IS NOT TRUE
    OR food_form_ok IS NOT TRUE
    OR size_ok IS NOT TRUE
    OR package_count_ok IS NOT TRUE
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
        'last_reconcile_checked_by', 'condition_variant_duplicate_guard',
        'last_reconcile_checked_result', 'reopened_condition_variant_or_demoted_match',
        'previous_duplicate_closed_by', bad.duplicate_closed_by,
        'previous_matched_cache_key', bad.matched_cache_key,
        'previous_matched_product_name', COALESCE(bad.matched_product_name, bad.recorded_matched_product_name),
        'previous_matched_source_url', COALESCE(bad.matched_source_url, bad.recorded_matched_source_url),
        'previous_matched_quality_state', bad.matched_quality_state,
        'previous_life_stage_ok', bad.life_stage_ok,
        'previous_line_ok', bad.line_ok,
        'previous_food_form_ok', bad.food_form_ok,
        'previous_size_ok', bad.size_ok,
        'previous_package_count_ok', bad.package_count_ok,
        'reopened_at', now(),
        'reopened_by', '259_protect_condition_variant_duplicate_closures',
        'reopen_reason', 'Direct duplicate closure failed verified-ready or protected variant guards.'
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
  IF public.catalog_acquisition_protected_line_terms_match(
    'Purina Pro Plan Adult Chicken Rice Entree Wet Dog Food',
    'Pro Plan Adult Weight Management Chicken Rice Entree In Gravy Wet Dog Food https://www.purina.com/dogs/shop/pro-plan-weight-management-chicken-rice-gravy-wet-dog-food'
  ) THEN
    RAISE EXCEPTION 'condition variant guard must reject generic title matched to weight-management formula';
  END IF;

  IF NOT public.catalog_acquisition_protected_line_terms_match(
    'Purina Pro Plan Weight Management Chicken Rice Entree Wet Dog Food',
    'Pro Plan Adult Weight Management Chicken Rice Entree In Gravy Wet Dog Food https://www.purina.com/dogs/shop/pro-plan-weight-management-chicken-rice-gravy-wet-dog-food'
  ) THEN
    RAISE EXCEPTION 'condition variant guard should allow explicit weight-management aliases';
  END IF;

  IF NOT public.catalog_acquisition_protected_line_terms_match(
    'Purina Pro Plan Senior Sensitive Stomach Salmon Rice Entree',
    'Purina Pro Plan Adult 7+ Sensitive Skin Stomach Salmon Rice Entree Classic Wet Dog Food'
  ) THEN
    RAISE EXCEPTION 'condition variant guard should allow sensitive stomach aliases';
  END IF;

  IF public.catalog_acquisition_protected_line_terms_match(
    'Royal Canin Adult Thin Slices in Gravy Cat Food',
    'Royal Canin Feline Hairball Care Thin Slices in Gravy Cat Food'
  ) THEN
    RAISE EXCEPTION 'condition variant guard must reject missing hairball term';
  END IF;

  IF NOT public.catalog_acquisition_protected_line_terms_match(
    'Nulo challenger Small Breed Northern Catch Haddock Salmon Redfish',
    'Nulo Challenger High-Protein Kibble For Small Breed Northern Catch Haddock Salmon Redfish'
  ) THEN
    RAISE EXCEPTION 'Nulo Challenger should still allow official high-protein wording';
  END IF;

  IF NOT public.catalog_acquisition_protected_line_terms_match(
    'Purina Pro Plan Sport Performance 30/20 Chicken and Rice',
    'Pro Plan All Ages Sport Performance 30/20 High Protein Chicken Rice Formula'
  ) THEN
    RAISE EXCEPTION 'Pro Plan Sport 30/20 should still allow official high-protein wording';
  END IF;

  SELECT count(*)::INTEGER
  INTO remaining_bad_rows
  FROM public.catalog_acquisition_queue q
  LEFT JOIN public.product_data matched
    ON matched.cache_key = q.sample_metadata->>'matched_cache_key'
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'duplicate_closed_by' = 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand'
    AND (
      public.catalog_quality_state(
        matched.pet_type,
        matched.is_complete_food,
        matched.catalog_exclusion_reason,
        matched.ingredient_text,
        matched.ingredient_count,
        matched.ingredient_verification_status,
        matched.image_url,
        matched.image_verification_status,
        matched.source_url,
        matched.expires_at
      ) IS DISTINCT FROM 'verified_ready'
      OR NOT public.catalog_acquisition_life_stage_terms_match(
        q.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      )
      OR NOT public.catalog_acquisition_protected_line_terms_match(
        q.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      )
      OR NOT public.catalog_acquisition_food_form_terms_match(
        q.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      )
      OR NOT public.catalog_acquisition_size_terms_match(
        q.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      )
      OR NOT public.catalog_acquisition_package_count_match(
        q.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      )
    );

  IF remaining_bad_rows <> 0 THEN
    RAISE EXCEPTION 'direct duplicate closure guard failures remain: %', remaining_bad_rows;
  END IF;
END $$;
