-- All nine observed package UPCs resolve the eight exact Blue Buffalo formula
-- versions; Trial Size and the standard bag share one canonical formula.
DO $$
DECLARE v_passed INTEGER;
BEGIN
  WITH expected(gtin) AS (
    VALUES
      ('840243144112'), ('840243104888'), ('840243105830'),
      ('840243135424'), ('840243148349'), ('840243148509'),
      ('840243158195'), ('840243161232'), ('840243156672')
  )
  SELECT count(*) INTO v_passed
  FROM expected
  WHERE (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
    WHERE nutritional_info->>'formula_evidence_tier' =
      'retailer_web_version'
  ) = 1;

  IF v_passed <> 9 THEN
    RAISE EXCEPTION
      'Target Blue Buffalo v133 barcode regression: %/9',
      v_passed;
  END IF;
END
$$;
