-- The serving-table ingredient contract intentionally removes Purina's
-- trailing package formula/version code because it is not an ingredient.
-- Preserve the exact readable Target statement verbatim in source provenance
-- while keeping the cleaned ingredient list for scoring. Also expose the
-- representative TCIN/UPC at the top level of version provenance.

WITH reviewed AS (
  SELECT DISTINCT ON (formula.id)
    formula.id AS formula_id,
    formula.promoted_cache_key,
    formula.ingredient_text,
    formula.ingredients,
    observation.source_external_id,
    observation.source_url,
    observation.raw_payload->>'target_upc' AS package_gtin,
    observation.front_image_url,
    observation.observed_at
  FROM public.catalog_formulas formula
  JOIN public.catalog_observations observation
    ON observation.formula_id = formula.id
  JOIN public.catalog_source_runs source_run
    ON source_run.id = observation.run_id
  WHERE source_run.run_key =
      'target-purina-one-reviewed-source-versions-v120:20260726'
  ORDER BY
    formula.id,
    (observation.source_url = formula.source_url) DESC,
    observation.source_external_id
)
UPDATE public.product_data serving
SET
  formula_version_provenance =
    COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
    jsonb_build_object(
      'source_url', reviewed.source_url,
      'product_code', 'TCIN ' || reviewed.source_external_id,
      'package_gtin', reviewed.package_gtin,
      'front_image_url', reviewed.front_image_url,
      'captured_at', reviewed.observed_at,
      'source_verbatim_ingredient_text', reviewed.ingredient_text,
      'source_verbatim_ingredient_hash', encode(
        digest(
          public.catalog_normalize_ingredient_evidence(
            reviewed.ingredient_text
          ),
          'sha256'
        ),
        'hex'
      ),
      'verbatim_source_statement_preserved', true,
      'exact_package_identity', true
    ),
  updated_at = now()
FROM reviewed
WHERE serving.cache_key = reviewed.promoted_cache_key;

WITH reviewed AS (
  SELECT DISTINCT ON (formula.id)
    formula.id AS formula_id,
    observation.source_external_id,
    observation.source_url,
    observation.raw_payload->>'target_upc' AS package_gtin,
    observation.front_image_url,
    observation.observed_at
  FROM public.catalog_formulas formula
  JOIN public.catalog_observations observation
    ON observation.formula_id = formula.id
  JOIN public.catalog_source_runs source_run
    ON source_run.id = observation.run_id
  WHERE source_run.run_key =
      'target-purina-one-reviewed-source-versions-v120:20260726'
  ORDER BY
    formula.id,
    (observation.source_url = formula.source_url) DESC,
    observation.source_external_id
)
UPDATE public.catalog_formulas formula
SET
  formula_version_provenance =
    COALESCE(formula.formula_version_provenance, '{}'::JSONB) ||
    jsonb_build_object(
      'source_url', reviewed.source_url,
      'product_code', 'TCIN ' || reviewed.source_external_id,
      'package_gtin', reviewed.package_gtin,
      'front_image_url', reviewed.front_image_url,
      'captured_at', reviewed.observed_at,
      'source_verbatim_ingredient_text', formula.ingredient_text,
      'source_verbatim_ingredient_hash', encode(
        digest(
          public.catalog_normalize_ingredient_evidence(
            formula.ingredient_text
          ),
          'sha256'
        ),
        'hex'
      ),
      'verbatim_source_statement_preserved', true,
      'exact_package_identity', true
    ),
  updated_at = now()
FROM reviewed
WHERE formula.id = reviewed.formula_id;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.catalog_formulas formula
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.id IN (
      SELECT DISTINCT observation.formula_id
      FROM public.catalog_observations observation
      JOIN public.catalog_source_runs source_run
        ON source_run.id = observation.run_id
      WHERE source_run.run_key =
        'target-purina-one-reviewed-source-versions-v120:20260726'
    )
      AND serving.ingredients = formula.ingredients
      AND serving.formula_version_provenance
        ->>'source_verbatim_ingredient_text' = formula.ingredient_text
      AND serving.formula_version_provenance
        ->>'verbatim_source_statement_preserved' = 'true'
      AND serving.formula_version_provenance->>'product_code'
        LIKE 'TCIN %'
      AND length(
        serving.formula_version_provenance
          ->>'source_verbatim_ingredient_hash'
      ) = 64
  ) <> 8 THEN
    RAISE EXCEPTION
      'Target Purina ONE verbatim serving evidence is incomplete';
  END IF;

  IF EXISTS (
    SELECT conflict.gtin
    FROM unnest(ARRAY[
      '017800031998',
      '017800158459',
      '017800189187',
      '017800146043',
      '017800102032',
      '017800102056',
      '017800102360'
    ]::TEXT[]) conflict(gtin)
    WHERE EXISTS (
      SELECT 1
      FROM public.resolve_verified_product_by_gtin(conflict.gtin, 8)
    )
  ) THEN
    RAISE EXCEPTION
      'A reused Purina ONE UPC resumed deterministic resolution';
  END IF;
END
$$;
