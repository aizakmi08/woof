-- Five exact-version UPCs resolve to their reviewed source version, one exact
-- package links to the existing verified formula, and one reused/conflicting
-- UPC safely abstains.
DO $$
DECLARE
  v_resolved INTEGER;
  v_abstained INTEGER;
BEGIN
  WITH expected(gtin) AS (
    VALUES
      ('840243158669'),
      ('859610007646'),
      ('840243101849'),
      ('840243122509'),
      ('840243158188'),
      ('840243158164')
  )
  SELECT count(*)
  INTO v_resolved
  FROM expected
  WHERE (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
  ) = 1;

  SELECT count(*)
  INTO v_abstained
  FROM (
    VALUES ('840243104840')
  ) expected(gtin)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
  );

  IF v_resolved <> 6 OR v_abstained <> 1 THEN
    RAISE EXCEPTION
      'Target Blue Buffalo v147 barcode regression: resolved %/6, abstained %/1',
      v_resolved,
      v_abstained;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('840243158188', 8)
    WHERE product_name =
      'Blue Buffalo Love Made Fresh Chunky Beef Stew with Peas & Carrots '
      || 'Small Breed Adult Refrigerated Dog Food'
      AND pet_type = 'dog'
      AND life_stage = 'adult'
      AND food_form = 'fresh'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('840243158164', 8)
    WHERE product_name =
      'Blue Buffalo Love Made Fresh Chunky Beef Stew with Peas & Carrots '
      || 'Adult Refrigerated Dog Food'
      AND pet_type = 'dog'
      AND life_stage = 'adult'
      AND food_form = 'fresh'
  ) THEN
    RAISE EXCEPTION
      'Love Made Fresh Small Breed/general adult identity boundary failed';
  END IF;

  IF (
    SELECT count(DISTINCT resolved.cache_key)
    FROM (
      VALUES ('840243158188'), ('840243158164')
    ) package(gtin)
    CROSS JOIN LATERAL
      public.resolve_verified_product_by_gtin(package.gtin, 8) resolved
  ) <> 2 THEN
    RAISE EXCEPTION
      'Love Made Fresh Small Breed/general adult packages were merged';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key =
      'target-blue-buffalo-review-v147:94c4fde4f3b9553aa68871f6'
      AND observation.source_external_id = '52615647'
      AND observation.validation_status = 'quarantined'
      AND observation.validation_reasons =
        ARRAY['ingredient_text_artifact_requires_exact_label_review']::TEXT[]
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key =
      'target-blue-buffalo-review-v147:94c4fde4f3b9553aa68871f6'
      AND observation.source_external_id = '76400774'
      AND observation.validation_status = 'quarantined'
      AND observation.validation_reasons =
        ARRAY['conflicting_life_stage_evidence_requires_label_review']::TEXT[]
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo v147 quarantine reasons changed';
  END IF;
END
$$;
