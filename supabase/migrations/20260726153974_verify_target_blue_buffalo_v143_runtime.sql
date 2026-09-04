-- Fourteen exact/equivalent package UPCs resolve once. The reused Salmon UPC
-- must abstain. Same-front Puppy packages with different ingredients must
-- remain distinct source versions.
DO $$
DECLARE
  v_resolved INTEGER;
  v_abstained INTEGER;
  v_puppy_cache_count INTEGER;
  v_puppy_ingredient_count INTEGER;
BEGIN
  WITH expected(gtin) AS (
    VALUES
      ('840243104888'), ('840243144112'),
      ('840243144082'), ('859610000036'),
      ('840243140763'), ('840243142286'),
      ('840243130535'), ('840243130511'),
      ('840243148523'), ('840243148547'), ('840243148561'),
      ('840243148653'), ('840243148707'), ('840243148332')
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
    VALUES ('840243148691')
  ) expected(gtin)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
  );

  SELECT
    count(DISTINCT resolved.cache_key),
    count(DISTINCT public.catalog_normalize_ingredient_evidence(
      resolved.ingredient_text
    ))
  INTO v_puppy_cache_count, v_puppy_ingredient_count
  FROM (
    VALUES ('840243144082'), ('859610000036')
  ) puppy(gtin)
  CROSS JOIN LATERAL
    public.resolve_verified_product_by_gtin(puppy.gtin, 8) resolved;

  IF v_resolved <> 14
    OR v_abstained <> 1
    OR v_puppy_cache_count <> 2
    OR v_puppy_ingredient_count <> 2
  THEN
    RAISE EXCEPTION
      'Target Blue Buffalo v143 barcode regression: resolved %/14, abstained %/1, Puppy caches %/2, Puppy ingredients %/2',
      v_resolved,
      v_abstained,
      v_puppy_cache_count,
      v_puppy_ingredient_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('840243142286', 8)
    WHERE product_name =
      'Blue Buffalo True Solutions Total Support Chicken Recipe '
      || 'Adult Wet Dog Food'
      AND food_form = 'wet'
      AND flavor = 'Chicken'
  ) THEN
    RAISE EXCEPTION
      'Blue True Solutions Total Support retained stale Best Life identity';
  END IF;

  IF (
    SELECT count(DISTINCT resolved.cache_key)
    FROM (
      VALUES
        ('840243148523'), ('840243148547'), ('840243148561')
    ) chicken(gtin)
    CROSS JOIN LATERAL
      public.resolve_verified_product_by_gtin(chicken.gtin, 8) resolved
    WHERE resolved.product_name =
      'Blue Buffalo Wilderness Adult with Chicken Dry Dog Food'
  ) <> 1 THEN
    RAISE EXCEPTION
      'Blue Wilderness Chicken sizes did not resolve one exact formula';
  END IF;
END
$$;
