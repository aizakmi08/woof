-- Nine exact/equivalent UPCs resolve once. The reused Healthy Weight UPC and
-- two ingredient-artifact packages remain non-resolving.
DO $$
DECLARE
  v_resolved INTEGER;
  v_abstained INTEGER;
BEGIN
  WITH expected(gtin) AS (
    VALUES
      ('840243153848'),
      ('840243158638'),
      ('840243101870'),
      ('840243105243'),
      ('859610000043'),
      ('840243124947'),
      ('840243122608'),
      ('840243140664'),
      ('840243105526')
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
    VALUES
      ('859610000067'),
      ('840243161225'),
      ('859610000388')
  ) expected(gtin)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
  );

  IF v_resolved <> 9 OR v_abstained <> 3 THEN
    RAISE EXCEPTION
      'Target Blue Buffalo v157 barcode regression: resolved %/9, abstained %/3',
      v_resolved,
      v_abstained;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('840243158638', 8)
    WHERE product_name =
      'Blue Buffalo Love Made Fresh Beef Recipe with Carrots & Peas Adult '
      || 'Refrigerated Dog Food'
      AND food_form = 'fresh'
  ) THEN
    RAISE EXCEPTION 'Love Made Fresh v157 fresh-food identity failed';
  END IF;

  IF (
    SELECT count(DISTINCT resolved.cache_key)
    FROM (
      VALUES ('859610000043'), ('840243124947')
    ) package(gtin)
    CROSS JOIN LATERAL
      public.resolve_verified_product_by_gtin(package.gtin, 8) resolved
  ) <> 2 THEN
    RAISE EXCEPTION
      'Large Breed Healthy Weight and standard Healthy Weight were merged';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key =
      'target-blue-buffalo-review-v157:f5337a2d2943d8aec40d6203'
      AND observation.source_external_id IN ('94897291', '76348368')
      AND observation.validation_status = 'quarantined'
      AND observation.validation_reasons =
        ARRAY['ingredient_text_artifact_requires_exact_label_review']::TEXT[]
    GROUP BY source_run.id
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'Target Blue Buffalo v157 artifact quarantine changed';
  END IF;
END
$$;
