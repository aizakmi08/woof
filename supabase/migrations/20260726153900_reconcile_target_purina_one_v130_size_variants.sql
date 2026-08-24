-- Four exact Target PDPs have version-safe UPCs and full ingredients but use
-- a formula-correct image with the wrong size badge. Attach the UPCs as SKU
-- children with explicit image scope. Keep the fifth reused UPC non-resolving.

DO $$
DECLARE
  v_review_run_id BIGINT;
  v_mapping_count INTEGER;
BEGIN
  SELECT id INTO STRICT v_review_run_id
  FROM public.catalog_source_runs
  WHERE run_key =
    'target-purina-one-review-v130:fe4464088c835d99286b7376';

  CREATE TEMP TABLE pg_temp.v130_size_variant_map ON COMMIT DROP AS
  SELECT
    review.id AS review_observation_id,
    review.source_external_id,
    review.gtin,
    review.package_size,
    review.source_url,
    review.observed_at,
    review.front_image_url,
    accepted.formula_id,
    formula.promoted_cache_key,
    review.source_external_id IN (
      '83904106', '14327639', '11215770', '11215764'
    ) AS version_safe
  FROM public.catalog_observations review
  JOIN public.catalog_observations accepted
    ON lower(btrim(accepted.manufacturer)) =
      lower(btrim(review.manufacturer))
   AND lower(btrim(accepted.brand)) = lower(btrim(review.brand))
   AND lower(btrim(accepted.product_line)) =
      lower(btrim(review.product_line))
   AND lower(btrim(accepted.pet_type)) = lower(btrim(review.pet_type))
   AND lower(btrim(accepted.life_stage)) = lower(btrim(review.life_stage))
   AND lower(btrim(accepted.food_form)) = lower(btrim(review.food_form))
   AND lower(btrim(accepted.flavor)) = lower(btrim(review.flavor))
   AND lower(btrim(COALESCE(accepted.diet_condition, ''))) =
      lower(btrim(COALESCE(review.diet_condition, '')))
   AND public.catalog_normalize_ingredient_evidence(
     accepted.ingredient_text
   ) = public.catalog_normalize_ingredient_evidence(review.ingredient_text)
  JOIN public.catalog_source_runs accepted_run
    ON accepted_run.id = accepted.run_id
   AND accepted_run.run_key LIKE
     'target-purina-one-reviewed-source-versions-v131%:20260726'
  JOIN public.catalog_formulas formula
    ON formula.id = accepted.formula_id
   AND formula.active
   AND formula.verification_status = 'verified'
   AND formula.formula_evidence_tier = 'retailer_web_version'
   AND formula.promoted_cache_key IS NOT NULL
  WHERE review.run_id = v_review_run_id
    AND review.validation_reasons =
      ARRAY['package_size_image_mismatch']::TEXT[]
    AND review.source_external_id IN (
      '83904106', '14327639', '23951885', '11215770', '11215764'
    );

  SELECT count(*) INTO v_mapping_count
  FROM pg_temp.v130_size_variant_map;

  IF v_mapping_count <> 5
    OR (
      SELECT count(DISTINCT review_observation_id)
      FROM pg_temp.v130_size_variant_map
    ) <> 5
  THEN
    RAISE EXCEPTION 'Purina ONE v130 size mapping changed: %',
      v_mapping_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.v130_size_variant_map mapping
    JOIN public.product_data serving
      ON regexp_replace(COALESCE(serving.gtin, ''), '\D', '', 'g') =
        mapping.gtin
     AND NULLIF(btrim(serving.ingredient_text), '') IS NOT NULL
    JOIN public.catalog_observations review
      ON review.id = mapping.review_observation_id
    WHERE mapping.version_safe
      AND public.catalog_normalize_ingredient_evidence(
        serving.ingredient_text
      ) <> public.catalog_normalize_ingredient_evidence(
        review.ingredient_text
      )
  ) THEN
    RAISE EXCEPTION 'A version-safe size UPC gained a formula conflict';
  END IF;

  UPDATE public.catalog_skus sku
  SET active = false, updated_at = now()
  FROM pg_temp.v130_size_variant_map mapping
  WHERE mapping.version_safe
    AND sku.gtin = mapping.gtin
    AND sku.formula_id <> mapping.formula_id
    AND sku.active;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  )
  SELECT
    formula_id, gtin, package_size, 1,
    'target-purina-one-reviewed-v131-size-variant',
    source_external_id, source_url, true, observed_at, observed_at, now()
  FROM pg_temp.v130_size_variant_map
  WHERE version_safe
  ON CONFLICT (source_slug, source_external_id, gtin, package_size)
  DO UPDATE SET
    formula_id = excluded.formula_id,
    source_url = excluded.source_url,
    active = true,
    last_observed_at = excluded.last_observed_at,
    updated_at = now();

  UPDATE public.catalog_observations observation
  SET
    formula_id = mapping.formula_id,
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      COALESCE(observation.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned_size_variant',
        'source_type', 'exact_retailer_package_page',
        'source_url', mapping.source_url,
        'captured_at', mapping.observed_at,
        'product_code', 'TCIN ' || mapping.source_external_id,
        'package_gtin', mapping.gtin,
        'package_size', mapping.package_size,
        'front_image_url', mapping.front_image_url,
        'image_identity_status', 'formula_match_size_badge_mismatch',
        'matching_package_size_front_image', false,
        'exact_package_identity_from_pdp_upc', true,
        'barcode_resolution_policy', CASE
          WHEN mapping.version_safe THEN 'exact_source_version'
          ELSE 'abstain_reused_gtin_formula_conflict'
        END
      )
  FROM pg_temp.v130_size_variant_map mapping
  WHERE observation.id = mapping.review_observation_id;

  UPDATE public.catalog_formulas formula
  SET
    formula_version_provenance =
      COALESCE(formula.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'size_variant_package_evidence', evidence.rows,
        'size_variant_image_policy',
          'formula image matches; package-size badge differs'
      ),
    updated_at = now()
  FROM (
    SELECT formula_id, jsonb_agg(jsonb_build_object(
      'product_code', 'TCIN ' || source_external_id,
      'package_gtin', gtin,
      'package_size', package_size,
      'source_url', source_url,
      'captured_at', observed_at,
      'matching_package_size_front_image', false,
      'barcode_resolution_policy', CASE
        WHEN version_safe THEN 'exact_source_version'
        ELSE 'abstain_reused_gtin_formula_conflict'
      END
    ) ORDER BY source_external_id) AS rows
    FROM pg_temp.v130_size_variant_map
    GROUP BY formula_id
  ) evidence
  WHERE formula.id = evidence.formula_id;

  UPDATE public.product_data serving
  SET
    formula_version_provenance =
      COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'size_variant_package_evidence', evidence.rows,
        'size_variant_image_policy',
          'formula image matches; package-size badge differs'
      ),
    updated_at = now()
  FROM (
    SELECT promoted_cache_key, jsonb_agg(jsonb_build_object(
      'product_code', 'TCIN ' || source_external_id,
      'package_gtin', gtin,
      'package_size', package_size,
      'source_url', source_url,
      'captured_at', observed_at,
      'matching_package_size_front_image', false,
      'barcode_resolution_policy', CASE
        WHEN version_safe THEN 'exact_source_version'
        ELSE 'abstain_reused_gtin_formula_conflict'
      END
    ) ORDER BY source_external_id) AS rows
    FROM pg_temp.v130_size_variant_map
    GROUP BY promoted_cache_key
  ) evidence
  WHERE serving.cache_key = evidence.promoted_cache_key;

  UPDATE public.catalog_skus
  SET active = false, updated_at = now()
  WHERE gtin = '017800167468' AND active;

  IF (
    SELECT count(*)
    FROM pg_temp.v130_size_variant_map mapping
    WHERE mapping.version_safe
      AND (
        SELECT count(*)
        FROM public.resolve_verified_product_by_gtin(mapping.gtin, 8)
        WHERE nutritional_info->>'formula_evidence_tier' =
          'retailer_web_version'
      ) = 1
  ) <> 4 THEN
    RAISE EXCEPTION 'A safe v130 size UPC did not resolve exactly';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('017800167468', 8)
  ) THEN
    RAISE EXCEPTION 'Conflicted v130 size UPC still resolves';
  END IF;
END
$$;
