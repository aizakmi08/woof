-- Every reviewed v136 package UPC must resolve exactly one source-versioned
-- formula. The two salmon package sizes share one canonical serving formula.
DO $$
DECLARE v_passed INTEGER;
BEGIN
  WITH expected(gtin, expected_form) AS (
    VALUES
      ('840243104994', 'wet'),
      ('840243130610', 'dry'),
      ('840243130603', 'dry'),
      ('840243135691', 'wet'),
      ('840243143740', 'wet'),
      ('840243148363', 'dry'),
      ('840243158089', 'fresh'),
      ('840243158645', 'fresh')
  )
  SELECT count(*) INTO v_passed
  FROM expected
  WHERE (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
    WHERE nutritional_info->>'formula_evidence_tier' =
        'retailer_web_version'
      AND food_form = expected.expected_form
  ) = 1;

  IF v_passed <> 8 THEN
    RAISE EXCEPTION
      'Target Blue Buffalo v136 barcode regression: %/8',
      v_passed;
  END IF;

  IF (
    SELECT count(DISTINCT resolved.cache_key)
    FROM (
      SELECT *
      FROM public.resolve_verified_product_by_gtin('840243130610', 8)
      UNION ALL
      SELECT *
      FROM public.resolve_verified_product_by_gtin('840243130603', 8)
    ) resolved
  ) <> 1 THEN
    RAISE EXCEPTION
      'Blue Wilderness Salmon package sizes split into separate formulas';
  END IF;
END
$$;
