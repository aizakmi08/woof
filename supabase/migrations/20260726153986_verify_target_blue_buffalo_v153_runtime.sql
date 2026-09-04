-- Nine exact/equivalent UPCs resolve once and two reused version-conflicting
-- UPCs abstain.
DO $$
DECLARE
  v_resolved INTEGER;
  v_abstained INTEGER;
BEGIN
  WITH expected(gtin) AS (
    VALUES
      ('840243153886'),
      ('859610006045'),
      ('840243130627'),
      ('840243105687'),
      ('840243158171'),
      ('840243158119'),
      ('859610007448'),
      ('840243140657'),
      ('840243142279')
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
    VALUES ('840243117352'), ('859610007455')
  ) expected(gtin)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
  );

  IF v_resolved <> 9 OR v_abstained <> 2 THEN
    RAISE EXCEPTION
      'Target Blue Buffalo v153 barcode regression: resolved %/9, abstained %/2',
      v_resolved,
      v_abstained;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('840243158171', 8)
    WHERE product_name =
      'Blue Buffalo Love Made Fresh Chunky Chicken Stew with Peas & Carrots '
      || 'Adult Refrigerated Dog Food'
      AND food_form = 'fresh'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('840243158119', 8)
    WHERE product_name =
      'Blue Buffalo Love Made Fresh Beef Recipe with Carrots & Peas Adult '
      || 'Refrigerated Dog Food'
      AND food_form = 'fresh'
  ) THEN
    RAISE EXCEPTION 'Love Made Fresh v153 identity boundary failed';
  END IF;

  IF (
    SELECT count(DISTINCT resolved.cache_key)
    FROM (
      VALUES ('859610006045'), ('840243130627')
    ) package(gtin)
    CROSS JOIN LATERAL
      public.resolve_verified_product_by_gtin(package.gtin, 8) resolved
  ) <> 2 THEN
    RAISE EXCEPTION
      'Distinct Wilderness Kitten ingredient versions were merged';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key =
      'target-blue-buffalo-review-v153:97077dc426ea90ce05469b6d'
      AND observation.source_external_id = '76366322'
      AND observation.validation_status = 'quarantined'
      AND observation.validation_reasons =
        ARRAY['ingredient_text_artifact_requires_exact_label_review']::TEXT[]
  ) THEN
    RAISE EXCEPTION 'Wilderness Kitten 5 lb quarantine changed';
  END IF;
END
$$;
