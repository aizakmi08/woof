-- Two reviewed Nutro size/package observations shared exact normalized
-- ingredients with a manufacturer-current sibling in the same reviewed
-- formula family. Preserve their package evidence on the current formula,
-- keep reused GTINs non-resolving, and retire the redundant serving aliases.
DO $$
DECLARE
  v_adult_current BIGINT := 36483;
  v_adult_duplicate BIGINT := 39075;
  v_large_current BIGINT := 36505;
  v_large_duplicate BIGINT := 39073;
BEGIN
  IF (
    SELECT public.catalog_normalize_ingredient_evidence(ingredient_text)
    FROM public.catalog_formulas
    WHERE id = v_adult_current
  ) IS DISTINCT FROM (
    SELECT public.catalog_normalize_ingredient_evidence(ingredient_text)
    FROM public.catalog_formulas
    WHERE id = v_adult_duplicate
  ) OR (
    SELECT public.catalog_normalize_ingredient_evidence(ingredient_text)
    FROM public.catalog_formulas
    WHERE id = v_large_current
  ) IS DISTINCT FROM (
    SELECT public.catalog_normalize_ingredient_evidence(ingredient_text)
    FROM public.catalog_formulas
    WHERE id = v_large_duplicate
  ) THEN
    RAISE EXCEPTION
      'Nutro equivalent size-family ingredient evidence changed';
  END IF;

  UPDATE public.catalog_observations
  SET
    formula_id = CASE formula_id
      WHEN v_adult_duplicate THEN v_adult_current
      WHEN v_large_duplicate THEN v_large_current
    END,
    formula_evidence_tier = 'manufacturer_current_exact',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'manufacturer_current_equivalent_package',
        'manufacturer_current_equivalence', true,
        'ingredient_hash_equality_verified', true,
        'barcode_resolution_policy',
          'abstain_reused_gtin_formula_conflict',
        'canonical_family_repair',
          'target-nutro-equivalent-size-family-v194'
      )
  WHERE formula_id IN (v_adult_duplicate, v_large_duplicate);

  INSERT INTO public.catalog_field_evidence (
    formula_id,
    observation_id,
    field_name,
    field_value,
    source_url,
    source_authority,
    accepted,
    observed_at,
    content_hash
  )
  SELECT
    observation.formula_id,
    observation.id,
    evidence.field_name,
    evidence.field_value,
    evidence.source_url,
    evidence.source_authority,
    true,
    evidence.observed_at,
    evidence.content_hash
  FROM public.catalog_field_evidence evidence
  JOIN public.catalog_observations observation
    ON observation.id = evidence.observation_id
  WHERE evidence.formula_id IN (v_adult_duplicate, v_large_duplicate)
    AND evidence.field_name IN ('ingredient_text', 'front_image_url')
  ON CONFLICT (formula_id, field_name, source_url, content_hash)
  DO UPDATE SET
    observation_id = excluded.observation_id,
    accepted = true;

  UPDATE public.catalog_field_evidence
  SET accepted = false
  WHERE formula_id IN (v_adult_duplicate, v_large_duplicate);

  UPDATE public.catalog_skus
  SET active = false, updated_at = now()
  WHERE gtin IN ('079105129633', '079105132961')
    AND active;

  UPDATE public.product_data
  SET
    gtin = NULL,
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'superseded_gtin', gtin,
        'gtin_resolution_policy',
          'abstain_reused_gtin_formula_conflict',
        'canonical_family_repair',
          'target-nutro-equivalent-size-family-v194'
      ),
    updated_at = now()
  WHERE regexp_replace(COALESCE(gtin, ''), '\D', '', 'g')
    IN ('079105129633', '079105132961');

  UPDATE public.product_data serving
  SET
    formula_version_provenance =
      COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'reviewed_equivalent_packages',
        COALESCE(
          serving.formula_version_provenance
            -> 'reviewed_equivalent_packages',
          '[]'::JSONB
        ) || CASE serving.cache_key
          WHEN 'nutro:079105116275' THEN jsonb_build_array(
            jsonb_build_object(
              'product_code', 'TCIN 80633921',
              'package_gtin', '079105129633',
              'source_url', 'https://www.target.com/p/-/A-80633921',
              'captured_at', '2026-07-27T19:33:03.792Z',
              'ingredient_hash_equality_verified', true,
              'barcode_resolution_policy',
                'abstain_reused_gtin_formula_conflict'
            )
          )
          WHEN 'nutro:079105116374' THEN jsonb_build_array(
            jsonb_build_object(
              'product_code', 'TCIN 94414963',
              'package_gtin', '079105132961',
              'source_url', 'https://www.target.com/p/-/A-94414963',
              'captured_at', '2026-07-27T19:33:03.792Z',
              'ingredient_hash_equality_verified', true,
              'barcode_resolution_policy',
                'abstain_reused_gtin_formula_conflict'
            )
          )
          ELSE '[]'::JSONB
        END
      ),
    updated_at = now()
  WHERE serving.cache_key IN (
    'nutro:079105116275',
    'nutro:079105116374'
  );

  UPDATE public.catalog_formulas
  SET
    active = false,
    verification_status = 'discontinued',
    absent_since = now(),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'superseded_by_formula_id',
          CASE id
            WHEN v_adult_duplicate THEN v_adult_current
            WHEN v_large_duplicate THEN v_large_current
          END,
        'supersession_reason',
          'exact_ingredient_equivalent_reviewed_size_family'
      ),
    updated_at = now()
  WHERE id IN (v_adult_duplicate, v_large_duplicate);

  DELETE FROM public.product_data
  WHERE cache_key IN (
    'census:d205fc97b0c32ddb8b6a8ad55e424ab3',
    'census:bf82cf4bd8e96a8b21e03199f3fbd05b'
  );

  IF EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin(
      '079105129633',
      8
    )
  ) OR EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin(
      '079105132961',
      8
    )
  ) THEN
    RAISE EXCEPTION
      'A repaired Nutro reused GTIN still resolved';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key IN (
      'census:d205fc97b0c32ddb8b6a8ad55e424ab3',
      'census:bf82cf4bd8e96a8b21e03199f3fbd05b'
    )
  ) THEN
    RAISE EXCEPTION 'Redundant Nutro serving aliases remain';
  END IF;
END
$$;
