-- The v139 exact-equivalence groups were promoted immediately before the
-- reusable helper began preserving reviewed package identities on serving
-- provenance. Backfill those four accepted packages once.
DO $$
DECLARE v_count INTEGER;
BEGIN
  WITH reviewed_packages AS (
    SELECT
      observation.formula_id,
      jsonb_agg(
        jsonb_build_object(
          'product_code', 'TCIN ' || observation.source_external_id,
          'package_gtin', observation.gtin,
          'package_size', observation.package_size,
          'source_url', observation.source_url,
          'front_image_url', observation.front_image_url,
          'captured_at', observation.observed_at,
          'ingredient_hash_equality_verified', true,
          'barcode_resolution_policy', 'prefer_existing_verified_formula'
        )
        ORDER BY observation.source_external_id
      ) AS rows
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key =
      'target-blue-buffalo-review-v139:b83e1e18bad1b75082664881'
      AND observation.validation_status = 'accepted'
      AND observation.validation_reasons = ARRAY[]::TEXT[]
      AND observation.formula_version_provenance->>'version_status' =
        'manufacturer_current_equivalent_package'
    GROUP BY observation.formula_id
  )
  UPDATE public.product_data serving
  SET
    formula_version_provenance =
      COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'reviewed_equivalent_packages',
        reviewed_packages.rows
      ),
    updated_at = now()
  FROM reviewed_packages
  JOIN public.catalog_formulas formula
    ON formula.id = reviewed_packages.formula_id
  WHERE serving.cache_key = formula.promoted_cache_key;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 4 THEN
    RAISE EXCEPTION
      'Blue v139 exact-equivalence provenance count changed: %',
      v_count;
  END IF;
END
$$;
