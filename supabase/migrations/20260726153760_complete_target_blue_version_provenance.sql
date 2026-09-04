-- Complete serving-row provenance for the six exact Target package versions.
-- The product code is intentionally stored alongside the GTIN: neither alone
-- is allowed to collapse a different ingredient version.

WITH evidence AS (
  SELECT
    formula.id AS formula_id,
    formula.promoted_cache_key,
    observation.source_external_id,
    observation.source_url,
    observation.gtin,
    observation.front_image_url,
    observation.observed_at,
    encode(
      digest(
        public.catalog_normalize_ingredient_evidence(
          observation.ingredient_text
        ),
        'sha256'
      ),
      'hex'
    ) AS ingredient_hash
  FROM public.catalog_source_runs source_run
  JOIN public.catalog_observations observation
    ON observation.run_id = source_run.id
  JOIN public.catalog_formulas formula
    ON formula.id = observation.formula_id
  WHERE source_run.run_key =
      'target-blue-buffalo-reviewed-source-versions-v114:20260726'
    AND observation.validation_status = 'accepted'
    AND formula.formula_evidence_tier = 'retailer_web_version'
)
UPDATE public.product_data serving
SET
  formula_version_provenance =
    COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'source_type', 'exact_retailer_package_page',
      'source_url', evidence.source_url,
      'captured_at', evidence.observed_at,
      'package_gtin', evidence.gtin,
      'product_code', 'TCIN ' || evidence.source_external_id,
      'front_image_url', evidence.front_image_url,
      'ingredient_text_hash', evidence.ingredient_hash,
      'exact_package_identity', true
    ),
  updated_at = now()
FROM evidence
WHERE serving.cache_key = evidence.promoted_cache_key;

WITH evidence AS (
  SELECT
    formula.id AS formula_id,
    observation.source_external_id,
    observation.gtin,
    observation.front_image_url,
    observation.observed_at
  FROM public.catalog_source_runs source_run
  JOIN public.catalog_observations observation
    ON observation.run_id = source_run.id
  JOIN public.catalog_formulas formula
    ON formula.id = observation.formula_id
  WHERE source_run.run_key =
      'target-blue-buffalo-reviewed-source-versions-v114:20260726'
    AND observation.validation_status = 'accepted'
)
UPDATE public.catalog_formulas formula
SET
  formula_version_provenance =
    COALESCE(formula.formula_version_provenance, '{}'::JSONB) ||
    jsonb_build_object(
      'package_gtin', evidence.gtin,
      'product_code', 'TCIN ' || evidence.source_external_id,
      'front_image_url', evidence.front_image_url,
      'captured_at', evidence.observed_at,
      'exact_package_identity', true
    ),
  updated_at = now()
FROM evidence
WHERE formula.id = evidence.formula_id;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.catalog_formulas formula
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.formula_key LIKE 'target-retailer-version:%'
      AND formula.source_url IN (
        SELECT observation.source_url
        FROM public.catalog_observations observation
        JOIN public.catalog_source_runs source_run
          ON source_run.id = observation.run_id
        WHERE source_run.run_key =
          'target-blue-buffalo-reviewed-source-versions-v114:20260726'
      )
      AND serving.formula_evidence_tier = 'retailer_web_version'
      AND serving.formula_version_provenance->>'product_code'
        LIKE 'TCIN %'
      AND serving.formula_version_provenance->>'package_gtin'
        = serving.gtin
      AND serving.formula_version_provenance->>'front_image_url'
        = serving.image_url
      AND length(
        serving.formula_version_provenance->>'ingredient_text_hash'
      ) = 64
  ) <> 6 THEN
    RAISE EXCEPTION
      'Target Blue serving version provenance is incomplete';
  END IF;
END;
$$;
